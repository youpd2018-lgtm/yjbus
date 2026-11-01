// ================================================================
// 나의 운행 상태 (라이브 모달 운전대 아이콘 색), 2026-11-01 재필씨 지시
// - 모든 기사는 0점 = 금색에서 출발. 점수가 쌓일수록 나빠짐.
// - 급가속·급정거·급회전: 한 번마다 1점, 되돌릴 수 없음 (그날 계속 쌓임)
// - 오차: 정류장을 지날 때마다 확정된 오차(빠르거나 늦거나 상관없이)
//     5분 이내 = 0점, 6~10분(5분 넘게) 한 번이라도 = 1점, 11분 이상(10분 넘게) = 2점 (가장 나빴던 단계만, 라이브 모달 오차 색 3단계와 같음, 2026-11-01)
//     편도(기점·종점 사이)마다 따로 셈: 편도 최대 2점(왕복 회차 최대 4점). 편도 끝 기점·종점을 오차 5분 이내로 지나면 그 편도 점수는 0점
// - 색: 0~5점 금색, 6~10점 녹색, 11~15점 주황, 16점 이상 빨강 (2026-11-01 사용자 지시)
// - 라이브 모달이 켜져 있는 동안만 GPS가 들어오므로 켠 시간만 측정됨
// - 하루 근무 단위(새벽 3시 전은 전날 근무)로 쌓고, 서버 시트 '운행상태'에 하루 한 줄로 올림
//   (점수가 바뀌면 5분 안에, 앱을 닫을 때, 다음에 앱을 열 때 못 올린 날 것도 올림. 같은 날 줄은 덮어써서 근무가 끝난 값이 남음)
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
    var DELAY_1 = 5, DELAY_2 = 10;   // 오차 1점 / 2점 기준(분)

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    var DAY_START_HOUR = 3;  // 새벽 3시 전 운행은 전날 근무로 봄 (막차가 자정을 넘기기 때문)
    function dateStr(n) { return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); }
    function todayStr() { var n = new Date(); if (n.getHours() < DAY_START_HOUR) n = new Date(n.getTime() - 86400000); return dateStr(n); }
    function driver() { return window.currentDriver || ''; }
    var PREFIX = 'yb_drvgrade_';
    function key() { return PREFIX + driver() + '_' + todayStr(); }

    var st = null, stKey = '';
    function state() {
        var k = key();
        if (st && stKey === k) return st;
        stKey = k; st = null;
        try { st = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { }
        if (!st || typeof st !== 'object') st = { acc: 0, brk: 0, turn: 0, dly: 0, ms: 0, log: [], ver: 0, sent: 0 };
        if (!st.date) st.date = todayStr();
        if (!st.driver) st.driver = driver();
        return st;
    }
    function save(quiet) {
        try {
            st.ver = (st.ver || 0) + 1;
            localStorage.setItem(stKey, JSON.stringify(st));
        } catch (e) { }
        if (!quiet) {
            try { window.dispatchEvent(new CustomEvent('yb-drivegrade')); } catch (e) { }
            scheduleUpload();
        }
    }
    function note(what) {
        var s = state();
        var n = new Date();
        s.log.push(pad(n.getHours()) + ':' + pad(n.getMinutes()) + ':' + pad(n.getSeconds()) + ' ' + what);
        if (s.log.length > 30) s.log.shift();
    }

    function scoreOf(s) { return (s.acc || 0) + (s.brk || 0) + (s.turn || 0) + (s.dly || 0); }
    function score() { return scoreOf(state()); }
    // 1 금색 · 2 녹색 · 3 주황 · 4 빨강
    function gradeOf(p) { return p <= 5 ? 1 : (p <= 10 ? 2 : (p <= 15 ? 3 : 4)); }
    function grade() { return gradeOf(score()); }
    var COLOR = ['', '금색', '녹색', '주황', '빨강'];

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
            else if (prev) { var s0 = state(); s0.ms = (s0.ms || 0) + (now - prev.t); if (Math.floor(s0.ms / 60000) !== Math.floor((s0.ms - (now - prev.t)) / 60000)) save(true); }   // 측정 시간(분)
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
    function onStopPassed(diffMin, isAnchor, stopName, isLast) {
        try {
            if (simOn() || !driver()) return;
            if (typeof diffMin !== 'number' || isNaN(diffMin)) return;
            var a = Math.abs(diffMin);
            var s = state();
            var lv = a > DELAY_2 ? 2 : (a > DELAY_1 ? 1 : 0);
            var changed = false;
            // 편도(구간)마다 따로 셈 (2026-11-01 사용자 지시): 한 편도에서 최대 2점 → 왕복 1회차 최대 4점, 편도 1회차 최대 2점
            //   dlyLeg = 지금 달리는 편도에서 가장 나빴던 단계, dlyDone = 끝난 편도들의 점수 합, dly = 둘의 합(화면·서버용)
            if (s.dlyDone === undefined) { s.dlyDone = s.dly || 0; s.dlyLeg = 0; s.legN = 0; }   // 옛 기록 이어받기
            if (isAnchor) {
                // 기점·종점(앵커) = 편도 끝. 5분 이내로 지나면 이 편도 점수 0, 아니면 이 편도 점수를 확정
                if (s.legN > 0) {
                    var legPts = a <= DELAY_1 ? 0 : Math.max(s.dlyLeg || 0, lv);
                    if (a <= DELAY_1 && s.dlyLeg) note('기점·종점 정시 통과(' + (stopName || '') + ') → 이 편도 시간 준수 0점');
                    else if (legPts) note('편도 끝(' + (stopName || '') + ') 오차 ' + diffMin + '분 → 이 편도 ' + legPts + '점 확정');
                    s.dlyDone += legPts;
                    changed = true;
                }
                s.dlyLeg = 0; s.legN = 0;   // 다음 편도 시작
            } else {
                s.legN = (s.legN || 0) + 1;
                if (lv > (s.dlyLeg || 0)) {
                    s.dlyLeg = lv; changed = true;
                    note('오차 ' + diffMin + '분(' + (stopName || '') + ') → 이 편도 ' + lv + '점');
                }
            }
            s.dly = s.dlyDone + (s.dlyLeg || 0);
            if (isLast) { snapTrip(); changed = true; }   // 회차 끝: 지금까지의 점수를 회차 기록으로 남김
            if (changed) save();
        } catch (e) { console.warn('[운행상태] 오차 처리 오류', e); }
    }

    // 회차가 끝날 때(종점 통과) 그때까지의 누적 점수를 남김 → 근무통계에서 회차별로 몇 점 늘었는지 보여 줌
    function snapTrip() {
        var s = state();
        s.trips = s.trips || [];
        var label = String(window.currentTripRoundNumber || '').trim() || ((s.trips.length + 1) + '회차');
        var n = new Date(), at = pad(n.getHours()) + ':' + pad(n.getMinutes());
        var snap = { t: label, at: at, acc: s.acc || 0, brk: s.brk || 0, turn: s.turn || 0, dly: s.dly || 0 };
        var prev = s.trips[s.trips.length - 1];
        if (prev && prev.t === label) s.trips[s.trips.length - 1] = snap;   // 같은 회차 종점을 또 지나면 덮어씀
        else s.trips.push(snap);
        if (s.trips.length > 12) s.trips.shift();
    }

    // 근무통계 화면용: 오늘 근무 기록
    function getToday() {
        var s = state();
        return { date: s.date, score: score(), grade: grade(), color: COLOR[grade()], acc: s.acc || 0, brk: s.brk || 0, turn: s.turn || 0, dly: s.dly || 0, min: Math.round((s.ms || 0) / 60000), trips: (s.trips || []).slice() };
    }

    // 근무통계 화면용: 이달 합계 (서버에 올라간 날 + 아직 못 올린 이 폰 기록, 같은 날은 이 폰 값 우선)
    function fetchMonth(year, month) {
        var prefix = year + '-' + pad(month) + '-';
        var days = {};
        function local() {
            try {
                var me = PREFIX + driver() + '_';
                for (var i = 0; i < localStorage.length; i++) {
                    var k = localStorage.key(i);
                    if (!k || k.indexOf(me) !== 0) continue;
                    var r = JSON.parse(localStorage.getItem(k) || 'null');
                    var d = r && (r.date || k.slice(me.length));
                    if (!r || !d || d.indexOf(prefix) !== 0) continue;
                    var p = scoreOf(r);
                    if (!p && !r.ms) continue;   // 측정 안 한 날은 뺌
                    days[d] = { date: d, score: p, grade: gradeOf(p), acc: r.acc || 0, brk: r.brk || 0, turn: r.turn || 0, dly: r.dly || 0, min: Math.round((r.ms || 0) / 60000), trips: r.trips || [] };
                }
            } catch (e) { }
        }
        function finish() {
            local();
            var list = Object.keys(days).sort().map(function (k) { return days[k]; });
            var sum = { days: list.length, acc: 0, brk: 0, turn: 0, dly: 0, min: 0, score: 0, colors: [0, 0, 0, 0, 0] };
            list.forEach(function (d) { sum.acc += d.acc; sum.brk += d.brk; sum.turn += d.turn; sum.dly += d.dly; sum.min += d.min; sum.score += d.score; sum.colors[d.grade] += 1; });
            sum.avg = list.length ? Math.round(sum.score / list.length * 10) / 10 : 0;
            sum.avgGrade = gradeOf(Math.round(sum.avg));
            sum.list = list;
            return sum;
        }
        var url = window.GAS_WEB_APP_URL;
        if (!url || !driver()) return Promise.resolve(finish());
        return fetch(url + '?action=get_drive_grade&driver=' + encodeURIComponent(driver()) + '&year=' + year + '&month=' + month)
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res && res.success) (res.rows || []).forEach(function (r) {
                    var p = Number(r[4]) || 0;
                    days[r[0]] = { date: r[0], score: p, grade: gradeOf(p), acc: Number(r[6]) || 0, brk: Number(r[7]) || 0, turn: Number(r[8]) || 0, dly: Number(r[9]) || 0, min: Number(r[10]) || 0 };
                });
                return finish();
            })
            .catch(function () { return finish(); });
    }

    // ---- 서버 시트 '운행상태'에 올리기 (하루 한 줄, 덮어쓰기) ----
    var upTimer = null, uploading = false;
    function scheduleUpload() {
        if (upTimer) return;
        upTimer = setTimeout(function () { upTimer = null; upload(); }, 5 * 60 * 1000);
    }
    function sched(date) {
        try {
            var k = typeof getDriverKey === 'function' ? getDriverKey('sched_' + date) : 'sched_' + date;
            return JSON.parse(localStorage.getItem(k) || 'null');
        } catch (e) { return null; }
    }
    function upload() {
        try {
            var url = window.GAS_WEB_APP_URL;
            if (uploading || !url || !driver()) return;
            state();   // 지금 기록도 목록에 들어가게
            var me = PREFIX + driver() + '_';
            var keys = [];
            for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(me) === 0) keys.push(k); }
            keys.sort();
            var todo = null, rec = null;
            for (var j = 0; j < keys.length; j++) {
                var r = null;
                try { r = JSON.parse(localStorage.getItem(keys[j]) || 'null'); } catch (e) { }
                if (!r) continue;
                if ((r.sent || 0) >= (r.ver || 0)) {
                    if (keys[j] !== key()) localStorage.removeItem(keys[j]);   // 다 올린 지난 날은 폰에서 지움
                    continue;
                }
                todo = keys[j]; rec = r; break;
            }
            if (!todo) return;
            var date = rec.date || todo.slice(me.length);
            var sd = sched(date) || {};
            var p = scoreOf(rec), sentVer = rec.ver;
            uploading = true;
            fetch(url, {
                method: 'POST', headers: { 'Content-Type': 'text/plain' }, keepalive: true,
                body: JSON.stringify({
                    action: 'save_drive_grade', driver: driver(), date: date,
                    route: sd.route || '', seq: sd.seq || '', time: sd.time || '',
                    score: p, color: COLOR[gradeOf(p)],
                    acc: rec.acc || 0, brk: rec.brk || 0, turn: rec.turn || 0, dly: rec.dly || 0,
                    min: Math.round((rec.ms || 0) / 60000)
                })
            }).then(function (r) { return r.json(); })
                .then(function (res) {
                    uploading = false;
                    if (res && res.success) {
                        var cur = null;
                        try { cur = JSON.parse(localStorage.getItem(todo) || 'null'); } catch (e) { }
                        if (cur) { cur.sent = sentVer; localStorage.setItem(todo, JSON.stringify(cur)); }
                        if (st && stKey === todo) st.sent = sentVer;
                        setTimeout(upload, 2000);   // 못 올린 다른 날이 있으면 이어서
                    }
                })
                .catch(function () { uploading = false; });
        } catch (e) { uploading = false; }
    }
    window.addEventListener('load', function () { setTimeout(upload, 8000); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) upload(); });
    window.addEventListener('pagehide', upload);

    window.DriveGrade = { onFix: onFix, onStopPassed: onStopPassed, score: score, grade: grade, upload: upload, getToday: getToday, fetchMonth: fetchMonth, today: todayStr, gradeOf: gradeOf, COLOR: COLOR };
    window.ybDriveInfo = function () {
        var s = state();
        return { 날짜: s.date, 점수: score(), 색: COLOR[grade()], 급가속: s.acc, 급정거: s.brk, 급회전: s.turn, 오차점수: s.dly, 측정분: Math.round((s.ms || 0) / 60000), 서버저장: (s.sent || 0) >= (s.ver || 0), 기록: s.log.slice() };
    };
})();
