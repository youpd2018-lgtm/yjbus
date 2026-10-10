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
      i.style.cssText = 'color:' + ic[1] + ';font-size:1.2em;vertical-align:-0.2em;margin-left:6px;';
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
    var label = txt('liveCardStatus');
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

  function init() {
    if (!window.ybLv2On && !document.documentElement.classList.contains('lv2')) return;
    var gps = $('gpsAdminTrigger'), slot = $('yb3GpsSlot');
    if (gps && slot && gps.parentNode !== slot) slot.appendChild(gps);
    if (slot && !$('yb3Speed')) {   // GPS 버튼 아래 속도: 숫자는 거점 시간 크기, km 는 아주 작게
      var sp = document.createElement('div'); sp.id = 'yb3Speed'; sp.innerHTML = '<b>--</b><small>km</small>'; slot.appendChild(sp);
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

    syncTop(); syncMain(); syncSeq(); syncStops(); syncPill();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.ybLv2Refresh = function () { syncTop(); syncMain(); syncSeq(); syncStops(); syncPill(); };
})();
