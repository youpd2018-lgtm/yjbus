// ================================================================
// 🧪 [테스트 운행] script_test_drive.js  (테스트 계정 강영걸 전용)
// - 라이브 모달 아래 [테스트하기] 버튼 → 202 평일16대 1순번 실제 시간표·정류장으로 5분 운행(5배속)을 가상으로 돌린다.
// - 바뀌는 것: 시계(5배속)·GPS(정류장을 따라 이동)·오늘 근무(테스트용 202 1순번으로 대신 보임).
// - 서버에는 아무것도 저장하지 않는다(저장 요청은 가짜 성공으로 막음). 읽기만 실제 서버를 쓴다.
// - 시작하면 1회차 출발 30초 전 카운트 → 운행 중, 라이브 모달을 열면 운행 시작, 껐다 다시 열면 처음부터(installRestart).
// - 이 탭 안에서만 켜지고(sessionStorage), [테스트 끝내기]를 누르거나 탭을 닫으면 사라진다.
// - 노선지도(route_map.html)도 같은 가짜 GPS를 받아 지도가 정류장을 따라간다.
// ================================================================
(function () {
  var SS = 'yb_td', SS_PATH = 'yb_td_path';
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { } }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) { } }

  var RealDate = Date;
  var state = null;
  try { state = JSON.parse(ssGet(SS) || 'null'); } catch (e) { }
  var on = !!(state && state.on);

  var SAMPLE_ROUTE = '202', SAMPLE_TT = '202평일(16대)_1순번';
  var SAMPLE_SCHED = JSON.stringify({ workType: '정상', busNo: '1234', route: '202평일(16대)', seq: '1순번', time: '오전' });
  var BASE_RATE = 5;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayStr(ms) { var d = new RealDate(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // ---------- 켜져 있을 때만: 가짜 시계 · 가짜 GPS · 근무 대체 · 저장 막기 ----------
  // 가상 시계: 시작하면 1회차 출발(t0) 30초 전부터 실시간으로 카운트다운 → 출발 시각에 '운행 중'으로 바뀌어 멈춰 있다가,
  // 라이브 모달(또는 노선지도)을 열면 운행 시작 지점으로 옮겨 5배속으로 달린다.
  var CD_MS = 30000;
  function vnow() {
    var r = RealDate.now(), cd = Math.min(state.t0 - CD_MS + (r - state.E), state.t0);
    if (!state.opened) return cd;
    var rs = Math.max(state.opened, state.E + CD_MS);
    if (r < rs) return cd;
    return state.base + (r - rs) * state.rate;
  }

  function installShims() {
    // 1) 시계
    function FakeDate() {
      var a = arguments;
      if (!(this instanceof FakeDate)) return new RealDate(vnow()).toString();
      if (a.length === 0) return new RealDate(vnow());
      if (a.length === 1) return new RealDate(a[0]);
      return new RealDate(a[0], a[1], a[2] === undefined ? 1 : a[2], a[3] || 0, a[4] || 0, a[5] || 0, a[6] || 0);
    }
    FakeDate.prototype = RealDate.prototype;
    FakeDate.now = vnow; FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
    window.Date = FakeDate;

    // 2) 오늘 근무를 테스트용(202 평일16대 1순번)으로 대신 보이게 (저장소에 쓰지는 않음)
    var TODAY = state.today;
    var origGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) {
      try { if (this === window.localStorage && /^jpil_user_.+_sched_\d{4}-\d{2}-\d{2}$/.test(k) && k.slice(-10) === TODAY) return SAMPLE_SCHED; } catch (e) { }
      return origGet.apply(this, arguments);
    };

    // 3) GPS: 저장해 둔 경로를 시각에 맞춰 따라간다
    var path = [];
    try { path = JSON.parse(ssGet(SS_PATH) || '[]'); } catch (e) { }
    function distM(a, b) { var R = 6371000, d2r = Math.PI / 180, dLat = (b[0] - a[0]) * d2r, dLon = (b[1] - a[1]) * d2r; var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * d2r) * Math.cos(b[0] * d2r) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
    var lastP = null, lastT = 0, hi = 0;
    function fix() {
      if (!path.length) return null;
      var t = vnow(), lo = 0, h = path.length - 1;
      if (t <= path[0][0]) { lo = 0; h = 0; }
      else if (t >= path[h][0]) { lo = h; }
      else { while (h - lo > 1) { var m = (lo + h) >> 1; if (path[m][0] <= t) lo = m; else h = m; } h = lo + 1; }
      var a = path[lo], b = path[Math.min(h, path.length - 1)], f = (b[0] > a[0]) ? Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0]))) : 0;
      var p = [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], spd = 0;
      if (lastP && t > lastT) spd = Math.min(20, distM(lastP, p) / ((t - lastT) / 1000));
      lastP = p; lastT = t;
      return { coords: { latitude: p[0], longitude: p[1], accuracy: 8, speed: spd, heading: null, altitude: null, altitudeAccuracy: null }, timestamp: RealDate.now() };
    }
    var watchers = {}, wid = 0;
    var geo = {
      getCurrentPosition: function (ok, err) { var f = fix(); if (f) ok(f); else if (err) err({ code: 2, message: 'no fix' }); },
      watchPosition: function (ok) { var id = ++wid; watchers[id] = setInterval(function () { var f = fix(); if (f) { try { ok(f); } catch (e) { console.warn(e); } } }, 1000); return id; },
      clearWatch: function (id) { if (watchers[id]) { clearInterval(watchers[id]); delete watchers[id]; } }
    };
    try { Object.defineProperty(navigator, 'geolocation', { configurable: true, get: function () { return geo; } }); } catch (e) { }

  }
  if (on) installShims();

  // ---------- 강영걸(테스트 계정)은 테스트 중이 아니어도 항상: 서버 저장 막기, 저장은 이 폰(로컬)에만 ----------
  (function installWriteBlock() {
    var WRITE = /(?:action=|"action"\s*:\s*")(save_(?!usage)|admin_(?!list_)|register_|update_my_|set_|delete_|put_|claim_|log_|report_)/;
    function blocked() { return on || isAdminName(); }
    var origFetch = window.fetch ? window.fetch.bind(window) : null;
    if (origFetch) {
      window.fetch = function (input, init) {
        try {
          var url = (typeof input === 'string') ? input : (input && input.url) || '';
          var body = (init && typeof init.body === 'string') ? init.body : '';
          if (/script\.google\.com|script\.googleusercontent\.com/.test(url) && (WRITE.test(url) || WRITE.test(body)) && blocked()) {
            return Promise.resolve(new Response(JSON.stringify({ success: true, localOnly: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
          }
        } catch (e) { }
        return origFetch(input, init);
      };
    }
    if (navigator.sendBeacon) {
      var ob = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (u, d) { return (/script\.google/.test(u || '') && blocked()) ? true : ob(u, d); };
    }
  })();

  // ---------- 경로 만들기: 202 실제 정류장·표준시간 + 길 모양 ----------
  function baseUrl() { var p = location.pathname; return p.substring(0, p.lastIndexOf('/') + 1); }
  function getJson(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function gasStops() {
    var ok = function (j) { return j && j.stops && j.stops.length > 10 && j.anchors && j.anchors.length === 3; };
    // 먼저 GitHub 노선 파일(data/routemaster/ganseon)을 읽고, 안 되면 서버(시트)에서 받는다
    return getJson(baseUrl() + 'data/routemaster/ganseon/' + SAMPLE_ROUTE + '.json')
      .then(function (j) { if (ok(j)) return j; throw new Error('bad'); })
      .catch(function () {
        var u = window.GAS_WEB_APP_URL;
        if (!u) return Promise.reject(new Error('no gas'));
        return fetch(u + '?action=get_route_stops&route=' + SAMPLE_ROUTE).then(function (r) { return r.json(); })
          .then(function (j) { if (j && j.success && ok(j)) return j; throw new Error('bad'); });
      });
  }
  function hmsToSec(s) { var m = /^(\d+):(\d+)(?::(\d+))?$/.exec(String(s || '').trim()); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0)) : null; }
  function distM2(a, b) { var R = 6371000, d2r = Math.PI / 180, dLat = (b[0] - a[0]) * d2r, dLon = (b[1] - a[1]) * d2r; var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * d2r) * Math.cos(b[0] * d2r) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.sqrt(x)); }

  async function buildPath() {
    var root = baseUrl();
    var res = await Promise.all([
      getJson(root + 'data/timetable/tt/' + encodeURIComponent(SAMPLE_TT) + '.json'),
      getJson(root + 'data/map/' + SAMPLE_ROUTE + '.json'),
      gasStops().catch(function () { return getJson(root + 'data/demo/202_stops.json'); })
    ]);
    var tt = res[0], mapJ = res[1], route = res[2];
    var r1 = tt.rounds[0];
    var t0 = hmsToSec(r1.time1), t1 = hmsToSec(r1.time2), t2 = hmsToSec(r1.time3);
    var stops = route.stops, N = stops.length, A = route.anchors, cum = stops.map(function (s) { return s[4]; });
    var T = [];    // 정류장 i 의 표준 통과 시각(초) — 앱의 계산과 같은 방식(앵커 사이를 누적 구간소요시간 비율로)
    for (var i = 0; i < N; i++) {
      if (i <= A[1]) T.push(t0 + (t1 - t0) * (cum[i] - cum[A[0]]) / (cum[A[1]] - cum[A[0]]));
      else T.push(t1 + (t2 - t1) * (cum[i] - cum[A[1]]) / (cum[A[2]] - cum[A[1]]));
    }
    // 시작 정류장: 이후 5분 안에 정류장을 가장 여러 곳 지나는 곳(첫 정류장 제외)
    var k = 1, best = -1;
    for (var s = 1; s < N - 6; s++) { var c = 0; for (var j = s + 1; j < N && T[j] - T[s] <= 300; j++) c++; if (c >= 4) { k = s; best = c; break; } if (c > best) { best = c; k = s; } }
    // 가상 버스는 시작부터 45초 늦고, 정류장마다 18초씩 더 늦어진다(오차시간이 눈에 보이게)
    var P = T.map(function (t, i) { return i <= k ? t + (i === k ? 45 : 0) : t + 45 + (i - k) * 18; });
    // 경로 점: 길 모양(data/map)을 따라 정류장 사이를 거리 비율로
    var segs = mapJ.segs || [], pts = [], dayStart = new RealDate(); dayStart.setHours(0, 0, 0, 0);
    var d0 = dayStart.getTime();
    for (var i2 = k; i2 < N - 1; i2++) {
      var poly = (segs[i2] && segs[i2].length > 1 && segs.length === N - 1) ? segs[i2] : [[stops[i2][2], stops[i2][3]], [stops[i2 + 1][2], stops[i2 + 1][3]]];
      var L = [0]; for (var q = 1; q < poly.length; q++) L.push(L[q - 1] + distM2(poly[q - 1], poly[q]));
      var tot = L[L.length - 1] || 1, ta = P[i2], tb = P[i2 + 1];
      for (var q2 = (i2 === k ? 0 : 1); q2 < poly.length; q2++) pts.push([Math.round(d0 + (ta + (tb - ta) * (L[q2] / tot)) * 1000), +poly[q2][0].toFixed(6), +poly[q2][1].toFixed(6)]);
    }
    return { pts: pts, t0Ms: d0 + t0 * 1000, startMs: d0 + P[k] * 1000, startStop: stops[k][1] };
  }

  var starting = false;
  async function start(openLive) {
    if (starting) return; starting = true;
    try {
      var r = await buildPath();
      ssSet(SS_PATH, JSON.stringify(r.pts));
      var nowMs = RealDate.now();
      ssSet(SS, JSON.stringify({ on: true, base: r.startMs, t0: r.t0Ms, E: nowMs, opened: 0, rate: BASE_RATE, today: dayStr(nowMs), openLive: !!openLive }));
      location.reload();
    } catch (e) {
      starting = false;
      alert('테스트 운행을 준비하지 못했습니다. (' + (e && e.message || e) + ')');
    }
  }
  function stop() { ssDel(SS); ssDel(SS_PATH); location.reload(); }
  window.ybTestDrive = { start: start, stop: stop, isOn: function () { return on; } };

  // ---------- 화면: 테스트 계정에게만 [테스트하기] 버튼, 켜져 있으면 표시줄 ----------
  var TEST_USERS = ['강영걸'];   // 테스트 버튼이 보이는 계정(실제 운행을 안 하는 시연용 계정)
  function isAdminName() {
    var nm = '';
    try { var u = JSON.parse(window.localStorage.getItem('yeongjong_logged_user') || 'null'); if (u && u.name) nm = u.name; } catch (e) { }
    if (!nm) { try { nm = window.localStorage.getItem('loggedInUser') || ''; } catch (e) { } }
    return TEST_USERS.some(function (n) { return String(nm).indexOf(n) !== -1; });
  }

  // ---------- 라이브 모달을 처음 열 때 운행 시작, 껐다 다시 열면 처음(30초 카운트)부터 ----------
  function installRestart() {
    if (!on || typeof window.openLiveModal !== 'function') return;
    var origOpen = window.openLiveModal, inMap = false;
    function markOpened() { state.opened = RealDate.now(); ssSet(SS, JSON.stringify(state)); }
    window.openLiveModal = function () {
      if (!state.opened) { markOpened(); return origOpen.apply(this, arguments); }
      if (inMap) return origOpen.apply(this, arguments);   // 노선지도가 밑에 켜 두는 경우는 그대로 이어서
      state.E = RealDate.now(); state.opened = 0; state.openLive = true; ssSet(SS, JSON.stringify(state));
      location.reload();
    };
    if (typeof window.openRouteMap === 'function') {
      var origMap = window.openRouteMap;
      window.openRouteMap = function () {
        inMap = true;
        try { if (!state.opened) markOpened(); return origMap.apply(this, arguments); } finally { inMap = false; }
      };
    }
  }
  function ui() {
    installRestart();
    var btns = [];
    function mk(anchor, after) {
      if (!anchor || !anchor.parentNode) return;
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'ybTestBtn';
      btn.textContent = on ? '🧪 테스트 끝내기' : '🧪 테스트하기';
      btn.style.cssText = 'display:none;width:' + (after ? '92%' : '52%') + ';min-width:150px;height:' + (after ? '72px' : '44px') + ';margin:' + (after ? '20px auto 0' : '0 auto 8px') + ';border:none;border-radius:14px;font-weight:900;font-size:' + (after ? '30px' : '15px') + ';white-space:nowrap;cursor:pointer;background:' + (on ? '#475569;color:#fff' : '#fde047;color:#1f2937');
      btn.addEventListener('click', function () { if (on) stop(); else { btn.disabled = true; btn.textContent = '준비 중...'; start(!after).then(function () { }); } });
      anchor.parentNode.insertBefore(btn, after ? anchor.nextSibling : anchor);
      var wrap = anchor.parentNode;
      if (wrap && getComputedStyle(wrap).display === 'flex' && getComputedStyle(wrap).flexDirection === 'column') btn.style.alignSelf = 'center';
      btns.push(btn);
    }
    mk(document.querySelector('.yb2-btns'), true);        // 메인 메뉴 아래
    if (!btns.length) return;
    function sync() { var v = isAdminName() ? 'block' : 'none'; btns.forEach(function (x) { x.style.display = v; }); }
    setInterval(sync, 1500); sync();
    // 테스트가 막 켜져 다시 불러온 직후라면 라이브 모달을 자동으로 연다
    if (on && state.openLive) {
      state.openLive = false; ssSet(SS, JSON.stringify(state));
      var tries = 0, iv = setInterval(function () {
        tries++;
        if (typeof window.openLiveModal === 'function' && window.currentDriver) { clearInterval(iv); setTimeout(function () { try { window.openLiveModal(); } catch (e) { } }, 1200); }
        else if (tries > 40) clearInterval(iv);
      }, 500);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui); else ui();
})();
