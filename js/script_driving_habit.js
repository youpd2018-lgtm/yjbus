// ================================================================
// 🚌 [운행 습관 집계] script_driving_habit.js
// - 라이브 모달에서 GPS가 들어올 때마다(약 1초 간격) 급출발·급정거·과속·급회전을 세어 폰에 저장하고 서버(운행습관 시트)에 올립니다.
// - 기준: 한국교통안전공단 운행기록분석 위험운전행동(버스) 기준을 GPS용으로 단순화
//   · 급출발: 멈춘 상태(3km/h 이하)에서 1초에 11km/h 이상 빨라짐
//   · 급정거: 1초에 7.5km/h 이상 줄어 속도가 3km/h 이하가 됨 (직전 속도 8km/h 이상)
//   · 과속: 제한속도 +20km/h 초과가 3번 연속 (제한속도 정보가 없으면 판정 안 함)
//   · 급회전: 15km/h 이상에서 2초 안에 진행 방향이 60~120도 바뀜
// - 값: 이번 회차(cur)·오늘은 이 폰 기준, 이달은 서버(운행습관 시트) 합계
//   (하루 동안은 단말기를 바꾸지 않으므로 오늘은 이 폰 값을 바로 보여주고, 이달은 서버 합계(오늘 제외) + 오늘 값)
// ================================================================
(function () {
    var NAMES = ['급출발', '급정거', '과속', '급회전'];
    var KEY_PREFIX = 'yb_habit_';
    var MAX_ACC_M = 40;
    var MAX_GAP_S = 3;

    var buf = [];                 // 최근 위치 [{t, v, h}]
    var cool = {};                // 항목별 마지막 집계 시각(초)
    var overCnt = 0, overArmed = true;
    var lastTripKey = '', lastStopIdx = null;
    var uploading = false;

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function zero() { return { '급출발': 0, '급정거': 0, '과속': 0, '급회전': 0 }; }
    function pad(n) { return String(n).padStart(2, '0'); }
    function todayStr() { var n = new Date(); return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); }
    function driver() { return window.currentDriver || ''; }
    function dayKey(date) { return KEY_PREFIX + driver() + '_' + date; }

    function loadDay(date) {
        try {
            var o = JSON.parse(lsGet(dayKey(date)) || 'null');
            if (o && o.total) return { cur: Object.assign(zero(), o.cur || {}), total: Object.assign(zero(), o.total) };
        } catch (e) { }
        return { cur: zero(), total: zero() };
    }
    function saveDay(date, d) { lsSet(dayKey(date), JSON.stringify(d)); }

    // 아직 서버에 못 올린 횟수 (기사별)
    function pendKey() { return KEY_PREFIX + 'pending_' + driver(); }
    function loadPending() {
        try {
            var o = JSON.parse(lsGet(pendKey()) || 'null');
            if (o && o.date) return { date: o.date, v: Object.assign(zero(), o.v || {}) };
        } catch (e) { }
        return { date: todayStr(), v: zero() };
    }
    function savePending(p) { lsSet(pendKey(), JSON.stringify(p)); }
    function pendTotal(p) { return NAMES.reduce(function (a, n) { return a + p.v[n]; }, 0); }

    function count(name, nowSec) {
        var date = todayStr();
        var d = loadDay(date);
        d.cur[name]++; d.total[name]++;
        saveDay(date, d);
        var p = loadPending();
        if (p.date !== date && pendTotal(p) > 0) { uploadPending(p); p = { date: date, v: zero() }; }
        p.date = date; p.v[name]++;
        savePending(p);
        cool[name] = nowSec;
        console.log('🚨 [운행습관] ' + name + ' +1');
    }

    function angDiff(a, b) {
        var d = Math.abs(a - b) % 360;
        return d > 180 ? 360 - d : d;
    }

    // 새 회차가 시작되면(노선·근무 변경, 정류장 번호가 크게 되돌아감) '이번 회차' 값을 0으로
    function checkTrip(duty) {
        var tripKey = duty ? String(duty.uniqueKey || duty.routeShort || '') : '';
        var idx = (typeof window.lastPassedStopIndex === 'number') ? window.lastPassedStopIndex : null;
        var reset = false;
        if (tripKey && lastTripKey && tripKey !== lastTripKey) reset = true;
        if (idx !== null && lastStopIdx !== null && idx < lastStopIdx - 3) reset = true;
        if (tripKey) lastTripKey = tripKey;
        if (idx !== null) lastStopIdx = idx;
        if (reset) {
            var date = todayStr();
            var d = loadDay(date);
            d.cur = zero();
            saveDay(date, d);
        }
    }

    // 지금 달리는 구간의 제한속도 (정보가 없으면 null)
    function currentLimit() {
        try {
            var cache = window.standardMasterCache || window.currentTripMasterCache || [];
            var idx = (typeof window.lastPassedStopIndex === 'number') ? window.lastPassedStopIndex + 1 : null;
            if (idx === null || !cache[idx]) return null;
            var lim = Number(cache[idx].limit);
            return lim > 0 ? lim : null;
        } catch (e) { return null; }
    }

    // GPS 한 번 들어올 때마다 호출
    function onFix(speedKmh, accuracy, heading, duty) {
        try {
            if (window.simState && window.simState.active) return;
            if (speedKmh === null || speedKmh === undefined) return;
            if (accuracy && accuracy > MAX_ACC_M) return;
            checkTrip(duty);

            var now = Date.now() / 1000;
            var cur = { t: now, v: speedKmh, h: (typeof heading === 'number' && !isNaN(heading)) ? heading : null };
            var prev = buf.length ? buf[buf.length - 1] : null;
            if (prev && now - prev.t > MAX_GAP_S) { buf = []; prev = null; overCnt = 0; }   // 끊겼다 이어진 구간은 판정 안 함
            buf.push(cur);
            while (buf.length && now - buf[0].t > 6) buf.shift();
            if (!prev) return;

            var dt = Math.max(0.5, now - prev.t);
            var dv = cur.v - prev.v;

            // 급출발
            if (prev.v <= 3 && dv / dt >= 11 && now - (cool['급출발'] || 0) > 10) count('급출발', now);
            // 급정거
            if (prev.v >= 8 && -dv / dt >= 7.5 && cur.v <= 3 && now - (cool['급정거'] || 0) > 5) count('급정거', now);

            // 과속 (제한속도 +20km/h 초과가 3번 연속)
            var lim = currentLimit();
            if (lim !== null) {
                if (cur.v > lim + 20) {
                    overCnt++;
                    if (overCnt >= 3 && overArmed) { count('과속', now); overArmed = false; }
                } else {
                    overCnt = 0;
                    if (cur.v <= lim + 15) overArmed = true;
                }
            }

            // 급회전 (15km/h 이상에서 2초 안에 60~120도)
            if (cur.v >= 15 && cur.h !== null && now - (cool['급회전'] || 0) > 8) {
                var old = null;
                for (var i = 0; i < buf.length - 1; i++) {
                    if (now - buf[i].t <= 2 && buf[i].h !== null && buf[i].v >= 15) { old = buf[i]; break; }
                }
                if (old) {
                    var turn = angDiff(cur.h, old.h);
                    if (turn >= 60 && turn <= 120) count('급회전', now);
                }
            }
        } catch (e) { console.warn('운행습관 집계 오류:', e); }
    }

    // 서버(운행습관 시트)로 '새로 늘어난 횟수' 올리기 (성공한 만큼만 pending에서 뺌)
    function uploadPending(p) {
        var url = window.GAS_WEB_APP_URL;
        if (!url || !driver()) return;
        var sent = Object.assign({}, p.v), sentDate = p.date;
        uploading = true;
        fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'text/plain' }, keepalive: true,
            body: JSON.stringify({ action: 'save_driving_habit', date: sentDate, driver: driver(), start: sent['급출발'], stop: sent['급정거'], speed: sent['과속'], turn: sent['급회전'] })
        }).then(function (r) { return r.json(); })
            .then(function (res) {
                uploading = false;
                if (res && res.success) {
                    var now = loadPending();
                    if (now.date === sentDate) NAMES.forEach(function (n) { now.v[n] = Math.max(0, now.v[n] - sent[n]); });
                    savePending(now);
                }
            })
            .catch(function () { uploading = false; });
    }

    function upload() {
        try {
            if (uploading || !driver()) return;
            var p = loadPending();
            if (pendTotal(p) > 0) uploadPending(p);
        } catch (e) { uploading = false; }
    }

    function getCounts() {
        var d = loadDay(todayStr());
        return { cur: d.cur, today: d.total };
    }

    // 서버에서 해당 월의 오늘·이달 합계를 받아옴 (아직 못 올린 횟수는 더해서 돌려줌). 실패하면 null
    function fetchServer(year, month) {
        var url = window.GAS_WEB_APP_URL;
        if (!url || !driver()) return Promise.resolve(null);
        return fetch(url + '?action=get_driving_habit&driver=' + encodeURIComponent(driver()) + '&year=' + year + '&month=' + month)
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (!res || !res.success) return null;
                var monthOther = zero(), serverToday = zero(), ts = todayStr();
                Object.keys(res.days || {}).forEach(function (date) {
                    NAMES.forEach(function (n, i) {
                        var v = Number(res.days[date][i]) || 0;
                        if (date === ts) serverToday[n] += v; else monthOther[n] += v;
                    });
                });
                // 오늘 값: 이 폰 기록과 (서버 + 아직 못 올린 횟수) 중 큰 쪽
                var p = loadPending(), local = loadDay(ts).total, todayEff = zero();
                NAMES.forEach(function (n) {
                    var srv = serverToday[n] + (p.date === ts ? p.v[n] : 0);
                    todayEff[n] = Math.max(local[n], srv);
                });
                var monthSum = monthOther;
                if (ts.indexOf(year + '-' + pad(month) + '-') === 0) NAMES.forEach(function (n) { monthSum[n] += todayEff[n]; });
                return { today: todayEff, month: monthSum };
            })
            .catch(function () { return null; });
    }

    window.DrivingHabit = { onFix: onFix, upload: upload, getCounts: getCounts, fetchServer: fetchServer };
    setInterval(upload, 30000);
    window.addEventListener('load', function () { setTimeout(upload, 5000); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) upload(); });
    window.addEventListener('pagehide', upload);
})();
