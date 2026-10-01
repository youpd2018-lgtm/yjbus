// ================================================================
// 🚦 [구간 제한속도 채우기] SpeedLimit.js
// - '노선마스터' 시트 N열에 '제한속도(km/h)'를 채웁니다. (그 행 정류장에 도착하는 구간의 제한속도)
// - 기본 50km/h, 아래 SPEED_HIGHWAY_SECTIONS에 적은 고속도로 구간은 80km/h.
// - 먼저 previewSpeedLimits()로 '제한속도_점검' 시트를 보고 맞는지 확인한 뒤, applySpeedLimits()를 실행하세요.
// - applySpeedLimits()는 N열이 '비어 있는 칸'만 채웁니다. (직접 적어 둔 값은 건드리지 않음)
// - 과속 판정 = 제한속도 + 20km/h 초과 (앱에서 사용)
// ================================================================

var SPEED_LIMIT_COL = 14;          // N열
var SPEED_LIMIT_HEADER = '제한속도(km/h)';
var SPEED_DEFAULT = 50;
var SPEED_HIGHWAY = 80;
var SPEED_CHECK_SHEET_NAME = '제한속도_점검';

// a, b = 정류장명에 들어 있는 글자 (b는 여러 개면 배열). both = true면 왕복, false면 a→b 편도
var SPEED_HIGHWAY_SECTIONS = [
  { route: '203',  a: '풍림아이원', b: ['인천공항T1', '인천공항T2'], both: true },
  { route: '203A', a: '풍림아이원', b: ['인천공항T1', '인천공항T2'], both: true },
  { route: '206',  a: '풍림아이원', b: ['인천공항T1', '인천공항T2'], both: true },
  { route: '281',  a: '풍림아이원', b: ['인천공항T1', '인천공항T2'], both: true },
  { route: '202',  a: '영종역', b: ['청라국제도시역'], both: true },
  { route: '202',  a: '드라이빙센터', b: ['인천공항T1'], both: false },
  { route: '202',  a: '국제업무단지', b: ['그린나래지하차도'], both: false },
  { route: '202A', a: '서부공단입구', b: ['인천공항T1'], both: false },
  { route: '205',  a: '그린나래지하차도', b: ['인천공항T2'], both: true },
  { route: '204',  a: '삼목선착장', b: ['인천공항T2'], both: true },
  { route: '221',  a: '공항충전소', b: ['인천공항T2'], both: true }
  // 282는 고속도로 구간 없음
];

function speedMatch_(name, keys) {
  for (var i = 0; i < keys.length; i++) if (name.indexOf(keys[i]) !== -1) return true;
  return false;
}

// 한 방향 찾기: 시작 키워드 정류장 → 끝 키워드 정류장 사이 구간(끝 정류장에 도착하는 구간까지)을 표시
function speedFindRanges_(names, fromKeys, toKeys) {
  var ranges = [], lastEnd = -1;
  for (var j = 0; j < names.length; j++) {
    if (!speedMatch_(names[j], toKeys)) continue;
    var k = -1;
    for (var x = j - 1; x > lastEnd; x--) {
      if (speedMatch_(names[x], fromKeys)) { k = x; break; }
    }
    if (k === -1) continue;
    ranges.push({ from: k, to: j });   // 표시할 행: k+1 ~ j
    lastEnd = j;
  }
  return ranges;
}

// 계산: 노선마스터의 행별 고속도로 여부 + 점검용 설명
function speedCompute_() {
  var ss = (typeof SHEET_ID !== 'undefined' && SHEET_ID)
    ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ROUTE_MASTER_SHEET_NAME);
  var lastRow = sheet.getLastRow();
  var vals = sheet.getRange(2, 1, lastRow - 1, 10).getDisplayValues();   // A~J
  var rows = [];
  vals.forEach(function (r, i) {
    rows.push({ sheetRow: i + 2, route: String(r[1]).trim(), name: String(r[6]).trim(), segM: Number(String(r[9]).replace(/,/g, '')) || 0 });
  });

  var hw = {};       // sheetRow -> true
  var report = [];   // [노선, 구간, 결과, 시작 정류장, 끝 정류장, 행 수, 거리(m)]
  SPEED_HIGHWAY_SECTIONS.forEach(function (sec) {
    var rr = rows.filter(function (x) { return x.route === sec.route; });
    var names = rr.map(function (x) { return x.name; });
    var label = sec.a + (sec.both ? ' ↔ ' : ' → ') + sec.b.join('/');
    if (!rr.length) { report.push([sec.route, label, '❌ 노선 없음', '', '', 0, 0]); return; }
    var found = speedFindRanges_(names, [sec.a], sec.b);
    var found2 = sec.both ? speedFindRanges_(names, sec.b, [sec.a]) : [];
    var all = found.concat(found2);
    if (!all.length) { report.push([sec.route, label, '❌ 정류장을 못 찾음', '', '', 0, 0]); return; }
    all.forEach(function (rg) {
      var cnt = 0, meters = 0;
      for (var q = rg.from + 1; q <= rg.to; q++) { hw[rr[q].sheetRow] = true; cnt++; meters += rr[q].segM; }
      report.push([sec.route, label, '✅', names[rg.from], names[rg.to], cnt, meters]);
    });
  });
  return { sheet: sheet, ss: ss, rows: rows, hw: hw, report: report };
}

// 1단계: 점검만 (노선마스터는 건드리지 않고 '제한속도_점검' 시트에 결과를 적음)
function previewSpeedLimits() {
  var c = speedCompute_();
  var out = c.ss.getSheetByName(SPEED_CHECK_SHEET_NAME) || c.ss.insertSheet(SPEED_CHECK_SHEET_NAME);
  out.clear();
  out.getRange(1, 1, 1, 7).setValues([['노선', '구간(설정)', '결과', '시작 정류장(이 정류장 다음부터 80)', '끝 정류장', '구간 수', '거리(m)']]);
  if (c.report.length) out.getRange(2, 1, c.report.length, 7).setValues(c.report);
  out.setFrozenRows(1);
  Logger.log('점검 시트에 ' + c.report.length + '줄 적었습니다. ❌ 줄이 있으면 SPEED_HIGHWAY_SECTIONS의 정류장 글자를 고치세요.');
}

// 2단계: N열 채우기 (비어 있는 칸만)
function applySpeedLimits() {
  var c = speedCompute_();
  var sheet = c.sheet;
  var n = c.rows.length;
  sheet.getRange(1, SPEED_LIMIT_COL).setValue(SPEED_LIMIT_HEADER);
  var cur = sheet.getRange(2, SPEED_LIMIT_COL, n, 1).getValues();
  var filled = 0;
  for (var i = 0; i < n; i++) {
    if (String(cur[i][0]).trim() !== '') continue;
    cur[i][0] = c.hw[c.rows[i].sheetRow] ? SPEED_HIGHWAY : SPEED_DEFAULT;
    filled++;
  }
  sheet.getRange(2, SPEED_LIMIT_COL, n, 1).setValues(cur);
  if (typeof clearRouteStopsCache === 'function') clearRouteStopsCache();
  Logger.log('제한속도 ' + filled + '칸을 채웠습니다. (이미 값이 있던 칸은 그대로)');
}
