// 단속카메라 전방 알림: 진행 방향 앞 500m 안의 카메라를 글자로 알리고(500m 노랑, 200m 빨강 깜빡),
// 카메라마다 500m에서 한 번만 음성으로 말한다. 노선지도·라이브 모달 공용. 데이터: data/camera/cameras.json
(function () {
  var ALERT_M = 500, NEAR_M = 200, NAME = { speed: '과속카메라', signal: '신호단속카메라', both: '과속 신호단속카메라', other: '단속카메라' };
  var cams = null, loading = false, prev = null, heading = null, spoken = {};
  try { spoken = JSON.parse(sessionStorage.getItem('yb_cam_spoken') || '{}'); } catch (e) { }

  function dist(a, b, c, d) {
    var r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r;
    return 6371000 * Math.sqrt(x * x + y * y);
  }
  function bear(a, b, c, d) {
    var r = Math.PI / 180, y = Math.sin((d - b) * r) * Math.cos(c * r);
    var x = Math.cos(a * r) * Math.sin(c * r) - Math.sin(a * r) * Math.cos(c * r) * Math.cos((d - b) * r);
    return (Math.atan2(y, x) / r + 360) % 360;
  }
  function load() {
    if (cams || loading) return; loading = true;
    fetch('data/camera/cameras.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : { cameras: [] }; })
      .then(function (j) { cams = j.cameras || []; }).catch(function () { cams = []; loading = false; });
  }
  function voiceOn() { try { return localStorage.getItem('yb_cam_voice') !== '0'; } catch (e) { return true; } }
  function speak(c) {
    if (!voiceOn() || !('speechSynthesis' in window)) return;
    var k = c.lat + ',' + c.lng; if (spoken[k] && Date.now() - spoken[k] < 120000) return;   // 같은 카메라는 2분 안에 다시 말하지 않음
    spoken[k] = Date.now(); try { sessionStorage.setItem('yb_cam_spoken', JSON.stringify(spoken)); } catch (e) { }
    var t = '전방 ' + NAME[c.type] + (c.limit ? ' ' + c.limit + '킬로미터' : '');
    try { var u = new SpeechSynthesisUtterance(t); u.lang = 'ko-KR'; u.rate = 1.05; speechSynthesis.speak(u); } catch (e) { }
  }
  // pos = { lat, lon, speed(km/h), heading }, route = 노선 이름(예: '202'), el = 알림 칸
  function update(pos, route, el) {
    if (!el) return; load();
    var best = null, bd = 1e9;
    if (pos && cams && route && (pos.speed == null || pos.speed >= 5)) {
      if (pos.heading != null && !isNaN(pos.heading)) heading = pos.heading;
      else if (prev && dist(prev.lat, prev.lon, pos.lat, pos.lon) > 10) heading = bear(prev.lat, prev.lon, pos.lat, pos.lon);
      if (!prev || dist(prev.lat, prev.lon, pos.lat, pos.lon) > 10) prev = { lat: pos.lat, lon: pos.lon };
      if (heading != null) cams.forEach(function (c) {
        if (c.routes.indexOf(route) < 0) return;
        var d = dist(pos.lat, pos.lon, c.lat, c.lng); if (d > ALERT_M || d >= bd) return;
        if (Math.abs(((bear(pos.lat, pos.lon, c.lat, c.lng) - heading + 540) % 360) - 180) <= 50) { best = c; bd = d; }
      });
    }
    if (!best) { el.className = 'yb-cam'; return; }
    el.className = 'yb-cam on' + (bd <= NEAR_M ? ' near' : '');
    el.innerHTML = '<span>' + NAME[best.type].replace('신호단속카메라', '신호단속') + (best.limit ? ' <b class="lim">' + best.limit + '</b>km' : '') + '</span><b>' + (Math.round(bd / 10) * 10) + 'm</b>';
    speak(best);
  }
  window.YbCamera = { update: update, load: load };
})();
