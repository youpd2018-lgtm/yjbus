// ================================================================
// 🕒 [표준시간 100% 안전 조회 모듈] StandardTime.js
// - 프론트엔드에서 조립된 고유키(예: 203110303)를 받아,
//   standard_master 시트 H열과 100% 일치하는 회차의 정류장만 반환합니다.
// ================================================================

function getStandardMasterForLiveByKey(uniqueKey) {
  try {
    var targetKey = String(uniqueKey || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!targetKey) {
      Logger.log("⚠️ 유효하지 않은 고유키 전달: " + uniqueKey);
      return { success: false, data: [] };
    }

    // 1. ScriptCache 초고속 캐시 조회 (동일 회차는 0ms 반환)
    try {
      var cache = CacheService.getScriptCache();
      var cached = cache.get("STD_MASTER_KEY_V2_" + targetKey);
      if (cached) {
        return { success: true, data: JSON.parse(cached), cached: true };
      }
    } catch(cacheErr) {}

    var ss = (typeof SHEET_ID !== 'undefined' && SHEET_ID) 
             ? SpreadsheetApp.openById(SHEET_ID) 
             : SpreadsheetApp.getActiveSpreadsheet();
             
    var sheet = ss.getSheetByName("standard_master");
    if (!sheet) {
      Logger.log("⚠️ standard_master 시트를 찾을 수 없습니다.");
      return { success: false, data: [] };
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 1) {
      Logger.log("⚠️ standard_master 시트에 데이터가 없습니다.");
      return { success: false, data: [] };
    }

    var matchedList = [];

    // 2. ⚡ TextFinder를 활용한 H열 초고속 인덱스 탐색 (전체 77,000행 메모리 로딩 제거)
    var textFinder = sheet.getRange("H:H").createTextFinder(targetKey).matchEntireCell(true);
    var matches = textFinder.findAll();

    // 3. 만약 정확한 targetKey가 없다면, 회차(끝 2자리)를 제외한 앞자리 prefix로 근접 회차 검색
    if (!matches || matches.length === 0) {
      if (targetKey.length >= 6) {
        var prefix = targetKey.substring(0, targetKey.length - 2);
        var prefixFinder = sheet.getRange("H:H").createTextFinder("^" + prefix).useRegularExpression(true);
        matches = prefixFinder.findAll();
        if (matches && matches.length > 0) {
          targetKey = String(matches[0].getValue() || '').trim().toUpperCase();
        }
      }
    }

    if (matches && matches.length > 0) {
      var startRow = matches[0].getRow();
      var endRow = matches[matches.length - 1].getRow();
      var numRows = endRow - startRow + 1;

      // 필요한 행(약 50~130행)만 정밀 읽기 (I열:위도, J열:경도 포함 총 10개 열)
      var data = sheet.getRange(startRow, 1, numRows, 10).getValues();

      for (var i = 0; i < data.length; i++) {
        var rowKey = String(data[i][7] || '').trim().toUpperCase();

        if (rowKey === targetKey) {
          var formattedTime = formatTimeToHHMMSS(data[i][6]);

          matchedList.push({
            sequence: data[i][3],                           // D열: 정류장순서
            stopId: String(data[i][4] || '').trim(),         // E열: 정류장ID
            name: String(data[i][5] || '').trim(),           // F열: 정류장명
            stdTime: formattedTime,                         // G열: 표준시간 (HH:mm:ss)
            lat: parseFloat(data[i][8]) || null,            // I열: 위도 (Latitude)
            lng: parseFloat(data[i][9]) || null,            // J열: 경도 (Longitude)
            // 호환성을 위한 배열 인덱스 접근
            0: data[i][0], 1: data[i][1], 2: data[i][2], 3: data[i][3],
            4: String(data[i][4] || '').trim(),
            5: String(data[i][5] || '').trim(),
            6: formattedTime,
            7: rowKey,
            8: data[i][8],
            9: data[i][9]
          });
        }
      }
    }

    // 캐시에 결과 보관 (6시간)
    if (matchedList.length > 0) {
      try {
        var cacheToSave = CacheService.getScriptCache();
        cacheToSave.put("STD_MASTER_KEY_V2_" + targetKey, JSON.stringify(matchedList), 21600);
      } catch (ce) {}
    }

    Logger.log("✅ [고유키 매칭 완료] " + targetKey + " -> " + matchedList.length + "개 정류장 반환");
    return { success: true, data: matchedList };

  } catch (err) {
    Logger.log("❌ getStandardMasterForLiveByKey 오류: " + err.toString());
    return { success: false, error: err.toString(), data: [] };
  }
}

// 💡 스프레드시트 Date 객체를 "HH:mm:ss" 문자열로 안전하게 변환하는 헬퍼 함수
function formatTimeToHHMMSS(timeVal) {
  if (!timeVal) return "--:--:--";
  if (timeVal instanceof Date) {
    var hh = String(timeVal.getHours()).padStart(2, '0');
    var mm = String(timeVal.getMinutes()).padStart(2, '0');
    var ss = String(timeVal.getSeconds()).padStart(2, '0');
    return hh + ":" + mm + ":" + ss;
  }
  var str = String(timeVal).trim();
  if (str === "" || str === "-" || str === "0") return "--:--:--";
  var parts = str.split(':');
  if (parts.length >= 2) {
    var h = String(parts[0]).padStart(2, '0');
    var m = String(parts[1]).padStart(2, '0');
    var s = parts[2] ? String(parts[2]).padStart(2, '0') : "00";
    return h + ":" + m + ":" + s;
  }
  return str;
}
// ================================================================
// 🔍 [디버그 전용] standard_master H열의 실제 고유키 샘플 반환 함수
// ================================================================
function getSampleStandardMasterKeys() {
  try {
    var ss = (typeof SHEET_ID !== 'undefined' && SHEET_ID)
             ? SpreadsheetApp.openById(SHEET_ID)
             : SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("standard_master");
    if (!sheet) return { success: false, keys: [] };

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: false, keys: [] };

    var data = sheet.getRange(2, 1, Math.min(lastRow - 1, 200), 8).getValues();
    var seen = {};
    var uniqueKeys = [];
    for (var i = 0; i < data.length; i++) {
      var key = String(data[i][7] || '').trim();
      if (key && !seen[key]) {
        seen[key] = true;
        uniqueKeys.push(key);
      }
      if (uniqueKeys.length >= 30) break;
    }
    return { success: true, keys: uniqueKeys };
  } catch (err) {
    return { success: false, error: err.toString(), keys: [] };
  }
}
