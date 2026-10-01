// ================================================================
// 📍 [현재 정류장 공유] script_live_pos.js
// - 메인 화면 첫 카드가 '운행중'일 때 '운행중' 대신 지금 있는 정류장 이름을 보여줍니다.
// - 기사님 폰: 라이브 모달에서 정류장을 지날 때마다 DB 시트의 'live_pos_<기사이름>' 키에 현재 정류장을 올립니다.
//   (가족 사용자가 등록된 기사님만 올립니다. 서버 부담을 줄이기 위해 15초 이상 간격으로만 올림)
// - 가족 사용자 폰: 그 키를 45초마다 읽어 와서 보여줍니다. (25분 넘게 갱신이 없으면 '운행중'으로 되돌아감)
// ================================================================
(function () {
    var TTL_MS = 25 * 60 * 1000;
    var MIN_GAP_MS = 15 * 1000;
    var POLL_MS = 45 * 1000;
    var cache = null;           // { stop, ts }
    var lastPub = { stop: null, t: 0 };
    var polling = false;

    function isFamily() { return (typeof isFamilyUser !== 'undefined') && isFamilyUser; }
    function targetName() { return isFamily() ? (typeof targetDriverName !== 'undefined' ? targetDriverName : '') : (window.currentDriver || ''); }
    function keyFor(name) { return 'live_pos_' + name; }

    function hasFamily(driver) {
        try {
            return getUsersList().some(function (u) { return u && u.userType === 'family' && u.targetDriver === driver && u.active !== false; });
        } catch (e) { return false; }
    }

    function write(stop) {
        var driver = window.currentDriver;
        if (!driver || isFamily()) return;
        if (typeof google === 'undefined' || !google.script || !google.script.run) return;
        google.script.run.saveToServer(keyFor(driver), JSON.stringify({ stop: stop, ts: Date.now() }));
    }

    // 정류장을 지날 때 호출
    function publish(stopName) {
        try {
            if (!stopName || isFamily()) return;
            if (!hasFamily(window.currentDriver)) return;
            var now = Date.now();
            if (lastPub.stop === stopName) return;
            if (now - lastPub.t < MIN_GAP_MS) return;
            lastPub = { stop: stopName, t: now };
            write(stopName);
        } catch (e) { }
    }

    // 라이브 모달을 닫을 때: 현재 정류장 표시 지우기
    function clear() {
        try {
            if (lastPub.stop === null) return;
            lastPub = { stop: null, t: 0 };
            write('');
        } catch (e) { }
    }

    function poll() {
        var name = targetName();
        var url = window.GAS_WEB_APP_URL;
        if (!name || !url || polling) return;
        polling = true;
        fetch(url + '?action=load_key_from_server&key=' + encodeURIComponent(keyFor(name)))
            .then(function (r) { return r.json(); })
            .then(function (res) {
                polling = false;
                var v = res && res.value;
                if (typeof v === 'string' && v) { try { v = JSON.parse(v); } catch (e) { v = null; } }
                cache = (v && v.stop) ? { stop: String(v.stop), ts: Number(v.ts) || 0 } : null;
            })
            .catch(function () { polling = false; });
    }

    // 메인 카드에 보여줄 현재 정류장 이름 (없으면 null → '운행중')
    function getStopName() {
        try {
            // 1) 이 폰에서 라이브 모달 GPS가 살아 있으면 그 정류장
            var fresh = window._gpsLastFixAt && (Date.now() - window._gpsLastFixAt < 60 * 1000);
            var idx = window.lastPassedStopIndex;
            if (!isFamily() && fresh && typeof idx === 'number') {
                var rows = window.standardMasterCache || window.currentTripMasterCache || [];
                var r = rows[idx];
                if (r) {
                    var n = String(Array.isArray(r) ? r[5] : (r.name || r.stopName || r[5] || '')).trim();
                    if (n) return n;
                }
            }
            // 2) 가족 사용자: 기사님 폰이 올린 정류장
            if (isFamily() && cache && cache.stop && Date.now() - cache.ts < TTL_MS) return cache.stop;
        } catch (e) { }
        return null;
    }

    setInterval(function () { if (isFamily() && !document.hidden) poll(); }, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && isFamily()) poll(); });

    window.LivePos = { publish: publish, clear: clear, poll: poll, getStopName: getStopName };
})();
