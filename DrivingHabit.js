// ================================================================
// 🚌 [운행 습관 저장] DrivingHabit.js
// - 앱이 보낸 '그날의 급출발·급정거·과속·급회전 횟수'를 '운행습관' 시트에 저장합니다.
// - 기사 + 날짜가 같은 줄이 있으면 그 줄을 덮어쓰고(하루 합계), 없으면 새 줄을 추가합니다.
// - 앱에서 doPost(action = 'save_driving_habit')로 호출합니다. (Code.js의 doPost에 연결되어 있어야 함)
// ================================================================

var DRIVING_HABIT_SHEET_NAME = '운행습관';

function saveDrivingHabit(d) {
  try {
    if (!d || !d.date || !d.driver) return { success: false, error: '데이터 누락' };
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var ss = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName(DRIVING_HABIT_SHEET_NAME);
      if (!sheet) {
        sheet = ss.insertSheet(DRIVING_HABIT_SHEET_NAME);
        sheet.appendRow(['날짜', '기사', '급출발', '급정거', '과속', '급회전', '저장시각']);
        sheet.setFrozenRows(1);
        sheet.getRange(2, 1, 1000, 2).setNumberFormat('@');   // 날짜·기사는 글자로 (자동 변환 방지)
      }
      var date = String(d.date), driver = String(d.driver);
      var row = [date, driver, Number(d.start) || 0, Number(d.stop) || 0, Number(d.speed) || 0, Number(d.turn) || 0,
        Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss')];

      var last = sheet.getLastRow();
      var target = -1;
      if (last >= 2) {
        var keys = sheet.getRange(2, 1, last - 1, 2).getDisplayValues();
        for (var i = keys.length - 1; i >= 0; i--) {   // 최근 줄부터 찾기
          if (keys[i][0] === date && keys[i][1] === driver) { target = i + 2; break; }
        }
      }
      if (target === -1) target = last + 1;
      sheet.getRange(target, 1, 1, 2).setNumberFormat('@');
      sheet.getRange(target, 1, 1, 7).setValues([row]);
      return { success: true };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
