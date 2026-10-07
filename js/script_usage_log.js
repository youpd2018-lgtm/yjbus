// 사용 시간 기록: 앱 / 라이브 모달 / 노선지도를 화면에 켜 둔 시간을 5초 단위로 모아 두었다가 서버(시트 '사용기록')로 보낸다.
// 화면이 꺼지거나 다른 앱으로 가 있는 시간은 세지 않는다. 가볍게: 5분마다 한 번(또는 앱을 닫을 때) 작은 요청 1번.
(function () {
  var KEY = 'yb_usage_pending', TICK = 5, FLUSH_MS = 300000;
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { } }
  function liveOpen() { var m = document.getElementById('liveModal'); return !!(m && m.classList.contains('active') && m.style.display !== 'none'); }

  setInterval(function () {
    if (document.visibilityState !== 'visible') return;
    var o = load();
    o.app = (o.app || 0) + TICK;
    if (liveOpen()) o.live = (o.live || 0) + TICK;
    if (window._rm) o.map = (o.map || 0) + TICK;
    save(o);
  }, TICK * 1000);

  function flush(unload) {
    try {
      var o = load();
      if (!(o.app || o.live || o.map)) return;
      var url = window.GAS_WEB_APP_URL;
      if (!url || !window.gasCredentials || !window.gasCredentials()) return;
      save({}); // 보낸 만큼 비운다(실패하면 이번 분량만 잃음)
      fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, keepalive: !!unload,
        body: JSON.stringify({ action: 'save_usage', app: o.app || 0, live: o.live || 0, map: o.map || 0 })
      }).catch(function () { });
    } catch (e) { }
  }
  setInterval(function () { flush(false); }, FLUSH_MS);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); });
  window.addEventListener('pagehide', function () { flush(true); });
  setTimeout(function () { flush(false); }, 20000); // 지난번에 못 보낸 분량
})();
