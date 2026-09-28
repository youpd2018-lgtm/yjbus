// =========================================================================
// 🔑 [Standard Master H열 고유키 일괄 생성 스크립트]
// - 노선(알파벳 포함) + 대수 + 순번(2자리) + 회차(2자리) 조합
// - 예: 202번 16대 1순번 1회차 -> 202160101
// - 예: 202A번 4대 10순번 2회차 -> 202A41002
// - 편집기 직접 실행 시 오류를 방지하기 위해 getUi() 팝업을 제거했습니다.
// =========================================================================
function generateUniqueKeysForStandardMaster() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("standard_master");

  if (!sheet) {
    console.log("❌ 오류: standard_master 시트를 찾을 수 없습니다.");
    return;
  }

  const lastRow = sheet.getLastRow();
  
  const headerCell = sheet.getRange("H1");
  headerCell.setValue("고유키").setFontWeight("bold").setBackground("#f3f3f3").setHorizontalAlignment("center");
  sheet.setColumnWidth(8, 120); // H열 너비 자동 조절

  if (lastRow < 2) {
    console.log("⚠️ 알림: 데이터가 없어 헤더만 생성했습니다.");
    return;
  }

  // A열(노선), B열(대수), C열(순번회차) 데이터 한 번에 읽기
  const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const keysToInsert = [];

  for (let i = 0; i < data.length; i++) {
    let route = String(data[i][0] || "").trim(); // 예: "202A" (알파벳 유지)
    let busCount = String(data[i][1] || "").replace(/[^0-9]/g, ''); // 예: "16" (숫자만 추출)
    let turnStr = String(data[i][2] || "").trim(); // 예: "1순번 1회차"

    let seq = 0;
    let turn = 0;

    // 순번과 회차에서 숫자 정밀 추출
    let match = turnStr.match(/(\d+)\s*순번.*?(\d+)\s*회차/);
    if (match) {
      seq = parseInt(match[1], 10);
      turn = parseInt(match[2], 10);
    } else {
      let nums = turnStr.match(/\d+/g);
      if (nums && nums.length >= 2) {
        seq = parseInt(nums[0], 10);
        turn = parseInt(nums[1], 10);
      } else if (nums && nums.length === 1) {
        seq = parseInt(nums[0], 10);
        turn = 1;
      }
    }

    // 순번과 회차를 무조건 2자리 숫자로 포맷팅 (예: 1 -> "01", 10 -> "10")
    let seqFormatted = String(seq).padStart(2, '0');
    let turnFormatted = String(turn).padStart(2, '0');

    // 고유키 조합 (띄어쓰기 없이 결합)
    let uniqueKey = route + busCount + seqFormatted + turnFormatted;
    
    // 배열에 1열(H열) 형태로 담기
    keysToInsert.push([uniqueKey]);
  }

  const targetRange = sheet.getRange(2, 8, keysToInsert.length, 1);
  targetRange.setValues(keysToInsert);
  targetRange.setHorizontalAlignment("center"); // 보기 좋게 가운데 정렬

  console.log("✅ 완료: 총 " + keysToInsert.length + "개의 고유 키가 H열에 성공적으로 생성되었습니다!");
}