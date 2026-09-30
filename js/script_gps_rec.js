// ================================================================
// 🛰️ [GPS 주행 기록 모으기] script_gps_rec.js
// - 라이브 모달이 켜져 있고 버스가 움직이는 동안, 위치를 노선별로 폰에 모아 두었다가 서버(gps_기록 시트)로 올립니다.
// - 올리는 때: 모달을 닫을 때 / 화면을 벗어날 때 / 점이 400개 쌓였을 때 / 앱을 다시 열었을 때(남은 기록)
// - 서버 전송에 실패하면 폰에 남겨 두었다가 다음에 다시 올립니다.
// - 노선(202A, 203 등)마다 코스가 같으므로 순번·회차는 기록하지 않습니다.
// ================================================================
(function () {
    var LS_BUF = 'yb_gpsrec_buf_v1';
    var MIN_MOVE_M = 15;      // 이 거리 이상 움직였을 때만 기록
    var MIN_SPEED_KMH = 3;    // 정차 중(차고지 대기 등)에는 기록하지 않음
    var MAX_ACC_M = 60;       // 위치 오차가 이보다 크면 버림
    var FLUSH_AT = 400;       // 점이 이만큼 쌓이면 올림

    var cur = null;           // { route, driver, date, pts: [[lat, lon, sec], ...] }
    var last = null;          // 마지막으로 기록한 점
    var flushing = false;

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

    function loadPending() { try { return JSON.parse(lsGet(LS_BUF) || '[]'); } catch (e) { return []; } }
    function savePending(arr) { lsSet(LS_BUF, JSON.stringify(arr)); }

    function dist(lat1, lon1, lat2, lon2) {
        var R = 6371000, d2r = Math.PI / 180;
        var dLat = (lat2 - lat1) * d2r, dLon = (lon2 - lon1) * d2r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * d2r) * Math.cos(lat2 * d2r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    function todayStr() {
        var n = new Date();
        return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
    }

    // 지금 진행 중인 기록을 '올릴 대기 목록'으로 옮김
    function stash() {
        if (!cur || cur.pts.length < 2) { cur = null; return; }
        var pending = loadPending();
        pending.push(cur);
        savePending(pending);
        cur = null; last = null;
    }

    function encode(item) {
        return item.pts.map(function (p) { return p[0].toFixed(5) + ',' + p[1].toFixed(5) + ',' + p[2]; }).join(';');
    }

    // 대기 목록을 서버로 올림 (성공한 것만 지움)
    function upload(keepalive) {
        var url = window.GAS_WEB_APP_URL;
        if (!url || flushing) return;
        var pending = loadPending();
        if (!pending.length) return;
        flushing = true;
        var item = pending[0];
        var body = JSON.stringify({ action: 'save_gps_track', date: item.date, route: item.route, driver: item.driver, count: item.pts.length, points: encode(item) });
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, keepalive: !!keepalive && body.length < 60000 })
            .then(function (r) { return r.json(); })
            .then(function (res) {
                flushing = false;
                if (res && res.success) {
                    var now = loadPending();
                    now.shift();
                    savePending(now);
                    if (now.length) upload(false);
                }
            })
            .catch(function () { flushing = false; });   // 실패하면 그대로 두고 다음에 다시 시도
    }

    // GPS 위치가 들어올 때마다 호출 (script_gps_sim.js의 onGpsLocationUpdate)
    window.gpsRecAdd = function (lat, lon, speedKmh, accuracy) {
        try {
            if (window.simState && window.simState.active) return;
            if (accuracy && accuracy > MAX_ACC_M) return;
            if (speedKmh !== null && speedKmh !== undefined && speedKmh < MIN_SPEED_KMH) return;
            var duty = window._gpsDuty || {};
            var route = duty.routeShort || duty.baseRoute || '';
            if (!route) return;

            if (cur && cur.route !== route) stash();
            if (!cur) cur = { route: route, driver: window.currentDriver || '', date: todayStr(), pts: [] };
            if (last && dist(last[0], last[1], lat, lon) < MIN_MOVE_M) return;

            var n = new Date();
            last = [lat, lon, n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()];
            cur.pts.push(last);
            if (cur.pts.length >= FLUSH_AT) { stash(); upload(false); }
        } catch (e) { console.warn('GPS 기록 오류:', e); }
    };

    // 모달을 닫거나 화면을 벗어날 때
    window.gpsRecFlush = function () { stash(); upload(true); };
    document.addEventListener('visibilitychange', function () { if (document.hidden) window.gpsRecFlush(); });
    window.addEventListener('pagehide', function () { window.gpsRecFlush(); });
    // 앱을 열 때 지난번에 못 올린 기록이 있으면 올림
    window.addEventListener('load', function () { setTimeout(function () { upload(false); }, 4000); });
})();
