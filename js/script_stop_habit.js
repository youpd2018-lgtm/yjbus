// ================================================================
// 🚌 [정류장 통과 속도] script_stop_habit.js  (2026-10-26 사용자 지시: 급정거·급출발 대신 정류장 20km 통과를 잰다)
// - 라이브 모달을 켜 둔 동안, 오늘 내 근무 시간에만 잰다.
//   · GPS가 노선 정류장 30m 안으로 들어갔다가 45m 밖으로 나가면 그 정류장을 '통과'한 것으로 센다.
//   · 그 30m 안에서 가장 느린 속도가 20km/h 이상이면 '20km 이상 통과'(서행하지 않고 지나감)로 센다.
// - 한 회차에서 통과한 정류장이 1곳 이상이면 기록한다. (모달을 껐다 켜도 이어서 모음)
// - 서버(정류장습관 시트)에는 회차마다 한 줄: 측정횟수=통과 횟수, 급정거횟수 칸=20km 이상 통과 횟수, 급정거 Top3 칸=20km 이상 통과 정류장 이름들.
//   새 방식 줄은 키 끝에 |p20 이 붙고, 옛 급정거·급출발 줄은 화면에서 쓰지 않는다.
// - 화면: 이번 회차(폰 값) / 이달(서버 값 + 아직 못 올린 이 폰 값), 20km 이상 많이 통과한 정류장 Top3 는 항상 보임
// ================================================================
(function () {
    var KEY_PREFIX = 'yb_stoppass_';   // 옛 급정거·급출발 기록(yb_stophab_)과 섞이지 않게 새 저장소
    var KEY_TAG = '|p20';        // 서버 줄 키 끝 표시 (새 방식)
    var MIN_STOPS = 1;           // 통계로 인정하는 최소 통과 정류장 수
    var ZONE_M = 30;             // 이 거리 안에 들어오면 정류장을 지나는 중
    var EXIT_M = 45;             // 이 거리 밖으로 나가면 지나간 것으로 확정
    var LIMIT_KMH = 20;          // 정류장 안 최저 속도가 이 이상이면 '20km 이상 통과'
    var MAX_ACC_M = 40;
    var MAX_GAP_S = 6;           // GPS가 이 시간 넘게 끊기면 그 구간은 판정 안 함 (폰이 2~3초 간격으로 줄 때도 이어지게)

    var buf = [];                // 최근 위치 [{t, v, lat, lon}]
    var zone = null;             // 지금 지나는 정류장 { idx, nm, lat, lon, minV }
    var lastResult = null;       // 마지막으로 지나간 정류장 결과 'ok'(20km 아래) | 'over'(20km 이상) — 라이브 모달 알약 아래 표시용
    function notify() { try { window.dispatchEvent(new Event('yb-stoppass')); } catch (e) { } }
    var bufDriver = null, lastIdx = null, uploading = false;
    var state = null;            // { trips: {key: trip}, serial: {}, cur: key }
    var rawPrev = null;          // 속도값이 안 올 때 위치 차이로 속도를 구하기 위한 직전 위치
    var diag = { fix: 0, noSpeed: 0, derived: 0, off: 0, noMaster: 0, lowAcc: 0, stops: 0, over: 0, why: '' };   // 점검용 (화면 맨 아래에 작게 표시)
    function resetDiag() { diag = { fix: 0, noSpeed: 0, derived: 0, off: 0, noMaster: 0, lowAcc: 0, stops: 0, over: 0, why: '', day: todayStr() }; }
    function saveDiag() { diag.day = todayStr(); lsSet(KEY_PREFIX + 'diag', JSON.stringify(diag)); }
    function loadDiag() { try { var o = JSON.parse(lsGet(KEY_PREFIX + 'diag') || 'null'); if (o && o.day === todayStr()) diag = Object.assign(diag, o); } catch (e) { } }   // 점검 숫자는 오늘 것만 센다
    loadDiag();

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function pad(n) { return String(n).padStart(2, '0'); }
    function todayStr() { var n = new Date(); return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); }
    function driver() { return window.currentDriver || ''; }
    function storeKey() { return KEY_PREFIX + driver(); }

    function loadState() {
        try {
            var o = JSON.parse(lsGet(storeKey()) || 'null');
            if (o && o.trips) return { trips: o.trips, serial: o.serial || {}, cur: o.cur || '' };
        } catch (e) { }
        return { trips: {}, serial: {}, cur: '' };
    }
    function saveState() {
        if (!state) return;
        var keys = Object.keys(state.trips).sort();
        while (keys.length > 120) delete state.trips[keys.shift()];   // 오래된 회차는 정리
        lsSet(storeKey(), JSON.stringify(state));
    }

    function rad(x) { return x * Math.PI / 180; }
    function haversineM(a, b, c, d) {
        var R = 6371000, dLa = rad(c - a), dLo = rad(d - b);
        var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
        return 2 * R * Math.asin(Math.sqrt(x));
    }
    function stopLat(r) { return parseFloat(r.lat !== undefined ? r.lat : (Array.isArray(r) ? r[8] : null)); }
    function stopLng(r) { return parseFloat(r.lng !== undefined ? r.lng : (Array.isArray(r) ? r[9] : null)); }
    function stopName(r) { return r ? String(Array.isArray(r) ? r[5] : (r.name || r.stopName || r[5] || '')).trim() : ''; }

    // 오늘 내 근무(정상·대타)이고 운행 시간 안일 때만 잰다 (쉬는 날·집에서 시험 삼아 켠 경우는 기록 안 함)
    function todaySched() {
        try { return JSON.parse(lsGet(typeof getDriverKey === 'function' ? getDriverKey('sched_' + todayStr()) : 'sched_' + todayStr()) || 'null'); } catch (e) { return null; }
    }
    var offWhy = '';
    function onDutyNow() {
        try {
            var sd = todaySched();
            var wt = sd && sd.workType ? String(sd.workType).trim() : '';
            if (wt !== '정상' && wt !== '대타') { offWhy = '오늘 근무가 정상·대타가 아님 (' + (wt || '근무 정보 없음') + ')'; return false; }
            if (typeof isWithinOperatingHours === 'function' && !isWithinOperatingHours()) { offWhy = '지금이 운행 시간이 아님'; return false; }
            offWhy = '';
            return true;
        } catch (e) { offWhy = '근무 정보 확인 오류'; return false; }
    }

    // 지금 회차 기록을 찾거나 새로 만든다. 같은 근무·회차라도 정류장 번호가 크게 되돌아가면 새 회차로 본다.
    function currentTrip(duty) {
        if (!state) state = loadState();
        var date = todayStr();
        var uk = duty ? String(duty.uniqueKey || duty.routeShort || '') : '';
        var turn = duty && duty.turnNum ? duty.turnNum : 1;
        var base = uk + '|' + turn;
        var idx = (typeof window.lastPassedStopIndex === 'number') ? window.lastPassedStopIndex : null;
        var sk = date + '|' + base;
        if (state.serial[sk] === undefined) state.serial[sk] = 1;
        if (idx !== null && lastIdx !== null && idx < lastIdx - 3) { state.serial[sk]++; resetPhase(); }
        if (idx !== null) lastIdx = idx;
        var key = date + '|' + base + '|' + state.serial[sk] + KEY_TAG;
        var t = state.trips[key];
        if (!t) {
            var sd = todaySched();
            t = state.trips[key] = { key: key, date: date, route: sd ? String(sd.route || '') : '', seq: sd ? String(sd.seq || '') : '', turn: turn, pass: [], ver: 1, sent: 0 };
            saveState();
        }
        state.cur = key;
        return t;
    }

    function resetPhase() { zone = null; buf = []; }

    // 지난 정류장 주변 몇 개 중 radius 안에서 가장 가까운 정류장 번호 (없으면 -1)
    function nearestStop(lat, lon, master, radius) {
        var from = 0, to = master.length - 1;
        if (typeof window.lastPassedStopIndex === 'number' && window.lastPassedStopIndex >= 0) {
            from = Math.max(0, window.lastPassedStopIndex - 1);
            to = Math.min(master.length - 1, window.lastPassedStopIndex + 3);
        }
        var best = -1, bd = Infinity;
        for (var i = from; i <= to; i++) {
            var la = stopLat(master[i]), lo = stopLng(master[i]);
            if (!la || !lo) continue;
            var d = haversineM(lat, lon, la, lo);
            if (d < bd) { bd = d; best = i; }
        }
        return (best !== -1 && bd <= radius) ? best : -1;
    }

    // 정류장 하나를 지나간 것으로 확정: [이름, 최저속도]
    function markPass(trip, z) {
        if (!trip.pass) trip.pass = [];
        var mv = Math.round(z.minV);
        trip.pass.push([z.nm, mv]);
        diag.stops++;
        if (mv >= LIMIT_KMH) diag.over++;
        lastResult = mv >= LIMIT_KMH ? 'over' : 'ok';
        trip.ver++;
        saveState(); saveDiag();
        notify();
    }

    // GPS 한 번 들어올 때마다 호출 (라이브 모달이 켜져 있을 때만 불림)
    function onFix(speedKmh, accuracy, heading, duty) {
        try {
            if (bufDriver !== driver()) { state = null; resetPhase(); lastIdx = null; bufDriver = driver(); }
            if (!driver()) return;
            if (window.simState && window.simState.active) return;
            var pos = window.lastGpsPosition;
            if (!pos || !pos.lat) return;
            if (diag.day && diag.day !== todayStr()) resetDiag();
            diag.fix++;
            // 속도값이 안 오는 폰(서 있을 때 등)은 직전 위치와의 거리로 속도를 구함
            var nowMs = Date.now();
            if (speedKmh === null || speedKmh === undefined) {
                diag.noSpeed++;
                var kmh = null;
                if (rawPrev && nowMs - rawPrev.ms >= 500 && nowMs - rawPrev.ms <= 6000) {
                    kmh = Math.round(haversineM(rawPrev.lat, rawPrev.lon, pos.lat, pos.lon) / ((nowMs - rawPrev.ms) / 1000) * 3.6);
                    if (kmh <= 2) kmh = 0;
                    if (kmh > 120) kmh = null;
                }
                if (kmh !== null) diag.derived++;
                speedKmh = kmh;
            }
            rawPrev = { ms: nowMs, lat: pos.lat, lon: pos.lon };
            if (speedKmh === null || speedKmh === undefined) return;
            if (accuracy && accuracy > MAX_ACC_M) { diag.lowAcc++; return; }
            if (!onDutyNow()) { diag.off++; diag.why = offWhy; return; }
            var master = window.standardMasterCache || window.currentTripMasterCache || [];
            if (!master.length) { diag.noMaster++; diag.why = '노선 정류장 정보 없음'; return; }
            diag.why = '';
            if (diag.fix % 10 === 0) saveDiag();

            var trip = currentTrip(duty);
            var now = Date.now() / 1000;
            var prev = buf.length ? buf[buf.length - 1] : null;
            if (prev && now - prev.t > MAX_GAP_S) { if (zone) { zone = null; notify(); } buf = []; }   // GPS가 오래 끊기면 그 정류장은 판정 안 함
            buf.push({ t: now, v: speedKmh });
            while (buf.length > 30) buf.shift();

            if (zone) {
                var d = haversineM(pos.lat, pos.lon, zone.lat, zone.lon);
                if (d <= EXIT_M) { zone.minV = Math.min(zone.minV, speedKmh); return; }
                markPass(trip, zone); zone = null;
            }
            var idx = nearestStop(pos.lat, pos.lon, master, ZONE_M);
            if (idx !== -1 && !(trip.lastIdx === idx && now - (trip.lastT || 0) < 120)) {   // 같은 정류장을 2분 안에 또 세지 않음 (GPS 흔들림)
                zone = { idx: idx, nm: stopName(master[idx]), lat: stopLat(master[idx]), lon: stopLng(master[idx]), minV: speedKmh };
                trip.lastIdx = idx; trip.lastT = now;
                notify();
            }
        } catch (e) { console.warn('정류장 습관 집계 오류:', e); }
    }

    // ---- 집계 ----
    function summarize(trip) {
        var pass = trip.pass || [], over = [];
        pass.forEach(function (p) { if (p[1] >= LIMIT_KMH) over.push(p[0]); });
        return { n: pass.length, ov: over.length, ok: pass.length >= MIN_STOPS, overNames: over, topOver: countTop([over]) };
    }

    function getCurrent() {
        if (!state) state = loadState();
        var t = state.trips[state.cur];
        if (!t || t.date !== todayStr()) return null;
        return summarize(t);
    }

    // ---- 서버 올리기 ----
    function upload() {
        try {
            if (uploading || !driver()) return;
            if (!state) state = loadState();
            var url = window.GAS_WEB_APP_URL;
            if (!url) return;
            var list = [];
            Object.keys(state.trips).forEach(function (k) {
                var t = state.trips[k];
                if (t.ver === t.sent) return;
                var s = summarize(t);
                if (!s.ok) return;
                list.push({ t: t, s: s });
            });
            if (!list.length) return;
            var item = list[0];
            uploading = true;
            var sentVer = item.t.ver;
            fetch(url, {
                method: 'POST', headers: { 'Content-Type': 'text/plain' }, keepalive: true,
                body: JSON.stringify({
                    action: 'save_stop_habit', driver: driver(), key: item.t.key, date: item.t.date,
                    route: item.t.route, seq: item.t.seq, turn: item.t.turn,
                    n: item.s.n, hardStop: item.s.ov, hardStart: 0,
                    topStop: item.s.overNames.join('|'), topStart: ''
                })
            }).then(function (r) { return r.json(); })
                .then(function (res) {
                    uploading = false;
                    if (res && res.success) { item.t.sent = sentVer; saveState(); }
                })
                .catch(function () { uploading = false; });
        } catch (e) { uploading = false; }
    }

    // ---- 이달 합계: 서버에 올라간 회차 + 아직 못 올린 이 폰 회차 ----
    function countTop(lists) {
        // 많이 나온 정류장 먼저, 같은 횟수면 가장 나중에 나온(새로 추가된) 정류장 먼저
        var cnt = {}, last = {}, order = [], pos = 0;
        lists.forEach(function (arr) {
            arr.forEach(function (nm) {
                if (!nm) return;
                if (cnt[nm] === undefined) { cnt[nm] = 0; order.push(nm); }
                cnt[nm]++;
                last[nm] = pos++;
            });
        });
        order.sort(function (a, b) { return (cnt[b] - cnt[a]) || (last[b] - last[a]); });
        return order.slice(0, 3).map(function (nm) { return nm + ' ' + cnt[nm] + '회'; });
    }
    function fetchMonth(year, month) {
        if (!state) state = loadState();
        var prefix = year + '-' + pad(month) + '-';
        var rows = {};   // key -> {n, ov, names[]}
        function finish() {
            Object.keys(state.trips).forEach(function (k) {
                var t = state.trips[k];
                if (t.date.indexOf(prefix) !== 0) return;
                var s = summarize(t);
                if (s.ok) rows[k] = { n: s.n, ov: s.ov, names: s.overNames };
            });
            var n = 0, ov = 0, a = [];
            Object.keys(rows).forEach(function (k) { var r = rows[k]; n += r.n; ov += r.ov; a.push(r.names); });
            return { n: n, ov: ov, ok: n > 0, topOver: countTop(a) };
        }
        var url = window.GAS_WEB_APP_URL;
        if (!url || !driver()) return Promise.resolve(finish());
        return fetch(url + '?action=get_stop_habit&driver=' + encodeURIComponent(driver()) + '&year=' + year + '&month=' + month)
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res && res.success) {
                    (res.rows || []).forEach(function (r) {
                        if (String(r[0]).slice(-KEY_TAG.length) !== KEY_TAG) return;   // 옛 급정거·급출발 줄은 제외
                        rows[r[0]] = { n: Number(r[1]) || 0, ov: Number(r[2]) || 0, names: String(r[4] || '').split('|').filter(Boolean) };
                    });
                }
                return finish();
            })
            .catch(function () { return finish(); });
    }

    // 라이브 모달 표시용: 정류장 안인지, 마지막 결과, 이번 회차 20km 이상 통과 횟수
    function getLive() {
        var c = getCurrent();
        return { inZone: !!zone, last: lastResult, over: c ? c.ov : 0 };
    }

    window.DrivingHabit = { LIMIT_KMH: LIMIT_KMH, getLive: getLive, onFix: onFix, upload: upload, getCurrent: getCurrent, fetchMonth: fetchMonth, getDiag: function () { return diag; }, MIN_STOPS: MIN_STOPS };
    setInterval(upload, 30000);
    window.addEventListener('load', function () { setTimeout(upload, 5000); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) upload(); });
    window.addEventListener('pagehide', upload);
})();
