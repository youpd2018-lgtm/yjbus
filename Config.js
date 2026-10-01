// ================================================================
// ⚙️ [시스템 설정 및 상수] Config.js
// ================================================================

// 💡 스프레드시트 ID
const SHEET_ID = '1kczhJRVEJ4r4dEXX_UFPOThMhuW3WDKB1LX97OxGvrA';

// 🔑 공공데이터포털 TAGO / 버스위치정보 서비스 인증키
// 키는 GitHub에 올리지 않는다: Apps Script > 프로젝트 설정 > 스크립트 속성에 BUS_SERVICE_KEY 로 저장
const BUS_SERVICE_KEY = PropertiesService.getScriptProperties().getProperty('BUS_SERVICE_KEY') || '';

// 🤖 Google Gemini AI API 설정
// 키는 GitHub에 올리지 않는다: Apps Script > 프로젝트 설정 > 스크립트 속성에 GEMINI_API_KEY 로 저장
const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
const GEMINI_MODEL = 'gemini-flash-lite-latest';
