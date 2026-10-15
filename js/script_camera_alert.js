// 단속카메라 전방 알림: 진행 방향 앞 500m 안의 카메라를 글자로 알리고(500m 노랑, 200m 빨강 깜빡),
// 500m와 200m에서 각각 한 번 띵동 경고음을 내고, 카메라 제한속도를 넘으면 화면 테두리가 빨갛게 깜빡인다. 노선지도·라이브 모달 공용. 데이터: data/camera/cameras.json
(function () {
  var ALERT_M = 500, NEAR_M = 200, NAME = { speed: '과속카메라', signal: '신호위반', both: '과속·신호위반', other: '단속카메라' }, CAUTION_M = 100;
  var cams = null, secs = null, loading = false, secState = {}, prev = null, heading = null, caution = null, spoken = {};
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
    fetch('data/camera/sections.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : { sections: [] }; })
      .then(function (j) { secs = j.sections || []; window.YbCamera.sections = secs; }).catch(function () { secs = []; });
  }
  // 경고음: 띵동 두 번. 같은 카메라는 500m에서 한 번, 200m에서 한 번만 (노선지도 iframe과 앱이 sessionStorage를 같이 써서 겹쳐 울리지 않음)
  function ding() {
    try { var w = window.sfxPlay ? window : (window.parent && window.parent.sfxPlay ? window.parent : null);
      if (w) { w.sfxPlay('depart'); setTimeout(function () { w.sfxPlay('depart'); }, 900); return; } } catch (e) { }
    try { var a = new Audio('sounds/depart_ding.mp3'), p = a.play(); if (p && p.catch) p.catch(function () { });
      setTimeout(function () { try { new Audio('sounds/depart_ding.mp3').play().catch(function () { }); } catch (e) { } }, 900); } catch (e) { }
  }
  function chime(c, d) {
    var k = c.lat + ',' + c.lng, st = d <= NEAR_M ? 2 : 1, now = Date.now(), o = spoken[k] || {};
    if (o['s' + st] && now - o['s' + st] < 180000) return;
    o['s' + st] = now; if (st === 2) o.s1 = o.s1 || now; spoken[k] = o;
    try { sessionStorage.setItem('yb_cam_spoken', JSON.stringify(spoken)); } catch (e) { }
    ding();
  }
  // 제한속도를 넘으면 화면 전체에 은은한 빨간 테두리가 소리 없이 깜빡임
  function over(on) {
    var o = document.getElementById('ybCamOver');
    if (!o) { if (!on) return; o = document.createElement('div'); o.id = 'ybCamOver'; o.className = 'yb-cam-over'; document.body.appendChild(o); }
    o.classList.toggle('on', !!on);
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
    // 100m 안으로 들어오면 그 카메라를 붙잡아 두고, 지나칠 때까지 "주의하세요"를 같은 자리에 띄운다
    if (caution && pos) {
      var dl = dist(pos.lat, pos.lon, caution.c.lat, caution.c.lng);
      if (dl < caution.min) caution.min = dl;
      if (dl > caution.min + 30 || dl > 300) caution = null; else { best = caution.c; bd = dl; }
    } else if (caution) caution = null;
    if (!caution && best && bd <= CAUTION_M) caution = { c: best, min: bd };
    // ---- 구간단속: 시작점 접근 알림 → 구간 안 평균속도·남은 거리 → 끝점 통과 ----
    var sec = null, secD = 0, inSec = null;
    if (pos && secs && route) {
      var nowT = Date.now();
      secs.forEach(function (sc) {
        if (sc.routes.indexOf(route) < 0) return;
        var st = secState[sc.name], ds = dist(pos.lat, pos.lon, sc.start.lat, sc.start.lng), de = dist(pos.lat, pos.lon, sc.end.lat, sc.end.lng);
        if (st) {   // 구간 안
          var step = dist(st.last.lat, st.last.lon, pos.lat, pos.lon);
          if (step > 3) { st.dist += step; st.last = { lat: pos.lat, lon: pos.lon }; }
          if (de <= 80 || nowT - st.t0 > 3600000) { delete secState[sc.name]; return; }
          inSec = { sc: sc, st: st, left: de }; return;
        }
        if (heading == null || (pos.speed != null && pos.speed < 5)) return;
        var okDir = Math.abs(((bear(sc.start.lat, sc.start.lng, sc.end.lat, sc.end.lng) - heading + 540) % 360) - 180) <= 60;
        if (!okDir) return;
        if (ds <= 80) { secState[sc.name] = { t0: nowT, dist: 0, last: { lat: pos.lat, lon: pos.lon } }; inSec = { sc: sc, st: secState[sc.name], left: de, fresh: true }; return; }
        if (ds <= ALERT_M && ds < (sec ? secD : 1e9) && Math.abs(((bear(pos.lat, pos.lon, sc.start.lat, sc.start.lng) - heading + 540) % 360) - 180) <= 50) { sec = sc; secD = ds; }
      });
    }
    if (inSec) {
      var sc = inSec.sc, sp = inSec.st, secs_ = (Date.now() - sp.t0) / 1000;
      var avg = secs_ > 20 && sp.dist > 100 ? sp.dist / secs_ * 3.6 : (pos.speed != null ? pos.speed : 0);
      var bad = sc.limit > 0 && (avg > sc.limit || (pos.speed != null && pos.speed > sc.limit));
      el.className = 'yb-cam on' + (bad ? ' near' : '');
      el.innerHTML = '<span>구간단속 <b class="lim">' + sc.limit + '</b>km · 평균 <b class="lim">' + Math.round(avg) + '</b></span><b>' + (inSec.left >= 1000 ? (inSec.left / 1000).toFixed(1) + 'km' : Math.round(inSec.left / 10) * 10 + 'm') + '</b>';
      if (inSec.fresh) ding();
      over(bad); return;
    }
    if (sec && (!best || secD < bd)) {
      el.className = 'yb-cam on' + (secD <= NEAR_M ? ' near' : '');
      el.innerHTML = '<span>구간단속 시작 <b class="lim">' + sec.limit + '</b>km</span><b>' + (Math.round(secD / 10) * 10) + 'm</b>';
      chime({ lat: sec.start.lat, lng: sec.start.lng }, secD); over(false); return;
    }
    if (!best) { el.className = 'yb-cam'; over(false); return; }
    el.className = 'yb-cam on' + (bd <= NEAR_M || caution ? ' near' : '');
    el.innerHTML = '<span>' + NAME[best.type] + (best.limit ? ' <b class="lim">' + best.limit + '</b>km' : '') + '</span><b>' + (caution ? '주의하세요' : Math.round(bd / 10) * 10 + 'm') + '</b>';
    chime(best, bd);
    over(best.limit > 0 && pos.speed != null && pos.speed > best.limit);
  }
  window.YbCamera = { update: update, load: load };
})();
