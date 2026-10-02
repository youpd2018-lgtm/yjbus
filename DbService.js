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
