// ================================================================
// 🎬 [시연 모드] demo_mode.js  (주소 끝에 ?demo=1 이 있을 때만 동작, 평소에는 아무 일도 안 함)
// - 시연 페이지(demo.html)가 앱을 폰 모양 틀 안에 띄울 때만 켜진다.
// - 저장소(localStorage)를 이 탭 안의 임시 저장소로 바꿔서 진짜 기사님 정보·로그인에 절대 손대지 않는다.
// - 서버(Apps Script) 요청은 모두 가짜 응답으로 막는다(서버로 안 나감).
// - 가짜 로그인(홍길동)·가짜 근무(202 평일16대 1순번 실제 시간표·정류장)·가짜 시계(5배속)·가짜 GPS(5분 운행)를 만든다.
// ================================================================
(function () {
  var q = location.search || '';
  var on = /[?&]demo=1(&|$)/.test(q);
  var topLevel = (window.top === window);
  try {
    if (on) sessionStorage.setItem('yb_demo', '1');
    else if (topLevel) sessionStorage.removeItem('yb_demo');   // 앱을 그냥 열면(맨 위 창) 시연 모드 해제
  } catch (e) { }
  var active = on;
  try { active = active || sessionStorage.getItem('yb_demo') === '1'; } catch (e) { }
  if (!active) return;

  var RealDate = Date;
  var realNow = function () { return RealDate.now(); };
  var SS_LS = 'yb_demo_ls', SS_CLK = 'yb_demo_clock';
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { } }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) { } }

  // ---------- 1) 가짜 시계 ----------
  // 처음: 오늘 04:30 에서 1배속. 모의주행을 누르면 5번 정류장 통과 시각(05:31경)에서 5배속.
  function todayAt(h, m, s) { var d = new RealDate(realNow()); d.setHours(h, m, s || 0, 0); return d.getTime(); }
  var clk = null;
  try { clk = JSON.parse(ssGet(SS_CLK) || 'null'); } catch (e) { }
  if (!clk) { clk = { base: todayAt(4, 30, 0), ref: realNow(), rate: 1, started: false }; ssSet(SS_CLK, JSON.stringify(clk)); }
  function vnow() { return clk.base + (realNow() - clk.ref) * clk.rate; }
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

  // ---------- 2) 임시 저장소 (이 탭 안에서만 유지) ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var nd = new RealDate(realNow());
  var TODAY = nd.getFullYear() + '-' + pad(nd.getMonth() + 1) + '-' + pad(nd.getDate());
  var store = {};
  try { store = JSON.parse(ssGet(SS_LS) || '{}') || {}; } catch (e) { store = {}; }
  if (!store.loggedInUser) {
    var u = { name: '홍길동', pin: '123456', userType: 'driver', approved: true };
    store.loggedInUser = '홍길동';
    store.autoLoginPin = '123456';
    store.yeongjong_logged_user = JSON.stringify(u);
    store.yeongjong_users_db = JSON.stringify([u]);
    store['jpil_user_홍길동_sched_' + TODAY] = JSON.stringify({ workType: '정상', busNo: '7511', route: '202평일(16대)', seq: '1순번', time: '오전' });
    store['jpil_user_홍길동_schededit_' + TODAY] = '1';   // 근무표 자동 채움이 덮어쓰지 않게 보호
    store.yb_ui3 = '1';
  }
  var saveTimer = null;
  function flush() { ssSet(SS_LS, JSON.stringify(store)); }
  function later() { if (saveTimer) return; saveTimer = setTimeout(function () { saveTimer = null; flush(); }, 300); }
  var fake = {
    getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[String(k)] = String(v); later(); },
    removeItem: function (k) { delete store[String(k)]; later(); },
    clear: function () { store = {}; later(); },
    key: function (i) { return Object.keys(store)[i] || null; }
  };
  var lsProxy = new Proxy(fake, {
    get: function (t, p) { if (p === 'length') return Object.keys(store).length; if (p in t) return t[p]; return Object.prototype.hasOwnProperty.call(store, p) ? store[p] : undefined; },
    set: function (t, p, v) { store[String(p)] = String(v); later(); return true; },
    deleteProperty: function (t, p) { delete store[String(p)]; later(); return true; },
    has: function (t, p) { return p in t || Object.prototype.hasOwnProperty.call(store, p); },
    ownKeys: function () { return Object.keys(store); },
    getOwnPropertyDescriptor: function (t, p) { if (Object.prototype.hasOwnProperty.call(store, p)) return { value: store[p], enumerable: true, configurable: true, writable: true }; return undefined; }
  });
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return lsProxy; } }); } catch (e) { }
  flush();

  // ---------- 3) 노선 데이터(202번 실제 정류장)와 가짜 GPS ----------
  // 정류장 이름·위치·구간소요시간 = 202번 실제 데이터(data/demo/202_stops.json), 길 모양 = data/map/202.json
  // 근무 = 202 평일16대 1순번 실제 시간표(GitHub 시간표). 1회차: T1장기주차장 05:10 → 대우하나 07:05 → 종점 09:12
  var BASE = 66;                         // 기점(대우하나아파트)
  var T_START = [5, 10], T_MID = [7, 5], T_END = [9, 12];
  var DEMO_STOP = 5;                     // 모의주행은 5번 정류장(그린나래지하차도)에서 출발: 이후 정류장이 촘촘해 5분 안에 여러 곳을 지난다
  var mapJson = null, mapLoading = null, stopsData = null;
  function baseUrl() { var p = location.pathname; return p.substring(0, p.lastIndexOf('/') + 1); }
  function loadMap() {
    if (mapJson && stopsData) return Promise.resolve(mapJson);
    if (mapLoading) return mapLoading;
    mapLoading = Promise.all([
      window.fetch(baseUrl() + 'data/map/202.json').then(function (r) { return r.json(); }),
      window.fetch(baseUrl() + 'data/demo/202_stops.json').then(function (r) { return r.json(); })
    ]).then(function (a) { mapJson = a[0]; stopsData = a[1]; return mapJson; });
    return mapLoading;
  }
  // 정류장 i 의 표준 통과 시각(05:10 을 0 으로 한 초): 앵커 사이를 누적 구간소요시간 비율로 배분(앱과 같은 방식)
  function stdSec(i) {
    var cum = stopsData.stops.map(function (s) { return s[4]; });
    var t0 = 0, t1 = (T_MID[0] * 60 + T_MID[1] - (T_START[0] * 60 + T_START[1])) * 60, t2 = (T_END[0] * 60 + T_END[1] - (T_START[0] * 60 + T_START[1])) * 60;
    if (i <= BASE) return t0 + (t1 - t0) * (cum[i] - cum[0]) / (cum[BASE] - cum[0]);
    return t1 + (t2 - t1) * (cum[i] - cum[BASE]) / (cum[cum.length - 1] - cum[BASE]);
  }
  // 가짜 버스는 표준시간보다 조금(8~20초) 늦게 정류장을 지난다
  function tPass(i) { return i === 0 ? 0 : stdSec(i) + 8 + ((i * 5) % 4) * 4; }
  function posAtSec(s) {
    var S = mapJson.draw.stops, SEGS = mapJson.segs, N = S.length;
    if (s <= 0) return S[0];
    var k = 0; while (k < N - 2 && s > tPass(k + 1)) k++;
    var a = tPass(k), b = tPass(k + 1), f = Math.max(0, Math.min(1, (s - a) / (b - a)));
    var seg = SEGS[k] || [S[k], S[k + 1]];
    var idx = f * (seg.length - 1), i0 = Math.floor(idx), i1 = Math.min(seg.length - 1, i0 + 1), r = idx - i0;
    return [seg[i0][0] + (seg[i1][0] - seg[i0][0]) * r, seg[i0][1] + (seg[i1][1] - seg[i0][1]) * r];
  }
  function distM(a, b) { var R = 6371000, d2r = Math.PI / 180, dLat = (b[0] - a[0]) * d2r, dLon = (b[1] - a[1]) * d2r; var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * d2r) * Math.cos(b[0] * d2r) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  var lastPos = null, lastT = 0;
  function currentFix() {
    if (!mapJson || !stopsData) return null;
    var dep = todayAt(T_START[0], T_START[1], 0);
    var t = vnow(), sec = (t - dep) / 1000;
    var p = posAtSec(sec), spd = 0;
    if (lastPos && t > lastT) spd = Math.min(20, distM(lastPos, p) / ((t - lastT) / 1000));
    lastPos = p; lastT = t;
    return { coords: { latitude: p[0], longitude: p[1], accuracy: 8, speed: spd, heading: null, altitude: null, altitudeAccuracy: null }, timestamp: realNow() };
  }
  var watchers = {}, wid = 0;
  var geo = {
    getCurrentPosition: function (ok, err) { loadMap().then(function () { ok(currentFix()); }); },
    watchPosition: function (ok) {
      var id = ++wid;
      loadMap().then(function () {
        if (!(id in watchers) && watchers[id] !== 0) { }
      });
      watchers[id] = setInterval(function () { var f = currentFix(); if (f) { try { ok(f); } catch (e) { console.warn(e); } } }, 1000);
      return id;
    },
    clearWatch: function (id) { if (watchers[id]) { clearInterval(watchers[id]); delete watchers[id]; } }
  };
  try { Object.defineProperty(navigator, 'geolocation', { configurable: true, get: function () { return geo; } }); } catch (e) { }
  loadMap();

  // ---------- 4) 서버(Apps Script) 가짜 응답 ----------
  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  function isGas(url) { return /script\.google\.com|script\.googleusercontent\.com/.test(url || ''); }
  function jsonResp(obj) { return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = (typeof input === 'string') ? input : (input && input.url);
      if (isGas(url)) {
        if (/action=get_route_stops/.test(url)) return loadMap().then(function () { return jsonResp(stopsData); });
        return Promise.resolve(jsonResp({ success: true }));
      }
      return origFetch(input, init);
    };
  }
  if (navigator.sendBeacon) { var ob = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function (u, d) { return isGas(u) ? true : ob(u, d); }; }

  // ---------- 5) 시연 조작 (demo.html 의 버튼이 부른다) ----------
  window.__demo = {
    active: true,
    start: function () {   // 모의주행: 5번 정류장에서 5배속
      var from = stopsData ? todayAt(T_START[0], T_START[1], 0) + tPass(DEMO_STOP) * 1000 : todayAt(5, 31, 0);
      clk = { base: from, ref: realNow(), rate: 5, started: true };
      ssSet(SS_CLK, JSON.stringify(clk)); lastPos = null;
    },
    reset: function () { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } store = {}; ssDel(SS_CLK); ssDel(SS_LS); },
    isStarted: function () { return !!clk.started; },
    virtualTime: function () { return new RealDate(vnow()); }
  };
  console.log('🎬 시연 모드 켜짐 (가짜 로그인·가짜 GPS·가짜 서버)');
})();
