// 사용 기록: 시트 '사용기록'에 (날짜, 이름) 한 줄씩 쌓는다. 앱·라이브 모달·노선지도 이용 시간(초)과 구차장 횟수.
const USAGE_SHEET_NAME = '사용기록';

// delta: { app, live, map, gem } (모두 숫자, 더해짐)
function usageAdd_(name, delta) {
  if (!name) return;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sh = ss.getSheetByName(USAGE_SHEET_NAME);
    if (!sh) {
      sh = ss.insertSheet(USAGE_SHEET_NAME);
      sh.appendRow(['날짜', '이름', '앱(분)', '라이브모달(분)', '노선지도(분)', '구차장(횟수)']);
      sh.setFrozenRows(1);
    }
    const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    const last = sh.getLastRow();
    let row = -1;
    if (last > 1) {
      // 오늘 줄은 맨 아래쪽에 모여 있으므로 아래에서 최대 300줄만 훑는다
      const from = Math.max(2, last - 299);
      const vals = sh.getRange(from, 1, last - from + 1, 2).getDisplayValues();
      for (let i = vals.length - 1; i >= 0; i--) {
        if (vals[i][0] === today && vals[i][1] === name) { row = from + i; break; }
      }
    }
    const m = function (s) { return Math.round((Number(s) || 0) / 6) / 10; }; // 초 → 분(소수 1자리)
    if (row < 0) {
      sh.appendRow([today, name, m(delta.app), m(delta.live), m(delta.map), Number(delta.gem) || 0]);
      sh.getRange(sh.getLastRow(), 1).setNumberFormat('@').setValue(today);
    } else {
      const cur = sh.getRange(row, 3, 1, 4).getValues()[0];
      sh.getRange(row, 3, 1, 4).setValues([[
        Math.round((Number(cur[0]) + m(delta.app)) * 10) / 10,
        Math.round((Number(cur[1]) + m(delta.live)) * 10) / 10,
        Math.round((Number(cur[2]) + m(delta.map)) * 10) / 10,
        (Number(cur[3]) || 0) + (Number(delta.gem) || 0)
      ]]);
    }
  } catch (err) {
    // 기록 실패가 앱 동작을 막지 않게 조용히 넘긴다
  } finally {
    try { lock.releaseLock(); } catch (e2) { }
  }
}

// 앱이 보내는 이용 시간(초)
function usageSave_(viewer, d) {
  if (!viewer || !viewer.name) return { success: false };
  const cap = function (x) { x = Number(x) || 0; return x < 0 ? 0 : Math.min(x, 3600); }; // 한 번에 최대 1시간
  usageAdd_(viewer.name, { app: cap(d.app), live: cap(d.live), map: cap(d.map) });
  return { success: true };
}
