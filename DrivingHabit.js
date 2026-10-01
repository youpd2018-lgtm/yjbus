// ================================================================
// 🚌 [운행 습관 저장] DrivingHabit.js
// - 앱이 보낸 '그날의 급출발·급정거·과속·급회전 횟수'를 '운행습관' 시트에 저장합니다.
// - 앱이 보낸 값은 '새로 늘어난 횟수'입니다. 기사 + 날짜가 같은 줄이 있으면 그 줄에 더하고, 없으면 새 줄을 추가합니다.
//   (폰·태블릿·공용폰을 섞어 써도 서버 시트가 기준이 됩니다)
// - 앱이 이달 합계를 볼 때는 doGet(action = 'get_driving_habit', driver, year, month)을 씁니다.
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
      var add = [Number(d.start) || 0, Number(d.stop) || 0, Number(d.speed) || 0, Number(d.turn) || 0];

      var last = sheet.getLastRow();
      var target = -1;
      if (last >= 2) {
        var keys = sheet.getRange(2, 1, last - 1, 2).getDisplayValues();
        for (var i = keys.length - 1; i >= 0; i--) {   // 최근 줄부터 찾기
          if (keys[i][0] === date && keys[i][1] === driver) { target = i + 2; break; }
        }
      }
      var base = [0, 0, 0, 0];
      if (target === -1) {
        target = last + 1;
      } else {
        var old = sheet.getRange(target, 3, 1, 4).getValues()[0];
        base = [Number(old[0]) || 0, Number(old[1]) || 0, Number(old[2]) || 0, Number(old[3]) || 0];
      }
      var row = [date, driver, base[0] + add[0], base[1] + add[1], base[2] + add[2], base[3] + add[3],
        Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss')];
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

// 한 기사의 해당 월 날짜별 합계: { success, days: { '2026-10-01': [급출발, 급정거, 과속, 급회전], ... } }
function getDrivingHabit(driver, year, month) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(DRIVING_HABIT_SHEET_NAME);
    var days = {};
    if (sheet && sheet.getLastRow() >= 2) {
      var prefix = String(year) + '-' + ('0' + month).slice(-2) + '-';
      var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getDisplayValues();
      vals.forEach(function (r) {
        if (r[1] === String(driver) && r[0].indexOf(prefix) === 0) {
          days[r[0]] = [Number(r[2]) || 0, Number(r[3]) || 0, Number(r[4]) || 0, Number(r[5]) || 0];
        }
      });
    }
    return { success: true, days: days };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
