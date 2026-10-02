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
