// ================================================================
// 🧮 [표준시간 계산 엔진] script_std_calc.js
// - standard_master 조회 대신, 노선 JSON(정류장 + 누적 구간소요시간)과
//   근무표 앵커시간(time1~3)으로 회차의 정류장별 표준시간을 계산합니다.
// - 정류장 시간 = 구간 시작 + (구간 끝 - 구간 시작) × (L 누적 비율)
// - 노선 JSON은 GAS(get_route_stops)에서 노선당 1회만 받아 localStorage에 보관합니다.
// - 모드(localStorage 'yb_std_mode'): 'calc'   (기본: 계산값 우선, 실패 시 기존 방식)
//                                     'compare'(기존값 사용 + 계산값 비교 로그)
//                                     'legacy' (기존 방식만)
// ================================================================
(function () {
    const ROUTE_CACHE_PREFIX = 'yb_route_v1_';
    const ROUTE_CACHE_TTL_MS = 10 * 60 * 60 * 1000;
    const inflight = {};
    let lastError = '';

    function getMode() {
        try { return localStorage.getItem('yb_std_mode') || 'calc'; } catch (e) { return 'calc'; }
    }
    function setMode(mode) {
        try { localStorage.setItem('yb_std_mode', mode); } catch (e) { }
    }

    // "HH:MM" / "HH:MM:SS" → 초 (24:00 이상 허용, 빈 값은 null)
    function hmsToSec(str) {
        let s = String(str || '').trim().replace(/[：.]/g, ':');
        if (!s || s === '-') return null;
        if (/^\d{3,4}$/.test(s)) s = s.slice(0, -2) + ':' + s.slice(-2);   // 0826 → 08:26
        const p = s.split(':').map(Number);
        if (p.some(isNaN) || p.length < 2) return null;
        return p[0] * 3600 + p[1] * 60 + (p[2] || 0);
    }

    function secToHms(sec) {
        const t = ((Math.round(sec) % 86400) + 86400) % 86400;   // 24시 이후는 00:xx 로 표기
        const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    // ---------------- 노선 JSON 로드 ----------------
    function readRouteCache(name) {
        try {
            const raw = localStorage.getItem(ROUTE_CACHE_PREFIX + name);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (obj && obj.data && Date.now() - obj.t < ROUTE_CACHE_TTL_MS) return obj.data;
        } catch (e) { }
        return null;
    }

    function loadRoute(name) {
        name = String(name || '').trim();
        if (!name) return Promise.resolve(null);
        const cached = readRouteCache(name);
        if (cached) return Promise.resolve(cached);
        if (inflight[name]) return inflight[name];
        const url = window.GAS_WEB_APP_URL;
        if (!url) return Promise.resolve(null);

        const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 30000) : null;
        inflight[name] = fetch(url + '?action=get_route_stops&route=' + encodeURIComponent(name), ctrl ? { signal: ctrl.signal } : undefined)
            .then(r => r.text().then(text => ({ status: r.status, text })))
            .then(({ status, text }) => {
                if (timer) clearTimeout(timer);
                delete inflight[name];
                let res = null;
                try { res = JSON.parse(text); } catch (e) {
                    lastError = `[${name}] 응답이 JSON이 아님 (HTTP ${status}). 웹 앱이 새 버전으로 배포되지 않았을 수 있음. 응답 앞부분: ${text.slice(0, 120).replace(/\s+/g, ' ')}`;
                    return null;
                }
                if (!res || !res.success || !Array.isArray(res.stops) || res.stops.length === 0) {
                    lastError = `[${name}] 서버 응답: ${JSON.stringify(res).slice(0, 200)}`;
                    return null;
                }
                if (res.warn) console.warn(`⚠️ [노선 ${name}] ${res.warn}`);
                try { localStorage.setItem(ROUTE_CACHE_PREFIX + name, JSON.stringify({ t: Date.now(), data: res })); } catch (e) { }
                return res;
            })
            .catch(err => {
                if (timer) clearTimeout(timer);
                delete inflight[name];
                lastError = (err && err.name === 'AbortError')
                    ? `[${name}] 30초 안에 응답이 없음 (서버가 오래 걸리거나 접속이 막힘)`
                    : `[${name}] 요청 실패: ${err}`;
                console.warn(`⚠️ [노선 ${name}] JSON 로드 실패:`, err);
                return null;
            });
        return inflight[name];
    }

    // ---------------- 구간 계산 ----------------
    // route.stops[ia..ib] 를 시각 t0 → t1 사이에 누적 구간소요시간 비율로 배분
    function legRows(route, ia, ib, t0, t1, skipFirst) {
        const stops = route.stops;
        const den = stops[ib][4] - stops[ia][4];
        const rows = [];
        for (let i = ia; i <= ib; i++) {
            if (skipFirst && i === ia) continue;
            const frac = den > 0 ? (stops[i][4] - stops[ia][4]) / den : (ib === ia ? 0 : (i - ia) / (ib - ia));
            rows.push({ stop: stops[i], sec: t0 + (t1 - t0) * frac });
        }
        return rows;
    }

    function toStdRows(legRowList) {
        return legRowList.map((r, idx) => {
            const time = secToHms(r.sec);
            const s = r.stop;
            return {
                sequence: idx + 1,
                stopId: s[0],
                name: s[1],
                stdTime: time,
                lat: s[2],
                lng: s[3],
                limit: s[5],
                4: s[0], 5: s[1], 6: time, 8: s[2], 9: s[3]
            };
        });
    }

    // 근무표 앵커 → 회차 정류장 목록 (실패 시 null)
    async function computeTripRows(effectiveRoute, baseRoute, times) {
        lastError = '';
        const fail = (msg) => { lastError = msg; return null; };
        if (!times) return fail('근무표 시간(time1~3)이 없습니다.');
        const t = [hmsToSec(times.time1), hmsToSec(times.time2), hmsToSec(times.time3)];
        const nz = t.filter(v => v !== null);
        if (nz.length < 2) return fail(`인식된 시간이 ${nz.length}개입니다 (최소 2개 필요). 입력값: "${times.time1}" / "${times.time2}" / "${times.time3}" — 08:26 형식으로 입력하세요.`);

        // 24시를 넘어 이어지는 앵커(예: 23:50 → 00:20)는 하루를 더해 증가하도록 보정
        for (let i = 1; i < nz.length; i++) {
            while (nz[i] < nz[i - 1]) nz[i] += 86400;
        }

        const isA = /A$/.test(effectiveRoute);
        if (isA) {
            // 202A / 203A: 편도 노선 전체(앵커 2개) + (시간이 3개면) 정규 노선 기점→도착
            const rA = await loadRoute(effectiveRoute);
            if (!rA) return fail(lastError || `${effectiveRoute} 노선 JSON을 받지 못했습니다.`);
            if (rA.anchors.length < 2) return fail(`${effectiveRoute} 앵커가 ${rA.anchors.length}개입니다 (2개 필요).`);
            let rows = legRows(rA, rA.anchors[0], rA.anchors[rA.anchors.length - 1], nz[0], nz[1], false);
            if (nz.length >= 3) {
                const rB = await loadRoute(baseRoute);
                if (!rB) return fail(lastError || `${baseRoute} 노선 JSON을 받지 못했습니다.`);
                if (rB.anchors.length < 3) return fail(`${baseRoute} 앵커가 ${rB.anchors.length}개입니다 (3개 필요).`);
                rows = rows.concat(legRows(rB, rB.anchors[1], rB.anchors[2], nz[1], nz[2], true));
            }
            return toStdRows(rows);
        }

        // 정규 노선(앵커 3개): time1=출발, time2=기점, time3=도착 (공란 슬롯은 건너뜀)
        const r = await loadRoute(effectiveRoute);
        if (!r) return fail(lastError || `${effectiveRoute} 노선 JSON을 받지 못했습니다.`);
        if (r.anchors.length < 3) return fail(`${effectiveRoute} 앵커가 ${r.anchors.length}개입니다 (정규 노선은 3개 필요). 202A/203A 는 노선에서 A를 선택하세요.`);
        const [a0, a1, a2] = r.anchors;
        const has = [t[0] !== null, t[1] !== null, t[2] !== null];
        // 자정 보정을 슬롯 기준으로 다시 적용
        const ts = t.slice();
        for (let i = 1; i < 3; i++) {
            if (ts[i] !== null) {
                let prev = null;
                for (let j = i - 1; j >= 0; j--) if (ts[j] !== null) { prev = ts[j]; break; }
                while (prev !== null && ts[i] < prev) ts[i] += 86400;
            }
        }
        let rows = [];
        if (has[0] && has[1]) rows = rows.concat(legRows(r, a0, a1, ts[0], ts[1], false));
        if (has[1] && has[2]) rows = rows.concat(legRows(r, a1, a2, ts[1], ts[2], has[0]));
        return rows.length ? toStdRows(rows) : fail('계산할 구간이 없습니다. 시간 3개 중 연속된 두 슬롯(출발+기점 또는 기점+도착)이 필요합니다.');
    }

    // ---------------- 기존 standard_master 와 비교 (검증용) ----------------
    function compareWithLegacy(duty, legacyRows) {
        if (!duty || !duty.tripTimes || !Array.isArray(legacyRows) || legacyRows.length === 0) return;
        computeTripRows(duty.routeShort, duty.baseRoute, duty.tripTimes).then(calc => {
            if (!calc) {
                console.warn(`🧮 [표준시간 계산 비교] ${duty.uniqueKey}: 계산 불가(노선 JSON/앵커 확인 필요)`);
                return;
            }
            const byId = {};
            legacyRows.forEach(r => { const id = String(r.stopId || r[4] || ''); (byId[id] = byId[id] || []).push(r); });
            let matched = 0, maxDiff = 0, sumDiff = 0;
            calc.forEach(c => {
                const cand = byId[c.stopId];
                if (!cand) return;
                matched++;
                const legacy = cand.shift();
                let d = Math.abs(hmsToSec(c.stdTime) - hmsToSec(legacy.stdTime || legacy[6]));
                if (d > 43200) d = 86400 - d;
                sumDiff += d;
                if (d > maxDiff) maxDiff = d;
            });
            console.log(`🧮 [표준시간 계산 비교] ${duty.uniqueKey} | 계산 ${calc.length}개 / 기존 ${legacyRows.length}개 정류장 | ID 일치 ${matched}개 | 평균 차이 ${matched ? Math.round(sumDiff / matched) : '-'}초, 최대 ${maxDiff}초`);
            console.log(`   계산: ${calc[0].name} ${calc[0].stdTime} → ${calc[calc.length - 1].name} ${calc[calc.length - 1].stdTime}`);
        });
    }

    window.StdCalc = { getLastError: () => lastError, clearRouteCache: (n) => { try { localStorage.removeItem(ROUTE_CACHE_PREFIX + n); } catch (e) { } }, getMode, setMode, loadRoute, computeTripRows, compareWithLegacy, hmsToSec, secToHms };
})();
