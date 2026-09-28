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
// 📝 [BOARD_DB] 글 저장 (신규 행 추가)
// ================================================================
function saveBoardItem(item) {
  try {
    const sheet = getOrCreateBoardSheet();
    const id = item.id || ('msg_' + Date.now());
    const category = item.category || 'ROUTE'; // ROUTE, SHIFT, MEMO, MESSAGE
    const targetKey = String(item.targetKey || '').trim();
    const writer = item.writer || '동료기사';
    const title = item.title || '';
    const content = item.content || '';
    const timestamp = item.timestamp || Utilities.formatDate(new Date(), "GMT+9", "yyyy-MM-dd HH:mm");

    // [A: id, B: category, C: targetKey, D: writer, E: title, F: content, G: timestamp]
    sheet.appendRow([id, category, targetKey, writer, title, content, timestamp]);
    return { success: true, id: id };
  } catch (err) {
    Logger.log("❌ saveBoardItem 오류: " + err.toString());
    return { success: false, error: err.toString() };
  }
}

// ================================================================
// 🔍 [BOARD_DB] 글 목록 조회 (카테고리 및 타겟 키 기준 필터링)
// ================================================================
function getBoardItems(category, targetKey) {
  try {
    const sheet = getOrCreateBoardSheet();
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, items: [] };

    const items = [];
    const cleanTargetKey = String(targetKey || '').trim();

    // 2행부터 순회 (최신 글이 위로 오도록 역순 탐색)
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      const rowCategory = String(row[1]).trim();
      const rowTargetKey = String(row[2]).trim();

      // 조건: 카테고리 일치 & targetKey 일치 (MESSAGE나 빈 키인 경우 카테고리만 검사)
      const isTargetMatched = (category === 'MESSAGE' || !cleanTargetKey) 
        ? true 
        : (rowTargetKey === cleanTargetKey);

      if (rowCategory === category && isTargetMatched) {
        items.push({
  id: String(row[0] || ''),
  category: String(row[1] || ''),
  targetKey: String(row[2] || ''),
  writer: String(row[3] || ''),
  title: String(row[4] || ''),
  content: String(row[5] || ''),
  timestamp: row[6] instanceof Date 
    ? Utilities.formatDate(row[6], "GMT+9", "yyyy-MM-dd HH:mm") 
    : String(row[6] || '')
});
      }
    }

    return { success: true, items: items };
  } catch (err) {
    Logger.log("❌ getBoardItems 오류: " + err.toString());
    return { success: false, error: err.toString(), items: [] };
  }
}

// ================================================================
// ✏️ [BOARD_DB] 본인 확인 후 글 수정
// ================================================================
function updateBoardItem(id, currentUser, newTitle, newContent) {
  try {
    const sheet = getOrCreateBoardSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        const writer = String(data[i][3]).trim();
        // 본인 검증 (이름 포함 여부 체크)
        if (!writer.includes(currentUser) && !currentUser.includes(writer)) {
          return { success: false, message: "작성자 본인만 수정할 수 있습니다." };
        }
        
        // E열: title, F열: content 갱신 (1-based index: 5열, 6열)
        sheet.getRange(i + 1, 5).setValue(newTitle);
        sheet.getRange(i + 1, 6).setValue(newContent);
        return { success: true };
      }
    }
    return { success: false, message: "해당 글을 찾을 수 없습니다." };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ================================================================
// 🗑️ [BOARD_DB] 본인 확인 후 글 삭제
// ================================================================
function deleteBoardItem(id, currentUser) {
  try {
    const sheet = getOrCreateBoardSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        const writer = String(data[i][3]).trim();
        // 본인 검증
        if (!writer.includes(currentUser) && !currentUser.includes(writer)) {
          return { success: false, message: "작성자 본인만 삭제할 수 있습니다." };
        }
        
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, message: "해당 글을 찾을 수 없습니다." };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ================================================================
// 📋 [BOARD_DB] 단일 메모 로드 (ROUTE / SHIFT / MEMO 전용)
// ================================================================
function loadBoardMemo(category, targetKey) {
  try {
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