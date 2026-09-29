// Firebase 웹 앱 설정 (공개용 값: API 키는 접근 권한이 아닌 프로젝트 식별자입니다.
// 실제 접근 제어는 Firebase 콘솔의 보안 설정과 서버측 발송 키로 이루어집니다.)
// 페이지(window)와 서비스 워커(self) 양쪽에서 공용으로 사용합니다.
(function (g) {
  g.FIREBASE_CONFIG = {
    apiKey: "AIzaSyANllBYwvTRvKQBYh-ARGuvjMshOc2J2cs",
    authDomain: "yjbuspwa.firebaseapp.com",
    projectId: "yjbuspwa",
    storageBucket: "yjbuspwa.firebasestorage.app",
    messagingSenderId: "126238705929",
    appId: "1:126238705929:web:b9035cebd60ad41c2c6bd8"
  };
  g.FCM_VAPID_KEY = "BH0r15wnzhVLPkki7MREC9B4DJqpY7jNFtcnfjRgRLTqiUi3t_-Em3cdSY9q0TZvrgyhpwu6P33H5-n8XeOlnlY";
  g.FIREBASE_SDK_VERSION = "10.14.1";
})(typeof self !== 'undefined' ? self : window);
