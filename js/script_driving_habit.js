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

    // ================================================================
    // ⏱️ [회차 평균 속도] 라이브 모달을 처음 켠 시각·그때 정류장 → 마지막으로 GPS가 잡힌 시각·그때 정류장
    // - 두 정류장 사이 거리(시간표 회차 거리를 정류장 위치 비율로 나눈 값) ÷ 그 시간
    // - 내 근무일(정상·대타)·운행 시간 안에서, 실제로 달리는(5km/h 이상) 동안만 잼 (쉬는 날·집에서 시험 삼아 켠 건 기록 안 함)
    // - 중간에 모달을 끄거나 다른 앱·전화를 써도 시작(처음 달린 때)과 끝(마지막 GPS 때)만 보고 계산
    // - 종점에 도착하면 거기서 끝으로 고정 (종점에서 계속 켜 둬도 시간이 늘어나지 않음)
    // ================================================================
    var TRIP_KEY_PREFIX = 'yb_tripspd_';
    var MIN_TRIP_SEC = 300;       // 5분 미만은 계산 안 함
    var MIN_TRIP_FRAC = 0.1;      // 회차 거리의 10% 미만 구간은 계산 안 함
    function tripStoreKey() { return TRIP_KEY_PREFIX + driver(); }
    function loadTrips() { try { return JSON.parse(lsGet(tripStoreKey()) || '{}') || {}; } catch (e) { return {}; } }
    function saveTrips(o) {
        var keys = Object.keys(o).sort();
        while (keys.length > 70) delete o[keys.shift()];   // 오래된 날짜는 정리
        lsSet(tripStoreKey(), JSON.stringify(o));
    }
    // 지금 회차의 시간표 거리(km)
    function tripDistKm(duty) {
        try {
            var sd = JSON.parse(lsGet((typeof getDriverKey === 'function' ? getDriverKey('sched_' + todayStr()) : 'sched_' + todayStr())) || 'null');
            if (!sd || typeof customGetItem !== 'function') return null;
            var list = customGetItem(sd.route, sd.seq);
            var row = list && list[(duty.turnNum || 1) - 1];
            var d = row ? parseFloat(row.dist) : NaN;
            return d > 0 ? d : null;
        } catch (e) { return null; }
    }
    function rad(x) { return x * Math.PI / 180; }
    function haversineM(a, b, c, d) {
        var R = 6371000, dLa = rad(c - a), dLo = rad(d - b);
        var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
        return 2 * R * Math.asin(Math.sqrt(x));
    }
    // 정류장 si → ei 구간이 회차 전체 길이에서 차지하는 비율 (정류장 위치 사이 직선거리 합으로 비교)
    function segFraction(master, si, ei) {
        var cum = [0], n = master.length;
        for (var i = 1; i < n; i++) {
            var A = master[i - 1], B = master[i];
            var la1 = parseFloat(A.lat !== undefined ? A.lat : (Array.isArray(A) ? A[8] : null)), lo1 = parseFloat(A.lng !== undefined ? A.lng : (Array.isArray(A) ? A[9] : null));
            var la2 = parseFloat(B.lat !== undefined ? B.lat : (Array.isArray(B) ? B[8] : null)), lo2 = parseFloat(B.lng !== undefined ? B.lng : (Array.isArray(B) ? B[9] : null));
            cum.push(cum[i - 1] + ((la1 && lo1 && la2 && lo2) ? haversineM(la1, lo1, la2, lo2) : 0));
        }
        var total = cum[n - 1];
        if (!(total > 0) || si < 0 || ei >= n || ei <= si) return 0;
        return (cum[ei] - cum[si]) / total;
    }
    // 오늘 내 근무(정상·대타)이고 운행 시간 안일 때만 잰다 (쉬는 날·집에서 시험 삼아 켠 경우는 기록 안 함)
    function onDutyNow() {
        try {
            var sd = JSON.parse(lsGet(typeof getDriverKey === 'function' ? getDriverKey('sched_' + todayStr()) : 'sched_' + todayStr()) || 'null');
            var wt = sd && sd.workType ? String(sd.workType).trim() : '';
            if (wt !== '정상' && wt !== '대타') return false;
            if (typeof isWithinOperatingHours === 'function' && !isWithinOperatingHours()) return false;
            return true;
        } catch (e) { return false; }
    }
    var MOVE_KMH = 5;   // 실제로 달리고 있다고 보는 속도
    function tripOnFix(speedKmh, duty) {
        try {
            if (!duty || !duty.uniqueKey) return;
            if (!onDutyNow()) return;
            var master = window.standardMasterCache || [];
            var n = master.length, idx = window.lastPassedStopIndex;
            if (!n || typeof idx !== 'number' || idx < 0) return;
            var date = todayStr(), nowMs = Date.now();
            var all = loadTrips(), list = all[date] || [];
            var rec = null;
            for (var i = list.length - 1; i >= 0; i--) { if (list[i].k === duty.uniqueKey) { rec = list[i]; break; } }
            var moving = speedKmh >= MOVE_KMH;
            if (!rec) {
                if (!moving) return;                  // 실제로 달리기 시작한 때부터 잼 (출발지에서 기다리는 시간은 안 넣음)
                var dist = tripDistKm(duty);
                if (!dist) return;
                rec = { k: duty.uniqueKey, t: duty.turnNum, s: nowMs, si: idx, e: nowMs, ei: idx, D: dist, d: 0, done: 0 };   // 처음 켠 시각·정류장
                list.push(rec);
            } else {
                if (rec.done) return;                 // 종점에 이미 도착한 회차는 더 늘리지 않음
                if (idx < rec.ei) return;             // 정류장 번호가 되돌아가면(위치 오차) 무시
                if (!moving && idx < n - 1) return;   // 서 있는 동안은 끝 시각을 늘리지 않음 (마지막으로 달린 때까지만)
                rec.e = nowMs; rec.ei = idx;           // 마지막으로 달리며 GPS가 잡힌 시각·정류장
                if (idx >= n - 1) rec.done = 1;
            }
            rec.d = rec.D * segFraction(master, rec.si, rec.ei);
            all[date] = list; saveTrips(all);
        } catch (e) { }
    }
    // 끝난 회차를 서버(회차속도 시트)에 한 줄씩 올림 (이미 올린 건 u=1 로 표시해 다시 안 올림)
    var tripUploading = false;
    function uploadTrips() {
        try {
            var url = window.GAS_WEB_APP_URL;
            if (tripUploading || !url || !driver()) return;
            var all = loadTrips(), ts = todayStr(), nowMs = Date.now(), todo = null;
            Object.keys(all).some(function (date) {
                var list = all[date];
                for (var i = 0; i < list.length; i++) {
                    var r = list[i];
                    var closed = r.done || date < ts || i < list.length - 1 || (nowMs - r.e) > 30 * 60 * 1000;   // 더 이상 늘어나지 않는 회차만
                    if (!r.u && closed && recSpeed(r) !== null) { todo = { date: date, r: r }; return true; }
                }
                return false;
            });
            if (!todo) return;
            var rr = todo.r;
            tripUploading = true;
            fetch(url, {
                method: 'POST', headers: { 'Content-Type': 'text/plain' }, keepalive: true,
                body: JSON.stringify({ action: 'save_trip_speed', date: todo.date, driver: driver(), key: rr.k, turn: rr.t, start: rr.s, end: rr.e, dist: Math.round(rr.d * 100) / 100, speed: Math.round(recSpeed(rr) * 10) / 10 })
            }).then(function (r) { return r.json(); })
                .then(function (res) {
                    tripUploading = false;
                    if (res && res.success) {
                        var cur = loadTrips(), l = cur[todo.date] || [];
                        l.forEach(function (x) { if (x.k === rr.k && x.e === rr.e) x.u = 1; });
                        saveTrips(cur);
                        uploadTrips();   // 다음 회차가 남았으면 이어서
                    }
                })
                .catch(function () { tripUploading = false; });
        } catch (e) { tripUploading = false; }
    }
    // 한 회차 기록의 평균 속도 (계산할 수 없으면 null)
    function recSpeed(r) {
        var sec = (r.e - r.s) / 1000;
        if (!(sec >= MIN_TRIP_SEC) || sec > 8 * 3600 || !(r.D > 0) || !(r.d / r.D >= MIN_TRIP_FRAC)) return null;
        return r.d / (sec / 3600);
    }
    // 평균 속도(km/h) 모음: cur(이번 회차) / today / month. 없으면 null. measuring: 이번 회차가 재는 중(아직 계산 불가)
    function getAvgSpeeds(year, month) {
        var out = { cur: null, today: null, month: null, measuring: false };
        try {
            var all = loadTrips(), ts = todayStr();
            var agg = function (trips) {
                var dist = 0, sec = 0;
                (trips || []).forEach(function (t) { if (recSpeed(t) !== null) { dist += t.d; sec += (t.e - t.s) / 1000; } });
                return sec > 0 ? dist / (sec / 3600) : null;
            };
            out.today = agg(all[ts]);
            var prefix = year + '-' + pad(month) + '-', md = 0, ms = 0;
            Object.keys(all).forEach(function (date) {
                if (date.indexOf(prefix) !== 0) return;
                all[date].forEach(function (t) { if (recSpeed(t) !== null) { md += t.d; ms += (t.e - t.s) / 1000; } });
            });
            out.month = ms > 0 ? md / (ms / 3600) : null;
            var list = all[ts] || [], last = list.length ? list[list.length - 1] : null;
            if (last) {
                var v = recSpeed(last);
                if (v !== null) out.cur = v; else if (!last.done) out.measuring = true;
            }
        } catch (e) { }
        return out;
    }

    // GPS 한 번 들어올 때마다 호출
    function onFix(speedKmh, accuracy, heading, duty) {
        try {
            if (window.simState && window.simState.active) return;
            if (speedKmh === null || speedKmh === undefined) return;
            if (accuracy && accuracy > MAX_ACC_M) return;
            checkTrip(duty);
            tripOnFix(speedKmh, duty);

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
        try { uploadTrips(); } catch (e) { }
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

    window.DrivingHabit = { onFix: onFix, upload: upload, getCounts: getCounts, fetchServer: fetchServer, getAvgSpeeds: getAvgSpeeds };
    setInterval(upload, 30000);
    window.addEventListener('load', function () { setTimeout(upload, 5000); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) upload(); });
    window.addEventListener('pagehide', upload);
})();
