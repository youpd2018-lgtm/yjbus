// 🚦 소통 알약 + 돌발정보 (국토교통부 표준노드링크 LINK_ID 방식) — 지금은 282 노선만, 관리자(또는 시험 켜기)만 사용
// - 노선 구간별 링크번호: data/route/282_links.json (link_edit.html 에서 사람이 고친 파일)
// - 폰이 내 위치 주변 약 5km만 국토교통부에서 직접 받는다(전국 X). 키는 시험 단계에서는 이 폰에 직접 넣은 값(yb_its_key)만 쓴다.
// - 어떤 단계든 실패하면 아무것도 바꾸지 않아 옛 표시가 그대로 나온다.
(function () {
  'use strict';
  var ROUTES = { '282': true };
  var ALL_USERS = false;            // true 로 바꾸면 모든 기사에게 적용 (관리자 확인 후)
  var ITS = 'https://openapi.its.go.kr:9443/';
  var H = 0.025;                    // 소통정보 받을 사각형: 위도·경도 ±0.025도 ≈ 5km
  var data = {}, key = null, keyTried = 0;
  var traffic = {}, trafficAt = 0, trafficCenter = null, fetching = false;
  var curSeg = -1, lamp = null, lamps = {};   // lamps[구간] = 마지막 정상 값(자료 없는 구간은 이전 값 유지)
  var incAt = 0, incSeen = {}, incBusy = false;

  function enabled() {
    if (ALL_USERS) return true;
    try { if (localStorage.getItem('yb_traffic_link') === '1') return true; } catch (e) { }
    try { return (localStorage.getItem('loggedInUser') || '') === '유재필'; } catch (e) { return false; }
  }
  function dist(a, b) { var k = Math.cos(a[0] * Math.PI / 180); return Math.hypot((a[0] - b[0]) * 110540, (a[1] - b[1]) * 111320 * k); }
  function bearing(a, b) { var k = Math.cos(a[0] * Math.PI / 180); return (Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180 / Math.PI + 360) % 360; }
  function angDiff(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

  function dutyRoute() {
    try { var d = (typeof getTodayDutyInfo === 'function') ? getTodayDutyInfo() : null; return d ? String(d.baseRoute || d.routeShort || '') : ''; } catch (e) { return ''; }
  }
  async function loadRoute(r) {
    if (data[r] !== undefined) return data[r];
    data[r] = null;
    try {
      var x = await fetch('data/route/' + r + '_links.json', { cache: 'no-cache' });
      if (x.ok) { var j = await x.json(); if (j && j.v === 3 && j.lines && j.segs) data[r] = j; }
    } catch (e) { }
    return data[r];
  }
  // 키: 지금은 시험 단계라 이 폰에 직접 넣은 값만 쓴다(localStorage yb_its_key, 서버에서 내려받지 않음)
  async function getKey() {
    if (key) return key;
    try { key = (localStorage.getItem('yb_its_key') || '').trim() || null; } catch (e) { }
    return key;
  }

  // 내 위치가 어느 구간인지: 처음엔 진행 방향이 맞는 가장 가까운 구간, 한 번 잡은 뒤에는 앞뒤 가까운 구간만 본다
  function findSeg(R, pos, heading) {
    var best = -1, bd = 1e9, n = R.lines.length;
    for (var i = 0; i < n; i++) {
      if (curSeg >= 0 && (i < curSeg - 1 || i > curSeg + 3)) continue;
      var ln = R.lines[i];
      for (var j = 0; j < ln.length; j++) {
        var d = dist(pos, ln[j]);
        if (d >= bd) continue;
        if (curSeg < 0 && typeof heading === 'number' && heading >= 0 && j + 1 < ln.length && angDiff(heading, bearing(ln[j], ln[j + 1])) > 70) continue;
        bd = d; best = i;
      }
    }
    return bd < 120 ? best : -1;
  }
  function segFlow(R, i) {
    var ids = R.segs[i] || [], sumLen = 0, sumSp = 0, sumLim = 0;
    ids.forEach(function (id) {
      var inf = R.links[id] || [0, 0], lim = inf[0], len = inf[1] || 1, t = traffic[id], sp = t ? parseFloat(t.speed) : NaN;
      if (!isNaN(sp) && lim > 0) { sumLen += len; sumSp += sp * len; sumLim += lim * len; }
    });
    if (!sumLen) return null;
    var ratio = sumSp / sumLim;
    return { state: ratio >= 0.8 ? 'ok' : (ratio >= 0.4 ? 'slow' : 'jam'), label: Math.round(sumSp / sumLen) + 'km' };
  }

  async function fetchTraffic(pos) {
    var k = await getKey(); if (!k) return false;
    var url = ITS + 'trafficInfo?apiKey=' + encodeURIComponent(k) + '&type=all&getType=json'
      + '&minX=' + (pos[1] - H).toFixed(4) + '&maxX=' + (pos[1] + H).toFixed(4) + '&minY=' + (pos[0] - H).toFixed(4) + '&maxY=' + (pos[0] + H).toFixed(4);
    var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 20000);
    try {
      var t = await fetch(url, { signal: ctl.signal }).then(function (x) { return x.text(); });
      var j = JSON.parse(t), items = (j && j.body && j.body.items) || [], m = {};
      items.forEach(function (it) { if (it.linkId) m[String(it.linkId)] = it; });
      if (!items.length) return false;
      traffic = m; trafficAt = Date.now(); trafficCenter = pos; return true;
    } catch (e) { return false; } finally { clearTimeout(tm); }
  }

  // 돌발정보: 내 앞쪽 구간 선 가까이(150m)에 있는 것만(소통정보와 같이 5분·2km마다 받음) 알린다. 같은 건은 한 번만.
  async function checkIncidents(R, pos) {
    if (incBusy) return;
    incBusy = true; incAt = Date.now();
    try {
      var k = await getKey(); if (!k) return;
      var bb = 0.05;
      var url = ITS + 'eventInfo?apiKey=' + encodeURIComponent(k) + '&type=all&eventType=all&getType=json'
        + '&minX=' + (pos[1] - bb).toFixed(4) + '&maxX=' + (pos[1] + bb).toFixed(4) + '&minY=' + (pos[0] - bb).toFixed(4) + '&maxY=' + (pos[0] + bb).toFixed(4);
      var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 20000);
      var t = await fetch(url, { signal: ctl.signal }).then(function (x) { return x.text(); }); clearTimeout(tm);
      var j = JSON.parse(t), items = (j && j.body && j.body.items) || [];
      var from = Math.max(0, curSeg), to = Math.min(R.lines.length - 1, curSeg + 3);
      items.forEach(function (it) {
        var p = [parseFloat(it.coordY), parseFloat(it.coordX)];
        if (isNaN(p[0]) || isNaN(p[1])) return;
        var near = false;
        for (var i = from; i <= to && !near; i++) { var ln = R.lines[i]; for (var q = 0; q < ln.length; q++) if (dist(p, ln[q]) < 150) { near = true; break; } }
        if (!near) return;
        var id = (it.roadName || '') + '|' + (it.message || it.eventDetailType || '') + '|' + it.coordX + '|' + it.coordY;
        if (incSeen[id]) return; incSeen[id] = 1;
        var km = (dist(pos, p) / 1000).toFixed(1);
        var road = String(it.roadName || '주요도로').trim(), msg = String(it.message || it.eventDetailType || '돌발상황 발생').trim();
        var text = '🚨 [돌발] ' + road + ' ' + msg + ' (' + km + 'km 전방)';
        window.liveTrafficAlerts = window.liveTrafficAlerts || [];
        window.liveTrafficAlerts.unshift(text);
        window._trafficAlertMeta = window._trafficAlertMeta || [];
        window._trafficAlertMeta.push({ text: text, receivedAt: Date.now() });
        if (typeof renderLiveModalAlerts === 'function') renderLiveModalAlerts();
        if (typeof triggerTrafficIncidentTest === 'function') triggerTrafficIncidentTest(text);
      });
    } catch (e) { } finally { incBusy = false; }
  }

  async function tick() {
    try {
      if (!enabled()) { lamp = null; return; }
      var r = dutyRoute();
      if (!ROUTES[r]) { lamp = null; curSeg = -1; return; }
      var g = window.lastGpsPosition;
      if (!g || !g.time || Date.now() - new Date(g.time).getTime() > 120000) return;   // GPS 없으면 그대로(옛 표시)
      var R = await loadRoute(r); if (!R) return;
      var pos = [g.lat, g.lon];
      var s = findSeg(R, pos, g.heading);
      if (s < 0) { if (curSeg >= 0 && dist(pos, R.lines[curSeg][0]) > 3000) curSeg = -1; lamp = null; return; }
      curSeg = s; var fresh = false;
      if (!fetching && (!trafficAt || Date.now() - trafficAt > 300000 || dist(pos, trafficCenter) > 2000)) {
        fetching = true; try { await fetchTraffic(pos); } finally { fetching = false; }
        fresh = true;
      }
      var f = segFlow(R, s);
      if (f) lamps[s] = { f: f, at: Date.now() }; else f = (lamps[s] && Date.now() - lamps[s].at < 1800000) ? lamps[s].f : null;   // 자료가 없으면 이전 값 유지(30분까지)
      lamp = f;
      if (lamp && typeof setTrafficLamp === 'function') {
        var st = document.getElementById('trafficFlowStatusText');
        if (!(st && st.innerText === '돌발 주의')) setTrafficLamp(lamp.state, lamp.label);
      }
      if (fresh) checkIncidents(R, pos);   // 돌발정보도 소통정보와 같은 때(5분 또는 2km)에만 받음
    } catch (e) { }
  }

  window.TrafficLink = {
    getLamp: function () { return enabled() ? lamp : null; },
    tick: tick
  };
  setInterval(tick, 10000);
  setTimeout(tick, 3000);
})();
