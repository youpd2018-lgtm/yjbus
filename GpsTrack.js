// ================================================================
// 🛰️ [GPS 주행 기록 저장] GpsTrack.js
// - 라이브 모달을 켜고 운행한 기사님 폰의 GPS 위치를 '노선별'로 모아 'gps_기록' 시트에 저장합니다.
// - 한 줄 = 한 번 업로드(노선 + 위치 목록). 위치 목록 형식: "위도,경도,초;위도,경도,초;..." (초 = 그날 0시부터의 초)
// - 나중에 이 기록을 겹쳐 노선별 실제 버스 길을 만들어 길안내에 씁니다.
// - 앱에서 doPost(action = 'save_gps_track')로 호출합니다. (Code.js의 doPost에 연결되어 있어야 함)
// ================================================================

var GPS_TRACK_SHEET_NAME = 'gps_기록';
var GPS_TRACK_MAX_CHARS = 45000;   // 구글시트 한 칸 글자 수 제한(5만) 안쪽으로

function saveGpsTrack(d) {
  try {
    if (!d || !d.route || !d.points) return { success: false, error: '데이터 누락' };
    var points = String(d.points);
    if (points.length > GPS_TRACK_MAX_CHARS) return { success: false, error: '위치 목록이 너무 큼' };

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var ss = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName(GPS_TRACK_SHEET_NAME);
      if (!sheet) {
        sheet = ss.insertSheet(GPS_TRACK_SHEET_NAME);
        sheet.appendRow(['저장시각', '날짜', '노선', '기사', '점 개수', '위치 목록(위도,경도,초)']);
        sheet.setFrozenRows(1);
      }
      // 글자로 저장 (숫자/날짜로 자동 변환 방지)
      var lastRow = sheet.getLastRow() + 1;
      sheet.getRange(lastRow, 1, 1, 6).setNumberFormat('@');
      sheet.getRange(lastRow, 1, 1, 6).setValues([[
        Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'),
        String(d.date || ''), String(d.route), String(d.driver || ''), String(d.count || ''), points
      ]]);
      return { success: true };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
