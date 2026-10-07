// 🚦 소통 알약 + 돌발정보 (국토교통부 표준노드링크 LINK_ID 방식) — 전 노선(202~282), 관리자(또는 시험 켜기)만 사용
// - 노선 구간별 링크번호: data/route/282_links.json (link_edit.html 에서 사람이 고친 파일)
// - 서버 공유 저장소(10분)를 읽고, 오래됐으면 달리는 폰 한 대가 영종·청라 지역만 국토교통부에서 받아 올린다(전국 X). 키는 시험 단계에서는 이 폰에 직접 넣은 값(yb_its_key)만 쓴다.
// - 어떤 단계든 실패하면 아무것도 바꾸지 않아 옛 표시가 그대로 나온다.
(function () {
  'use strict';
  var ROUTES = { '202': true, '202A': true, '203': true, '203A': true, '204': true, '205': true, '206': true, '221': true, '281': true, '282': true };
  var ALL_USERS = true;             // false 로 바꾸면 관리자(유재필)만 (재필씨 지시 2026-10-07: 모든 사용자)
  var ITS = 'https://openapi.its.go.kr:9443/';
    var data = {}, key = null, keyTried = 0;
  
  var curSeg = -1, lamp = null, lamps = {};   // lamps[구간] = 마지막 정상 값(자료 없는 구간은 이전 값 유지)
  var incSeen = {};

  function enabled() {
    if (ALL_USERS) return true;
    try { if (localStorage.getItem('yb_traffic_link') === '1') return true; } catch (e) { }
    try { return (localStorage.getItem('loggedInUser') || '') === '유재필'; } catch (e) { return false; }
  }
  function dist(a, b) { var k = Math.cos(a[0] * Math.PI / 180); return Math.hypot((a[0] - b[0]) * 110540, (a[1] - b[1]) * 111320 * k); }
  function bearing(a, b) { var k = Math.cos(a[0] * Math.PI / 180); return (Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180 / Math.PI + 360) % 360; }
  function angDiff(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

  function dutyRoute() {
    try { var d = (typeof getTodayDutyInfo === 'function') ? getTodayDutyInfo() : null; return d ? String(d.routeShort || d.baseRoute || '') : ''; } catch (e) { return ''; }
  }
  async function loadRoute(r) {
    if (data[r] !== undefined) return data[r];
    data[r] = null;
    try {
      var x = await fetch('data/route/' + r + '_links.json', { cache: 'no-cache' });
      if (x.ok) {
        var j = await x.json();
        if (j && j.segs && j.links && !j.lines) {   // 아직 사람이 안 고친(v2) 노선: 노선지도 선을 구간 선으로 씀
          var m = await fetch('data/route/' + r + '.json', { cache: 'no-cache' }).then(function (y) { return y.ok ? y.json() : null; });
          if (m && m.segs && m.segs.length === j.segs.length) j.lines = m.segs;
        }
        if (j && j.lines && j.segs && j.lines.length === j.segs.length) data[r] = j;
      }
    } catch (e) { }
    return data[r];
  }
  // 키: 로그인한 사용자만 서버에서 받아 메모리에만 둔다(저장 안 함). 못 받으면 이 폰에 직접 넣은 값(yb_its_key)을 쓴다.
  async function getKey() {
    if (key) return key;
    try { key = (localStorage.getItem('yb_its_key') || '').trim() || null; } catch (e) { }
    if (key) return key;
    if (keyTried && Date.now() - keyTried < 300000) return null;
    keyTried = Date.now();
    try {
      var r = await fetch(window.GAS_WEB_APP_URL + '?action=get_its_key').then(function (x) { return x.json(); });
      if (r && r.success && r.key) key = r.key;
    } catch (e) { }
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

  // ── 공유 저장소(서버) ──────────────────────────────────────────
  // 서버에 10분짜리 소통·돌발정보가 있으면 그것을 읽는다. 10분이 지났으면 운행 중인 폰 한 대만 국토부에서 영종·청라 전체를 받아 서버에 올린다.
  var AREA = { minX: 126.36, maxX: 126.70, minY: 37.42, maxY: 37.57 };   // 영종·청라·인천 노선 전체
  var FRESH = 600000, STALE = 2400000;                                   // 10분 / 40분
  var shared = { t: null, e: null }, sharedAt = 0, collecting = false, allIds = null;

  async function gasGet(q) { return fetch(window.GAS_WEB_APP_URL + '?' + q).then(function (x) { return x.json(); }); }
  async function gasPost(o) { return fetch(window.GAS_WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(o) }).then(function (x) { return x.json(); }); }
  async function itsGet(path, k) {
    var url = ITS + path + '?apiKey=' + encodeURIComponent(k) + '&type=all' + (path === 'eventInfo' ? '&eventType=all' : '') + '&getType=json'
      + '&minX=' + AREA.minX + '&maxX=' + AREA.maxX + '&minY=' + AREA.minY + '&maxY=' + AREA.maxY;
    var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 30000);
    try { var t = await fetch(url, { signal: ctl.signal }).then(function (x) { return x.text(); }); var j = JSON.parse(t); return (j && j.body && j.body.items) || []; }
    finally { clearTimeout(tm); }
  }
  async function loadAllIds() {   // 우리 노선 링크번호 전체(서버에 올릴 때 이것만 추려서 올림)
    if (allIds) return allIds;
    var ids = {};
    for (var r in ROUTES) { var R = await loadRoute(r); if (R) for (var id in R.links) ids[id] = 1; }
    allIds = ids; return ids;
  }
  async function collect(kind) {
    collecting = true;
    try {
      var c = await gasGet('action=claim_traffic_shared&kind=' + kind);
      if (!c || !c.ok) return;                      // 다른 폰이 받는 중이거나 이번 달 한도에 가까움
      var k = await getKey(); if (!k) return;
      if (kind === 't') {
        var items = await itsGet('trafficInfo', k); if (!items.length) return;
        var ids = await loadAllIds(), m = {};
        items.forEach(function (it) { var id = String(it.linkId || ''), sp = parseFloat(it.speed); if (ids[id] && !isNaN(sp)) m[id] = Math.round(sp * 10) / 10; });
        var res = await gasPost({ action: 'put_traffic_shared', kind: 't', data: m });
        if (res && res.success) shared.t = { at: Date.now(), data: m };
      } else {
        var ev = await itsGet('eventInfo', k);
        var list = ev.map(function (it) { return { roadName: it.roadName || '', message: it.message || '', eventDetailType: it.eventDetailType || '', coordX: it.coordX, coordY: it.coordY }; });
        var res2 = await gasPost({ action: 'put_traffic_shared', kind: 'e', data: list });
        if (res2 && res2.success) shared.e = { at: Date.now(), data: list };
      }
    } catch (e) { } finally { collecting = false; }
  }
  async function syncShared(g) {
    if (collecting) return;
    if (!sharedAt || Date.now() - sharedAt > 300000) {   // 서버 값 읽기(국토부 호출 아님): 5분마다
      try { var r = await gasGet('action=get_traffic_shared'); if (r && r.success) { if (r.t) shared.t = r.t; if (r.e) shared.e = r.e; sharedAt = Date.now(); } } catch (e) { }
    }
    var driving = (g.speedKmh || 0) >= 5;
    if (driving) {   // 달리는 폰만 새로 받는다
      if (!shared.t || Date.now() - shared.t.at >= FRESH) await collect('t');
      if (!shared.e || Date.now() - shared.e.at >= FRESH) await collect('e');
    }
  }

  function segFlow(R, i) {
    var ids = R.segs[i] || [], sumLen = 0, sumSp = 0, sumLim = 0, m = (shared.t && Date.now() - shared.t.at < STALE) ? shared.t.data : null;
    if (!m) return null;
    ids.forEach(function (id) {
      var inf = R.links[id] || [0, 0], lim = inf[0], len = inf[1] || 1, sp = m[id];
      if (typeof sp === 'number' && lim > 0) { sumLen += len; sumSp += sp * len; sumLim += lim * len; }
    });
    if (!sumLen) return null;
    var ratio = sumSp / sumLim;
    return { state: ratio >= 0.8 ? 'ok' : (ratio >= 0.4 ? 'slow' : 'jam'), label: Math.round(sumSp / sumLen) + 'km' };
  }

  // 돌발정보: 내 앞쪽 구간 선 가까이(150m)에 있는 것만 알린다. 같은 건은 한 번만.
  function checkIncidents(R, pos) {
    if (!shared.e || Date.now() - shared.e.at > STALE) return;
    var from = Math.max(0, curSeg), to = Math.min(R.lines.length - 1, curSeg + 3);
    shared.e.data.forEach(function (it) {
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
  }

  async function tick() {
    try {
      if (!enabled()) { lamp = null; return; }
      var r = dutyRoute();
      if (!ROUTES[r]) { lamp = null; curSeg = -1; return; }
      var g = window.lastGpsPosition;
      if ((!g || !g.time) && window.simState && window.simState.active && window.curBusGpsLat) g = { lat: window.curBusGpsLat, lon: window.curBusGpsLon, speedKmh: window.curBusSpeed || 45, heading: -1, time: new Date() };   // 모의주행(PC 시험)
      if (!g || !g.time || Date.now() - new Date(g.time).getTime() > 120000) return;   // GPS 없으면 그대로(옛 표시)
      var R = await loadRoute(r); if (!R) return;
      var pos = [g.lat, g.lon];
      var s = findSeg(R, pos, g.heading);
      if (s < 0) { if (curSeg >= 0 && dist(pos, R.lines[curSeg][0]) > 3000) curSeg = -1; lamp = null; return; }
      curSeg = s;
      await syncShared(g);
      var f = segFlow(R, s);
      if (f) lamps[s] = { f: f, at: Date.now() }; else f = (lamps[s] && Date.now() - lamps[s].at < 1800000) ? lamps[s].f : null;   // 자료가 없으면 이전 값 유지(30분까지)
      lamp = f;
      if (lamp && typeof setTrafficLamp === 'function') {
        var st = document.getElementById('trafficFlowStatusText');
        if (!(st && st.innerText === '돌발 주의')) setTrafficLamp(lamp.state, lamp.label);
      }
      checkIncidents(R, pos);
    } catch (e) { }
  }

  window.TrafficLink = {
    getLamp: function () { return enabled() ? lamp : null; },
    tick: tick
  };
  setInterval(tick, 10000);
  setTimeout(tick, 3000);
})();
