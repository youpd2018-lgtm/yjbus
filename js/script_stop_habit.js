// ================================================================
// 🚌 [정류장 운전 습관] script_stop_habit.js  (옛 script_driving_habit.js 대신)
// - 라이브 모달을 켜 둔 동안만 잰다. 통과 정류장은 제외하고, '선 정류장'만 잰다.
//   · 정차: 정류장 60m 안에서 달리던 차(15km/h 이상)가 멈춤(3km/h 이하) → 멈추기 전 감속이 1초에 7.5km/h 이상이면 '급정거'
//   · 출발: 그 정류장을 떠난 뒤 100m(또는 12초) 안에 속도가 1초에 11km/h 이상 오르면 '급출발'
// - 한 회차에서 측정된 정류장이 10개 이상이면 통계로 인정한다. (모달을 껐다 켜도 이어서 모음)
// - 서버(정류장습관 시트)에는 회차마다 한 줄: 같은 회차는 덮어써서 중복되지 않는다.
// - 화면: 이번 회차(폰 값) / 이달(서버 값 + 아직 못 올린 이 폰 값)
// ================================================================
(function () {
    var KEY_PREFIX = 'yb_stophab_';
    var MIN_STOPS = 10;          // 통계로 인정하는 최소 측정 정류장 수
    var STOP_RADIUS_M = 60;      // 정류장에 섰다고 보는 거리
    var APPROACH_KMH = 15;       // 정류장에 서기 전에 이 속도 이상으로 달려야 '정차'로 침 (통과·이미 서 있던 차 제외)
    var STOPPED_KMH = 3;
    var HARD_STOP = 7.5;         // 급정거: 1초 감속(km/h)
    var HARD_START = 11;         // 급출발: 1초 가속(km/h)
    var DEPART_M = 100;
    var DEPART_SEC = 12;
    var MAX_ACC_M = 40;
    var MAX_GAP_S = 6;           // GPS가 이 시간 넘게 끊기면 그 구간은 판정 안 함 (폰이 2~3초 간격으로 줄 때도 이어지게)

    var buf = [];                // 최근 위치 [{t, v, lat, lon}]
    var phase = 'run';           // run | stopped | depart
    var curIdx = -1, curLat = 0, curLon = 0, departT0 = 0, departMax = 0;
    var bufDriver = null, lastIdx = null, uploading = false;
    var state = null;            // { trips: {key: trip}, serial: {}, cur: key }
    var rawPrev = null;          // 속도값이 안 올 때 위치 차이로 속도를 구하기 위한 직전 위치
    var diag = { fix: 0, noSpeed: 0, derived: 0, off: 0, noMaster: 0, lowAcc: 0, stops: 0, why: '' };   // 점검용 (화면 맨 아래에 작게 표시)
    function saveDiag() { lsSet(KEY_PREFIX + 'diag', JSON.stringify(diag)); }
    function loadDiag() { try { var o = JSON.parse(lsGet(KEY_PREFIX + 'diag') || 'null'); if (o) diag = Object.assign(diag, o); } catch (e) { } }
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
        var key = date + '|' + base + '|' + state.serial[sk];
        var t = state.trips[key];
        if (!t) {
            var sd = todaySched();
            t = state.trips[key] = { key: key, date: date, route: sd ? String(sd.route || '') : '', seq: sd ? String(sd.seq || '') : '', turn: turn, stops: {}, ver: 1, sent: 0 };
            saveState();
        }
        state.cur = key;
        return t;
    }

    function resetPhase() { phase = 'run'; curIdx = -1; buf = []; }

    // 정류장 근처에서 선 것인지: 지난 정류장 주변 몇 개 중 가장 가까운 정류장 번호 (없으면 -1)
    function nearestStop(lat, lon, master) {
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
        return (best !== -1 && bd <= STOP_RADIUS_M) ? best : -1;
    }

    function markStop(trip, idx, name, decel) {
        var s = trip.stops[idx];
        if (!s) { s = trip.stops[idx] = { nm: name, ds: 0, as: 0, dep: 0 }; }
        if (decel > s.ds) s.ds = Math.round(decel * 10) / 10;
        trip.ver++;
        saveState();
    }
    function markDepart(trip, idx, accel) {
        var s = trip.stops[idx];
        if (!s) return;
        s.dep = 1;
        if (accel > s.as) s.as = Math.round(accel * 10) / 10;
        trip.ver++;
        saveState();
    }

    // GPS 한 번 들어올 때마다 호출 (라이브 모달이 켜져 있을 때만 불림)
    function onFix(speedKmh, accuracy, heading, duty) {
        try {
            if (bufDriver !== driver()) { state = null; resetPhase(); lastIdx = null; bufDriver = driver(); }
            if (!driver()) return;
            if (window.simState && window.simState.active) return;
            var pos = window.lastGpsPosition;
            if (!pos || !pos.lat) return;
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
            var cur = { t: now, v: speedKmh, lat: pos.lat, lon: pos.lon };
            var prev = buf.length ? buf[buf.length - 1] : null;
            if (prev && now - prev.t > MAX_GAP_S) { if (phase === 'depart') phase = 'run'; buf = []; prev = null; }
            buf.push(cur);
            while (buf.length && now - buf[0].t > 20) buf.shift();
            if (!prev) return;
            var dt = Math.max(0.5, now - prev.t);

            if (phase === 'run') {
                if (cur.v <= STOPPED_KMH && prev.v > STOPPED_KMH) {
                    // 멈춘 순간: 직전 10초 안에 15km/h 이상으로 달렸고, 정류장 근처인가?
                    var ran = false, maxDecel = 0;
                    for (var i = 0; i < buf.length; i++) if (buf[i].v >= APPROACH_KMH) ran = true;
                    for (var j = 1; j < buf.length; j++) {
                        var a = buf[j - 1], b = buf[j];
                        if (a.v >= 8) maxDecel = Math.max(maxDecel, (a.v - b.v) / Math.max(0.5, b.t - a.t));
                    }
                    var idx = ran ? nearestStop(cur.lat, cur.lon, master) : -1;
                    if (idx !== -1) {
                        markStop(trip, idx, stopName(master[idx]), maxDecel); diag.stops++; saveDiag();
                        phase = 'stopped'; curIdx = idx; curLat = stopLat(master[idx]); curLon = stopLng(master[idx]);
                    }
                }
            } else if (phase === 'stopped') {
                if (cur.v > STOPPED_KMH && prev.v <= STOPPED_KMH) {
                    phase = 'depart'; departT0 = now; departMax = Math.max(0, (cur.v - prev.v) / dt);
                }
            } else if (phase === 'depart') {
                departMax = Math.max(departMax, (cur.v - prev.v) / dt);
                var far = haversineM(cur.lat, cur.lon, curLat, curLon) >= DEPART_M;
                if (far || now - departT0 >= DEPART_SEC) {
                    markDepart(trip, curIdx, departMax);
                    phase = 'run';
                } else if (cur.v <= STOPPED_KMH) {
                    phase = 'stopped';   // 다시 섰으면 계속 같은 정류장에서 기다리는 중
                }
            }
        } catch (e) { console.warn('정류장 습관 집계 오류:', e); }
    }

    // ---- 집계 ----
    function summarize(trip) {
        var idxs = Object.keys(trip.stops || {});
        var n = idxs.length, hs = 0, hst = 0, ds = [], as = [];
        idxs.forEach(function (i) {
            var s = trip.stops[i];
            if (s.ds >= HARD_STOP) { hs++; ds.push(s); }
            if (s.dep && s.as >= HARD_START) { hst++; as.push(s); }
        });
        ds.sort(function (a, b) { return b.ds - a.ds; });
        as.sort(function (a, b) { return b.as - a.as; });
        return {
            n: n, hs: hs, hst: hst, ok: n >= MIN_STOPS,
            topStop: ds.slice(0, 3).map(function (s) { return s.nm; }),
            topStart: as.slice(0, 3).map(function (s) { return s.nm; })
        };
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
                    n: item.s.n, hardStop: item.s.hs, hardStart: item.s.hst,
                    topStop: item.s.topStop.join('|'), topStart: item.s.topStart.join('|')
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
        var cnt = {}, order = [];
        lists.forEach(function (arr) {
            arr.forEach(function (nm) {
                if (!nm) return;
                if (cnt[nm] === undefined) { cnt[nm] = 0; order.push(nm); }
                cnt[nm]++;
            });
        });
        order.sort(function (a, b) { return cnt[b] - cnt[a]; });
        return order.slice(0, 3).map(function (nm) { return nm + ' ' + cnt[nm] + '회'; });
    }
    function fetchMonth(year, month) {
        if (!state) state = loadState();
        var prefix = year + '-' + pad(month) + '-';
        var rows = {};   // key -> {n, hs, hst, topStop[], topStart[]}
        function finish() {
            Object.keys(state.trips).forEach(function (k) {
                var t = state.trips[k];
                if (t.date.indexOf(prefix) !== 0) return;
                var s = summarize(t);
                if (s.ok) rows[k] = { n: s.n, hs: s.hs, hst: s.hst, topStop: s.topStop, topStart: s.topStart };
            });
            var n = 0, hs = 0, hst = 0, a = [], b = [];
            Object.keys(rows).forEach(function (k) { var r = rows[k]; n += r.n; hs += r.hs; hst += r.hst; a.push(r.topStop); b.push(r.topStart); });
            return { n: n, hs: hs, hst: hst, ok: n > 0, topStop: countTop(a), topStart: countTop(b) };
        }
        var url = window.GAS_WEB_APP_URL;
        if (!url || !driver()) return Promise.resolve(finish());
        return fetch(url + '?action=get_stop_habit&driver=' + encodeURIComponent(driver()) + '&year=' + year + '&month=' + month)
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res && res.success) {
                    (res.rows || []).forEach(function (r) {
                        rows[r[0]] = { n: Number(r[1]) || 0, hs: Number(r[2]) || 0, hst: Number(r[3]) || 0, topStop: String(r[4] || '').split('|').filter(Boolean), topStart: String(r[5] || '').split('|').filter(Boolean) };
                    });
                }
                return finish();
            })
            .catch(function () { return finish(); });
    }

    window.DrivingHabit = { onFix: onFix, upload: upload, getCurrent: getCurrent, fetchMonth: fetchMonth, getDiag: function () { return diag; }, MIN_STOPS: MIN_STOPS };
    setInterval(upload, 30000);
    window.addEventListener('load', function () { setTimeout(upload, 5000); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) upload(); });
    window.addEventListener('pagehide', upload);
})();
