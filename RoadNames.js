// ================================================================
// 🛣️ [도로명 저장] RoadNames.js
// - '노선마스터' 시트 O열(15번째)에 정류장별 도로명을 기록합니다. (관리자 전용, road_names.html 에서 호출)
// - 도로명은 국토교통부 소통정보(도로 이름·속도)와 정류장을 맞추는 데 쓰입니다.
// ================================================================
var ROAD_NAME_COL = 15;   // O열

function saveRoadNames(routeName, roads) {
  try {
    var name = String(routeName || '').trim();
    if (!name) return { success: false, error: 'route 누락' };
    if (!Array.isArray(roads) || roads.length === 0) return { success: false, error: '도로명 목록이 비었습니다' };

    var ss = (typeof SHEET_ID !== 'undefined' && SHEET_ID)
      ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(ROUTE_MASTER_SHEET_NAME);
    if (!sheet) return { success: false, error: '노선마스터 시트 없음' };

    var lastRow = sheet.getLastRow();
    var names = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
    var rowsOfRoute = [];
    for (var i = 0; i < names.length; i++) {
      if (String(names[i][0]).trim() === name) rowsOfRoute.push(i + 2);
    }
    if (rowsOfRoute.length === 0) return { success: false, error: '노선 없음: ' + name };
    if (rowsOfRoute.length !== roads.length) {
      return { success: false, error: '정류장 수가 다릅니다 (시트 ' + rowsOfRoute.length + '개 / 받은 ' + roads.length + '개). 저장하지 않았습니다.' };
    }

    if (!String(sheet.getRange(1, ROAD_NAME_COL).getDisplayValue()).trim()) {
      sheet.getRange(1, ROAD_NAME_COL).setValue('도로명');
    }
    // 같은 노선의 행이 연속이면 한 번에, 아니면 한 줄씩 기록
    var contiguous = rowsOfRoute[rowsOfRoute.length - 1] - rowsOfRoute[0] + 1 === rowsOfRoute.length;
    var vals = roads.map(function (r) { return [String(r || '').trim()]; });
    if (contiguous) {
      sheet.getRange(rowsOfRoute[0], ROAD_NAME_COL, vals.length, 1).setValues(vals);
    } else {
      for (var k = 0; k < rowsOfRoute.length; k++) sheet.getRange(rowsOfRoute[k], ROAD_NAME_COL).setValue(vals[k][0]);
    }
    if (typeof clearRouteStopsCache === 'function') clearRouteStopsCache();
    return { success: true, route: name, count: vals.length };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
