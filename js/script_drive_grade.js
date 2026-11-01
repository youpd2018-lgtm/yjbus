// ================================================================
// 나의 운행 상태 (라이브 모달 운전대 아이콘 색), 2026-11-01 재필씨 지시
// - 모든 기사는 0점 = 금색에서 출발. 점수가 쌓일수록 나빠짐.
// - 급가속·급정거·급회전: 한 번마다 1점, 되돌릴 수 없음 (그날 계속 쌓임)
// - 오차: 정류장을 지날 때마다 확정된 오차(빠르거나 늦거나 상관없이)
//     3분 이내 = 0점, 3분 넘게 한 번이라도 = 1점, 6분 넘게 = 2점 (가장 나빴던 단계만, 더해지지 않음)
//     기점·종점(앵커 정류장)을 오차 3분 이내로 지나면 오차 점수는 0점으로 되돌림
// - 색: 0~5점 금색, 6~10점 녹색, 11~15점 주황, 16점 이상 빨강 (2026-11-01 사용자 지시)
// - 라이브 모달이 켜져 있는 동안만 GPS가 들어오므로 켠 시간만 측정됨
// - 시험: 개발자 도구에서 ybDriveInfo()
// ================================================================
(function () {
    'use strict';

    // ---- 기준값 (교통안전공단 운행기록 위험운전 기준을 참고, 운행해 보며 조정) ----
    var ACC_KMHS = 6;        // 급가속: 1초에 6km/h 넘게 빨라짐 (5km/h 넘게 달리던 중)
    var START_KMHS = 8;      // 급출발: 거의 멈춤(5km/h 이하)에서 1초에 8km/h 넘게
    var BRAKE_KMHS = 9;      // 급정거·급감속: 1초에 9km/h 넘게 느려짐
    var TURN_DEG = 60;       // 급회전: 4초 안에 60도 넘게 방향이 바뀜
    var TURN_MIN_KMH = 25;   //         그동안 평균 속도가 25km/h 이상일 때만
    var MAX_ACC = 30;        // 1초에 30km/h 넘게 바뀐 것은 GPS 튐으로 보고 무시
    var MAX_ACCURACY_M = 20; // GPS 정확도가 20m보다 나쁘면 쓰지 않음
    var COOL_MS = 5000;      // 같은 동작은 5초 안에 한 번만 셈
    var DELAY_1 = 3, DELAY_2 = 6;   // 오차 1점 / 2점 기준(분)

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function todayStr() { var n = new Date(); return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); }
    function driver() { return window.currentDriver || ''; }
    function key() { return 'yb_drvgrade_' + driver() + '_' + todayStr(); }

    var st = null, stKey = '';
    function state() {
        var k = key();
        if (st && stKey === k) return st;
        stKey = k; st = null;
        try { st = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { }
        if (!st || typeof st !== 'object') st = { acc: 0, brk: 0, turn: 0, dly: 0, log: [] };
        return st;
    }
    function save() {
        try {
            localStorage.setItem(stKey, JSON.stringify(st));
            // 지난 날짜 기록은 정리 (오늘 것만 둠)
            for (var i = localStorage.length - 1; i >= 0; i--) {
                var k = localStorage.key(i);
                if (k && k.indexOf('yb_drvgrade_') === 0 && k !== stKey) localStorage.removeItem(k);
            }
        } catch (e) { }
        try { window.dispatchEvent(new CustomEvent('yb-drivegrade')); } catch (e) { }
    }
    function note(what) {
        var s = state();
        var n = new Date();
        s.log.push(pad(n.getHours()) + ':' + pad(n.getMinutes()) + ':' + pad(n.getSeconds()) + ' ' + what);
        if (s.log.length > 30) s.log.shift();
    }

    function score() { var s = state(); return s.acc + s.brk + s.turn + s.dly; }
    // 1 금색 · 2 녹색 · 3 주황 · 4 빨강
    function grade() {
        var p = score();
        return p <= 5 ? 1 : (p <= 10 ? 2 : (p <= 15 ? 3 : 4));
    }

    function simOn() { return !!(window.simState && window.simState.active); }

    // ---- 급가속·급정거·급회전 (GPS 한 번 들어올 때마다) ----
    var buf = [];            // {t, v, h, lat, lon}
    var lastAt = { acc: 0, brk: 0, turn: 0 };

    function bearing(a, b) {
        var r = Math.PI / 180;
        var y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
        var x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
        return (Math.atan2(y, x) / r + 360) % 360;
    }
    function distM(a, b) {
        var r = Math.PI / 180, R = 6371000;
        var dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
        var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * R * Math.asin(Math.sqrt(x));
    }
    function angDiff(a, b) { var d = ((b - a + 540) % 360) - 180; return d; }

    function hit(type, now, label) {
        if (now - lastAt[type] < COOL_MS) return;
        lastAt[type] = now;
        state()[type] += 1;
        note(label);
        save();
    }

    function onFix(pos) {
        try {
            if (simOn() || !driver() || !pos || !pos.coords) return;
            var c = pos.coords;
            if (c.speed === null || c.speed === undefined || c.speed < 0) return;
            if (c.accuracy && c.accuracy > MAX_ACCURACY_M) return;
            var now = Date.now();
            var cur = { t: now, v: c.speed * 3.6, h: (typeof c.heading === 'number' && !isNaN(c.heading)) ? c.heading : null, lat: c.latitude, lon: c.longitude };
            var prev = buf.length ? buf[buf.length - 1] : null;
            if (cur.h === null && prev && distM(prev, cur) >= 5) cur.h = bearing(prev, cur);   // 방향값이 없으면 위치로 계산
            if (prev && now - prev.t > 5000) buf = [];   // 끊겼다 다시 들어오면 새로 시작
            buf.push(cur);
            while (buf.length && now - buf[0].t > 6000) buf.shift();

            // 속도 변화: 약 2초 전 값과 비교 (한 번 튄 값에 덜 흔들리게)
            var base = null;
            for (var i = buf.length - 2; i >= 0; i--) {
                var dt = (now - buf[i].t) / 1000;
                if (dt >= 1.5 && dt <= 3) { base = buf[i]; break; }
            }
            if (base) {
                var rate = (cur.v - base.v) / ((now - base.t) / 1000);
                if (Math.abs(rate) <= MAX_ACC) {
                    if (base.v <= 5 && rate >= START_KMHS) hit('acc', now, '급출발 ' + rate.toFixed(1) + 'km/h/s');
                    else if (base.v > 5 && rate >= ACC_KMHS) hit('acc', now, '급가속 ' + rate.toFixed(1) + 'km/h/s');
                    else if (rate <= -BRAKE_KMHS) hit('brk', now, '급정거 ' + rate.toFixed(1) + 'km/h/s');
                }
            }

            // 방향 변화: 4초(3~5초) 안의 누적 회전각
            var turn = 0, vSum = 0, n = 0, ok = false, prevH = null;
            for (var j = 0; j < buf.length; j++) {
                var dtj = (now - buf[j].t) / 1000;
                if (dtj > 5) continue;
                if (buf[j].h === null) { prevH = null; continue; }
                if (prevH !== null) turn += angDiff(prevH, buf[j].h);
                prevH = buf[j].h;
                vSum += buf[j].v; n++;
                if (dtj >= 3) ok = true;
            }
            if (ok && n >= 3 && vSum / n >= TURN_MIN_KMH && Math.abs(turn) >= TURN_DEG) {
                hit('turn', now, '급회전 ' + Math.round(Math.abs(turn)) + '도 / 평균 ' + Math.round(vSum / n) + 'km/h');
            }
        } catch (e) { console.warn('[운행상태] GPS 처리 오류', e); }
    }

    // ---- 오차 (정류장 통과가 확정될 때마다 script_gps_sim.js가 부름) ----
    function onStopPassed(diffMin, isAnchor, stopName) {
        try {
            if (simOn() || !driver()) return;
            if (typeof diffMin !== 'number' || isNaN(diffMin)) return;
            var a = Math.abs(diffMin);
            var s = state();
            var lv = a > DELAY_2 ? 2 : (a > DELAY_1 ? 1 : 0);
            if (isAnchor && a <= DELAY_1) {
                if (s.dly) note('기점·종점 정시 통과(' + (stopName || '') + ') → 오차 점수 0');
                s.dly = 0;
            } else if (lv > s.dly) {
                s.dly = lv;
                note('오차 ' + diffMin + '분(' + (stopName || '') + ') → 오차 ' + lv + '점');
            } else return;
            save();
        } catch (e) { console.warn('[운행상태] 오차 처리 오류', e); }
    }

    window.DriveGrade = { onFix: onFix, onStopPassed: onStopPassed, score: score, grade: grade };
    window.ybDriveInfo = function () {
        var s = state();
        return { 점수: score(), 색: ['', '금색', '녹색', '주황', '빨강'][grade()], 급가속: s.acc, 급정거: s.brk, 급회전: s.turn, 오차점수: s.dly, 기록: s.log.slice() };
    };
})();
