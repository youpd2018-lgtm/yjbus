// ================================================================
// 🗂️ main_new.html 전용 스크립트 (index.html 에는 포함되지 않음)
//  1) 근무표 윗선의 기사명 표시 (본인 진하게 / 교대근무자 흐리게, 오전 → 오후 순)
//  2) 메시지 분리: 응원 한마디 → 메인 위젯 / 돌발·교통 → 라이브모달 위젯
// ================================================================
(function () {
  'use strict';

  // ── 1. 기사명 표시 ──────────────────────────────────────────────
  function ysMyName() {
    try {
      if (typeof isFamilyUser !== 'undefined' && isFamilyUser && typeof targetDriverName !== 'undefined' && targetDriverName) {
        return String(targetDriverName).trim();
      }
    } catch (e) { }
    return typeof getLoggedInDriverName === 'function' ? getLoggedInDriverName() : '';
  }

  function ysIsOff(d) {
    return !d || ['휴무', '휴일', '연차', '공가', '병가', '미등록'].indexOf(d.workType) >= 0;
  }

  // 같은 노선 + 같은 순번(또는 같은 차량)의 다른 기사님 찾기 (오전/오후 맞교대)
  function ysFindPartner(dateStr, myName, myData) {
    if (typeof getUsersList !== 'function') return null;
    var users = [];
    try { users = getUsersList() || []; } catch (e) { }
    var best = null;
    users.forEach(function (u) {
      if (!u || !u.name || u.userType === 'family' || u.name === myName) return;
      var raw = localStorage.getItem('jpil_user_' + u.name + '_sched_' + dateStr);
      if (!raw) return;
      var d;
      try { d = JSON.parse(raw); } catch (e) { return; }
      if (ysIsOff(d)) return;
      var sameSeat = (d.route === myData.route && String(d.seq) === String(myData.seq));
      var sameBus = (myData.busNo && myData.busNo !== '-' && d.busNo === myData.busNo);
      if (!sameSeat && !sameBus) return;
      var otherHalf = (d.time !== myData.time);
      if (!best || (otherHalf && !best.otherHalf)) best = { name: u.name, time: d.time || '', otherHalf: otherHalf };
    });
    return best;
  }

  function ysSetName(el, text, cls) {
    el.textContent = text;
    el.className = 'ys-name ' + cls;
  }

  function updateSheetNames() {
    var first = document.getElementById('ysNameFirst');
    var sep = document.getElementById('ysNameSep');
    var second = document.getElementById('ysNameSecond');
    if (!first || !sep || !second) return;

    var me = ysMyName() || '-';
    var dateEl = document.getElementById('searchDate');
    var dateStr = dateEl ? dateEl.value : '';
    var myData = null;
    try {
      var key = typeof getDriverKey === 'function' ? getDriverKey('sched_' + dateStr) : 'sched_' + dateStr;
      var raw = localStorage.getItem(key);
      if (raw) myData = JSON.parse(raw);
    } catch (e) { }

    var partner = (myData && !ysIsOff(myData)) ? ysFindPartner(dateStr, me, myData) : null;

    if (!partner) {
      ysSetName(first, me, 'is-me');
      sep.style.display = 'none';
      second.style.display = 'none';
      return;
    }

    // 왼쪽 = 오전 근무자, 오른쪽 = 오후 근무자 (종이 근무표와 같은 순서)
    var iAmPm = String(myData.time || '').indexOf('오후') >= 0;
    var mine = { text: me, cls: 'is-me' };
    var mate = { text: partner.name, cls: 'is-mate' };
    var pair = iAmPm ? [mate, mine] : [mine, mate];
    ysSetName(first, pair[0].text, pair[0].cls);
    ysSetName(second, pair[1].text, pair[1].cls);
    sep.style.display = '';
    second.style.display = '';
  }
  window.updateSheetNames = updateSheetNames;

  // searchSchedule 이 끝날 때마다 기사명 갱신
  if (typeof window.searchSchedule === 'function') {
    var origSearch = window.searchSchedule;
    window.searchSchedule = function () {
      var r = origSearch.apply(this, arguments);
      try { updateSheetNames(); } catch (e) { console.warn('기사명 표시 오류:', e); }
      return r;
    };
  }

  // ── 2. 메시지 분리 (응원 한마디 ↔ 돌발/교통) ─────────────────────
  var ALERT_RE = /^🚨|\[돌발\]|\[사고\]|\[공사\]|\[통제\]/;
  var DEFAULT_CHEER = '안전운행 하시고 오늘도 좋은 하루 되세요! [영종운수]';
  var cheerList = [];
  var cheerIdx = 0;
  var alertIdx = 0;
  var rotateTimer = null;

  function isAlert(m) { return ALERT_RE.test(String(m || '')); }

  function fadeSet(el, html) {
    if (!el || el.getAttribute('data-last') === html) return;
    el.setAttribute('data-last', html);
    el.classList.add('fade-out');
    setTimeout(function () {
      el.innerHTML = html;
      el.classList.remove('fade-out');
      el.classList.add('fade-in');
      void el.offsetWidth;
      el.classList.remove('fade-in');
    }, 420);
  }

  function alertHtml(msg) {
    return typeof _formatAlert === 'function' ? _formatAlert(msg) : msg;
  }

  var NO_ALERT_HTML =
    '<span style="display:inline-flex;align-items:center;gap:6px;color:#94a3b8;font-size:14.5px;font-weight:600;">' +
    '<iconify-icon icon="solar:shield-check-bold" style="font-size:18px;color:#4ade80;"></iconify-icon>' +
    '돌발정보 · 교통 특이사항 없음</span>';

  function currentAlerts() {
    if (typeof _cleanExpiredTraffic === 'function') _cleanExpiredTraffic();
    return (window.liveTrafficAlerts || []).filter(isAlert);
  }

  function paint() {
    // 메인: 응원 한마디만
    var cheers = cheerList.length ? cheerList : [DEFAULT_CHEER];
    var cMsg = cheers[cheerIdx % cheers.length];
    fadeSet(document.getElementById('mainCheerMessage'),
      typeof formatMessageDisplay === 'function' ? formatMessageDisplay(cMsg) : cMsg);

    // 라이브모달: 돌발/교통만
    var alerts = currentAlerts();
    var aHtml = alerts.length ? alertHtml(alerts[alertIdx % alerts.length]) : NO_ALERT_HTML;
    fadeSet(document.getElementById('liveColleagueMessage'), aHtml);
  }

  function startRotation() {
    if (rotateTimer) clearInterval(rotateTimer);
    rotateTimer = setInterval(function () {
      cheerIdx++;
      alertIdx++;
      paint();
    }, 5000);
  }

  // 기존 renderMessages 를 대체 (loadLatestColleagueMessage / 돌발 수신 모듈이 그대로 호출함)
  window.renderMessages = function (msgsArray) {
    var all = Array.isArray(msgsArray) ? msgsArray : [];
    cheerList = all.filter(function (m) {
      var s = String(m || '').trim();
      return s && s !== '__LOADING_INDICATOR__' && !isAlert(s);
    });
    cheerIdx = 0;

    // 새 돌발 속보 도착 시 알림음 1회 (기존과 동일한 띵-동)
    var q = window._priorityQueue || [];
    if (q.length) {
      var last = q[q.length - 1].text;
      if (last && last !== window.lastPlayedAlertText) {
        window.lastPlayedAlertText = last;
        if (typeof playChimeDingDong === 'function') playChimeDingDong();
      }
      window._priorityQueue = [];
      alertIdx = 0;
    }

    paint();
    startRotation();
  };

  // 메인 화면이 뜨자마자 한마디를 불러오고, 5분마다 갱신
  function initCheer() {
    if (typeof loadLatestColleagueMessage === 'function') loadLatestColleagueMessage();
  }
  window.addEventListener('load', function () {
    setTimeout(initCheer, 800);
    setTimeout(updateSheetNames, 1200);
    setInterval(initCheer, 5 * 60 * 1000);
  });
})();
