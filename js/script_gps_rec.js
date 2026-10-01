// ================================================================
// 🛰️ [GPS 주행 기록 모으기 - 관리자 전용] script_gps_rec.js
// - 관리자(유재필)만 쓸 수 있고, 라이브 모달의 [기록 시작] 단추를 눌러야 기록이 시작됩니다. (모달을 켠다고 자동 기록 안 함)
// - 흐름: 기록 시작 → (출발지 / 기점 / 도착지 단추를 해당 장소에서 누름) → 기록 종료 → 서버(gps_기록 시트)로 올림
// - 같은 노선은 서버가 5번까지만 받습니다. 그 이상이면 시작할 때 알려 줍니다.
// - 기록 중에는 화면이 꺼져도 폰에 저장해 두므로 이어서 기록됩니다.
// ================================================================
(function () {
    var ADMIN_NAME = '유재필';
    var LS_BUF = 'yb_gpsrec_buf_v2';   // 올릴 대기 목록
    var LS_CUR = 'yb_gpsrec_cur_v2';   // 기록 중인 것
    var MARKS = ['출발지', '기점', '도착지'];
    var MIN_MOVE_M = 15;      // 이 거리 이상 움직였을 때만 점을 찍음
    var MIN_SPEED_KMH = 3;    // 정차 중에는 점을 찍지 않음
    var MAX_ACC_M = 60;       // 위치 오차가 이보다 크면 버림
    var AUTOSAVE_EVERY = 20;  // 점 20개마다 폰에 임시 저장

    var cur = null;           // { route, driver, date, pts: [[lat, lon, sec]], marks: {이름: [lat, lon, sec]} }
    var last = null;
    var flushing = false;

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }

    window.isGpsAdmin = function () { return window.currentDriver === ADMIN_NAME; };

    function loadPending() { try { return JSON.parse(lsGet(LS_BUF) || '[]'); } catch (e) { return []; } }
    function savePending(arr) { lsSet(LS_BUF, JSON.stringify(arr)); }
    function saveCur() { if (cur) lsSet(LS_CUR, JSON.stringify(cur)); else lsDel(LS_CUR); }

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
    function nowSec() { var n = new Date(); return n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds(); }
    function dutyRoute() { var d = window._gpsDuty || {}; return d.routeShort || d.baseRoute || ''; }

    function post(obj) {
        return fetch(window.GAS_WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(obj) })
            .then(function (r) { return r.json(); });
    }

    // ---------- 화면 (라이브 모달의 #gpsRecBar) ----------
    function chip(label, on, handler) {
        return '<span class="nav-chip' + (on ? ' on' : '') + '" onclick="' + handler + '">' + label + '</span>';
    }
    function render() {
        var bar = document.getElementById('gpsRecBar');
        if (!bar) return;
        if (!window.isGpsAdmin()) { bar.hidden = true; bar.innerHTML = ''; return; }
        bar.hidden = false;
        if (!cur) { bar.innerHTML = chip('● 기록 시작', false, 'gpsRecStart()'); return; }
        var html = '<span class="nav-chip on" style="cursor:default">' + cur.route + ' 기록중 ' + cur.pts.length + '점</span>';
        MARKS.forEach(function (m) { html += chip((cur.marks[m] ? '✓ ' : '') + m, !!cur.marks[m], "gpsRecMark('" + m + "')"); });
        html += chip('■ 기록 종료', false, 'gpsRecStop()');
        bar.innerHTML = html;
    }
    window.gpsRecRender = render;

    // ---------- 시작 / 표시 / 종료 ----------
    window.gpsRecStart = function () {
        if (!window.isGpsAdmin() || cur) return;
        var route = dutyRoute();
        if (!route) { alert('오늘 근무 노선을 알 수 없어요.'); return; }
        post({ action: 'gps_track_status', route: route }).then(function (res) {
            if (res && res.full) { alert(route + ' 노선은 이미 ' + res.count + '번 기록되어서 더 기록하지 않아요.'); return; }
            begin(route);
        }).catch(function () {
            if (confirm('서버에 기록 횟수를 확인하지 못했어요. 그래도 시작할까요?')) begin(route);
        });
    };
    function begin(route) {
        cur = { route: route, driver: window.currentDriver || '', date: todayStr(), pts: [], marks: {} };
        last = null;
        saveCur();
        render();
    }

    window.gpsRecMark = function (name) {
        if (!cur) return;
        var p = window.lastGpsPosition;
        if (!p) { alert('GPS 위치를 아직 받지 못했어요.'); return; }
        cur.marks[name] = [p.lat, p.lon, nowSec()];
        saveCur();
        render();
    };

    window.gpsRecStop = function () {
        if (!cur) return;
        var missing = MARKS.filter(function (m) { return !cur.marks[m]; });
        var msg = missing.length ? (missing.join(', ') + ' 표시를 안 했어요. 그래도 기록을 끝낼까요?') : '기록을 끝내고 서버로 올릴까요?';
        if (!confirm(msg)) return;
        if (cur.pts.length < 2) { cur = null; last = null; saveCur(); render(); alert('점이 너무 적어서 저장하지 않았어요.'); return; }
        var pending = loadPending();
        pending.push(cur);
        savePending(pending);
        cur = null; last = null;
        saveCur();
        render();
        upload(false);
    };

    // ---------- 점 모으기 (script_gps_sim.js의 GPS 갱신마다 호출) ----------
    window.gpsRecAdd = function (lat, lon, speedKmh, accuracy) {
        try {
            if (!cur || !window.isGpsAdmin()) return;
            if (window.simState && window.simState.active) return;
            if (accuracy && accuracy > MAX_ACC_M) return;
            if (speedKmh !== null && speedKmh !== undefined && speedKmh < MIN_SPEED_KMH) return;
            if (last && dist(last[0], last[1], lat, lon) < MIN_MOVE_M) return;
            last = [lat, lon, nowSec()];
            cur.pts.push(last);
            if (cur.pts.length % AUTOSAVE_EVERY === 0) saveCur();
            render();
        } catch (e) { console.warn('GPS 기록 오류:', e); }
    };

    // ---------- 서버로 올리기 ----------
    function encode(pts) {
        return pts.map(function (p) { return p[0].toFixed(5) + ',' + p[1].toFixed(5) + ',' + p[2]; }).join(';');
    }
    function encodeMarks(marks) {
        return MARKS.filter(function (m) { return marks[m]; }).map(function (m) {
            var p = marks[m];
            return m + ',' + p[0].toFixed(5) + ',' + p[1].toFixed(5) + ',' + p[2];
        }).join(';');
    }
    function upload() {
        if (!window.GAS_WEB_APP_URL || flushing) return;
        var pending = loadPending();
        if (!pending.length) return;
        flushing = true;
        var item = pending[0];
        post({ action: 'save_gps_track', date: item.date, route: item.route, driver: item.driver, count: item.pts.length, points: encode(item.pts), marks: encodeMarks(item.marks || {}) })
            .then(function (res) {
                flushing = false;
                if (res && (res.success || res.full)) {   // 성공했거나 이미 5번이 차서 더 못 받는 경우
                    var now = loadPending();
                    now.shift();
                    savePending(now);
                    if (res.full) alert(item.route + ' 노선은 이미 5번 기록되어서 이번 기록은 저장하지 않았어요.');
                    else if (cur === null) alert(item.route + ' 기록을 서버에 저장했어요. (' + item.pts.length + '점)');
                    if (now.length) upload();
                } else {
                    alert('기록 저장 실패: ' + ((res && res.error) || '알 수 없는 오류') + '\n폰에 남겨 두었다가 다시 올릴게요.');
                }
            })
            .catch(function () { flushing = false; });   // 실패하면 폰에 남겨 두고 다음에 다시 시도
    }

    // 모달을 닫거나 화면이 꺼져도 기록은 끝나지 않고 폰에만 임시 저장
    window.gpsRecFlush = function () { saveCur(); };
    document.addEventListener('visibilitychange', function () { if (document.hidden) saveCur(); });
    window.addEventListener('pagehide', saveCur);

    // 앱을 열 때: 관리자가 아니면 남은 기록을 모두 지우고, 관리자면 기록 중이던 것을 되살리고 못 올린 것을 올림
    window.gpsRecInit = function () {
        if (!window.currentDriver) return;   // 아직 로그인 전
        if (!window.isGpsAdmin()) { lsDel(LS_BUF); lsDel(LS_CUR); lsDel('yb_gpsrec_buf_v1'); cur = null; render(); return; }
        if (!cur) { try { cur = JSON.parse(lsGet(LS_CUR) || 'null'); } catch (e) { cur = null; } }
        render();
        upload();
    };
    window.addEventListener('load', function () { setTimeout(window.gpsRecInit, 4000); });
})();
