// ================================================================
// 🗺️ [노선 정류장 JSON 내보내기] RouteExport.js
// - '노선마스터' 시트에서 노선명(B열)별 정류장 목록을 앱용 JSON으로 만듭니다.
// - 정류장별 누적 구간소요시간(L열, 초)이 앵커 구간 사이의 시간 배분 비율이 됩니다.
// - 앵커 정류장 = 배경색이 '연한 빨강 2'(#ea9999)로 칠해진 행 (G열 기준)
//   · 왕복 노선: 3개(출발/기점/도착)   · 편도 노선(202A/203A 등): 2개
// - 표준시간 자체는 저장하지 않습니다. 앱이 근무표 앵커시간(time1~3)으로 계산합니다.
// ================================================================

var ROUTE_MASTER_SHEET_NAME = '노선마스터';
var ROUTE_ANCHOR_COLOR = '#ea9999';   // 구글시트 '연한 빨강 2'
var ROUTE_STOPS_CACHE_PREFIX = 'ROUTE_STOPS_V3_';

// 노선마스터 열 (1-based): D=순서 E=정류장ID G=정류장명 H=위도 I=경도 L=구간소요시간 N=제한속도 O=도로명
function isAnchorBackground_(bg) {
  var c = String(bg || '').toLowerCase();
  if (c === ROUTE_ANCHOR_COLOR) return true;
  var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(c);
  if (!m) return false;
  var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return (r - g >= 60) && (r - b >= 60);   // 붉은 계열 배경 (색상 코드 오차 대비)
}

function getRouteStopsForApp(routeName) {
  try {
    var name = String(routeName || '').trim();
    if (!name) return { success: false, error: 'route 누락' };

    var cache = CacheService.getScriptCache();
    var cached = cache.get(ROUTE_STOPS_CACHE_PREFIX + name);
    if (cached) return JSON.parse(cached);

    var ss = (typeof SHEET_ID !== 'undefined' && SHEET_ID)
      ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(ROUTE_MASTER_SHEET_NAME);
    if (!sheet) return { success: false, error: '노선마스터 시트 없음' };

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: false, error: '노선마스터 데이터 없음' };

    // B열(노선명)만 먼저 읽어 해당 노선의 연속 행 범위를 찾는다
    var names = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
    var first = -1, last = -1;
    for (var i = 0; i < names.length; i++) {
      if (String(names[i][0]).trim() === name) {
        if (first === -1) first = i;
        last = i;
      }
    }
    if (first === -1) return { success: false, error: '노선 없음: ' + name };

    var startRow = first + 2;
    var numRows = last - first + 1;
    var values = sheet.getRange(startRow, 1, numRows, 15).getDisplayValues();
    var backgrounds = sheet.getRange(startRow, 7, numRows, 1).getBackgrounds();

    var stops = [];
    var anchors = [];
    var cum = 0;
    for (var r = 0; r < values.length; r++) {
      var row = values[r];
      if (String(row[1]).trim() !== name) continue;   // 같은 노선명이 섞여 끊긴 경우 방어
      var seg = parseTimeToSec(row[11]);              // L열 구간소요시간
      cum += (seg === null ? 0 : seg);
      stops.push([
        String(row[4]).trim(),                        // E: 정류장ID
        String(row[6]).trim(),                        // G: 정류장명
        parseFloat(row[7]) || null,                   // H: 위도
        parseFloat(row[8]) || null,                   // I: 경도
        cum,                                          // 누적 구간소요시간(초)
        parseFloat(row[13]) || 50,                    // N: 제한속도(km/h, 비어 있으면 50)
        String(row[14] || '').trim()                  // O: 도로명 (소통정보 매칭용, 비어 있을 수 있음)
      ]);
      if (isAnchorBackground_(backgrounds[r][0])) anchors.push(stops.length - 1);
    }

    var warn = (anchors.length !== 2 && anchors.length !== 3)
      ? '앵커(빨간 행) 개수가 2 또는 3이 아닙니다: ' + anchors.length : '';
    var result = {
      success: true,
      route: name,
      totalSec: cum,
      anchors: anchors,     // stops 배열 인덱스
      stops: stops,         // [id, name, lat, lng, cumSec, 제한속도, 도로명]
      warn: warn
    };

    try { cache.put(ROUTE_STOPS_CACHE_PREFIX + name, JSON.stringify(result), 21600); } catch (ce) {}
    return result;
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// 🔍 [점검용] 모든 노선의 앵커 개수/정류장 수/합계를 로그로 출력 (Apps Script 편집기에서 실행)
function debugRouteAnchors() {
  var ss = (typeof SHEET_ID !== 'undefined' && SHEET_ID)
    ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ROUTE_MASTER_SHEET_NAME);
  var lastRow = sheet.getLastRow();
  var names = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
  var seen = {}, list = [];
  names.forEach(function (n) { var k = String(n[0]).trim(); if (k && !seen[k]) { seen[k] = 1; list.push(k); } });

  var colorCount = {};
  sheet.getRange(2, 7, lastRow - 1, 1).getBackgrounds().forEach(function (b) {
    colorCount[b[0]] = (colorCount[b[0]] || 0) + 1;
  });
  Logger.log('G열 배경색 분포: ' + JSON.stringify(colorCount));

  list.forEach(function (n) {
    var res = getRouteStopsForApp(n);
    if (!res.success) { Logger.log(n + ' ❌ ' + res.error); return; }
    var names = res.anchors.map(function (i) { return res.stops[i][1]; }).join(' → ');
    Logger.log(n + ' | 정류장 ' + res.stops.length + '개 | 합계 ' + formatSecToHms(res.totalSec)
      + ' | 앵커 ' + res.anchors.length + '개 [' + names + ']' + (res.warn ? ' ⚠️ ' + res.warn : ''));
  });
}

// 노선마스터 수정 후 캐시를 즉시 비우고 싶을 때 실행
function clearRouteStopsCache() {
  var cache = CacheService.getScriptCache();
  var keys = [];
  ['202', '202A', '203', '203A', '204', '205', '206', '221', '281', '282'].forEach(function (n) {
    keys.push(ROUTE_STOPS_CACHE_PREFIX + n);
  });
  cache.removeAll(keys);
}
