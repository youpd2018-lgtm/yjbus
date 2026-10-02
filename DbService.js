// ================================================================
// 💾 [스프레드시트 DB 서비스] DbService.js
// ================================================================

function saveToServer(key, value) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('DB') || ss.insertSheet('DB');
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === key) { rowIndex = i + 1; break; }
  }
  const strValue = typeof value === 'object' ? JSON.stringify(value) : value;
  if (rowIndex > 0) sheet.getRange(rowIndex, 2).setValue(strValue);
  else sheet.appendRow([key, strValue]);
  return true;
}

function loadFromServer() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('DB');
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const result = {};
  for (let i = 0; i < data.length; i++) {
    if (data[i][0]) result[data[i][0]] = data[i][1];
  }
  return result;
}

function loadKeyFromServer(key) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('DB');
  if (!sheet) return "";
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return "";
}

// 🔎 [점검용] DB 시트의 키를 종류별로 세어 로그에 보여 준다 (값은 출력하지 않음). 편집기에서 실행.
function auditDbKeys() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('DB');
  if (!sheet) { console.log('DB 시트가 없습니다.'); return; }
  const data = sheet.getDataRange().getValues();
  const groups = {};
  data.forEach(function (row) {
    const k = String(row[0] || '');
    if (!k) return;
    const g = k
      .replace(/\d{4}-\d{2}-\d{2}/g, '<날짜>')
      .replace(/^(jpil_user_)[^_]+(_.*)$/, '$1<이름>$2')
      .replace(/^(fcm_)[^_]+(_.*)$/, '$1<이름>$2')
      .replace(/^(yeongjong_(?:first_header|seq_header|shared_tt)_).*$/, '$1<노선_순번>')
      .replace(/^(yeongjong_header_).*$/, '$1<키>');
    const len = String(row[1] === undefined ? '' : row[1]).length;
    if (!groups[g]) groups[g] = { n: 0, chars: 0 };
    groups[g].n++;
    groups[g].chars += len;
  });
  Object.keys(groups).sort().forEach(function (g) {
    console.log(groups[g].n + '개 | ' + groups[g].chars + '자 | ' + g);
  });
  console.log('총 ' + data.length + '행');
}

// 🧹 [정리용] DB 시트에서 이미 GitHub에 있는 자료의 사본만 지운다. 개인정보·메모·푸시 등록·사용자 목록 등 나머지 키는 절대 지우지 않는다.
//   previewCleanDb() : 지울 대상 개수만 로그로 보여 준다 (지우지 않음)
//   runCleanDb()     : 실제로 지운다 (실행 전 시트 사본(백업) 필수)
function dbCleanTargets_(rows) {
  // 직접 고친 근무(schededit)가 있는 날짜의 sched 는 남긴다
  const keep = {};
  rows.forEach(function (r) {
    const m = String(r[0] || '').match(/^jpil_user_(.+)_schededit_(\d{4}-\d{2}-\d{2})$/);
    if (m) keep['jpil_user_' + m[1] + '_sched_' + m[2]] = true;
  });
  return function isTarget(key) {
    key = String(key || '');
    if (!key) return false;
    if (/^jpil_user_.+_sched_\d{4}-\d{2}-\d{2}$/.test(key)) return !keep[key];
    if (/^yeongjong_(first_header|seq_header|shared_tt)_/.test(key)) return true;
    if (key === 'yeongjong_shared_routeDataMap') return true;
    return false;
  };
}

function previewCleanDb() { dbCleanRun_(false); }
function runCleanDb() { dbCleanRun_(true); }

function dbCleanRun_(execute) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('DB');
  if (!sheet) { console.log('DB 시트가 없습니다.'); return; }
  const rows = sheet.getDataRange().getValues();
  const isTarget = dbCleanTargets_(rows);
  const kept = [], removed = {};
  rows.forEach(function (r) {
    if (isTarget(r[0])) {
      const g = String(r[0]).replace(/\d{4}-\d{2}-\d{2}/g, '<날짜>').replace(/^(jpil_user_)[^_]+(_.*)$/, '$1<이름>$2').replace(/^(yeongjong_(?:first_header|seq_header|shared_tt)_).*$/, '$1<노선_순번>');
      removed[g] = (removed[g] || 0) + 1;
    } else kept.push(r);
  });
  Object.keys(removed).forEach(function (g) { console.log('지울 대상 ' + removed[g] + '개 | ' + g); });
  console.log('전체 ' + rows.length + '행 → 남는 행 ' + kept.length + '개');
  if (!execute) { console.log('미리보기만 했습니다. 지우지 않았습니다.'); return; }
  if (kept.length === rows.length) { console.log('지울 것이 없습니다.'); return; }
  const width = Math.max(2, sheet.getLastColumn());
  const out = kept.map(function (r) { const a = r.slice(0, width); while (a.length < width) a.push(''); return a; });
  sheet.getRange(1, 1, rows.length, width).clearContent();
  if (out.length) sheet.getRange(1, 1, out.length, width).setValues(out);
  console.log('정리 완료: ' + (rows.length - kept.length) + '행을 지웠습니다.');
}
