/**
 * ==========================================================================
 * [노선마스터] L열 직접 타이핑 / 메뉴 증감 조절 ➔ M열 실시간 증감 반영 통합 엔진
 * ==========================================================================
 * ■ 주요 동작:
 *   1. L열 직접 타이핑 지원: '060111' 입력 시 '06:01:11'로 자동 변환 저장
 *   2. 직접 수정 시 M열 자동 반영: 원래 시간 대비 증감분(±)을 계산하여 M열에 기록
 *   3. 다른 행 변경 절대 금지: 선택/수정한 셀 외의 다른 정류장 시간은 1초도 이동 없음
 *   4. M1 동적 헤더 실시간 연동: 직접 타이핑 시에도 인가 총시간 대비 오차를 즉시 재계산
 *   5. 메뉴 증감 조절 기능 유지: 다중 행 드래그 균등 배분 및 자투리 초 마지막 셀 몰아주기
 * ==========================================================================
 */

// 🚌 영종운수 노선별 인가 기준 총 표준시간 (단위: 분)
const ROUTE_TOTAL_MINUTES = {
  '202': 288,   // 4시간 48분
  '203': 145,   // 2시간 25분
  '204': 225,   // 3시간 45분
  '205': 144,   // 2시간 24분
  '206': 155,   // 2시간 25분
  '221': 165,   // 2시간 45분
  '281': 185,   // 3시간 05분
  '282': 125,   // 2시간 05분
  '202A': 55,   // 편도 약 55분
  '203A': 50    // 편도 약 50분
};

// 1. 시트 상단 메뉴 등록
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🚌 소요시간 제어')
    .addItem('1. 선택 정류장 구간시간 증감 조절 (±)', 'adjustIndependentSegmentTimes')
    .addItem('2. 선택 노선 인가시간 합계 검증 (0초 확인)', 'checkTotalOffsetBalance')
    .addItem('3. M열 증감 기록 초기화 (작업 완료 후)', 'clearMColumnOffsets')
    .addItem('4. M1 헤더 표시 새로고침', 'refreshM1HeaderDisplay')
    .addSeparator()
    .addItem('⚠️ L/M열 전체 초기화 (J열 거리 비례 세팅)', 'resetRouteMasterLMColumns')
    .addToUi();
  addStopSyncMenu_();
}

/**
 * 2. [핵심] L열 직접 타이핑 수정 시 실시간 자동 감지 및 M열 반영 (onEdit 트리거)
 */
function onEdit(e) {
  if (!e || !e.range) return;

  const range = e.range;
  const sheet = range.getSheet();

  // 대상: '노선마스터' 시트, L열(12열), 2행 이하, 단일 셀 수정인 경우만 실행
  if (sheet.getName().trim() !== '노선마스터' || range.getColumn() !== 12 || range.getRow() < 2 || range.getNumRows() > 1) {
    return;
  }

  const targetRow = range.getRow();
  const rawInput = String(e.value !== undefined ? e.value : range.getDisplayValue()).trim();
  const oldValueRaw = String(e.oldValue !== undefined ? e.oldValue : '').trim();

  if (!rawInput || rawInput === '-') return;

  // 1) 입력값을 hh:mm:ss 형식 문자열로 정규화
  const formattedTime = formatRawInputToHms(rawInput);
  if (!formattedTime) return;

  const newSec = parseTimeToSec(formattedTime);
  const oldSec = parseTimeToSec(oldValueRaw);

  // 2) L열 본인 셀을 표준 hh:mm:ss 문자열 서식으로 확정 저장
  range.setNumberFormat('@').setValue(formattedTime);

  // 3) 이전 시간(oldValue)이 존재하는 경우 직접 수정에 따른 증감분(±)을 M열에 기록
  if (oldSec !== null && newSec !== null) {
    const diffSec = newSec - oldSec;
    const mCell = sheet.getRange(targetRow, 13);
    const prevMDiff = parseOffsetFromMCell(mCell.getValue());
    const finalMDiff = prevMDiff + diffSec;

    if (finalMDiff === 0) {
      mCell.clearContent().setBackground('#FFFFFF');
    } else {
      const signText = (finalMDiff > 0 ? '+' : '-') + formatSecToHms(Math.abs(finalMDiff));
      mCell.setNumberFormat('@')
        .setValue(signText)
        .setBackground(finalMDiff < 0 ? '#FCE8E6' : '#E8F0FE')
        .setFontColor(finalMDiff < 0 ? '#CC0000' : '#1A73E8')
        .setFontWeight('bold')
        .setFontSize(9)
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle');
    }
    sheet.autoResizeColumn(13);
  }

  // 4) 현재 수정된 노선 블록을 감지해 M1 헤더의 인가시간 오차를 즉각 갱신
  updateM1HeaderForTargetRow(sheet, targetRow);
}

/**
 * 3. [메뉴 기능 1] 선택 정류장(들) 구간소요시간 직접 증감 조절 (다중 선택 및 자투리 처리)
 */
function adjustIndependentSegmentTimes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const ui = SpreadsheetApp.getUi();

  if (sheet.getName().trim() !== '노선마스터') {
    ui.alert("'노선마스터' 시트에서 실행해 주세요.");
    return;
  }

  const range = sheet.getActiveRange();
  if (range.getColumn() !== 12) {
    ui.alert("L열(구간소요시간)의 정류장 셀을 선택 후 실행해 주세요.");
    return;
  }

  const startRow = range.getRow();
  const numRows = range.getNumRows();
  const endRow = startRow + numRows - 1;

  let promptMsg = '';
  if (numRows === 1) {
    const curVal = sheet.getRange(startRow, 12).getDisplayValue();
    promptMsg = `【선택 정류장】: ${startRow}행 (현재 구간시간: ${curVal})\n\n줄이거나 늘릴 시간을 입력하세요.\n(줄일 때: -1분, -45초, -01:00)\n(늘릴 때: +30초, +1분30초, +01:30)`;
  } else {
    promptMsg = `【선택 정류장 수】: ${numRows}개 (${startRow}행 ~ ${endRow}행)\n\n이 구간 전체에 적용할 총 증감 시간을 입력하세요.\n자투리 초는 마지막 정류장에 합산됩니다.\n(예: -5분, +3분, -300초, +180초)`;
  }

  const prompt = ui.prompt('구간 소요시간 직접 조정', promptMsg, ui.ButtonSet.OK_CANCEL);
  if (prompt.getSelectedButton() !== ui.Button.OK) return;

  const totalDiffSec = parseInputOffsetToSeconds(prompt.getResponseText().trim());
  if (totalDiffSec === 0) {
    ui.alert("조정할 시간 값이 0이거나 올바르지 않습니다.");
    return;
  }

  const lRange = sheet.getRange(startRow, 12, numRows, 1);
  const mRange = sheet.getRange(startRow, 13, numRows, 1);
  const lValues = lRange.getValues();
  const mValues = mRange.getValues();

  const baseDiff = Math.trunc(totalDiffSec / numRows);
  const remainder = totalDiffSec % numRows;

  for (let i = 0; i < numRows; i++) {
    const thisDiff = (i === numRows - 1) ? (baseDiff + remainder) : baseDiff;
    const curSec = parseTimeToSec(lValues[i][0]);

    if (curSec !== null) {
      const newSec = Math.max(0, curSec + thisDiff);
      lValues[i][0] = formatSecToHms(newSec);

      const prevMDiff = parseOffsetFromMCell(mValues[i][0]);
      const finalMDiff = prevMDiff + thisDiff;

      if (finalMDiff === 0) {
        mValues[i][0] = '';
      } else {
        mValues[i][0] = (finalMDiff > 0 ? '+' : '-') + formatSecToHms(Math.abs(finalMDiff));
      }
    }
  }

  lRange.setNumberFormat('@').setValues(lValues);
  mRange.setNumberFormat('@').setValues(mValues);

  const mBgs = [];
  const mFgs = [];
  for (let i = 0; i < numRows; i++) {
    const val = String(mValues[i][0] || '').trim();
    if (val.startsWith('-')) {
      mBgs.push(['#FCE8E6']);
      mFgs.push(['#CC0000']);
    } else if (val.startsWith('+')) {
      mBgs.push(['#E8F0FE']);
      mFgs.push(['#1A73E8']);
    } else {
      mBgs.push(['#FFFFFF']);
      mFgs.push(['#000000']);
    }
  }
  mRange.setBackgrounds(mBgs).setFontColors(mFgs).setHorizontalAlignment('center').setVerticalAlignment('middle').setFontSize(9);
  sheet.autoResizeColumn(13);

  updateM1HeaderForTargetRow(sheet, startRow);
}

/**
 * 4. M1 헤더에 현재 선택된 노선의 인가 총시간 및 오차 실시간 표기
 */
function updateM1HeaderForTargetRow(sheet, targetRow) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const block = getRouteBlockByRow(sheet, targetRow || sheet.getActiveCell().getRow(), lastRow);
  if (!block) return 0;

  const routeName = block.routeName;
  const targetMinutes = ROUTE_TOTAL_MINUTES[routeName] || 150;
  const targetTotalSec = targetMinutes * 60;

  const numRows = block.endRow - block.startRow + 1;
  const lVals = sheet.getRange(block.startRow, 12, numRows, 1).getValues();

  let currentSumSec = 0;
  for (let i = 0; i < numRows; i++) {
    const s = parseTimeToSec(lVals[i][0]);
    if (s !== null) currentSumSec += s;
  }

  const diffFromTarget = currentSumSec - targetTotalSec;
  const m1 = sheet.getRange('M1');

  if (diffFromTarget === 0) {
    m1.setValue(`[${routeName}번 인가총시간]\n${formatSecToHms(targetTotalSec)}\n(현재합계 일치: 0초)`)
      .setBackground('#E6F4EA')
      .setFontColor('#137333')
      .setFontWeight('bold')
      .setFontSize(9)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true);
  } else {
    const sign = diffFromTarget > 0 ? '+' : '-';
    m1.setValue(`[${routeName}번 인가: ${formatSecToHms(targetTotalSec)}]\n현재합: ${formatSecToHms(currentSumSec)}\n(오차: ${sign}${formatSecToHms(Math.abs(diffFromTarget))})`)
      .setBackground('#FCE8E6')
      .setFontColor('#CC0000')
      .setFontWeight('bold')
      .setFontSize(9)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true);
  }

  return diffFromTarget;
}

/**
 * 5. 특정 행이 속한 노선 블록 탐색
 */
function getRouteBlockByRow(sheet, rowIdx, lastRow) {
  const metaRange = sheet.getRange(1, 1, lastRow, 4).getValues();
  let startRow = rowIdx;
  let detectedRoute = '';

  for (let r = rowIdx - 1; r >= 1; r--) {
    const rowStr = metaRange[r].slice(0, 4).join(' ');
    const hasData = metaRange[r].some(c => c !== '' && c !== null && c !== undefined);

    if (!hasData) {
      startRow = r + 2;
      break;
    }

    for (const rKey in ROUTE_TOTAL_MINUTES) {
      const reg = new RegExp(`(^|[^0-9A-Za-z])${rKey}([^0-9A-Za-z]|$)`);
      if (reg.test(rowStr)) {
        if (!detectedRoute) detectedRoute = rKey;
      }
    }
    if (r === 1) startRow = 2;
  }

  if (!detectedRoute) detectedRoute = '202';

  let endRow = rowIdx;
  for (let r = rowIdx - 1; r < lastRow; r++) {
    const hasData = metaRange[r].some(c => c !== '' && c !== null && c !== undefined);
    if (!hasData) {
      endRow = r;
      break;
    }
    if (r === lastRow - 1) endRow = lastRow;
  }

  return { startRow: Math.min(startRow, rowIdx), endRow: Math.max(endRow, rowIdx), routeName: detectedRoute };
}

/**
 * 6. M1 헤더 새로고침
 */
function refreshM1HeaderDisplay() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  if (sheet.getName().trim() !== '노선마스터') return;

  const curRow = sheet.getActiveCell().getRow();
  updateM1HeaderForTargetRow(sheet, curRow >= 2 ? curRow : 2);
  ss.toast('M1 헤더가 새로고침되었습니다.', '완료', 3);
}

/**
 * 7. 인가시간 검증 팝업
 */
function checkTotalOffsetBalance() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const ui = SpreadsheetApp.getUi();
  if (sheet.getName().trim() !== '노선마스터') return;

  const curRow = sheet.getActiveCell().getRow();
  const block = getRouteBlockByRow(sheet, curRow >= 2 ? curRow : 2, sheet.getLastRow());
  const diff = updateM1HeaderForTargetRow(sheet, curRow);

  if (diff === 0) {
    ui.alert(`✅ [${block.routeName}번] 검증 완료\n\n${block.routeName}번 소요시간 합계가 인가 총시간과 정확히 일치합니다.`);
  } else {
    const sign = diff > 0 ? '+' : '-';
    ui.alert(`⚠️ [${block.routeName}번] 오차 발생 (${sign}${formatSecToHms(Math.abs(diff))})\n\n정류장별 소요시간의 합이 인가 기준 시간과 맞지 않습니다.\nM열을 확인해 시간을 맞춰주세요.`);
  }
}

/**
 * 8. M열 증감 기록 초기화
 */
function clearMColumnOffsets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const ui = SpreadsheetApp.getUi();
  if (sheet.getName().trim() !== '노선마스터') return;

  const res = ui.alert("M열 증감 기록 초기화", "M열의 ± 증감 내역을 지우시겠습니까?\n(L열 구간소요시간은 유지됩니다)", ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, 13, lastRow - 1, 1).clearContent().setBackground('#FFFFFF');
  }
  updateM1HeaderForTargetRow(sheet, sheet.getActiveCell().getRow());
}

/**
 * 9. 최초 1회 초기화: J열 거리 비례 세팅
 */
function resetRouteMasterLMColumns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('노선마스터');
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  sheet.getRange(1, 12).setValue('구간소요시간').setFontWeight('bold').setBackground('#1E293B').setFontColor('#FFFFFF').setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.getRange(1, 13).setValue('증감합계: 0초\n(완료)').setFontWeight('bold').setBackground('#E6F4EA').setFontColor('#137333').setFontSize(9).setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);

  const values = sheet.getRange(1, 1, lastRow, 10).getValues();
  const blocks = [];
  let curBlock = [];

  for (let r = 1; r < lastRow; r++) {
    const hasData = values[r].some(c => c !== '' && c !== null && c !== undefined);
    if (hasData) {
      curBlock.push({ rowIndex: r + 1, data: values[r] });
    } else {
      if (curBlock.length > 0) { blocks.push(curBlock); curBlock = []; }
    }
  }
  if (curBlock.length > 0) blocks.push(curBlock);

  const outputL = Array.from({ length: lastRow - 1 }, () => ['']);
  const outputM = Array.from({ length: lastRow - 1 }, () => ['']);

  blocks.forEach(block => {
    let detected = '';
    for (const item of block) {
      const rowStr = item.data.slice(0, 4).join(' ');
      for (const rKey in ROUTE_TOTAL_MINUTES) {
        if (new RegExp(`(^|[^0-9A-Za-z])${rKey}([^0-9A-Za-z]|$)`).test(rowStr)) {
          detected = rKey; break;
        }
      }
      if (detected) break;
    }

    const totalSec = (ROUTE_TOTAL_MINUTES[detected] || 150) * 60;
    const dists = block.map(item => parseFloat(String(item.data[9] || '').replace(/[^0-9.]/g, '')) || 0);
    const sumDist = dists.reduce((a, b) => a + b, 0);
    const bLen = block.length;
    let accSec = 0;

    block.forEach((item, idx) => {
      const rIdx = item.rowIndex - 2;
      if (sumDist <= 0) { outputL[rIdx] = ['00:00:00']; return; }
      if (idx === bLen - 1) {
        outputL[rIdx] = [formatSecToHms(Math.max(0, totalSec - accSec))];
      } else {
        const calcSec = Math.round((dists[idx] / sumDist) * totalSec);
        accSec += calcSec;
        outputL[rIdx] = [formatSecToHms(calcSec)];
      }
    });

    const sRow = block[0].rowIndex;
    const eRow = block[bLen - 1].rowIndex;
    sheet.getRange(sRow, 1, bLen, 13).setBorder(true, true, true, true, true, true, '#D0D7DE', SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(sRow, 1, 1, 13).setBorder(true, null, null, null, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    sheet.getRange(eRow, 1, 1, 13).setBorder(null, null, true, null, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  });

  sheet.getRange(2, 12, lastRow - 1, 1).setValues(outputL).setNumberFormat('@').setHorizontalAlignment('center').setVerticalAlignment('middle').setFontSize(10);
  sheet.getRange(2, 13, lastRow - 1, 1).setValues(outputM).setBackground('#FFFFFF').setFontColor('#000000').setFontWeight('normal');

  sheet.autoResizeColumn(12);
  sheet.autoResizeColumn(13);
  updateM1HeaderForTargetRow(sheet, 2);
  ss.toast('L열 및 M열 초기화 완료', '성공', 5);
}

// ======================= 유틸리티 헬퍼 =======================

/**
 * 060111, 1530 등의 다양한 입력을 hh:mm:ss 형식으로 정규화
 */
function formatRawInputToHms(input) {
  if (!input) return null;
  const clean = input.replace(/\s+/g, '');

  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(clean)) {
    const parts = clean.split(':').map(p => p.padStart(2, '0'));
    return parts.length === 2 ? `00:${parts[0]}:${parts[1]}` : parts.join(':');
  }

  const numOnly = clean.replace(/[^0-9]/g, '');
  if (!numOnly) return null;

  if (numOnly.length === 5 || numOnly.length === 6) {
    const p = numOnly.padStart(6, '0');
    return `${p.substring(0, 2)}:${p.substring(2, 4)}:${p.substring(4, 6)}`;
  } else if (numOnly.length === 3 || numOnly.length === 4) {
    const p = numOnly.padStart(4, '0');
    return `00:${p.substring(0, 2)}:${p.substring(2, 4)}`;
  } else if (numOnly.length <= 2) {
    return `00:00:${numOnly.padStart(2, '0')}`;
  }
  return null;
}

function parseOffsetFromMCell(val) {
  if (!val) return 0;
  const str = String(val).trim();
  if (!str.startsWith('+') && !str.startsWith('-')) return 0;
  const sign = str.startsWith('-') ? -1 : 1;
  const sec = parseTimeToSec(str.substring(1));
  return sec !== null ? sign * sec : 0;
}

function parseInputOffsetToSeconds(text) {
  if (!text) return 0;
  let clean = text.replace(/\s+/g, '');
  let sign = 1;
  if (clean.startsWith('+')) { sign = 1; clean = clean.substring(1); }
  else if (clean.startsWith('-')) { sign = -1; clean = clean.substring(1); }

  let totalSec = 0;
  const minM = clean.match(/(\d+)분/);
  const secM = clean.match(/(\d+)초/);
  if (minM) totalSec += parseInt(minM[1], 10) * 60;
  if (secM) totalSec += parseInt(secM[1], 10);

  if (!minM && !secM) {
    const parts = clean.split(':').map(p => parseInt(p, 10));
    if (parts.length === 3 && !parts.some(isNaN)) totalSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2 && !parts.some(isNaN)) totalSec = parts[0] * 60 + parts[1];
    else {
      const num = parseInt(clean.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(num)) totalSec = num * 60;
    }
  }
  return sign * totalSec;
}

function parseTimeToSec(val) {
  if (!val || val === '-') return null;
  if (val instanceof Date) return val.getHours() * 3600 + val.getMinutes() * 60 + val.getSeconds();
  const parts = String(val).trim().split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function formatSecToHms(sec) {
  const s = Math.max(0, Math.floor(sec));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}


