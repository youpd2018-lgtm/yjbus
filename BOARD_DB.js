// BORDER.gs 상단에 이 함수가 반드시 함께 정의되어 있어야 합니다!
function getOrCreateBoardSheet() {
  const ss = (typeof SHEET_ID !== 'undefined' && SHEET_ID)
    ? SpreadsheetApp.openById(SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  
  let sheet = ss.getSheetByName("BOARD_DB");
  if (!sheet) {
    sheet = ss.insertSheet("BOARD_DB");
    const headers = [["id", "category", "targetKey", "writer", "title", "content", "timestamp"]];
    sheet.getRange(1, 1, 1, 7).setValues(headers);
  }
  return sheet;
}


// ================================================================
// 📋 [BOARD_DB] 단일 메모 로드 (ROUTE / SHIFT / MEMO 전용)
// ================================================================
function loadBoardMemo(category, targetKey) {
  try {
    if (String(category || '').trim().toUpperCase() === 'DIFFICULTY' && typeof colorRolloverIfNeeded_ === 'function') colorRolloverIfNeeded_();  // 하루 바뀜 → 어제 최다 색 반영
    const sheet = getOrCreateBoardSheet();
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, content: "", writer: "" };

    const cleanCategory = String(category || '').trim().toUpperCase();
    const cleanKey = String(targetKey || '').trim();

    // 최신 행 우선 탐색
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      const rCat = String(row[1] || '').trim().toUpperCase();
      const rKey = String(row[2] || '').trim();

      if (rCat === cleanCategory && rKey === cleanKey) {
        return {
          success: true,
          id: String(row[0] || ''),
          category: rCat,
          targetKey: rKey,
          writer: String(row[3] || ''),
          content: String(row[5] || ''),
          timestamp: row[6] instanceof Date 
            ? Utilities.formatDate(row[6], "GMT+9", "yyyy-MM-dd HH:mm") 
            : String(row[6] || '')
        };
      }
    }
    return { success: true, content: "", writer: "" };
  } catch (err) {
    Logger.log("❌ loadBoardMemo 오류: " + err.toString());
    return { success: false, error: err.toString(), content: "" };
  }
}

// ================================================================
// 💾 [BOARD_DB] 단일 메모 저장/업데이트 (Upsert)
// ================================================================
function saveBoardMemo(category, targetKey, content, writer) {
  try {
    const sheet = getOrCreateBoardSheet();
    const data = sheet.getDataRange().getValues();

    const cleanCategory = String(category || '').trim().toUpperCase();
    const cleanKey = String(targetKey || '').trim();
    const isAnonymousCat = (cleanCategory === 'ROUTE' || cleanCategory === 'SHIFT');
    const cleanWriter = isAnonymousCat ? '' : (String(writer || '').trim() || '동료기사');
    const cleanContent = String(content || '');
    const nowTime = Utilities.formatDate(new Date(), "GMT+9", "yyyy-MM-dd HH:mm");

    // 🎨 난이도 색: 사람이 고른 것만 '색선택' 시트에 기록 (자동집계는 기록하지 않음)
    if (cleanCategory === 'DIFFICULTY' && String(writer || '').trim() !== '자동집계' && typeof colorLogAppend_ === 'function') {
      if (typeof colorRolloverIfNeeded_ === 'function') colorRolloverIfNeeded_();
      colorLogAppend_(cleanKey, cleanContent, writer);
    }

    let targetRowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      const rCat = String(data[i][1] || '').trim().toUpperCase();
      const rKey = String(data[i][2] || '').trim();
      if (rCat === cleanCategory && rKey === cleanKey) {
        targetRowIndex = i + 1; // 1-based row index
        break;
      }
    }

    if (targetRowIndex > 0) {
      // D열: writer, E열: title, F열: content, G열: timestamp
      sheet.getRange(targetRowIndex, 4).setValue(cleanWriter);
      sheet.getRange(targetRowIndex, 5).setValue(cleanCategory);
      sheet.getRange(targetRowIndex, 6).setValue(cleanContent);
      sheet.getRange(targetRowIndex, 7).setValue(nowTime);
    } else {
      const id = 'memo_' + Date.now();
      sheet.appendRow([id, cleanCategory, cleanKey, cleanWriter, cleanCategory, cleanContent, nowTime]);
    }
    return { success: true };
  } catch (err) {
    Logger.log("❌ saveBoardMemo 오류: " + err.toString());
    return { success: false, error: err.toString() };
  }
}