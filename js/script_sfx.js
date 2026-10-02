// ================================================================
// 🔔 [효과음] script_sfx.js
// - 매 회차 출발 시각에 "띵동"(sounds/depart_ding.mp3), 매 회차 도착 시각에 "차임"(sounds/arrive_chime.mp3)
// - 회차 목록은 로컬 알림(script_local_alarm.js)과 같은 것을 씀 (window.ybGetTodayTrips)
// - 앱 화면이 켜져 있는 동안만 울림 (웹 앱은 화면이 꺼지면 소리를 못 냄)
// - 설정 > 효과음 에서 켜기/끄기 (기기에 기억, 기본 켜짐)
// ================================================================
(function () {
    var LS_ON = 'yb_sfx_on';
    var SOUNDS = { depart: 'sounds/depart_ding.mp3', arrive: 'sounds/arrive_chime.mp3' };
    var GRACE_SEC = 3;          // 정각부터 이 시간(초) 안에서만 울림 (늦게 앱을 켜면 울리지 않음)
    var CHECK_MS = 500;

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    window.sfxIsOn = function () { return lsGet(LS_ON) !== '0'; };

    // ---------- 소리 재생 (WebAudio, 안 되면 Audio 태그) ----------
    var ctx = null, buffers = {}, loading = {};
    function getCtx() {
        if (!ctx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) { try { ctx = new AC(); } catch (e) { ctx = null; } } }
        return ctx;
    }
    function loadBuffer(name) {
        var c = getCtx();
        if (!c || buffers[name] || loading[name]) return;
        loading[name] = true;
        fetch(SOUNDS[name]).then(function (r) { return r.arrayBuffer(); })
            .then(function (ab) { return new Promise(function (res, rej) { c.decodeAudioData(ab, res, rej); }); })
            .then(function (b) { buffers[name] = b; })
            .catch(function () { })
            .then(function () { loading[name] = false; });
    }
    function unlock() {
        var c = getCtx();
        if (!c) return;
        try {
            if (c.state !== 'running') c.resume();
            var b = c.createBuffer(1, 1, 22050), src = c.createBufferSource();
            src.buffer = b; src.connect(c.destination); src.start(0);
        } catch (e) { }
        loadBuffer('depart'); loadBuffer('arrive');
    }
    ['pointerdown', 'touchend', 'click'].forEach(function (ev) { document.addEventListener(ev, unlock, { passive: true }); });

    function play(name) {
        try {
            var c = ctx;
            if (c && buffers[name]) {
                if (c.state !== 'running') c.resume();
                var src = c.createBufferSource();
                src.buffer = buffers[name]; src.connect(c.destination); src.start(0);
                return;
            }
            var au = new Audio(SOUNDS[name]);
            au.volume = 1;
            var p = au.play();
            if (p && p.catch) p.catch(function () { });
        } catch (e) { }
    }
    window.sfxPlay = play;   // 점검용: sfxPlay('depart') / sfxPlay('arrive')

    // ---------- 회차 시각에 맞춰 재생 ----------
    function check() {
        if (document.hidden || !window.sfxIsOn() || typeof window.ybGetTodayTrips !== 'function') return;
        var info = window.ybGetTodayTrips();
        if (!info || !info.trips || !info.trips.length) return;
        var now = new Date();
        var nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        info.trips.forEach(function (t) {
            [['depart', t.mins], ['arrive', t.endMins]].forEach(function (pair) {
                var kind = pair[0], min = pair[1];
                if (min === null || min === undefined) return;
                if (kind === 'arrive' && min === t.mins) return;      // 출발과 같은 시각이면 도착음은 생략
                var at = min * 60;
                if (nowSec < at || nowSec >= at + GRACE_SEC) return;
                var key = 'yb_sfx_' + info.today + '_' + info.driver + '_' + t.idx + '_' + kind;
                try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) { }
                play(kind);
            });
        });
    }
    window.addEventListener('load', function () { setTimeout(function () { setInterval(check, CHECK_MS); }, 4000); });

    // ---------- 설정 화면 켜기/끄기 ----------
    window.setSfx = function (on) {
        lsSet(LS_ON, on ? '1' : '0');
        if (on) { unlock(); play('depart'); }   // 켜면 한 번 들려줌
        window.updateSfxSettingsUI();
    };
    window.updateSfxSettingsUI = function () {
        var on = window.sfxIsOn();
        var sw = document.getElementById('sfxSwitch');
        if (sw) sw.checked = on;
        var txt = document.getElementById('sfxStateText');
        if (txt) txt.innerText = on ? '효과음이 켜져 있어요' : '효과음이 꺼져 있어요';
    };
})();
