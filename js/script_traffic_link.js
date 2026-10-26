// 🚦 앞쪽 돌발·정체 알림 (국토교통부 표준노드링크 LINK_ID 방식) — 전 노선(202~282)
// - 2026-10-26 사용자 지시: 신호등 알약은 '내 앞쪽'(약 5km)의 사고·공사·통제·기상 돌발과 정체만 알린다. 아무것도 없으면 초록.
//   (전에는 시내 도로 평균 속도를 색으로 보여 줬는데 운행에 도움이 안 돼서 바꿈)
// - 노선 구간별 링크번호: data/route/282_links.json (link_edit.html 에서 사람이 고친 파일)
// - 서버 공유 저장소(10분)를 읽고, 오래됐으면 달리는 폰 한 대가 영종·청라 지역만 국토교통부에서 받아 올린다(전국 X). 키는 시험 단계에서는 이 폰에 직접 넣은 값(yb_its_key)만 쓴다.
// - 어떤 단계든 실패하면 아무것도 바꾸지 않아 옛 표시가 그대로 나온다.
(function () {
  'use strict';
  var ROUTES = { '202': true, '202A': true, '203': true, '203A': true, '204': true, '205': true, '206': true, '221': true, '281': true, '282': true };
  var ALL_USERS = true;             // false 로 바꾸면 관리자(유재필)만 (재필씨 지시 2026-10-07: 모든 사용자)
  var ITS = 'https://openapi.its.go.kr:9443/';
    var data = {}, key = null, keyTried = 0;
  
  var curSeg = -1, lamp = null;
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
        if (j && j.segs && j.links && !j.lines && j.base && j.base.length === j.segs.length) j.lines = j.base;   // 선 모양도 이 파일 한 개에 들어 있음
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
  // ── 공유 저장소(서버) ──────────────────────────────────────────
  // 서버에 10분짜리 소통·돌발정보가 있으면 그것을 읽는다. 10분이 지났으면 운행 중인 폰 한 대만 국토부에서 영종·청라 전체를 받아 서버에 올린다.
  var AREA = { minX: 126.36, maxX: 126.70, minY: 37.42, maxY: 37.57 };   // 영종·청라·인천 노선 전체
  // 국토부 월 5,000건 한도: 돌발 12분(하루 최대 약 103번) + 소통 30분(약 41번) = 한 달 최대 약 4,300번
  var FRESH_E = 720000, FRESH_T = 1800000, STALE = 2700000;             // 돌발 12분 / 소통 30분 / 45분 지나면 안 씀
  var COLLECT_EVENTS = true;                                             // 2026-10-26 다시 켬(사용자 지시: 앞쪽 돌발·통제·공사 알림)
  var AHEAD_SEGS = 8;                                                    // 앞쪽 구간 수(구간 하나 약 0.6km → 약 5km)
  function inServiceHours() {   // 운행시간 04:30~01:00 (한국 시각)에만 국토부에서 새로 받는다
    var d = new Date(Date.now() + 9 * 3600000), m = d.getUTCHours() * 60 + d.getUTCMinutes();
    return m >= 270 || m < 60;
  }
  var shared = { t: null, e: null }, sharedAt = 0, skew = 0, collecting = false, allIds = null;
  function nowS() { return Date.now() + skew; }   // 서버 시각 기준(폰 시계가 틀려도 '몇 분 지났나'를 정확히 판단)

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
        if (res && res.success) shared.t = { at: nowS(), data: m };
      } else {
        var ev = await itsGet('eventInfo', k);
        var list = ev.map(function (it) {
          return { roadName: it.roadName || '', message: it.message || '', eventType: it.eventType || '', eventDetailType: it.eventDetailType || '',
            linkId: String(it.linkId || ''), lanesBlocked: it.lanesBlocked || '', startDate: it.startDate || '', endDate: it.endDate || '', coordX: it.coordX, coordY: it.coordY };
        });
        var res2 = await gasPost({ action: 'put_traffic_shared', kind: 'e', data: list });
        if (res2 && res2.success) shared.e = { at: nowS(), data: list };
      }
    } catch (e) { } finally { collecting = false; }
  }
  async function syncShared(g) {
    if (collecting) return;
    if (!sharedAt || Date.now() - sharedAt > 60000) {   // 서버 값 읽기(국토부 호출 아님): 1분마다
      try { var r = await gasGet('action=get_traffic_shared'); if (r && r.success) { if (r.now) skew = r.now - Date.now(); if (r.t) shared.t = r.t; if (r.e) shared.e = r.e; sharedAt = Date.now(); } } catch (e) { }
    }
    var driving = (g.speedKmh || 0) >= 5;
    if (driving && inServiceHours()) {   // 달리는 폰만, 운행시간 안에만 새로 받는다
      if (COLLECT_EVENTS && (!shared.e || nowS() - shared.e.at >= FRESH_E)) await collect('e');
      if (!shared.t || nowS() - shared.t.at >= FRESH_T) await collect('t');
    }
  }

  // 앞쪽 정체: 앞쪽 구간마다 (속도 ÷ 제한속도)를 길이로 평균. 0.35 아래이거나 15km/h 아래면 정체.
  // 서행은 알리지 않는다(완전 정체만, 사용자 지시 2026-10-26).
  // 시내 도로는 원래 신호·정류장 때문에 느리므로 300m 넘게 이어진 구간만 본다.
  function aheadJam(R, pos) {
    var m = (shared.t && nowS() - shared.t.at < STALE) ? shared.t.data : null;
    if (!m) return null;
    var to = Math.min(R.segs.length - 1, curSeg + AHEAD_SEGS);
    for (var i = curSeg; i <= to; i++) {
      var ids = R.segs[i] || [], sumLen = 0, sumSp = 0, sumLim = 0, road = '';
      ids.forEach(function (id) {
        var inf = R.links[id] || [0, 0], lim = inf[0], len = inf[1] || 1, sp = m[id];
        if (typeof sp === 'number' && lim > 0) { sumLen += len; sumSp += sp * len; sumLim += lim * len; if (!road && inf[2]) road = inf[2]; }
      });
      if (sumLen < 300) continue;
      var ratio = sumSp / sumLim, avg = sumSp / sumLen;
      if (!(ratio < 0.35 || avg < 15)) continue;
      var st = 'jam';
      var p0 = R.lines[i] && R.lines[i][0], km = p0 ? dist(pos, p0) / 1000 : 0;
      return { state: st, seg: i, road: road, avg: Math.round(avg), km: km };
    }
    return null;
  }

  // 돌발 종류 이름: 사고 / 공사 / 통제 / 기상 / 돌발
  function evKind(it) {
    var t = String(it.eventType || '') + ' ' + String(it.eventDetailType || '') + ' ' + String(it.message || '');
    if (/사고|추돌|전복|화재|고장/.test(t)) return '사고';
    if (/공사|보수|작업|포장/.test(t)) return '공사';
    if (/통제|차단|폐쇄|행사|집회|시위/.test(t)) return '통제';
    if (/기상|강우|강설|안개|결빙|침수|재난|강풍/.test(t)) return '기상';
    return '돌발';
  }
  function evId(it) { return (it.roadName || '') + '|' + (it.message || it.eventDetailType || '') + '|' + it.coordX + '|' + it.coordY; }

  // 앞쪽 돌발: 앞쪽 구간의 링크번호가 같거나, 앞쪽 구간 선에서 120m 안에 있는 것. 가장 가까운 것 하나.
  function aheadEvent(R, pos) {
    if (!shared.e || nowS() - shared.e.at > STALE) return null;
    var to = Math.min(R.lines.length - 1, curSeg + AHEAD_SEGS), mine = {};
    for (var i = curSeg; i <= to; i++) (R.segs[i] || []).forEach(function (id) { mine[id] = 1; });
    var best = null;
    shared.e.data.forEach(function (it) {
      var p = [parseFloat(it.coordY), parseFloat(it.coordX)];
      if (isNaN(p[0]) || isNaN(p[1])) return;
      var near = !!(it.linkId && mine[it.linkId]);
      for (var i = curSeg; i <= to && !near; i++) { var ln = R.lines[i]; for (var q = 0; q < ln.length; q++) if (dist(p, ln[q]) < 120) { near = true; break; } }
      if (!near) return;
      var km = dist(pos, p) / 1000;
      if (!best || km < best.km) best = { it: it, km: km, kind: evKind(it) };
    });
    return best;
  }

  // 알림(메시지창 + 음성)은 같은 건 한 번만. 정체는 같은 구간이면 20분에 한 번만.
  var jamSaid = {};
  function announce(text) {
    window.liveTrafficAlerts = window.liveTrafficAlerts || [];
    window.liveTrafficAlerts.unshift(text);
    window._trafficAlertMeta = window._trafficAlertMeta || [];
    window._trafficAlertMeta.push({ text: text, receivedAt: Date.now() });
    window._aheadAlertText = text;
    if (typeof renderLiveModalAlerts === 'function') renderLiveModalAlerts();
  }
  function checkAhead(R, pos) {
    var ev = aheadEvent(R, pos), jam = ev ? null : aheadJam(R, pos);
    if (ev) {
      var id = evId(ev.it);
      if (!incSeen[id]) {
        incSeen[id] = 1;
        var road = String(ev.it.roadName || '').trim(), msg = String(ev.it.message || ev.it.eventDetailType || '돌발상황').trim();
        announce('🚨 [' + ev.kind + '] ' + (road ? road + ' ' : '') + msg + ' (' + ev.km.toFixed(1) + 'km 전방)');
      }
      return { state: 'jam', label: ev.kind };
    }
    if (jam) {
      var k = String(jam.seg);
      if (!jamSaid[k] || Date.now() - jamSaid[k] > 1200000) {
        jamSaid[k] = Date.now();
        announce('🚦 [정체] ' + (jam.road ? jam.road + ' ' : '') + '평균 ' + jam.avg + 'km/h (' + jam.km.toFixed(1) + 'km 전방)');
      }
      return { state: 'jam', label: '정체' };
    }
    window._aheadAlertText = '';
    return { state: 'ok', label: '앞쪽 이상 없음' };
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
      lamp = checkAhead(R, pos);
      if (lamp && typeof setTrafficLamp === 'function') setTrafficLamp(lamp.state, lamp.label);
    } catch (e) { }
  }

  window.TrafficLink = {
    getLamp: function () { return enabled() ? lamp : null; },
    tick: tick
  };
  setInterval(tick, 10000);
  setTimeout(tick, 3000);
})();
