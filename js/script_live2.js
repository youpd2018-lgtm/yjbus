// 🆕 라이브 모달 "콕핏" (lv2) — html.lv2 일 때만 동작. 스위치는 js/live2_flag.js
// 방식: 기존 요소(숨겨 둠)에 기존 JS 가 그대로 값을 쓰고, 여기서는 그 값을 새 yb3-* 요소로 복사만 한다.
// 값이 바뀔 때만 반응(MutationObserver)하므로 배터리/속도 부담이 거의 없다.
(function () {
  'use strict';
  var RING_LEN = 2 * Math.PI * 136; // 게이지 원 둘레
  var $ = function (id) { return document.getElementById(id); };
  var modalBox = null;

  function txt(id) { var e = $(id); return e ? (e.textContent || '').trim() : ''; }
  function setText(el, v) { if (el && el.textContent !== v) el.textContent = v; }
  function hmsToSec(s) {
    var m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((s || '').trim());
    if (!m) return null;
    return (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0));
  }

  // 날씨 글자 → Iconify 의 Lucide(ISC 무료 오픈소스) 선(속이 빈) 아이콘 + 어울리는 색
  var WX_ICON = {
    '맑음': ['lucide:sun', '#FBBF24'], '구름조금': ['lucide:cloud-sun', '#FCD34D'], '흐림': ['lucide:cloud', '#CBD5E1'],
    '안개': ['lucide:cloud-fog', '#CBD5E1'], '비': ['lucide:cloud-rain', '#7DD3FC'], '눈': ['lucide:cloud-snow', '#E0F2FE'], '뇌우': ['lucide:cloud-lightning', '#FDE68A']
  };
  function syncTop() {
    var el = $('yb3Weather'); if (!el) return;
    var t = txt('weatherTempDisplay'), st = txt('weatherStatusDisplay');
    var ic = WX_ICON[st];
    var key = (t || '--℃') + '|' + st;
    if (el.getAttribute('data-k') === key) return;
    el.setAttribute('data-k', key);
    el.textContent = '영종도 ' + (t || '--℃') + (!ic && st && st !== '조회 중' ? ' (' + st + ')' : '');
    if (ic) {
      var i = document.createElement('iconify-icon');
      i.setAttribute('icon', ic[0]);
      i.style.cssText = 'color:' + ic[1] + ';font-size:34px;vertical-align:-0.2em;margin-left:6px;';
      el.appendChild(i);
    }
  }

  function syncSpeed() {
    var b = $('yb3Speed'); if (!b || !b.firstChild) return;
    var g = window.lastGpsPosition, v = '--';
    if (window.simState && window.simState.active) v = String(Math.round(window.curBusSpeed || 0));
    else if (g && g.time && Date.now() - new Date(g.time).getTime() < 15000 && typeof g.speedKmh === 'number') v = String(Math.max(0, Math.round(g.speedKmh)));
    setText(b.firstChild, v);
  }

  function syncMain() {
    var label = txt('liveCardStatus').replace(/\d+\s*순번\s*/, ''); // 순번은 숨기고 회차만 표시
    setText($('yb3Label'), label);
    var tl = txt('liveCardTimeLeft');
    setText($('yb3Time'), tl || '-'); // 시:분:초 전체 표시

    // 오차: 숫자만
    var d = txt('bisDelayBadge');
    setText($('yb3Delay'), d || '0');
    var n = parseInt(d.replace('+', ''), 10);
    var a = isNaN(n) ? 0 : Math.abs(n);
    var cls = a <= 5 ? 'yb3-ok' : (a <= 10 ? 'yb3-late' : 'yb3-vlate');
    if (modalBox) {
      ['yb3-ok', 'yb3-late', 'yb3-vlate'].forEach(function (c) { modalBox.classList.toggle(c, c === cls); });
    }
    syncRing();
  }

  // 색 링: 이전 거점 시간 → 다음 거점 시간 동안 남은 시간 비율만큼만 색이 남고, 시간이 갈수록 빠짐
  function syncRing() {
    var fill = $('yb3Fill'); if (!fill) return;
    var left = hmsToSec(txt('liveCardTimeLeft'));
    var f = 1;   // 첫 거점 전·계산 불가: 가득
    var list = window.todayStopSeq, ni = window.todayStopNext;
    if (left !== null && list && typeof ni === 'number' && ni > 0 && list[ni] && list[ni - 1]) {
      var a = hmsToSec(list[ni - 1].time), b = hmsToSec(list[ni].time);
      if (a !== null && b !== null) {
        var total = b - a; if (total < 0) total += 86400;
        if (total > 0) f = Math.max(0, Math.min(1, left / total));
      }
    }
    fill.setAttribute('stroke-dasharray', (f * RING_LEN).toFixed(1) + ' 1000');
  }

  var lastSeqKey = '';
  var SEQ_COLOR = { yellow: '#fbbf24', red: '#ef4444', important: '#ef4444', blue: '#38bdf8' };   // 근무표 시간 색(노랑·빨강·파랑)을 그대로 표시
  function syncSeq() {
    var seq = $('yb3Seq');
    var list = window.todayStopSeq, ni = window.todayStopNext;
    if (list && list.length && typeof ni === 'number' && ni >= 0) {
      // 오늘 내 근무 전체를 쭉 이어서: 가운데 = 다음 거점, 왼쪽 = 방금 지난 거점, 오른쪽 = 그 다음 거점 (거점을 지나면 왼쪽으로 한 칸 밀림)
      var pick = [list[ni - 1], list[ni], list[ni + 1]];
      for (var k = 0; k < 3; k++) {
        var node = $('yb3N' + (k + 1)); if (!node) continue;
        var it = pick[k];
        setText(node.children[0], it ? it.name : '');
        setText(node.children[1], it ? it.time : '');
        node.style.visibility = it ? '' : 'hidden';
        if (node.children[1]) node.children[1].style.color = (it && SEQ_COLOR[it.color]) || '';
        node.classList.toggle('on', k === 1);
      }
      if (seq) {
        seq.setAttribute('data-a', '2');
        var key = list[ni].key;
        if (lastSeqKey && lastSeqKey !== key) { seq.classList.remove('yb3-slide'); void seq.offsetWidth; seq.classList.add('yb3-slide'); }
        lastSeqKey = key;
      }
      return;
    }
    var active = 0;
    for (var i = 1; i <= 3; i++) {
      var node2 = $('yb3N' + i); if (!node2) continue;
      node2.style.visibility = '';
      setText(node2.children[0], txt('seqPoint' + i + 'Loc'));
      setText(node2.children[1], txt('seqPoint' + i + 'Time'));
      var te = $('seqPoint' + i + 'Time'), tc = te && te.style.color;
      if (node2.children[1]) node2.children[1].style.color = (tc && tc !== 'rgb(255, 255, 255)' && tc !== '#fff') ? tc : '';
      var box = $('seqBoxContainer' + i);
      var on = !!(box && box.classList.contains('active-target'));
      node2.classList.toggle('on', on);
      if (on && !active) active = i;
    }
    if (seq) seq.setAttribute('data-a', String(active || 1));
  }

  // 표준시간: 시:분은 크게, 초는 작게
  function setHms(el, v) {
    if (!el) return;
    v = v || '--:--:--';
    var key = el.getAttribute('data-v');
    if (key === v) return;
    el.setAttribute('data-v', v);
    var m = /^(\d{1,2}:\d{2})(:\d{2})$/.exec(v);
    el.textContent = '';
    if (!m) { el.textContent = v; return; }
    el.appendChild(document.createTextNode(m[1]));
    var sm = document.createElement('small'); sm.textContent = m[2]; el.appendChild(sm);
  }

  function syncStops() {
    setHms($('yb3StCur'), txt('trafficStopTimeNext'));
    setText($('yb3SnCur'), txt('trafficStopNameNext'));
    setHms($('yb3StNext'), txt('trafficStopTimeAfter'));
    setText($('yb3SnNext'), txt('trafficStopNameAfter'));
    syncRing();
  }

  function syncPill() {
    var flow = document.querySelector('#liveTrafficStopBox .tf-flow');
    var s = flow ? (flow.getAttribute('data-s') || 'ok') : 'ok';
    var p = $('yb3Pill');
    if (p) p.setAttribute('data-s', s);
    setText($('yb3PillText'), txt('trafficFlowStatusText') || '소통원활');
  }

  function watch(el, fn, attrs) {
    if (!el) return;
    var o = new MutationObserver(fn);
    var cfg = { childList: true, characterData: true, subtree: true };
    if (attrs) { cfg.attributes = true; cfg.attributeFilter = attrs; }
    o.observe(el, cfg);
  }

  // ---- 앞차·뒷차 출발 간격: 같은 노선·대수의 다른 순번 시간표에서, 내 지금 회차와 같은 출발지의 출발 시각을 비교 ----
  var gapKey = '';
  function toMin(t) { var m = String(t || '').match(/^(\d+):(\d+)/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function depOf(r) {   // 회차의 출발 = 시간이 있는 첫 칸(출발→기점→도착 순)과 그 칸의 장소
    for (var i = 1; i <= 3; i++) { var m = toMin(r['time' + i]); if (m !== null) return { t: m, place: (r.places || [])[i - 1] || '', s: String(r['time' + i]) }; }
    return null;
  }
  // 그 순번의 그 회차를 오전/오후 중 누가 운전하는지: 교대(노란색) 회차까지가 오전, 그 뒤가 오후 (기존 근무 계산과 같은 규칙)
  function driverName(route, seqNum, roundIdx, rounds, date) {
    try {
      var yi = -1;
      for (var i = 0; i < rounds.length && yi < 0; i++) for (var c = 1; c <= 3; c++) if (rounds[i]['c' + c] === 'yellow') { yi = i; break; }
      var cut = yi !== -1 ? yi : Math.min(2, rounds.length - 1);
      var part = roundIdx <= cut ? '오전' : '오후';
      var rows = (JSON.parse(localStorage.getItem('yb_daily_roster') || 'null') || {}).rows || [];
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j];   // [날짜, 이름, 근무형태, 노선, 차량, 순번, 근무시간]
        if (r[0] === date && r[3] === route && r[5] === seqNum + '순번' && r[6] === part) return r[1];
      }
    } catch (e) { }
    return '';
  }
  function syncGap() {
    var box = $('yb3Gap'); if (!box) return;
    var hide = function () { if (!box.hidden) box.hidden = true; gapKey = ''; };
    try {
      var inp = $('searchDate'); if (!inp || !inp.value || typeof getDriverKey !== 'function' || typeof window.ytTimetableRounds !== 'function') return hide();
      var sv = localStorage.getItem(getDriverKey('sched_' + inp.value)); if (!sv) return hide();
      var sd = JSON.parse(sv);
      if (!sd || !sd.route || !sd.seq || sd.workType === '휴무' || sd.workType === '미등록') return hide();
      var trip = (typeof window.ybCurrentTrip === 'function' && window.ybCurrentTrip()) || 0;
      var mm = String(window.currentTripRoundNumber || '').match(/(\d+)\s*회차/); if (mm) trip = +mm[1];
      if (!trip) return hide();
      var rosterAt = 0; try { rosterAt = (JSON.parse(localStorage.getItem('yb_daily_roster') || 'null') || {}).fetchedAt || 0; } catch (e) { }
      var key = [inp.value, sd.route, sd.seq, trip, rosterAt, trip === 1 ? 'b' : 'd'].join('|');
      if (key === gapKey) return;
      var mine = (window.ytTimetableRounds(sd.route, sd.seq) || [])[trip - 1];
      var md = mine && depOf(mine); if (!md) return hide();
      // 1회차만: 출발지(차고지 등)가 서로 달라도(예: 11순번 1회차는 서희스타옆문 출발) 기점(time2) 통과 시각으로 앞·뒷차를 본다
      var base1 = false;
      if (toMin(mine.time2) !== null && (mine.places || [])[1] && trip === 1) { md = { t: toMin(mine.time2), place: mine.places[1] }; base1 = true; }
      var mySeq = String(sd.seq).replace(/\D/g, ''), n = typeof window.ytTimetableSeqCount === 'function' ? window.ytTimetableSeqCount(sd.route) : 0;
      var front = null, back = null;
      for (var k = 1; k <= n; k++) {
        if (String(k) === mySeq) continue;
        var rounds = window.ytTimetableRounds(sd.route, k) || [];
        rounds.forEach(function (r, ri) {
          var d = depOf(r);
          if (base1) { d = (toMin(r.time2) !== null) ? { t: toMin(r.time2), place: (r.places || [])[1] || '' } : null; }
          if (!d || d.place !== md.place) return;
          var who = { t: d.t, seq: k, ri: ri, rounds: rounds };
          if (d.t <= md.t) { if (!front || d.t > front.t) front = who; }
          else if (!back || d.t < back.t) back = who;
        });
      }
      if (!front && !back) return hide();
      gapKey = key;
      var show = function (o, valId, nmId, diff) {
        if (!o) { setText($(valId), '-'); setText($(nmId), ''); return; }
        setText($(valId), diff(o.t) + '분');
        setText($(nmId), driverName(sd.route, o.seq, o.ri, o.rounds, inp.value) || (o.seq + '순번'));
      };
      show(front, 'yb3GapFront', 'yb3GapFrontNm', function (t) { return md.t - t; });
      show(back, 'yb3GapBack', 'yb3GapBackNm', function (t) { return t - md.t; });
      box.hidden = false;
    } catch (e) { }
  }

  // ---- 단속카메라 전방 알림: 평소엔 배차간격 박스가 보이다가, 카메라 앞에서만 그 박스를 덮고 메시지·소리가 나옴 ----
  function todayRoute() {   // 오늘 내 근무 노선 번호 (노선지도 버튼과 같은 방식: '202평일16대' → '202', '203A' → '203A')
    try {
      var name = typeof getLoggedInDriverName === 'function' ? getLoggedInDriverName() : (window.currentDriver || localStorage.getItem('loggedInUser'));
      var d = new Date(), today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var sd = JSON.parse(localStorage.getItem('jpil_user_' + name + '_sched_' + today) || 'null');
      if (!sd || !sd.route || sd.route === '-' || sd.workType === '휴무' || sd.workType === '미등록') return '';
      var m = String(sd.route).match(/(\d{3})\s*([Aa]?)/);
      return m ? m[1] + m[2].toUpperCase() : '';
    } catch (e) { return ''; }
  }
  function coverGap(el) {   // 배차간격 박스 위치·크기 그대로 그 위에 덮음 (배차간격 박스가 없으면 제자리)
    var gap = $('yb3Gap');
    if (el.classList.contains('on') && gap && !gap.hidden && gap.offsetWidth > 0) {
      el.style.cssText = 'position:absolute;margin:0;z-index:6;left:' + gap.offsetLeft + 'px;top:' + gap.offsetTop + 'px;width:' + gap.offsetWidth + 'px;height:' + gap.offsetHeight + 'px;border-radius:16px;padding:0 14px;overflow:hidden';
    } else el.style.cssText = 'margin-top:8px';
  }
  function syncCamera() {
    var el = $('ybCamAlert'); if (!el || !window.YbCamera) return;
    var g = window.lastGpsPosition, pos = null;
    if (g && g.time && Date.now() - new Date(g.time).getTime() < 15000) pos = { lat: g.lat, lon: g.lon, speed: typeof g.speedKmh === 'number' ? g.speedKmh : null, heading: g.heading };
    window.YbCamera.update(pos, todayRoute(), el);
    coverGap(el);
  }

  function init() {
    if (!window.ybLv2On && !document.documentElement.classList.contains('lv2')) return;
    var gps = $('gpsAdminTrigger'), slot = $('yb3GpsSlot'), gauge = $('yb3Gauge');
    if (gps && slot && gps.parentNode !== slot) slot.appendChild(gps);
    if (slot && !$('yb3Speed')) {   // GPS 버튼 아래 속도: 숫자는 거점 시간 크기, km 는 아주 작게
      var sp = document.createElement('div'); sp.id = 'yb3Speed'; sp.innerHTML = '<b>--</b><small>km</small>'; (gauge || slot).appendChild(sp);   // 원형 게이지 위쪽 빈자리
      setInterval(syncSpeed, 1000); syncSpeed();
    } // GPS 알약(재연결·관리자 길게누르기)을 새 화면으로 옮김
    modalBox = document.querySelector('#liveModal .ios-widget-modal');
    if (modalBox) modalBox.classList.add('yb3-ok');

    ['weatherTempDisplay', 'weatherStatusDisplay', 'bisVehicleNo'].forEach(function (id) { watch($(id), syncTop); });
    ['liveCardStatus', 'liveCardTimeLeft', 'bisDelayBadge'].forEach(function (id) { watch($(id), syncMain); });
    for (var i = 1; i <= 3; i++) {
      watch($('seqPoint' + i + 'Loc'), syncSeq);
      watch($('seqPoint' + i + 'Time'), syncSeq);
      watch($('seqBoxContainer' + i), syncSeq, ['class']);
    }
    ['trafficStopTimeNext', 'trafficStopNameNext', 'trafficStopTimeAfter', 'trafficStopNameAfter'].forEach(function (id) { watch($(id), syncStops); });
    watch($('trafficFlowStatusText'), syncPill);
    var flow = document.querySelector('#liveTrafficStopBox .tf-flow');
    if (flow) watch(flow, syncPill, ['data-s']);

    syncTop(); syncMain(); syncSeq(); syncStops(); syncPill(); syncGap(); setInterval(syncGap, 5000);
    setInterval(syncCamera, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.ybLv2Refresh = function () { syncTop(); syncMain(); syncSeq(); syncStops(); syncPill(); syncGap(); };
})();
