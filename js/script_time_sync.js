// 시계 보정: 폰 시계가 틀려도 앱 전체(지금 시각, 오차 시간, 알림음, 카메라 경고 등)가 정확한 시각을 쓰게 한다.
// 방법: 이 사이트(GitHub Pages)가 응답에 실어 보내는 서버 시각(Date 헤더)을 가벼운 요청(HEAD, 689바이트짜리 manifest.json)으로 6번 받아
//       폰 시계와의 차이를 구하고, Date.now()/new Date()가 그 차이만큼 보정된 값을 돌려주게 바꾼다. 구글 앱스 스크립트 서버는 쓰지 않는다.
// 정확도: 서버 시각은 1초 단위라, 어긋난 초 위치가 다른 여러 번의 측정으로 가능한 범위를 좁힌다(보통 ±0.2초 안).
// 반드시 다른 스크립트보다 먼저 불러온다(script_test_drive.js보다 앞).
(function () {
  if (window.__ybClockSync) return; window.__ybClockSync = true;
  var Real = Date, KEY = 'yb_clock_sync', MAX_OFF = 86400000, off = 0, info = { off: 0, at: 0, width: null, n: 0 };
  try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s.off === 'number' && Math.abs(s.off) <= MAX_OFF) { off = s.off; info = s; } } catch (e) { }

  function D() {
    var a = arguments;
    if (!(this instanceof D)) return new Real(Real.now() + off).toString();
    if (a.length === 0) return new Real(Real.now() + off);
    return new (Function.prototype.bind.apply(Real, [null].concat(Array.prototype.slice.call(a))))();
  }
  D.prototype = Real.prototype; D.UTC = Real.UTC; D.parse = Real.parse;
  D.now = function () { return Real.now() + off; };
  window.Date = D;
  window.ybClockInfo = function () { return { offsetMs: off, measuredAt: info.at, widthMs: info.width, samples: info.n }; };

  var syncing = false;
  function sample() {
    var t0 = Real.now();
    return fetch('manifest.json?ytc=' + t0 + Math.floor(Math.random() * 1e6), { method: 'HEAD', cache: 'no-store' }).then(function (r) {
      var t1 = Real.now(), d = r.headers.get('date'); if (!d || !r.ok || t1 - t0 > 3000) return null;
      var base = Real.parse(d); if (isNaN(base)) return null;
      // Age 헤더는 더하지 않는다: GitHub Pages의 Date는 캐시에서 나와도 응답 순간의 시각이다(실제 응답으로 확인)
      return { lo: base - t1, hi: base + 1000 - t0 };   // 서버 시각이 1초 단위로 잘려 오므로 [base, base+1초) 안
    }).catch(function () { return null; });
  }
  function sync() {
    if (syncing || (navigator.onLine === false)) return; syncing = true;
    var res = [], i = 0;
    (function next() {
      if (i++ >= 6) return done();
      sample().then(function (s) { if (s) res.push(s); setTimeout(next, 350 + Math.random() * 500); });
    })();
    function done() {
      syncing = false; if (res.length < 3) return;
      var lo = -Infinity, hi = Infinity; res.forEach(function (s) { lo = Math.max(lo, s.lo); hi = Math.min(hi, s.hi); });
      var o;
      if (lo <= hi) o = (lo + hi) / 2;
      else { var m = res.map(function (s) { return (s.lo + s.hi) / 2; }).sort(function (x, y) { return x - y; }); o = m[Math.floor(m.length / 2)]; hi = lo + 1000; }
      if (hi - lo > 2500 || Math.abs(o) > MAX_OFF) return;      // 믿기 어려운 결과는 쓰지 않음
      off = Math.round(o); info = { off: off, at: Real.now(), width: Math.round(hi - lo), n: res.length };
      try { localStorage.setItem(KEY, JSON.stringify(info)); } catch (e) { }
    }
  }
  function maybe() { if (!info.at || Real.now() - info.at > 20 * 60000) sync(); }
  window.ybClockResync = sync;
  window.addEventListener('load', function () { setTimeout(maybe, 2500); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(maybe, 1500); });
})();
