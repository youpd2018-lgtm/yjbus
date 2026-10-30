// ================================================================
// 🔔 [하차벨 등록] script_stop_bell.js  (2026-10-31 사용자 지시)
// - 라이브 모달의 시간 카운트 원을 한 번 터치하면 '손님이 하차벨을 눌렀다'고 등록한다. 원 테두리가 전체 빨간색으로 바뀐다.
//   (다시 터치하면 등록 취소 — 잘못 눌렀을 때 대비)
// - 다음 정류장 50m 전에 들어오면 음성으로 "하차 손님이 있습니다. 정차하세요."를 두 번 알려 주고,
//   그 정류장을 지나면(멀어지면) 자동으로 등록이 풀려 원래 색으로 돌아온다.
// - 정류장 위치는 정류장 통과 속도 측정과 같은 노선 정류장 목록(standardMasterCache)과 '지난 정류장 번호'(lastPassedStopIndex)를 쓴다.
// ================================================================
(function () {
    var RADIUS_M = 50;       // 정류장 50m 전부터 안내
    var LEAVE_M = 90;        // 안내한 정류장에서 이만큼 멀어지면 등록 해제
    var REPEAT_MS = 4500;    // 두 번째 안내까지 간격
    var TEXT = '하차 손님이 있습니다. 정차하세요.';
    var bell = false, prevD = {}, said = null, timer = null;

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
    function speakOnce(txt) {   // 모든 하차벨 음성 앞에는 띵동(sfx 'depart')
        try { if (window.sfxPlay) window.sfxPlay('depart'); } catch (e) { }
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
    function announce() {   // 두 번 안내 (+ 진동)
        speakOnce();
        try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) { }
        clearTimeout(timer);
        timer = setTimeout(function () { speakOnce(); }, REPEAT_MS);
    }

    function setBell(on, silent) {
        bell = !!on; prevD = {}; said = null;
        if (!bell) { clearTimeout(timer); timer = null; if (!silent) { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { } } }
        var g = $('yb3Gauge');
        if (g) { g.classList.toggle('yb3-bell', bell); g.setAttribute('aria-pressed', String(bell)); }
        if (bell) { try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { } }
    }

    function tick() {
        if (!bell) return;
        if (!modalOpen()) { setBell(false, true); return; }
        var g = window.lastGpsPosition;
        if (!g || !g.time || Date.now() - new Date(g.time).getTime() > 15000) return;
        var master = window.standardMasterCache || window.currentTripMasterCache || [];
        if (!master.length) return;
        var lp = window.lastPassedStopIndex, known = typeof lp === 'number' && lp >= 0;

        if (said !== null) {   // 안내한 정류장을 지나갔으면 등록 해제
            var d0 = distM(g.lat, g.lon, stopLat(master[said]), stopLng(master[said]));
            if (d0 > LEAVE_M || (known && lp >= said && d0 > RADIUS_M)) setBell(false, true);
            return;
        }
        var from = known ? lp + 1 : 0, to = known ? Math.min(master.length - 1, lp + 2) : master.length - 1;
        var best = -1, bd = Infinity;
        for (var i = from; i <= to; i++) {
            var la = stopLat(master[i]), lo = stopLng(master[i]);
            if (!la || !lo) continue;
            var d = distM(g.lat, g.lon, la, lo);
            if (d < bd) { bd = d; best = i; }
        }
        if (best < 0) return;
        var prev = prevD[best];
        prevD[best] = bd;
        if (bd <= RADIUS_M && (prev === undefined || bd <= prev + 2)) {   // 정류장 쪽으로 다가가는 중일 때만 (막 떠난 정류장은 제외)
            said = best;
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
