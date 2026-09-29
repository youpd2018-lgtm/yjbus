// ================================================================
// 🔔 [FCM 푸시 알림] 권한 요청 · 토큰 발급 · 서버(스프레드시트 DB) 등록
// - 서버 푸시(첫 운행 1시간 전 / 출발 10분 전)를 받기 위한 클라이언트 로직
// - 토큰은 DB 시트에 'fcm_<기사명>_<토큰끝16자>' 키로 저장 (발송 서버가 'fcm_' 접두어로 조회)
// ================================================================
(function () {
  const TOKEN_LS_KEY = 'yeongjong_fcm_token';
  let messaging = null;

  function isPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window &&
           typeof firebase !== 'undefined' && !!window.FIREBASE_CONFIG;
  }

  function getMessaging() {
    if (messaging) return messaging;
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    messaging = firebase.messaging();
    // 앱이 화면에 열려 있을 때 수신한 푸시는 앱 안에서 표시
    messaging.onMessage(function (payload) {
      const n = payload.notification || payload.data || {};
      if (window.Swal) {
        Swal.fire({ toast: true, position: 'top', timer: 6000, showConfirmButton: false,
                    title: n.title || '영종운수', text: n.body || '' });
      }
    });
    return messaging;
  }

  function tokenDbKey(driver, token) {
    return 'fcm_' + String(driver || 'unknown').trim() + '_' + token.slice(-16);
  }

  function saveTokenToServer(token) {
    const driver = window.currentDriver || (function () {
      try { return (JSON.parse(localStorage.getItem('yeongjong_logged_user')) || {}).name; } catch (e) { return null; }
    })();
    if (!driver || typeof google === 'undefined' || !google.script || !google.script.run) return;
    const value = JSON.stringify({ driver: driver, token: token, updatedAt: new Date().toISOString(),
                                   ua: navigator.userAgent.slice(0, 120) });
    google.script.run.withSuccessHandler(function () {}).withFailureHandler(function () {})
      .saveToServer(tokenDbKey(driver, token), value);
  }

  // 알림 권한 요청(사용자 클릭 필요) + 토큰 발급 + 서버 등록
  async function enablePushNotifications() {
    if (!isPushSupported()) {
      alert('이 브라우저는 푸시 알림을 지원하지 않습니다.\n(iPhone은 홈 화면에 추가한 앱에서만 가능합니다.)');
      return null;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('알림 권한이 허용되지 않았습니다.\n브라우저 설정에서 알림을 허용해 주세요.');
      updatePushButton();
      return null;
    }
    return refreshPushToken();
  }

  // 권한이 이미 허용된 경우 토큰을 (재)발급하고 서버에 등록
  async function refreshPushToken() {
    if (!isPushSupported() || Notification.permission !== 'granted') return null;
    try {
      const registration = await navigator.serviceWorker.ready;
      const token = await getMessaging().getToken({
        vapidKey: window.FCM_VAPID_KEY,
        serviceWorkerRegistration: registration
      });
      if (!token) return null;
      try { localStorage.setItem(TOKEN_LS_KEY, token); } catch (e) {}
      saveTokenToServer(token);
      updatePushButton();
      return token;
    } catch (err) {
      console.warn('FCM 토큰 발급 실패:', err);
      return null;
    }
  }

  // 알림 해제: 토큰 삭제 + 서버 등록 정보 비우기
  async function disablePushNotifications() {
    if (!isPushSupported()) return;
    const token = localStorage.getItem(TOKEN_LS_KEY);
    try { await getMessaging().deleteToken(); } catch (e) { console.warn('FCM 토큰 삭제 실패:', e); }
    if (token && window.currentDriver && google.script && google.script.run) {
      google.script.run.withSuccessHandler(function () {}).withFailureHandler(function () {})
        .saveToServer(tokenDbKey(window.currentDriver, token), '');
    }
    try { localStorage.removeItem(TOKEN_LS_KEY); } catch (e) {}
    updatePushButton();
  }

  function updatePushButton() {
    const btn = document.getElementById('pushBtn');
    if (!btn) return;
    const on = 'Notification' in window && Notification.permission === 'granted' && !!localStorage.getItem(TOKEN_LS_KEY);
    btn.style.opacity = on ? '1' : '0.55';
    btn.title = on ? '푸시 알림 켜짐 (눌러서 끄기)' : '푸시 알림 켜기';
  }

  window.togglePushNotifications = function () {
    const on = 'Notification' in window && Notification.permission === 'granted' && !!localStorage.getItem(TOKEN_LS_KEY);
    return on ? disablePushNotifications() : enablePushNotifications();
  };
  window.refreshPushToken = refreshPushToken;

  window.addEventListener('load', function () {
    updatePushButton();
    // 이미 허용된 기기는 조용히 토큰 갱신 (로그인 정보가 준비된 뒤)
    setTimeout(refreshPushToken, 3000);
  });
})();
