// ================================================================
// ⏰ [로컬 알림] 오늘 내 모든 회차(첫 운행 포함) 출발 10분 전에 폰 안에서 알림을 띄운다 (서버 없이)
// - 앱이 켜져 있거나 백그라운드에서 살아 있을 때 동작 (앱 완전 종료 시에는 서버 푸시만 가능)
// - 내 회차 범위는 화면과 같은 규칙: 오전 = 첫 회차 ~ 교대(노란색) 회차, 오후 = 교대 다음 회차 ~ 마지막 회차
// - 알림 권한(설정 > 알림받기)이 허용된 기기에서만 시스템 알림을 띄우고, 앱 화면에는 항상 토스트로도 알린다
// ================================================================
(function () {
  const LEAD_MIN = 10;               // 몇 분 전에 알릴지
  const GRACE_MIN = 2;               // 10분 전 시각부터 이 시간(분) 안에서만 울림 (그 뒤에 앱을 켜면 울리지 않음)
  const CHECK_MS = 15 * 1000;        // 확인 주기
  const WORK_TYPES = ['정상', '대타']; // 알림 대상 근무 형태
  let timerId = null;

  function pad2(n) { return String(n).padStart(2, '0'); }
  function dateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

  // 'HH:MM' (24:10 같은 자정 넘김도 허용) → 오늘 자정 기준 분
  function toMinutes(t) {
    const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  // 오늘 내 근무: 회차별 출발 시각 목록 [{idx, mins, text, place}]
  function getTodayTrips() {
    if (typeof isFamilyUser !== 'undefined' && isFamilyUser) return null; // 가족은 알림 없음
    const driver = window.currentDriver || localStorage.getItem('loggedInUser');
    if (!driver) return null;
    const today = dateStr(new Date());
    let sched = null;
    try { sched = JSON.parse(localStorage.getItem(`jpil_user_${driver}_sched_${today}`) || 'null'); } catch (e) { }
    if (!sched || !sched.route || !sched.seq || sched.route === '-' || sched.seq === '-') return null;
    if (WORK_TYPES.indexOf(String(sched.workType || '').trim()) === -1) return null;
    if (typeof customGetItem !== 'function' || typeof getHeaderArray !== 'function') return null;

    let list, headers;
    try { list = customGetItem(sched.route, sched.seq); headers = getHeaderArray(sched.route, sched.seq) || []; } catch (e) { return null; }
    if (!Array.isArray(list) || list.length === 0) return null;
    const colCount = headers.length || 3;

    // 교대(노란색) 회차 찾기 (화면의 calculateStartAndHandoverTime 과 같은 규칙)
    let yellowIdx = -1;
    for (let i = 0; i < list.length && yellowIdx === -1; i++) {
      for (let c = 1; c <= colCount; c++) { if (list[i]['c' + c] === 'yellow') { yellowIdx = i; break; } }
    }
    if (yellowIdx === -1 && list.length >= 3) yellowIdx = 2;
    const isAm = String(sched.time || '').indexOf('오전') !== -1;
    let from, to;
    if (isAm) { from = 0; to = yellowIdx === -1 ? list.length - 1 : yellowIdx; }
    else { from = yellowIdx === -1 ? 0 : yellowIdx + 1; if (from >= list.length) from = Math.max(yellowIdx, 0); to = list.length - 1; }

    const trips = [];
    for (let i = from; i <= to; i++) {
      for (let c = 1; c <= colCount; c++) {
        const v = list[i]['time' + c];
        if (v && String(v).trim() !== '') {
          const mins = toMinutes(v);
          if (mins !== null) trips.push({ idx: i + 1, mins, text: String(v).trim(), place: headers[c - 1] || '' });
          break;
        }
      }
    }
    return { driver, today, sched, trips };
  }

  async function showSystemNotification(title, body, tag) {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const reg = ('serviceWorker' in navigator) ? await navigator.serviceWorker.ready : null;
        const opt = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: tag || 'local-start-alarm',
                      requireInteraction: true, vibrate: [300, 150, 300], data: { url: './' } };
        if (reg && reg.showNotification) await reg.showNotification(title, opt);
        else new Notification(title, opt);
      }
    } catch (e) { console.warn('로컬 알림 표시 실패:', e); }
  }

  // 🔊 알림음 (앱이 켜져 있을 때 재생). 폰 정책상 첫 터치 때 한 번 '잠금 해제'해 둔다
  const ALARM_SOUND_URL = 'sounds/start_alarm.mp3';
  const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
  let alarmAudio = null;
  function getAlarmAudio() {
    if (!alarmAudio) {
      try { alarmAudio = new Audio(); alarmAudio.preload = 'auto'; alarmAudio.src = ALARM_SOUND_URL; } catch (e) { alarmAudio = null; }
    }
    return alarmAudio;
  }
  // 첫 터치 때 '무음 파일'로 재생 권한만 열어 둔다 (실제 알림음은 절대 재생하지 않음)
  function unlockAlarmAudio() {
    const au = getAlarmAudio();
    if (!au) return;
    try {
      au.src = SILENT_WAV;
      const p = au.play();
      const done = () => { try { au.pause(); au.currentTime = 0; au.src = ALARM_SOUND_URL; au.load(); } catch (e) { } };
      if (p && p.then) p.then(done).catch(() => { try { au.src = ALARM_SOUND_URL; } catch (e) { } }); else done();
    } catch (e) { }
  }
  document.addEventListener('pointerdown', unlockAlarmAudio, { once: true });
  function playAlarmSound() {
    const au = getAlarmAudio();
    if (!au) return;
    try { if (String(au.src).indexOf('start_alarm') === -1) au.src = ALARM_SOUND_URL; au.pause(); au.currentTime = 0; au.muted = false; au.volume = 1; const p = au.play(); if (p && p.catch) p.catch(e => console.warn('알림음 재생 실패:', e)); } catch (e) { }
  }
  function stopAlarmSound() { if (alarmAudio) { try { alarmAudio.pause(); alarmAudio.currentTime = 0; } catch (e) { } } }

  function notify(info, trip) {
    const title = `🚌 ${trip.idx}회차 출발 ${LEAD_MIN}분 전`;
    const body = `${trip.text} 출발` + (trip.place ? ` · ${trip.place}` : '') + ` · ${info.sched.route} ${info.sched.seq}` + (info.sched.busNo && info.sched.busNo !== '-' ? ` · 차량 ${info.sched.busNo}` : '');
    showSystemNotification(title, body, 'local-start-alarm-' + trip.idx);
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) { }
    playAlarmSound();
    showAlarmBanner(title, body);
  }

  // 📢 화면 위 알림 배너 (Swal 등 외부 라이브러리에 의존하지 않아 아이폰에서도 항상 표시)
  let bannerTimer = null;
  function showAlarmBanner(title, body) {
    try {
      let el = document.getElementById('localAlarmBanner');
      if (!el) {
        el = document.createElement('div');
        el.id = 'localAlarmBanner';
        el.style.cssText = 'position:fixed;left:10px;right:10px;top:calc(env(safe-area-inset-top, 0px) + 10px);z-index:2147483000;' +
          'background:#1e293b;color:#fff;border:2px solid #facc15;border-radius:14px;padding:12px 14px;' +
          'box-shadow:0 8px 24px rgba(0,0,0,.45);display:flex;align-items:center;gap:10px;font-family:inherit;';
        el.innerHTML = '<div style="flex:1;min-width:0"><div id="localAlarmBannerTitle" style="font-size:17px;font-weight:900;"></div>' +
          '<div id="localAlarmBannerBody" style="font-size:14px;margin-top:3px;color:#cbd5e1;word-break:keep-all;"></div></div>' +
          '<button type="button" id="localAlarmBannerBtn" style="flex:none;background:#facc15;color:#0f172a;border:none;border-radius:10px;padding:10px 12px;font-size:14px;font-weight:900;">소리 끄기</button>';
        document.body.appendChild(el);
        el.querySelector('#localAlarmBannerBtn').addEventListener('click', hideAlarmBanner);
      }
      el.querySelector('#localAlarmBannerTitle').textContent = title;
      el.querySelector('#localAlarmBannerBody').textContent = body;
      el.style.display = 'flex';
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(hideAlarmBanner, 20000);
    } catch (e) { console.warn('알림 배너 표시 실패:', e); }
  }
  function hideAlarmBanner() {
    clearTimeout(bannerTimer);
    stopAlarmSound();
    const el = document.getElementById('localAlarmBanner');
    if (el) el.style.display = 'none';
  }

  function check() {
    const info = getTodayTrips();
    if (!info || info.trips.length === 0) return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    // 정확히 '출발 10분 전' 시각부터 2분 안에서만 울림 (그 시각이 지난 뒤 앱을 켜면 울리지 않음)
    const due = info.trips.filter(t => nowMin >= t.mins - LEAD_MIN && nowMin < t.mins - LEAD_MIN + GRACE_MIN);
    due.forEach(trip => {
      const doneKey = `yb_local_alarm_${info.today}_${info.driver}_${trip.idx}_${trip.text}`;
      try { if (localStorage.getItem(doneKey)) return; localStorage.setItem(doneKey, String(Date.now())); } catch (e) { }
      notify(info, trip);
    });
    if (due.length) cleanup(info.today);
  }

  // 지난 날짜의 발송 기록 정리
  function cleanup(today) {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        const m = k && k.match(/^yb_local_alarm_(\d{4}-\d{2}-\d{2})_/);
        if (m && m[1] < today) localStorage.removeItem(k);
      }
    } catch (e) { }
  }

  function start() {
    if (timerId) return;
    timerId = setInterval(check, CHECK_MS);
    check();
  }

  window.testLocalStartAlarm = function () { // 점검용: 개발자 도구에서 호출 (오늘 회차 목록을 콘솔에 출력하고 첫 회차로 알림 예시)
    const info = getTodayTrips();
    console.log('오늘 내 회차 출발 목록:', info && info.trips);
    notify(info || { sched: { route: '-', seq: '-' } }, (info && info.trips[0]) || { idx: 1, text: '--:--', place: '' });
  };

  window.addEventListener('load', () => setTimeout(start, 4000));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
})();
