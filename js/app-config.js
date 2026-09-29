// ================================================================
// ⚙️ [앱 설정] 배포 주소를 바꿀 때는 이 파일만 수정하세요.
// - GAS_WEB_APP_URL: Google Apps Script 웹 앱 배포 URL (반드시 .../exec 로 끝나는 주소)
// - 수정 후 sw.js 의 CACHE_VERSION 을 올려야 기존 사용자에게 새 주소가 반영됩니다.
// ================================================================
window.APP_CONFIG = {
  GAS_WEB_APP_URL: "https://script.google.com/macros/s/AKfycbxXP88Y84mXUI4T0El4P9tnYhX5UsjAASCR5opbZpUkcZyUWdBnCLuzGUTvrN7FmxPS/exec"
};
window.GAS_WEB_APP_URL = window.APP_CONFIG.GAS_WEB_APP_URL;
