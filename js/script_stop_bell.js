// ================================================================
// 🔔 [하차벨 등록] script_stop_bell.js  (2026-10-31 사용자 지시)
// - 라이브 모달의 시간 카운트 원을 한 번 터치하면 '손님이 하차벨을 눌렀다'고 등록한다. 원 테두리가 전체 빨간색으로 바뀐다.
//   (다시 터치하면 등록 취소 — 잘못 눌렀을 때 대비)
// - 다음 정류장 100m 전과 50m 전에 한 번씩 (모두 띵동 + 음성) "하차 손님이 있습니다. 정차하세요."를 알려 주고,
//   그 정류장을 통과하면(가장 가까워졌다가 다시 멀어지면) 자동으로 등록이 풀려 원래 색으로 돌아온다.
// - 2026-11-01 사용자 지시: '정류장 근처에서 3km/h 이하로 정차하면 해제' 조건은 삭제(문제를 일으킴). 통과할 때만 해제.
//   해제된 뒤 다시 등록하면 방금 통과한 정류장은 빼고 그다음 정류장을 대상으로 한다.
// - 정류장 위치는 정류장 통과 속도 측정과 같은 노선 정류장 목록(standardMasterCache)과 '지난 정류장 번호'(lastPassedStopIndex)를 쓴다.
// ================================================================
(function () {
    var FAR_M = 100;         // 정류장 100m 전 첫 안내
    var RADIUS_M = 50;       // 정류장 50m 전 두 번째 안내
    var LEAVE_M = 130;       // 안내한 정류장에서 이만큼 멀어지면 등록 해제
    var TEXT = '하차 손님이 있습니다. 정차하세요.';
    var PASS_NEAR_M = 40;    // 이만큼 가까이 왔다가
    var PASS_AWAY_M = 20;    // 가장 가까웠던 거리보다 이만큼 멀어지면 '통과'
    var bell = false, prevD = {}, said = null, said50 = false, minD = Infinity;
    var doneIdx = -1, doneAt = 0;   // 마지막으로 통과해서 해제된 정류장 (다시 등록하면 그다음 정류장부터)

    function $(id) { return document.getElementById(id); }
    function rad(x) { return x * Math.PI / 180; }
    function distM(a, b, c, d) {
        var dla = rad(c - a), dlo = rad(d - b);
        var h = Math.sin(dla / 2) * Math.sin(dla / 2) + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dlo / 2) * Math.sin(dlo / 2);
        return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }
    function stopLat(r) { return parseFloat(r && (r.lat !== undefined ? r.lat : (Array.isArray(r) ? r[8] : null))); }
    function stopLng(r) { return parseFloat(r && (r.lng !== undefined ? r.lng : (Array.isArray(r) ? r[9] : null))); }
    function modalOpen() {
        var m = $('liveModal');
        return !!(m && m.classList.contains('active') && m.style.display !== 'none');
    }

    var DING_MS = 150;       // 띵동 소리 뒤에 음성
    var speakTimer = null;
    function speakOnce(txt) {   // 모든 하차벨 음성 앞에는 '딩동' 종소리(sfx 'bellpop', 과속 카메라 띵동과 구분)
        try { if (window.sfxPlay) window.sfxPlay('bellpop'); } catch (e) { }
        clearTimeout(speakTimer);
        speakTimer = setTimeout(function () { speakNow(txt); }, DING_MS);
    }
    function speakNow(txt) {
        try {
            if (!('speechSynthesis' in window)) return;
            window.speechSynthesis.resume();
            window.speechSynthesis.cancel();
            var u = new SpeechSynthesisUtterance(typeof txt === 'string' ? txt : TEXT);
            u.lang = 'ko-KR'; u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;
            var vs = window.speechSynthesis.getVoices();
            var v = vs && vs.find(function (x) { return x.lang && x.lang.indexOf('ko') === 0; });
            if (v) u.voice = v;
            window.speechSynthesis.speak(u);
        } catch (e) { }
    }
    function announce() {   // 띵동 + 음성 (+ 진동)
        speakOnce();
        try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) { }
    }

    function setBell(on, silent) {
        bell = !!on; prevD = {}; said = null; said50 = false; minD = Infinity;
        if (!bell) { clearTimeout(speakTimer); if (!silent) { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { } } }
        var g = $('yb3Gauge');
        if (g) { g.classList.toggle('yb3-bell', bell); g.setAttribute('aria-pressed', String(bell)); }
        if (bell) { try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { } }
    }

    function release() {   // 등록 해제 + 안내 중지 (음성 없이). 통과한 정류장은 기억해서 다시 등록하면 그다음 정류장부터
        if (said !== null) { doneIdx = said; doneAt = Date.now(); }
        setBell(false);
    }

    function tick() {
        if (!bell) return;
        if (!modalOpen()) { setBell(false, true); return; }
        var g = window.lastGpsPosition;
        if (!g || !g.time || Date.now() - new Date(g.time).getTime() > 15000) return;
        var master = window.standardMasterCache || window.currentTripMasterCache || [];
        if (!master.length) return;
        var lp = window.lastPassedStopIndex, known = typeof lp === 'number' && lp >= 0;

        // 후보 정류장: 지난 정류장(라이브 모달은 정류장 50~60m 안에서 '지난 것'으로 잡음) 부터 앞 2개
        var from = known ? Math.max(0, lp) : 0, to = known ? Math.min(master.length - 1, lp + 2) : master.length - 1;
        // 방금 통과해서 해제된 정류장은 빼고 그다음부터 (10분 지나거나 회차가 바뀌어 번호가 크게 되돌아가면 잊음)
        if (doneIdx >= 0 && (Date.now() - doneAt > 600000 || (known && lp < doneIdx - 3))) doneIdx = -1;
        if (doneIdx >= 0) { from = Math.max(from, doneIdx + 1); to = Math.max(to, Math.min(master.length - 1, doneIdx + 2)); }
        // 모든 후보 정류장까지의 거리를 매번 재 둔다 (정류장 간격이 좁으면 '가장 가까운 정류장'이 100m 안에서야 바뀌어 첫 안내를 놓치므로)
        var best = -1, bd = Infinity, appr = -1, ad = Infinity;
        for (var i = from; i <= to; i++) {
            var la = stopLat(master[i]), lo = stopLng(master[i]);
            if (!la || !lo) continue;
            var d = distM(g.lat, g.lon, la, lo);
            var pv = prevD[i];
            prevD[i] = d;
            if (d < bd) { bd = d; best = i; }
            if (pv !== undefined && d <= FAR_M && d <= pv + 2 && d < ad) { ad = d; appr = i; }   // 다가가는 중인 100m 안 정류장
        }

        if (said !== null) {   // 100m 앞에서 안내한 정류장: 50m 앞에서 한 번 더, 통과하면 해제
            var d0 = distM(g.lat, g.lon, stopLat(master[said]), stopLng(master[said]));
            if (d0 < minD) minD = d0;
            if (d0 > LEAVE_M || (minD <= PASS_NEAR_M && d0 >= minD + PASS_AWAY_M)) { release(); return; }
            if (!said50 && d0 <= RADIUS_M) { said50 = true; announce(); }
            return;
        }
        // 100m 안으로 다가가는 정류장이 있으면 첫 안내 (서 있어도 안내: 신호 대기 등)
        if (appr >= 0) {
            said = appr; said50 = ad <= RADIUS_M; minD = ad;   // 처음부터 50m 안이면 한 번만
            announce();
        }
    }

    function init() {
        var g = $('yb3Gauge');
        if (!g) return;
        g.setAttribute('role', 'button'); g.setAttribute('aria-pressed', 'false');
        g.setAttribute('aria-label', '하차벨 등록');
        g.addEventListener('click', function () { var on = !bell; setBell(on); speakOnce(on ? '하차 등록' : '하차 등록 취소'); });
        setInterval(tick, 1000);
    }
    window.YbStopBell = { set: setBell, isOn: function () { return bell; } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
