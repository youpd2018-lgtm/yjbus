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


// ================================================================
// ⏱️ [평균 속도 저장] 같은 '운행습관' 시트의 그날 줄(날짜 + 기사)에 평균 속도를 함께 저장합니다.
// - 통계 데이터(급출발·급정거·급회전·평균 속도)를 한 시트에서 관리합니다.
// - 시트 열: A 날짜 | B 기사 | C 급출발 | D 급정거 | E 과속(예전 항목, 더 쓰지 않음) | F 급회전 | G 저장시각
//            H 평균속도(km/h) | I 운행거리(km) | J 운행시간(분) | K 회차수 | L 회차내역
// - 앱이 운행이 끝난 뒤 한꺼번에 보냅니다: { driver, trips: [{ date, key, turn, route, seq, start, end, dist, speed }, ...] }
//   같은 날짜의 회차를 모두 보내면 서버가 하루 평균(= 총거리 ÷ 총시간)을 다시 계산해 그 줄의 H~L에 덮어씁니다. (다시 보내도 중복되지 않음)
// - 그날 줄이 아직 없으면 횟수는 0으로 해서 새 줄을 만듭니다. (급출발 등 횟수는 saveDrivingHabit이 같은 줄에 더함)
// - 앱에서 doPost(action = 'save_trip_speed')로 호출합니다. (Code.js의 doPost에 연결되어 있어야 함)
// ================================================================
function saveTripSpeed(d) {
  try {
    if (!d || !d.driver || !d.trips || !d.trips.length) return { success: false, error: '데이터 누락' };
    var driver = String(d.driver), tz = 'Asia/Seoul';
    var byDate = {};
    d.trips.forEach(function (t) {
      var speed = Number(t && t.speed), dist = Number(t && t.dist);
      if (!t || !t.date || !(speed > 0 && speed < 120) || !(dist > 0)) return;
      (byDate[String(t.date)] = byDate[String(t.date)] || []).push(t);
    });
    var dates = Object.keys(byDate);
    if (!dates.length) return { success: false, error: '값 이상' };

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var ss = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName(DRIVING_HABIT_SHEET_NAME);
      if (!sheet) {
        sheet = ss.insertSheet(DRIVING_HABIT_SHEET_NAME);
        sheet.appendRow(['날짜', '기사', '급출발', '급정거', '과속', '급회전', '저장시각']);
        sheet.setFrozenRows(1);
        sheet.getRange(2, 1, 1000, 2).setNumberFormat('@');
      }
      sheet.getRange(1, 8, 1, 5).setValues([['평균속도(km/h)', '운행거리(km)', '운행시간(분)', '회차수', '회차내역']]);

      var last = sheet.getLastRow(), index = {};
      if (last >= 2) {
        var keys = sheet.getRange(2, 1, last - 1, 2).getDisplayValues();
        for (var i = 0; i < keys.length; i++) index[keys[i][0] + '|' + keys[i][1]] = i + 2;
      }
      dates.forEach(function (date) {
        var trips = byDate[date].sort(function (a, b) { return Number(a.start) - Number(b.start); });
        var dist = 0, sec = 0, parts = [];
        trips.forEach(function (t) {
          dist += Number(t.dist);
          sec += (Number(t.end) - Number(t.start)) / 1000;
          parts.push((t.route || '') + ' ' + (t.seq || '') + ' ' + (t.turn || '') + '회차 ' + (Math.round(Number(t.speed) * 10) / 10) + 'km/h');
        });
        if (!(sec > 0)) return;
        var out = [Math.round(dist / (sec / 3600) * 10) / 10, Math.round(dist * 10) / 10, Math.round(sec / 60), trips.length, parts.join(' / ')];
        var id = date + '|' + driver, target = index[id];
        if (!target) {
          last += 1; target = last; index[id] = target;
          sheet.getRange(target, 1, 1, 2).setNumberFormat('@');
          sheet.getRange(target, 1, 1, 7).setValues([[date, driver, 0, 0, 0, 0, Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss')]]);
        }
        sheet.getRange(target, 8, 1, 5).setValues([out]);
      });
      return { success: true, saved: dates.length };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}


// ================================================================
// 🚏 [정류장 운전 습관 저장] '정류장습관' 시트 (2026-10-03 신설)
// - 라이브 모달을 켠 동안 앱이 잰 '정차·출발' 결과를 회차마다 한 줄로 저장합니다. (측정 정류장 10개 이상인 회차만 옴)
// - 열: A 날짜 | B 기사 | C 노선 | D 순번 | E 회차 | F 측정횟수 | G 급정거횟수 | H 급출발횟수 | I 급정거 Top3 | J 급출발 Top3 | K 저장시각 | L 키
//   (L 키 = 날짜|근무|회차|번호. 같은 키의 줄이 있으면 그 줄을 덮어써서 중복되지 않음)
// - 앱에서 doPost(action = 'save_stop_habit'), doGet(action = 'get_stop_habit', driver, year, month)로 호출합니다.
// - 옛 '운행습관' 시트는 더 쓰지 않습니다. (필요 없으면 지워도 됨)
// ================================================================
var STOP_HABIT_SHEET_NAME = '정류장습관';

function saveStopHabit(d) {
  try {
    if (!d || !d.key || !d.date || !d.driver) return { success: false, error: '데이터 누락' };
    var n = Number(d.n) || 0;
    if (n < 1) return { success: false, error: '측정 정류장 부족' };
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var ss = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName(STOP_HABIT_SHEET_NAME);
      if (!sheet) {
        sheet = ss.insertSheet(STOP_HABIT_SHEET_NAME);
        sheet.appendRow(['날짜', '기사', '노선', '순번', '회차', '측정횟수', '급정거횟수', '급출발횟수', '급정거 Top3', '급출발 Top3', '저장시각', '키']);
        sheet.setFrozenRows(1);
        sheet.getRange(2, 1, 2000, 5).setNumberFormat('@');
        sheet.getRange(2, 12, 2000, 1).setNumberFormat('@');
      }
      var key = String(d.key), driver = String(d.driver);
      var last = sheet.getLastRow(), target = -1;
      if (last >= 2) {
        var ids = sheet.getRange(2, 12, last - 1, 1).getDisplayValues();
        var who = sheet.getRange(2, 2, last - 1, 1).getDisplayValues();
        for (var i = ids.length - 1; i >= 0; i--) {
          if (ids[i][0] === key && who[i][0] === driver) { target = i + 2; break; }
        }
      }
      if (target === -1) target = last + 1;
      var row = [String(d.date), driver, String(d.route || ''), String(d.seq || ''), String(d.turn || ''),
        n, Number(d.hardStop) || 0, Number(d.hardStart) || 0,
        String(d.topStop || ''), String(d.topStart || ''),
        Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'), key];
      sheet.getRange(target, 1, 1, 5).setNumberFormat('@');
      sheet.getRange(target, 12, 1, 1).setNumberFormat('@');
      sheet.getRange(target, 1, 1, 12).setValues([row]);
      return { success: true };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// 한 기사의 해당 월 회차들: { success, rows: [[키, 측정횟수, 급정거횟수, 급출발횟수, 급정거Top3, 급출발Top3], ...] }
function getStopHabit(driver, year, month) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(STOP_HABIT_SHEET_NAME);
    var rows = [];
    if (sheet && sheet.getLastRow() >= 2) {
      var prefix = String(year) + '-' + ('0' + month).slice(-2) + '-';
      var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getDisplayValues();
      vals.forEach(function (r) {
        if (r[1] === String(driver) && r[0].indexOf(prefix) === 0) {
          rows.push([r[11], Number(r[5]) || 0, Number(r[6]) || 0, Number(r[7]) || 0, r[8], r[9]]);
        }
      });
    }
    return { success: true, rows: rows };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
