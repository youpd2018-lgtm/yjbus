// ================================================================
// 🛰️ [GPS 주행 기록 저장] GpsTrack.js
// - 라이브 모달을 켜고 운행한 기사님 폰의 GPS 위치를 '노선별'로 모아 'gps_기록' 시트에 저장합니다.
// - 한 줄 = 한 번 업로드(노선 + 위치 목록). 위치 목록 형식: "위도,경도,초;위도,경도,초;..." (초 = 그날 0시부터의 초)
// - 나중에 이 기록을 겹쳐 노선별 실제 버스 길을 만들어 길안내에 씁니다.
// - 앱에서 doPost(action = 'save_gps_track')로 호출합니다. (Code.js의 doPost에 연결되어 있어야 함)
// ================================================================

var GPS_TRACK_SHEET_NAME = 'gps_기록';
var GPS_TRACK_ADMIN = '유재필';      // 관리자만 기록 가능
var GPS_TRACK_MAX_PER_ROUTE = 5;     // 한 노선당 최대 기록 횟수
var GPS_TRACK_MAX_CHARS = 45000;   // 구글시트 한 칸 글자 수 제한(5만) 안쪽으로

// 노선별로 지금까지 몇 번 기록됐는지 센다
function countGpsTracks_(sheet, route) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var routes = sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).getValues();
  var n = 0;
  for (var i = 0; i < routes.length; i++) { if (String(routes[i][0]) === String(route)) n++; }
  return n;
}

// 앱이 기록을 시작하기 전에 '이 노선 더 받나요?'를 묻는 곳
function gpsTrackStatus(d) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(GPS_TRACK_SHEET_NAME);
  var n = countGpsTracks_(sheet, d && d.route);
  return { success: true, count: n, max: GPS_TRACK_MAX_PER_ROUTE, full: n >= GPS_TRACK_MAX_PER_ROUTE };
}

function saveGpsTrack(d) {
  try {
    if (!d || !d.route || !d.points) return { success: false, error: '데이터 누락' };
    if (String(d.driver || '') !== GPS_TRACK_ADMIN) return { success: false, error: '관리자만 기록할 수 있어요' };
    var points = String(d.points);
    if (points.length > GPS_TRACK_MAX_CHARS) return { success: false, error: '위치 목록이 너무 큼' };

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var ss = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName(GPS_TRACK_SHEET_NAME);
      if (!sheet) {
        sheet = ss.insertSheet(GPS_TRACK_SHEET_NAME);
        sheet.appendRow(['저장시각', '날짜', '노선', '기사', '점 개수', '위치 목록(위도,경도,초)', '표시점(출발지;기점;도착지)']);
        sheet.setFrozenRows(1);
      }
      var cnt = countGpsTracks_(sheet, d.route);
      if (cnt >= GPS_TRACK_MAX_PER_ROUTE) return { success: false, full: true, count: cnt };
      sheet.getRange(1, 7).setValue('표시점(출발지;기점;도착지)');
      // 글자로 저장 (숫자/날짜로 자동 변환 방지)
      var lastRow = sheet.getLastRow() + 1;
      sheet.getRange(lastRow, 1, 1, 7).setNumberFormat('@');
      sheet.getRange(lastRow, 1, 1, 7).setValues([[
        Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'),
        String(d.date || ''), String(d.route), String(d.driver || ''), String(d.count || ''), points, String(d.marks || '')
      ]]);
      return { success: true };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
