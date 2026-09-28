// ================================================================
// 🔄 [정류장 ID 동기화 및 백업 모듈] StopSync.js
// - 국토교통부 TAGO 공공 API 규격(ICB3...)으로 시트 정류장 ID를 100% 일괄 통일합니다.
// - 작업 전 'standard_master_backup' 시트를 자동 생성하여 원본을 안전하게 보호합니다.
// ================================================================

// 1. 🛡️ standard_master 시트 자동 백업 함수
function backupStandardMaster() {
  try {
    var ss = (typeof SHEET_ID !== 'undefined' && SHEET_ID)
      ? SpreadsheetApp.openById(SHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();

    var sourceSheet = ss.getSheetByName("standard_master");
    if (!sourceSheet) {
      Logger.log("⚠️ standard_master 시트를 찾을 수 없습니다.");
      return { success: false, message: "standard_master 시트 없음" };
    }

    var backupSheetName = "standard_master_backup";
    var existingBackup = ss.getSheetByName(backupSheetName);

    if (existingBackup) {
      Logger.log("ℹ️ 기존 백업 시트(" + backupSheetName + ")가 이미 존재합니다.");
    } else {
      var newBackup = sourceSheet.copyTo(ss);
      newBackup.setName(backupSheetName);
      Logger.log("✅ [백업 완료] " + backupSheetName + " 시트가 성공적으로 생성되었습니다.");
    }
    return { success: true, message: "백업 완료 또는 이미 존재함" };
  } catch (err) {
    Logger.log("❌ backupStandardMaster 오류: " + err.toString());
    return { success: false, error: err.toString() };
  }
}

// 2. 🚀 모든 노선 시트 및 standard_master의 정류장 ID를 TAGO 규격(ICB3...)으로 일괄 동기화
function syncTagoStopIdsToAllSheets() {
  try {
    var ss = (typeof SHEET_ID !== 'undefined' && SHEET_ID)
      ? SpreadsheetApp.openById(SHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();

    // 1단계: 원본 안전 백업
    backupStandardMaster();

    // 2단계: 개별 노선 마스터 시트 정류장 ID(E열) 갱신
    var routeSheetNames = ["202", "203", "204", "205", "206", "221", "281", "282", "202A", "203A"];
    var routeUpdateSummary = [];

    routeSheetNames.forEach(function (sheetName) {
      var sh = ss.getSheetByName(sheetName);
      if (!sh) return;
      var lastRow = sh.getLastRow();
      if (lastRow < 2) return;

      // E열(인덱스 5 = 정류장ID) 읽기
      var range = sh.getRange(2, 5, lastRow - 1, 1);
      var values = range.getValues();
      var modified = false;

      for (var r = 0; r < values.length; r++) {
        var rawId = String(values[r][0] || '').trim();
        var converted = convertToTagoStopId(rawId);
        if (converted !== rawId) {
          values[r][0] = converted;
          modified = true;
        }
      }

      if (modified) {
        range.setValues(values);
        routeUpdateSummary.push(sheetName + " (" + values.length + "행 갱신)");
        Logger.log("✅ [" + sheetName + " 시트] TAGO ID 동기화 완료: " + values.length + "개 정류장");
      }
    });

    // 3단계: 77,000행 standard_master 시트 E열 일괄 초고속 갱신
    var masterSheet = ss.getSheetByName("standard_master");
    var masterUpdatedCount = 0;

    if (masterSheet) {
      var mLastRow = masterSheet.getLastRow();
      if (mLastRow >= 1) {
        var startRow = 1;
        var firstCell = String(masterSheet.getRange(1, 1).getValue() || '').trim();
        if (firstCell === '노선' || firstCell === '노선명' || firstCell === '노선ID') {
          startRow = 2;
        }
        var mRange = masterSheet.getRange(startRow, 5, mLastRow - startRow + 1, 1); // E열: 정류장ID
        var mValues = mRange.getValues();

        for (var i = 0; i < mValues.length; i++) {
          var mRawId = String(mValues[i][0] || '').trim();
          var mConverted = convertToTagoStopId(mRawId);
          if (mConverted !== mRawId) {
            mValues[i][0] = mConverted;
            masterUpdatedCount++;
          }
        }

        if (masterUpdatedCount > 0) {
          mRange.setValues(mValues);
          Logger.log("✅ [standard_master] TAGO ID 일괄 동기화 완료: 총 " + masterUpdatedCount + "개 행 갱신");
        }
      }
    }

    return {
      success: true,
      routesUpdated: routeUpdateSummary,
      masterUpdatedRows: masterUpdatedCount
    };
  } catch (err) {
    Logger.log("❌ syncTagoStopIdsToAllSheets 오류: " + err.toString());
    return { success: false, error: err.toString() };
  }
}

// 💡 9자리 인천 로컬 ID(161..., 168...)를 국토부 TAGO 공식 ID(ICB3...)로 변환하는 핵심 헬퍼
function convertToTagoStopId(rawId) {
  if (!rawId) return '';
  var str = String(rawId).trim().toUpperCase();

  // 이미 ICB 접두사가 붙어있으면 그대로 유지
  if (str.indexOf("ICB") === 0) {
    return str;
  }

  // 숫자만 추출
  var digits = str.replace(/[^0-9]/g, '');

  // 9자리 인천 로컬 정류소 ID(예: 161000895, 168000214)는 "ICB3" + 뒷 8자리로 100% 매핑
  if (digits.length === 9) {
    return "ICB3" + digits.substring(1);
  }

  return str;
}

// 3. 📍 [초고속 자동 동기화] 영종운수 전 노선 TAGO 정류장 위도/경도(GPS) 일괄 동기화 (I열, J열)
function syncStopCoordinatesToStandardMaster() {
  try {
    var ss = (typeof SHEET_ID !== 'undefined' && SHEET_ID)
      ? SpreadsheetApp.openById(SHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();

    // 1단계: 원본 시트 안전 백업
    backupStandardMaster();

    // 2단계: TAGO 공공데이터 API로부터 영종운수 10개 노선 전 정류장 위도/경도 맵 수집
    var serviceKey = typeof BUS_SERVICE_KEY !== 'undefined' ? BUS_SERVICE_KEY : "ldmePwR9ORO9g6kIfA72AI7pu0YL2Fz%2Ba%2BwOGUyihH89yRYXL7pncSbytwR9IpM3Z3wuUrGJ7lmrMNTi03Mpmg%3D%3D";
    var routeMap = {
      "202": "ICB365000059",
      "202A": "ICB368000006",
      "203": "ICB365000060",
      "203A": "ICB368000056",
      "204": "ICB365000445",
      "205": "ICB368000003",
      "206": "ICB368000041",
      "221": "ICB368000054",
      "281": "ICB368000065",
      "282": "ICB368000066"
    };

    var totalCoordMap = {}; // { stopId: { lat: 37.xxx, lng: 126.xxx, name: '...' } }

    for (var rNo in routeMap) {
      var rId = routeMap[rNo];
      var url = "http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteAcctoThrghSttnList"
        + "?serviceKey=" + serviceKey
        + "&cityCode=23"
        + "&routeId=" + rId
        + "&numOfRows=250&pageNo=1&_type=xml";

      try {
        var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        var xml = resp.getContentText();
        var itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        var itemMatch;

        while ((itemMatch = itemRegex.exec(xml)) !== null) {
          var itemXml = itemMatch[1];
          var idM = itemXml.match(/<nodeid>(.*?)<\/nodeid>/i);
          var latM = itemXml.match(/<gpslati>(.*?)<\/gpslati>/i);
          var lngM = itemXml.match(/<gpslong>(.*?)<\/gpslong>/i);
          var nmM = itemXml.match(/<nodenm>(.*?)<\/nodenm>/i);

          if (idM && latM && lngM) {
            var sId = String(idM[1] || '').trim();
            var latVal = parseFloat(latM[1]) || null;
            var lngVal = parseFloat(lngM[1]) || null;
            if (sId && latVal && lngVal) {
              totalCoordMap[sId] = {
                lat: latVal,
                lng: lngVal,
                name: nmM ? nmM[1].trim() : ''
              };
            }
          }
        }
      } catch (fErr) {
        Logger.log("⚠️ [" + rNo + "] 정류장 좌표 수신 실패: " + fErr.toString());
      }
    }

    var totalStopsCount = Object.keys(totalCoordMap).length;
    Logger.log("🌐 [TAGO 수집 완료] 영종운수 총 " + totalStopsCount + "개 고유 정류장 좌표 확보");

    if (totalStopsCount === 0) {
      return { success: false, message: "TAGO API로부터 좌표를 가져오지 못했습니다." };
    }

    // 3단계: standard_master 시트 I열(위도), J열(경도) 일괄 초고속 쓰기
    var masterSheet = ss.getSheetByName("standard_master");
    var masterUpdatedCount = 0;

    if (masterSheet) {
      var mLastRow = masterSheet.getLastRow();
      if (mLastRow >= 2) {
        // 헤더 세팅
        masterSheet.getRange(1, 9).setValue("위도"); // I1
        masterSheet.getRange(1, 10).setValue("경도"); // J1

        // E열(정류장ID, 5열) 읽기
        var idValues = masterSheet.getRange(2, 5, mLastRow - 1, 1).getValues();
        var coordValues = []; // [[lat, lng], [lat, lng], ...]

        for (var i = 0; i < idValues.length; i++) {
          var curId = convertToTagoStopId(idValues[i][0]);
          if (curId && totalCoordMap[curId]) {
            coordValues.push([totalCoordMap[curId].lat, totalCoordMap[curId].lng]);
            masterUpdatedCount++;
          } else {
            coordValues.push(["", ""]);
          }
        }

        // I2:J[mLastRow] 일괄 기록 (단 1번의 API 호출로 1초 완료)
        masterSheet.getRange(2, 9, coordValues.length, 2).setValues(coordValues);
        Logger.log("✅ [standard_master] I열(위도), J열(경도) 동기화 완료: 총 " + masterUpdatedCount + "개 행 기록");
      }
    }

    // 4단계: 개별 노선 시트(202, 203, ...)에도 I열, J열 좌표 기록
    var routeSheets = ["202", "203", "204", "205", "206", "221", "281", "282", "202A", "203A"];
    var routeDone = [];

    routeSheets.forEach(function (sName) {
      var sh = ss.getSheetByName(sName);
      if (!sh) return;
      var lRow = sh.getLastRow();
      if (lRow < 2) return;

      sh.getRange(1, 9).setValue("위도");
      sh.getRange(1, 10).setValue("경도");

      var sIds = sh.getRange(2, 5, lRow - 1, 1).getValues();
      var cRows = [];
      for (var k = 0; k < sIds.length; k++) {
        var stopKey = convertToTagoStopId(sIds[k][0]);
        if (stopKey && totalCoordMap[stopKey]) {
          cRows.push([totalCoordMap[stopKey].lat, totalCoordMap[stopKey].lng]);
        } else {
          cRows.push(["", ""]);
        }
      }
      sh.getRange(2, 9, cRows.length, 2).setValues(cRows);
      routeDone.push(sName);
    });

    var msg = "🎉 [동기화 완료] " + totalStopsCount + "개 정류소 GPS 좌표 확보! standard_master(" + masterUpdatedCount + "행) 및 " + routeDone.length + "개 노선 시트 I열(위도), J열(경도) 반영 완료!";
    Logger.log(msg);

    try {
      SpreadsheetApp.getUi().alert("📍 위도/경도 동기화 완료", msg, SpreadsheetApp.getUi().ButtonSet.OK);
    } catch(uiErr) {}

    return {
      success: true,
      totalStopsCount: totalStopsCount,
      masterUpdatedRows: masterUpdatedCount,
      routesDone: routeDone,
      message: msg
    };

  } catch (err) {
    Logger.log("❌ syncStopCoordinatesToStandardMaster 오류: " + err.toString());
    return { success: false, error: err.toString() };
  }
}

// 4. 📋 구글 스프레드시트 상단 메뉴 자동 등록 (열 때마다 표시)
function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('🚌 영종운수 관리')
      .addItem('🛡️ standard_master 안전 백업 생성', 'backupStandardMaster')
      .addSeparator()
      .addItem('🚀 TAGO 정류장 ID 일괄 동기화 (전체 노선)', 'syncTagoStopIdsToAllSheets')
      .addItem('📍 정류장 위도/경도(GPS) 일괄 동기화 (I열, J열)', 'syncStopCoordinatesToStandardMaster')
      .addToUi();
  } catch (e) {
    // 웹앱 모드 실행 시 무시
  }
}
