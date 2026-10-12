// ================================================================
// 🎨 난이도 색 선택 기록 + 하루 바뀔 때 '가장 많이 고른 색' 자동 반영
//
//  [기록] 사용자가 색을 고를 때마다 시트 '색선택'에 한 줄씩 쌓입니다.
//         날짜 | 노선+순번 | 이름 | 색 | 시각
//         (노선+순번 예: 202평일16대1순번 — 이 묶음이 한 단위)
//  [표시 규칙]
//    1) 하루 중에는 '마지막에 고른 사람의 색'이 앱에 보입니다.
//    2) 하루가 바뀌면, 가장 최근 기록 날의 최다 색이 보입니다.
//       (동점이면 동점 색들 중 가장 나중에 고른 색)
//  [저장 위치] 색은 이 '색선택' 시트에만 저장됩니다. (BOARD_DB 에는 쓰지 않음)
//  [하루가 바뀌는 시간] COLOR_DAY_START_HOUR (0 = 자정, 4 = 새벽 4시)
//  BOARD_DB.js 의 loadBoardMemo / saveBoardMemo 가 DIFFICULTY 일 때 여기로 넘깁니다.
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

// 현재 보여 줄 색 (색선택 시트만 읽음)
//  - 오늘(하루 시작 시각 기준) 기록이 있으면 마지막에 고른 색
//  - 없으면 기록이 있는 가장 최근 날의 최다 색 (동점이면 동점 색 중 가장 나중에 고른 색)
function colorCurrent_(key) {
  try {
    key = String(key || '').trim();
    if (!key) return { color: '', writer: '' };
    var sheet = getOrCreateColorSheet_();
    var data = sheet.getDataRange().getValues();
    var today = colorDayString_(new Date());
    var perDay = {};   // 날짜 → { counts, lastIdx }
    var latestPrev = '';
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][1] || '').trim() !== key) continue;
      var en = COLOR_EN[String(data[i][3] || '').trim()];
      if (!en) continue;
      var rawDay = data[i][0];
      var day = (rawDay instanceof Date) ? Utilities.formatDate(rawDay, 'GMT+9', 'yyyy-MM-dd') : String(rawDay || '').trim();
      if (day === today) return { color: en, writer: String(data[i][2] || '') };   // 가장 아래 = 마지막 선택
      if (day > today) continue;
      if (!latestPrev || day > latestPrev) latestPrev = day;
      var d = perDay[day] || (perDay[day] = { counts: {}, lastIdx: {} });
      d.counts[en] = (d.counts[en] || 0) + 1;
      if (d.lastIdx[en] === undefined) d.lastIdx[en] = i;   // 아래에서 위로 읽으므로 처음 만난 것이 가장 나중
    }
    if (!latestPrev) return { color: '', writer: '' };
    var info = perDay[latestPrev], best = '', bestN = -1, bestIdx = -1;
    Object.keys(info.counts).forEach(function (c) {
      var n = info.counts[c], idx = info.lastIdx[c];
      if (n > bestN || (n === bestN && idx > bestIdx)) { best = c; bestN = n; bestIdx = idx; }
    });
    return { color: best, writer: COLOR_AUTO_WRITER };
  } catch (err) {
    Logger.log('❌ colorCurrent_ 오류: ' + err.toString());
    return { color: '', writer: '' };
  }
}
