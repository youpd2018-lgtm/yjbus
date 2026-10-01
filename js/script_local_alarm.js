// ================================================================
// ⏰ [로컬 알림] 오늘 운행 시작 10분 전에 폰 안에서 알림을 띄운다 (서버 없이)
// - 앱이 켜져 있거나 백그라운드에서 살아 있을 때 동작 (앱 완전 종료 시에는 서버 푸시만 가능)
// - 시작 시각은 화면의 '시작' 값과 같은 계산(calculateStartAndHandoverTime)을 사용
// - 알림 권한(설정 > 알림받기)이 허용된 기기에서만 시스템 알림을 띄우고, 앱 화면에는 항상 토스트로도 알린다
// ================================================================
(function () {
  const LEAD_MIN = 10;               // 몇 분 전에 알릴지
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

  function getTodayStart() {
    if (typeof isFamilyUser !== 'undefined' && isFamilyUser) return null; // 가족은 알림 없음
    const driver = window.currentDriver || localStorage.getItem('loggedInUser');
    if (!driver) return null;
    const today = dateStr(new Date());
    let sched = null;
    try { sched = JSON.parse(localStorage.getItem(`jpil_user_${driver}_sched_${today}`) || 'null'); } catch (e) { }
    if (!sched || !sched.route || !sched.seq || sched.route === '-' || sched.seq === '-') return null;
    if (WORK_TYPES.indexOf(String(sched.workType || '').trim()) === -1) return null;
    if (typeof calculateStartAndHandoverTime !== 'function') return null;
    let timing;
    try { timing = calculateStartAndHandoverTime(sched.route, sched.seq, sched.time); } catch (e) { return null; }
    const mins = toMinutes(timing && timing.startTime);
    if (mins === null) return null;
    return { driver, today, mins, startText: timing.startTime, sched };
  }

  async function showSystemNotification(title, body) {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const reg = ('serviceWorker' in navigator) ? await navigator.serviceWorker.ready : null;
        const opt = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'local-start-alarm',
                      requireInteraction: true, vibrate: [300, 150, 300], data: { url: './' } };
        if (reg && reg.showNotification) await reg.showNotification(title, opt);
        else new Notification(title, opt);
      }
    } catch (e) { console.warn('로컬 알림 표시 실패:', e); }
  }

  function notify(info) {
    const title = `🚌 운행 시작 ${LEAD_MIN}분 전`;
    const body = `${info.startText} 출발 · ${info.sched.route} ${info.sched.seq}` + (info.sched.busNo && info.sched.busNo !== '-' ? ` · 차량 ${info.sched.busNo}` : '');
    showSystemNotification(title, body);
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) { }
    if (window.Swal) {
      Swal.fire({ toast: true, position: 'top', timer: 8000, showConfirmButton: false, title: title, text: body });
    }
  }

  function check() {
    const info = getTodayStart();
    if (!info) return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    // 시작 10분 전부터 시작 시각 전까지만 (늦게 켠 경우 이미 지난 시간은 알리지 않음)
    if (nowMin < info.mins - LEAD_MIN || nowMin >= info.mins) return;
    const doneKey = `yb_local_alarm_${info.today}_${info.driver}_${info.startText}`;
    try { if (localStorage.getItem(doneKey)) return; localStorage.setItem(doneKey, String(Date.now())); } catch (e) { }
    notify(info);
    cleanup(info.today);
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

  window.testLocalStartAlarm = function () { // 점검용: 개발자 도구에서 호출
    const info = getTodayStart();
    notify(info || { startText: '--:--', sched: { route: '-', seq: '-' } });
  };

  window.addEventListener('load', () => setTimeout(start, 4000));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
})();
