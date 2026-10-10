// ================================================================
// 🎨 난이도 색 선택 기록 + 하루 바뀔 때 '가장 많이 고른 색' 자동 반영
//
//  [기록] 사용자가 색을 고를 때마다 시트 '색선택'에 한 줄씩 쌓입니다.
//         날짜 | 노선+순번 | 이름 | 색 | 시각
//         (노선+순번 예: 202평일16대1순번 — 이 묶음이 한 단위)
//  [표시 규칙]
//    1) 하루 중에는 '마지막에 고른 사람의 색'이 앱에 보입니다. (BOARD_DB의 DIFFICULTY 줄)
//    2) 하루가 바뀌면, 전날 그 묶음에서 가장 많이 선택된 색으로 바뀝니다.
//       (동점이면 동점 색들 중 가장 나중에 고른 색)
//       전날 아무도 안 골랐으면 색은 그대로 둡니다.
//  [하루가 바뀌는 시간] COLOR_DAY_START_HOUR (0 = 자정, 4 = 새벽 4시)
//  [작동 방식] 별도 트리거 설정 없음. 하루가 바뀐 뒤 누군가 색을 읽거나 고르는
//              첫 순간에 어제(밀린 날 포함) 집계를 한 번만 실행합니다.
//  BOARD_DB.js 의 loadBoardMemo / saveBoardMemo 맨 앞에서 호출됩니다.
// ================================================================
var COLOR_DAY_START_HOUR = 0;
var COLOR_SHEET_NAME = '색선택';
var COLOR_AUTO_WRITER = '자동집계';
var COLOR_KO = { green: '녹색', blue: '파랑', yellow: '노랑', red: '빨강' };
var COLOR_EN = { '녹색': 'green', '파랑': 'blue', '노랑': 'yellow', '빨강': 'red' };

// 운행일 문자열 (하루 시작 시각 기준) 예: 2026-10-10
function colorDayString_(date) {
  var shifted = new Date(date.getTime() - COLOR_DAY_START_HOUR * 3600 * 1000);
  return Utilities.formatDate(shifted, 'GMT+9', 'yyyy-MM-dd');
}

function getOrCreateColorSheet_() {
  var ss = (typeof SHEET_ID !== 'undefined' && SHEET_ID)
    ? SpreadsheetApp.openById(SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(COLOR_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(COLOR_SHEET_NAME);
    sheet.getRange(1, 1, 1, 5).setValues([['날짜', '노선+순번', '이름', '색', '시각']]);
    sheet.setFrozenRows(1);
    sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1).setNumberFormat('@'); // 날짜를 글자로 저장
  }
  return sheet;
}

// 색을 고를 때마다 한 줄 기록 (saveBoardMemo 에서 호출)
function colorLogAppend_(key, colorEn, writer) {
  try {
    var ko = COLOR_KO[String(colorEn || '').trim()];
    if (!ko || !key) return;
    var now = new Date();
    var sheet = getOrCreateColorSheet_();
    var row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1).setNumberFormat('@');
    sheet.getRange(row, 1, 1, 5).setValues([[
      colorDayString_(now), String(key), String(writer || '동료기사'), ko,
      Utilities.formatDate(now, 'GMT+9', 'HH:mm:ss')
    ]]);
  } catch (err) {
    Logger.log('❌ colorLogAppend_ 오류: ' + err.toString());
  }
}

// 하루가 바뀌었으면 밀린 날짜를 하나씩 집계해서 '가장 많이 고른 색'으로 바꿈
function colorRolloverIfNeeded_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var today = colorDayString_(new Date());
    var last = props.getProperty('COLOR_ROLLOVER_DONE');   // 집계를 마친 마지막 날짜
    var yesterday = colorDayString_(new Date(Date.now() - 24 * 3600 * 1000));
    if (!last) { props.setProperty('COLOR_ROLLOVER_DONE', yesterday); return; }  // 처음 설치: 과거는 건드리지 않음
    if (last >= yesterday) return;                          // 이미 오늘 처리함

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(8000)) return;                        // 동시에 실행 중이면 이번엔 건너뜀
    try {
      last = props.getProperty('COLOR_ROLLOVER_DONE');
      if (last >= yesterday) return;
      var sheet = getOrCreateColorSheet_();
      var data = sheet.getDataRange().getValues();
      var d = colorNextDay_(last);
      while (d <= yesterday) {
        colorTallyDay_(data, d);
        props.setProperty('COLOR_ROLLOVER_DONE', d);
        d = colorNextDay_(d);
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    Logger.log('❌ colorRolloverIfNeeded_ 오류: ' + err.toString());
  }
}

function colorNextDay_(dayStr) {
  var p = dayStr.split('-');
  var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + 1));
  return Utilities.formatDate(dt, 'UTC', 'yyyy-MM-dd');
}

// 한 날짜의 기록에서 묶음(노선+순번)마다 1등 색을 찾아 BOARD_DB 에 반영
function colorTallyDay_(data, dayStr) {
  var perKey = {};   // key → { counts:{색:횟수}, lastIdx:{색:마지막 줄 번호} }
  for (var i = 1; i < data.length; i++) {
    var rawDay = data[i][0];
    var day = (rawDay instanceof Date) ? Utilities.formatDate(rawDay, 'GMT+9', 'yyyy-MM-dd') : String(rawDay || '').trim();
    if (day !== dayStr) continue;
    var key = String(data[i][1] || '').trim();
    var en = COLOR_EN[String(data[i][3] || '').trim()];
    if (!key || !en) continue;
    if (!perKey[key]) perKey[key] = { counts: {}, lastIdx: {} };
    perKey[key].counts[en] = (perKey[key].counts[en] || 0) + 1;
    perKey[key].lastIdx[en] = i;
  }
  Object.keys(perKey).forEach(function (key) {
    var info = perKey[key], best = '', bestN = -1, bestIdx = -1;
    Object.keys(info.counts).forEach(function (c) {
      var n = info.counts[c], idx = info.lastIdx[c];
      if (n > bestN || (n === bestN && idx > bestIdx)) { best = c; bestN = n; bestIdx = idx; }
    });
    if (best) saveBoardMemo('DIFFICULTY', key, best, COLOR_AUTO_WRITER);
  });
}
