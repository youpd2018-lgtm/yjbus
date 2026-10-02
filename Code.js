// ================================================================
// 🌐 [웹앱 진입점] Code.js (v48)
// - 기능별 코드는 다음 모듈 파일들로 분리되어 관리됩니다:
//   1) Config.js       : SHEET_ID 및 서비스키 설정
//   2) BusApi.js       : TAGO 및 실시간 버스 위치 API
//   3) DbService.js    : 스프레드시트 DB 입출력 및 마스터 데이터
//   4) StandardTime.js : 고유키 기반 표준시간 정밀 대조 및 시간 포맷팅
// ================================================================

function doGet(e) {
  // 💡 [API 엔드포인트: Gemini 음성 비서 질의응답 (독립 웹앱 연동)]
  if (e && e.parameter && e.parameter.action === 'ask_gemini') {
    const query = e.parameter.query || "";
    const context = e.parameter.context || "";
    const answer = askGeminiVoiceAssistant(query, context);
    const result = { success: true, answer: answer };
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  // 💡 [API 엔드포인트: 일일근무표 시트의 오늘~N일 근무정보 (앱이 폰에 저장해 구차장이 사용)]
  if (e && e.parameter && e.parameter.action === 'get_daily_roster') {
    let res;
    try {
      res = getDailyRoster(parseInt(e.parameter.days, 10) || 5);
    } catch (err) {
      res = { success: false, error: err.toString() };
    }
    return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
  }

  // 💡 [API 엔드포인트: 실시간 DB 데이터 로드]
  if (e && e.parameter && e.parameter.action === 'load_from_server') {
    let dbData = {};
    try {
      dbData = loadFromServer();
    } catch(err) {
      dbData = { error: err.toString() };
    }
    const result = { success: true, data: dbData };
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  // 💡 [API 엔드포인트: 실시간 DB 데이터 저장]
  if (e && e.parameter && e.parameter.action === 'save_to_server') {
    const key = e.parameter.key;
    const value = e.parameter.value;
    try {
      saveToServer(key, value);
      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 💡 [API 엔드포인트: 실시간 버스 데이터 및 초기 설정]
  if (e && e.parameter && e.parameter.action === 'get_initial_data') {
    let busXml = "";
    try { busXml = getIncheonBusLive('202'); } catch(err) { busXml = ""; }
    const result = { success: true, busXml: busXml };
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  // 💡 [TAGO 정류장 ID 일괄 동기화 웹 엔드포인트]
  if (e && e.parameter && e.parameter.action === 'sync_stops') {
    var result = typeof syncTagoStopIdsToAllSheets === 'function'
      ? syncTagoStopIdsToAllSheets()
      : { success: false, error: "syncTagoStopIdsToAllSheets 함수 미정의" };
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  // 💡 [정류장 위도/경도(GPS) 일괄 동기화 웹 엔드포인트]
  if (e && e.parameter && (e.parameter.action === 'sync_stop_coordinates' || e.parameter.action === 'sync_coords')) {
    var result = typeof syncStopCoordinatesToStandardMaster === 'function'
      ? syncStopCoordinatesToStandardMaster()
      : { success: false, error: "syncStopCoordinatesToStandardMaster 함수 미정의" };
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  // 💡 [고유키 기반 표준시간 master 데이터 로드 엔드포인트]
  if (e && e.parameter && e.parameter.action === 'get_standard_master') {
    const key = e.parameter.key || e.parameter.uniqueKey || "";
    let result = { success: false, data: [] };
    try {
      result = typeof getStandardMasterForLiveByKey === 'function'
        ? getStandardMasterForLiveByKey(key)
        : { success: false, error: "getStandardMasterForLiveByKey 함수 미정의" };
    } catch(err) {
      result = { success: false, error: err.toString() };
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  // 💡 [노선 정류장 JSON 엔드포인트: 앱이 앵커시간으로 표준시간을 계산할 때 사용]
  if (e && e.parameter && e.parameter.action === 'get_route_stops') {
    let result;
    try {
      result = typeof getRouteStopsForApp === 'function'
        ? getRouteStopsForApp(e.parameter.route || "")
        : { success: false, error: "getRouteStopsForApp 함수 미정의" };
    } catch(err) {
      result = { success: false, error: err.toString() };
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  // 💡 [운행 습관 월 합계 조회: 근무통계 화면에서 사용]
  if (e && e.parameter && e.parameter.action === 'get_driving_habit') {
    const res = typeof getDrivingHabit === 'function'
      ? getDrivingHabit(e.parameter.driver || "", e.parameter.year || "", e.parameter.month || "")
      : { success: false, error: "getDrivingHabit 함수 미정의" };
    return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
  }

  if (e && e.parameter && e.parameter.action === 'get_sample_keys') {
    const res = typeof getSampleStandardMasterKeys === 'function' ? getSampleStandardMasterKeys() : { success: false };
    return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
  }

  // 💡 [단일 키 조회 엔드포인트: 오늘의 메모, 동료 메시지 등]
  if (e && e.parameter && e.parameter.action === 'load_key_from_server') {
    const key = e.parameter.key || "";
    let val = "";
    try {
      val = typeof loadKeyFromServer === 'function' ? loadKeyFromServer(key) : "";
    } catch(err) {
      val = "";
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true, value: val }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 💡 [단일 키 저장 엔드포인트: 오늘의 메모 등]
  if (e && e.parameter && e.parameter.action === 'save_key_to_server') {
    const key = e.parameter.key || "";
    const value = e.parameter.value || "";
    try {
      if (typeof saveToServer === 'function') saveToServer(key, value);
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 💡 [BOARD_DB 메모 로드 엔드포인트: 노선정보, 교대정보, 오늘의메모]
  if (e && e.parameter && e.parameter.action === 'load_board_memo') {
    const category = e.parameter.category || "";
    const targetKey = e.parameter.targetKey || "";
    let res = { success: false, content: "" };
    try {
      res = typeof loadBoardMemo === 'function' ? loadBoardMemo(category, targetKey) : { success: false, content: "" };
    } catch(err) {
      res = { success: false, error: err.toString(), content: "" };
    }
    return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
  }

  // 💡 [BOARD_DB 메모 저장 엔드포인트: 노선정보, 교대정보, 오늘의메모]
  if (e && e.parameter && (e.parameter.action === 'save_board_memo' || e.parameter.action === 'save_board_item')) {
    const category = e.parameter.category || "";
    const targetKey = e.parameter.targetKey || "";
    const content = e.parameter.content || "";
    const writer = e.parameter.writer || "";
    let res = { success: false };
    try {
      res = typeof saveBoardMemo === 'function' ? saveBoardMemo(category, targetKey, content, writer) : { success: false };
    } catch(err) {
      res = { success: false, error: err.toString() };
    }
    return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
  }

  // 💡 [국토교통부 ITS 실시간 돌발상황 조회]
  if (e && e.parameter && e.parameter.action === 'get_traffic_incident') {
    let res = { success: false, incidents: [] };
    try {
      res = typeof getTrafficIncidentLive === 'function' ? getTrafficIncidentLive() : { success: false, incidents: [] };
    } catch(err) {
      res = { success: false, error: err.toString(), incidents: [] };
    }
    return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
  }

  // 💡 [국토교통부 ITS 실시간 도로 소통정보 조회]
  if (e && e.parameter && e.parameter.action === 'get_traffic_flow') {
    let res = { success: false, items: [] };
    try {
      res = typeof getTrafficFlowLive === 'function' ? getTrafficFlowLive() : { success: false, items: [] };
    } catch(err) {
      res = { success: false, error: err.toString(), items: [] };
    }
    return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
  }

  // 💡 [실시간 인천 버스 위치 조회 액션 (XML 원본 반환)]
  if (e && e.parameter && (e.parameter.action === 'get_incheon_bus_live' || e.parameter.action === 'get_live_bus')) {
    const routeShort = e.parameter.routeShort || e.parameter.route || '202';
    const targetBusNo = e.parameter.targetBusNo || e.parameter.busNo || '';
    let xml = "";
    try {
      xml = typeof getIncheonBusLive === 'function' ? getIncheonBusLive(routeShort, targetBusNo) : "";
    } catch(err) {
      xml = "ERROR: " + err.toString();
    }
    return ContentService.createTextOutput(xml).setMimeType(ContentService.MimeType.XML);
  }

  // 알 수 없는 요청: 간단한 안내만 반환 (화면은 GitHub Pages 앱에서 제공)
  return ContentService.createTextOutput(JSON.stringify({ success: true, message: '영종운수 스마트근무표 API' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ================================================================
// 🎙️ [Gemini AI 실시간 음성 비서 백엔드]
// - 기사님의 음성 질문을 받아 당일 배차/근무 컨텍스트 기반으로 답변 생성
// - 모델 일시 장애(503 고부하 등) 대비 자동 다중 모델 폴백 적용
// ================================================================
function askGeminiVoiceAssistant(query, context, history) {
  try {
    // 🛡️ 남용 방지: 입력 길이 제한 + 분당/하루 호출 한도 (주소를 아는 누구나 호출할 수 있어서 한도 소진을 막는다)
    query = String(query || "").slice(0, 300);
    context = String(context || "").slice(0, 9000);
    if (Array.isArray(history)) {
      history = history.slice(-6).map(h => ({ role: h && h.role === 'model' ? 'model' : 'user', text: String((h && h.text) || "").slice(0, 600) }));
    } else {
      history = [];
    }
    const limitMsg = geminiRateLimitMessage_();
    if (limitMsg) return limitMsg;

    if (typeof GEMINI_API_KEY === 'undefined' || !GEMINI_API_KEY) {
      return "Gemini API 키가 설정되지 않았습니다.";
    }

    const primaryModel = (typeof GEMINI_MODEL !== 'undefined' && GEMINI_MODEL) ? GEMINI_MODEL : "gemini-flash-lite-latest";
    // 한도(쿼터)가 모델마다 따로라서, 같은 모델의 다른 이름(-latest 등)은 빼고 서로 다른 모델만 사용
    const fallbackList = [primaryModel, "gemini-3.1-flash-lite", "gemini-3-flash-preview"];
    const candidateModels = fallbackList.filter((m, idx) => fallbackList.indexOf(m) === idx);

    const systemPrompt = "너의 이름은 영종운수 상황실의 든든한 1등 살림꾼, '구차장'이야. " +
      "운전 중인 기사님이 듣기 편하도록 반드시 1~2문장의 간결하고 명확한 구어체로 대답하고 특수문자나 별표(*)는 절대 쓰지 마. " +
      "제공된 [구차장의 승무 브리핑 수첩]의 [일일근무표] 구역은 폰에 저장된 공식 근무표와 시간표이므로 가장 먼저 믿고 그 안에서 답을 찾아. 그 안에 답이 없을 때만 도구를 써. 시간표의 '장소' 줄에서 출발=출발 장소, 기점(회차)=회차 장소, 도착=도착 장소이니 '어디서 출발해' 같은 질문은 그 장소 이름으로 답해. " +
      "제공된 [구차장의 승무 브리핑 수첩] 정보를 우선적으로 참고하되, 내일이나 다음주 등 특정 날짜의 일정을 물어보면 " +
      "반드시 'search_driver_schedule' 도구를 사용해 날짜별 근무형태(오전/오후), 노선, 순번을 정확하게 파악해! " +
      "특히 여러 날짜(예: 월, 화, 수)를 물어볼 때 절대 임의로 묶어서 추측하지 말고, 날짜별로 순번이 다를 수 있으니 각각 확인해야 해. " +
      "그 후 파악된 노선과 순번을 바탕으로 'search_route_timetable'을 호출해 시간표를 확인해. " +
      "출근 시간 질문 시 규칙: 1) 오전 근무면 1회차 출발시간을 출근 시간으로 안내. 2) 오후 근무면 교대시간을 출근 시간으로 안내하되, 오후 첫 운행시간(교대시간 바로 다음 회차 출발시간)도 함께 안내해. " +
      "퇴근(마치는) 시간 질문 시 규칙: 1) 오전 근무면 교대시간을 퇴근 시간으로 안내해. 2) 오후 근무면 시간표에서 해당 순번의 제일 마지막 회차의 맨 마지막 도착 시간(차고지 도착)을 퇴근 시간으로 안내해. " +
      "특정 차량의 현재 운전기사를 물어볼 경우, 'search_driver_schedule'로 차량 번호를 검색해 오전/오후 기사를 모두 찾은 다음, 'search_route_timetable'로 교대 시간을 찾아 현재 시간과 비교하여 지금 운전 중인 기사가 누구인지 대답해. " +
      "불필요한 인사말이나 맺음말('안전운전 하십시오', '편히 쉬세요' 등)은 모조리 빼고 오직 묻는 질문에 대한 핵심 정보만 가장 빠르고 정확하게 단답형으로 대답해.";

    // 1. [Context Enrichment] 클라이언트 컨텍스트 기반으로 TAGO BIS 및 Board_DB 실시간 정보 추가
    let enrichedContext = context;
    try {
      const myRouteMatch = context.match(/(?:노선|배차)[:\s]*([0-9A-Z]+)번/i) || context.match(/([0-9A-Z]+)번\s*\d+순번/i);
      const myBusNoMatch = context.match(/차량\s+(\d{4})/i);
      if (myRouteMatch && myBusNoMatch) {
        const rNo = myRouteMatch[1];
        const bNo = myBusNoMatch[1];
        const bisXml = getIncheonBusLive(rNo, bNo) || "";
        
        let bisMsg = `\n\n[TAGO BIS 실시간 위치 (노선 ${rNo}, 차량 ${bNo})]`;
        if (bisXml.includes("ERROR") || bisXml === "") {
          bisMsg += "\n- 현재 실시간 위치 데이터를 불러올 수 없습니다.";
        } else {
          // 간이 XML 파싱 (순서 보장 안됨, 단순 정보 추출용)
          let busList = [];
          const regex = /<item>([\s\S]*?)<\/item>/g;
          let match;
          while ((match = regex.exec(bisXml)) !== null) {
            const item = match[1];
            const nodeNm = (item.match(/<nodenm>(.*?)<\/nodenm>/) || [])[1];
            const plainNo = (item.match(/<vehicleno>(.*?)<\/vehicleno>/) || [])[1];
            if (nodeNm && plainNo) busList.push({ nodeNm: nodeNm, plainNo: plainNo });
          }
          if (busList.length > 0) {
            let myBusIdx = busList.findIndex(b => b.plainNo.includes(bNo));
            if (myBusIdx !== -1) {
              bisMsg += `\n- 내 차량(${bNo}): 현재 [${busList[myBusIdx].nodeNm}] 정류장 부근`;
              if (myBusIdx > 0) bisMsg += `\n- 앞차(${busList[myBusIdx - 1].plainNo}): 현재 [${busList[myBusIdx - 1].nodeNm}] 정류장 부근`;
              if (myBusIdx < busList.length - 1) bisMsg += `\n- 뒷차(${busList[myBusIdx + 1].plainNo}): 현재 [${busList[myBusIdx + 1].nodeNm}] 정류장 부근`;
            } else {
               bisMsg += `\n- 현재 운행중인 차량 목록에 내 차량(${bNo})이 없습니다. 차고지 대기 중이거나 단말기 미작동 상태일 수 있습니다.`;
            }
          } else {
            bisMsg += "\n- 노선에 운행 중인 차량이 없습니다.";
          }
        }
        enrichedContext += bisMsg;

        // Board_DB 특이사항/화장실 비밀번호 추가
        try {
          const ss = SpreadsheetApp.openById(SHEET_ID);
          const boardSheet = ss.getSheetByName('BOARD_DB') || ss.getSheetByName('DB');
          if (boardSheet) {
            const bData = boardSheet.getDataRange().getValues();
            let toiletInfo = "";
            let noticeInfo = "";
            for (let i = 0; i < bData.length; i++) {
               if (String(bData[i][0]).includes(rNo + "번 화장실")) toiletInfo = bData[i][1];
               if (String(bData[i][0]).includes("공지사항")) noticeInfo = bData[i][1];
            }
            if (toiletInfo || noticeInfo) {
              enrichedContext += `\n\n[운행 특이사항 및 화장실]`;
              if (noticeInfo) enrichedContext += `\n- 공지: ${noticeInfo}`;
              if (toiletInfo) enrichedContext += `\n- 화장실: ${toiletInfo}`;
            }
          }

          // DBT 시트에서 시간표 및 교대 시간 추출
          const dbtSheet = ss.getSheetByName('DBT');
          const mySeqMatch = context.match(/(\d+)순번/);
          if (dbtSheet && mySeqMatch) {
            const seqStr = mySeqMatch[1] + "순번";
            const dbtData = dbtSheet.getDataRange().getDisplayValues();
            let ttMsg = "";
            for(let i=0; i<dbtData.length; i++) {
              const rowStr = dbtData[i].join(" ");
              // 해당 노선과 순번이 모두 포함된 행 찾기
              if(rowStr.includes(rNo) && rowStr.includes(seqStr)) {
                 ttMsg += "\n- " + dbtData[i].filter(c => c.trim() !== "").join(" | ");
              }
            }
            if (ttMsg) {
              enrichedContext += `\n\n[오늘 노선(${rNo}번 ${seqStr}) 상세 시간표 및 교대 시간 (DBT)]${ttMsg}`;
            }
          }
        } catch(e) { }
      }
    } catch(e) { 
      console.error("Context enrichment failed:", e);
    }
    const kstDate = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd (E) HH:mm");

    // 2. [Gemini Function Calling 도구 선언]
    const tools = [{
      functionDeclarations: [
        {
          name: "search_driver_schedule",
          description: "내 정보가 아닌, 동료 기사님의 일정이나 특정 차량(예: 1218)의 운행 기사님을 구글 시트에서 검색할 때 사용합니다.",
          parameters: {
            type: "OBJECT",
            properties: {
              keyword: { type: "STRING", description: "검색할 기사님 이름(예: 김태규) 또는 차량 번호(예: 1218)" }
            },
            required: ["keyword"]
          }
        },
        {
          name: "search_route_timetable",
          description: "특정 노선과 순번의 운행 시간표(회차별 출발/도착)나 교대 시간을 구글 시트(DBT)에서 검색할 때 사용합니다. 내일이나 다른 날의 교대시간을 물어볼 때도 필수적으로 사용하세요.",
          parameters: {
            type: "OBJECT",
            properties: {
              route_no: { type: "STRING", description: "노선 번호 (예: 281)" },
              seq_no: { type: "STRING", description: "순번 (예: 3)" },
              day_type: { type: "STRING", description: "평일 또는 휴일 (옵션)" }
            },
            required: ["route_no", "seq_no"]
          }
        },
        {
          name: "search_realtime_location",
          description: "특정 차량 번호(예: 2232)나 특정 기사님(예: 김태규)의 현재 실시간 버스 위치(정류장)를 조회할 때 사용합니다.",
          parameters: {
            type: "OBJECT",
            properties: {
              driver_name: { type: "STRING", description: "조회할 기사님 이름 (예: 김태규)" },
              vehicle_no: { type: "STRING", description: "조회할 차량 번호 (예: 2232)" },
              route_no: { type: "STRING", description: "노선 번호 (알 경우, 예: 206)" }
            }
          }
        },
        {
          name: "search_shift_partner",
          description: "특정 날짜, 노선, 순번, 근무형태(오전/오후)를 가진 기사님이 누구인지 구글 시트 배정표에서 검색합니다. 내 맞교대자뿐만 아니라, 앞순번이나 뒷순번 기사님을 찾을 때도 노선과 순번(예: 내 순번-1)을 바꿔서 검색할 수 있습니다.",
          parameters: {
            type: "OBJECT",
            properties: {
              route_no: { type: "STRING", description: "노선 번호 (예: 281)" },
              seq_no: { type: "STRING", description: "순번 (예: 2)" },
              target_work_type: { type: "STRING", description: "찾고자 하는 교대자의 근무 형태 (예: '오전' 또는 '오후')" },
              target_date: { type: "STRING", description: "조회할 날짜 (예: '20261027' 또는 '오늘', '내일')" }
            },
            required: ["route_no", "seq_no", "target_work_type"]
          }
        },
        {
          name: "learn_user_rule",
          description: "기사님이 구차장(AI)에게 새로운 대화 방식이나 규칙, 기억해야 할 사실 등을 명시적으로 지시할 때 이를 영구적으로 기억하도록 학습합니다.",
          parameters: {
            type: "OBJECT",
            properties: {
              rule_text: { type: "STRING", description: "학습할 명확한 규칙 내용 (예: '대답은 무조건 반말로 해', '000 기사님은 반장님이라고 불러' 등)" }
            },
            required: ["rule_text"]
          }
        }
      ]
    }];

    // 과거 대화 내역 (history) 적용
    const contents = [];
    if (history && Array.isArray(history)) {
       history.forEach(h => {
          contents.push({ role: h.role, parts: [{ text: h.text }] });
       });
    }

    // 🌟 [기사님 맞춤형 학습 규칙 불러오기]
    let userRules = "";
    try {
      userRules = PropertiesService.getScriptProperties().getProperty("GEMINI_USER_RULES") || "";
      if (userRules) {
        enrichedContext = (enrichedContext || "") + "\n\n[기사님이 구차장에게 직접 가르쳐준 특별 규칙 (이 규칙은 시스템 프롬프트보다 우선적으로 절대 엄수해야 함)]" + userRules;
      }
    } catch (e) {}

    const promptText = `현재 시간(한국기준): ${kstDate}\n\n` + (enrichedContext ? (enrichedContext + "\n\n") : "") + "기사님 질문: " + query;
    contents.push({ role: "user", parts: [{ text: promptText }] });

    const payload = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: contents,
      tools: tools
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    let lastError = null;
    const debugLogs = [];
    for (let i = 0; i < candidateModels.length; i++) {
      const model = candidateModels[i];
      try {
        const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + GEMINI_API_KEY;
        const response = UrlFetchApp.fetch(apiUrl, options);
        const code = response.getResponseCode();
        const text = response.getContentText();
        let json = null;
        try { json = JSON.parse(text); } catch(pe) { json = { parseError: pe.toString(), raw: text.slice(0, 200) }; }

        debugLogs.push({ model: model, code: code, response: json });

        if (code === 200 && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts[0]) {
          let currentContents = JSON.parse(JSON.stringify(contents)); // 깊은 복사로 history 포함
          
          let attempt = 0;
          let finalAnswer = "";
          let currentJson = json;

          while (attempt < 5) {
            attempt++;
            let part = currentJson.candidates[0].content.parts[0];
            
            if (part.text) {
              finalAnswer = part.text.replace(/[\*\_#`~\[\]\(\)\{\}<>]/g, "").replace(/\s+/g, " ").trim();
              break;
            }
            
            if (part.functionCall) {
              const funcName = part.functionCall.name;
              const args = part.functionCall.args || {};
              let funcResultText = "";

              if (funcName === "search_driver_schedule") {
                funcResultText = searchDriverScheduleInSheet(args.keyword || args.driver_name);
              } else if (funcName === "search_route_timetable") {
                funcResultText = searchRouteTimetableInSheet(args.route_no, args.seq_no, args.day_type);
              } else if (funcName === "search_realtime_location") {
                funcResultText = searchRealtimeLocation(args.driver_name, args.vehicle_no, args.route_no);
              } else if (funcName === "search_shift_partner") {
                funcResultText = searchShiftPartnerInSheet(args.route_no, args.seq_no, args.target_work_type, args.target_date);
              } else if (funcName === "learn_user_rule") {
                try {
                  const props = PropertiesService.getScriptProperties();
                  let currentRules = props.getProperty("GEMINI_USER_RULES") || "";
                  currentRules += "\n- " + args.rule_text;
                  props.setProperty("GEMINI_USER_RULES", currentRules);
                  funcResultText = "규칙이 성공적으로 학습되고 영구 저장되었습니다: " + args.rule_text;
                } catch (e) {
                  funcResultText = "규칙 저장 실패: " + e.toString();
                }
              }

              currentContents.push({ role: "model", parts: [part] });
              currentContents.push({ role: "user", parts: [{ functionResponse: { name: funcName, response: { result: funcResultText } } }] });
              
              const loopPayload = {
                system_instruction: { parts: [{ text: systemPrompt }] },
                tools: tools,
                contents: currentContents
              };
              
              const loopResp = UrlFetchApp.fetch(apiUrl, {
                method: "post",
                contentType: "application/json",
                payload: JSON.stringify(loopPayload),
                muteHttpExceptions: true
              });
              
              if (loopResp.getResponseCode() !== 200) {
                 throw new Error("Loop HTTP " + loopResp.getResponseCode());
              }
              currentJson = JSON.parse(loopResp.getContentText());
            } else {
              break;
            }
          }
          
          if (finalAnswer) {
            lastGeminiDebug = { success: true, model: model, logs: debugLogs };
            return finalAnswer;
          }
        } else {
          lastError = json.error ? (json.error.message || json.error) : ("HTTP " + code);
          console.warn("Gemini model " + model + " unavailable (HTTP " + code + "):", lastError);
        }
      } catch (callErr) {
        lastError = callErr.toString();
        debugLogs.push({ model: model, fetchError: callErr.toString() });
        console.warn("Gemini fetch error on model " + model + ":", callErr);
      }
    }

    lastGeminiDebug = { success: false, lastError: lastError, logs: debugLogs };
    console.error("All Gemini candidate models failed. Last error:", lastError);
    return "잠시 통신에 문제가 생겼어요. 안전 운전하시고 잠시 후 다시 말씀해 주세요.";
  } catch (err) {
    console.error("askGeminiVoiceAssistant Exception:", err);
    return "요청을 처리하는 도중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

// 📅 [일일근무표 시트 읽기] 오늘부터 days일 이내 행만 돌려준다 (5분 캐시)
// - 시트 첫 줄 제목: Key / 근무일자 / 기사명 / 근무형태 / 노선명 / 차량번호 / 순번 / 근무시간
// - rows: [근무일자, 기사명, 근무형태, 노선명, 차량번호, 순번, 근무시간]
function getDailyRoster(days) {
  days = Math.max(1, Math.min(days || 5, 10));
  const today = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd");
  const cache = CacheService.getScriptCache();
  const cacheKey = "daily_roster_" + today + "_" + days;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // 1순위: GitHub 근무표 (직접 고친 근무 반영). 받지 못하면 아래 시트 방식으로 대신한다
  try {
    const ghRows = ghRosterRows_();
    if (ghRows) {
      const endGh = Utilities.formatDate(new Date(Date.now() + (days - 1) * 86400000), "Asia/Seoul", "yyyy-MM-dd");
      const rowsGh = ghRows.filter(r => r.date >= today && r.date <= endGh)
        .map(r => [r.date, r.name, r.type, r.route || '-', r.bus || '-', r.seq || '-', r.time || '-']);
      const resGh = { success: true, today: today, days: days, rows: rowsGh };
      try { cache.put(cacheKey, JSON.stringify(resGh), 300); } catch (e) {}
      return resGh;
    }
  } catch (eGh) {}

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('일일근무표');
  if (!sheet) return { success: false, error: "일일근무표 시트를 찾을 수 없습니다." };
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return { success: true, today: today, rows: [] };

  const header = values[0].map(h => String(h).trim());
  const col = name => header.indexOf(name);
  const cDate = col('근무일자'), cName = col('기사명'), cType = col('근무형태'),
        cRoute = col('노선명'), cBus = col('차량번호'), cSeq = col('순번'), cTime = col('근무시간');
  if (cDate < 0 || cName < 0) return { success: false, error: "일일근무표 제목 줄에서 '근무일자'/'기사명'을 찾을 수 없습니다." };

  const end = Utilities.formatDate(new Date(Date.now() + (days - 1) * 86400000), "Asia/Seoul", "yyyy-MM-dd");
  const pick = (r, c) => c >= 0 ? String(r[c]).trim() : "";
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const d = pick(r, cDate).replace(/\./g, '-').replace(/\s/g, '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < today || d > end) continue;
    rows.push([d, pick(r, cName), pick(r, cType), pick(r, cRoute), pick(r, cBus), pick(r, cSeq), pick(r, cTime)]);
  }
  const res = { success: true, today: today, days: days, rows: rows };
  try { cache.put(cacheKey, JSON.stringify(res), 300); } catch (e) {} // 캐시 한도(100KB) 초과 시 무시
  return res;
}

// 🛡️ 구차장 호출 한도: 1분에 GEMINI_MAX_PER_MIN 번까지만 허용 (짧은 시간에 몰아서 부르는 남용 방지). 넘으면 안내 문장을 돌려준다
// - 하루 한도는 구글 무료 단계의 자체 한도에 맡긴다
const GEMINI_MAX_PER_MIN = 20;
function geminiRateLimitMessage_() {
  try {
    const minKey = "gem_min_" + Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMddHHmm");
    const cache = CacheService.getScriptCache();
    const lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      const minCnt = Number(cache.get(minKey) || 0) + 1;
      if (minCnt > GEMINI_MAX_PER_MIN) return "지금 질문이 너무 많아요. 잠시 후 다시 말씀해 주세요.";
      cache.put(minKey, String(minCnt), 120);
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    // 한도 계산에 실패해도 구차장은 계속 동작하게 둔다
  }
  return "";
}

// 🩺 [Gemini API 연결 상태 점검용 엔드포인트]
function testGeminiApiConnection() {
  try {
    const res = askGeminiVoiceAssistant("연결 테스트", "시스템 상태 점검");
    return { success: true, result: res, model: (typeof GEMINI_MODEL !== 'undefined' ? GEMINI_MODEL : 'gemini-3.5-flash') };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function doPost(e) {
  try {
    let postData = null;
    if (e && e.postData && e.postData.contents) {
      try { postData = JSON.parse(e.postData.contents); } catch(parseErr) { postData = e.parameter; }
    } else if (e && e.parameter) {
      postData = e.parameter;
    }
    if (postData && postData.action === 'ask_gemini') {
      const query = postData.query || "";
      const context = postData.context || "";
      const history = postData.history || [];
      const answer = askGeminiVoiceAssistant(query, context, history);
      return ContentService.createTextOutput(JSON.stringify({ success: true, answer: answer })).setMimeType(ContentService.MimeType.JSON);
    }
    if (postData && postData.action === 'save_driving_habit') {
      const res = typeof saveDrivingHabit === 'function' ? saveDrivingHabit(postData) : { success: false, error: "saveDrivingHabit 함수 미정의" };
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
    if (postData && postData.action === 'save_to_server') {
      saveToServer(postData.key, postData.value);
      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }
    if (postData && postData.action === 'load_board_memo') {
      const res = typeof loadBoardMemo === 'function' ? loadBoardMemo(postData.category, postData.targetKey) : { success: false, content: "" };
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
    if (postData && (postData.action === 'save_board_memo' || postData.action === 'save_board_item')) {
      const res = typeof saveBoardMemo === 'function' ? saveBoardMemo(postData.category, postData.targetKey, postData.content, postData.writer) : { success: false };
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true, received: true })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 📅 [공용] 일일근무표 전체 행을 객체 목록으로 읽기 (구차장 검색 도구용)
function readDailyRosterRows() {
  try {
    const ghRows = ghRosterRows_();
    if (ghRows) return ghRows;
  } catch (eGh) {}
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('일일근무표');
  if (!sheet) return null;
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const header = values[0].map(h => String(h).trim());
  const col = name => header.indexOf(name);
  const c = { date: col('근무일자'), name: col('기사명'), type: col('근무형태'), route: col('노선명'), bus: col('차량번호'), seq: col('순번'), time: col('근무시간') };
  const pick = (r, k) => c[k] >= 0 ? String(r[c[k]]).trim() : "";
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const date = pick(r, 'date').replace(/\./g, '-').replace(/\s/g, '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rows.push({ date: date, name: pick(r, 'name'), type: pick(r, 'type'), route: pick(r, 'route'), bus: pick(r, 'bus'), seq: pick(r, 'seq'), time: pick(r, 'time') });
  }
  return rows;
}

function rosterRowText(r) {
  const work = r.route && r.seq;
  return `${r.date} ${r.name}: ` + (work ? `${r.route} ${r.seq} ${r.time} 차량 ${r.bus || '-'}` : (r.type || '휴무'));
}

// 🔍 [Function Calling 용도] 동료 기사님 일정 / 차량 번호로 운행 기사 검색 (일일근무표)
function searchDriverScheduleInSheet(driverName) {
  try {
    const rows = readDailyRosterRows();
    if (rows === null) return "일일근무표 시트를 찾을 수 없습니다.";
    const kw = String(driverName || "").trim();
    if (!kw) return "검색어(기사님 이름 또는 차량 번호)가 필요합니다.";
    const hit = rows.filter(r => r.name.includes(kw) || (r.bus && r.bus === kw))
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    if (hit.length === 0) return `${kw} 기사님/차량의 일정을 일일근무표에서 찾을 수 없습니다.`;
    return `[${kw} 일일근무표 검색 결과]\n` + hit.slice(0, 20).map(r => "- " + rosterRowText(r)).join("\n");
  } catch (e) {
    return "검색 중 오류 발생: " + e.toString();
  }
}

// 🔍 [Function Calling 용도] 같은 노선·순번·날짜의 오전/오후 근무자 검색 (일일근무표)
function searchShiftPartnerInSheet(routeNo, seqNo, targetWorkType, targetDate) {
  try {
    const rows = readDailyRosterRows();
    if (rows === null) return "일일근무표 시트를 찾을 수 없습니다.";
    const rNum = String(routeNo).replace(/[^0-9A-Z]/ig, '');
    const sNum = String(seqNo).replace(/[^0-9]/g, '');
    const tWork = String(targetWorkType || '').includes('오전') ? '오전' : '오후';
    let dateStr = targetDate;
    if (!targetDate || targetDate === '오늘' || targetDate === '내일') {
      const d = new Date();
      if (targetDate === '내일') d.setDate(d.getDate() + 1);
      dateStr = Utilities.formatDate(d, "Asia/Seoul", "yyyy-MM-dd");
    } else if (/^\d{8}$/.test(targetDate)) {
      dateStr = targetDate.slice(0, 4) + "-" + targetDate.slice(4, 6) + "-" + targetDate.slice(6, 8);
    }
    const hit = rows.filter(r => r.date === dateStr && r.route.indexOf(rNum) === 0 && String(r.seq).replace(/[^0-9]/g, '') === sNum && r.time.includes(tWork));
    if (hit.length === 0) return `${dateStr} ${rNum}번 ${sNum}순번 ${tWork} 근무자를 일일근무표에서 찾을 수 없습니다. (아직 배정 전이거나 휴무일 수 있습니다)`;
    return `[${dateStr} ${rNum}번 ${sNum}순번 ${tWork} 근무자]\n` + hit.map(r => `- ${r.name} 기사님 (${r.route}, 차량 ${r.bus || '-'})`).join("\n");
  } catch (e) {
    return "교대 근무자 검색 중 오류 발생: " + e.toString();
  }
}

// 🔍 routeDataMap(DB 시트의 yeongjong_shared_routeDataMap)에서 노선·순번 시간표 찾기. 못 찾으면 null
function searchRouteTimetableInRouteDataMap(routeNo, seqNo, dayType) {
  // 시트(DB)의 routeDataMap 위에 GitHub 시간표를 덮어쓴다 (GitHub에 없는 노선은 시트 값 사용)
  let map = {};
  try {
    const raw = loadKeyFromServer('yeongjong_shared_routeDataMap');
    if (raw) map = (typeof raw === 'string') ? JSON.parse(raw) : raw;
  } catch (e0) {}
  try {
    const gh = ghRouteDataMap_();
    if (gh) Object.keys(gh).forEach(function (k) { map[k] = gh[k]; });
  } catch (e1) {}
  if (Object.keys(map).length === 0) return null;
  const rNum = String(routeNo).replace(/[^0-9A-Z]/ig, '');
  const sNum = String(seqNo).replace(/[^0-9]/g, '');
  let names = Object.keys(map).filter(k => k.indexOf(rNum) === 0);
  if (dayType) {
    const wantHoliday = /휴일|휴무/.test(dayType);
    const filtered = names.filter(k => wantHoliday ? k.includes('휴일') : !k.includes('휴일'));
    if (filtered.length) names = filtered;
  }
  let out = "";
  names.forEach(name => {
    const rt = map[name];
    const rounds = rt && rt.data && rt.data[sNum + '순번'];
    if (!Array.isArray(rounds) || rounds.length === 0) return;
    const heads = rt.headers || [];
    const role = ['출발', '기점(회차)', '도착'];
    let swap = "";
    const lines = rounds.map((r, i) => {
      const cells = [];
      ['1', '2', '3'].forEach((n, k) => {
        const t = r['time' + n];
        if (!t) return;
        const isSwap = r['c' + n] === 'yellow';
        if (isSwap) swap = t + " (" + (heads[k] || role[k]) + ")";
        cells.push((role[k] + " " + (heads[k] || "") + " " + t + (isSwap ? "(교대시간)" : "")).replace(/\s+/g, " "));
      });
      return (i + 1) + "회차: " + cells.join(" / ");
    });
    out += `\n[${name} ${sNum}순번 운행 시간표]\n※ 장소: 출발=${heads[0] || '-'}, 기점(회차)=${heads[1] || '-'}, 도착=${heads[2] || '-'}\n` + lines.join("\n") + (swap ? `\n※ 교대시간: ${swap}` : "");
  });
  return out ? out.trim() : null;
}

// 🔍 [Function Calling 용도] 노선 시간표 검색 (routeDataMap 우선, 없으면 DBT)
function searchRouteTimetableInSheet(routeNo, seqNo, dayType) {
  try {
    // 1순위: DB 시트의 routeDataMap(노선별 순번 시간표). 노란 칸 = 교대시간
    const mapRes = searchRouteTimetableInRouteDataMap(routeNo, seqNo, dayType);
    if (mapRes) return mapRes;
  } catch (e0) {}
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName('DBT');
    if (!sheet) return "DBT 시트를 찾을 수 없습니다.";
    
    const range = sheet.getDataRange();
    const data = range.getDisplayValues();
    const colors = range.getBackgrounds();
    
    let ttMsg = "";
    
    // 유연한 검색을 위해 숫자만 추출
    const rNum = String(routeNo).replace(/[^0-9A-Z]/ig, '');
    const sNum = String(seqNo).replace(/[^0-9]/g, '');

    for(let i=0; i<data.length; i++) {
      const rowStr = data[i].join(" ");
      // 노선 번호와 순번이 모두 포함된 행 찾기
      let match = rowStr.includes(rNum) && rowStr.includes(sNum);
      if (dayType && match) {
         if (dayType.includes('평일') && !rowStr.includes('평일')) match = false;
         if (dayType.includes('휴무') || dayType.includes('휴일')) {
            if (!rowStr.includes('휴일')) match = false;
         }
      }
      if(match) {
         let rowArr = [];
         for(let j=0; j<data[i].length; j++) {
            let cellText = String(data[i][j]).trim();
            if (cellText !== "") {
               const hex = colors[i][j].toLowerCase();
               // 오직 '노란색' 계열만 교대시간으로 간주 (빨강, 파랑 등 제외)
               const yellowHexes = ['#ffff00', '#fff2cc', '#ffe599', '#ffd966', '#f1c232'];
               if (yellowHexes.includes(hex)) {
                  cellText += "(교대시간)";
               }
               rowArr.push(cellText);
            }
         }
         ttMsg += "\n- " + rowArr.join(" | ");
      }
    }
    
    if (ttMsg) {
      return `[${rNum}번 노선 ${sNum}순번 운행 시간표]\n* 규칙: 텍스트에 '(교대시간)' 마커가 있는 시간이 정확한 교대시간입니다. 오전 근무자는 교대시간까지 근무하며, 오후 근무자는 이 교대시간에 차량을 인계받고 다음 회차부터 운행합니다.\n${ttMsg}`;
    } else {
      return `${routeNo}번 노선 ${seqNo}순번의 시간표 데이터를 찾을 수 없습니다.`;
    }
  } catch(e) {
    return "시간표 검색 중 오류 발생: " + e.toString();
  }
}

// 🔍 [Function Calling 용도] 실시간 버스 위치 검색 (TAGO BIS)
function searchRealtimeLocation(driverName, vehicleNo, routeNo) {
  try {
    let rNo = routeNo;
    let vNo = vehicleNo;
    let dName = driverName;

    // 노선번호나 차량번호 중 하나라도 없으면 일일근무표(오늘)에서 먼저 찾기
    if ((!rNo || !vNo) && (dName || vNo)) {
      try {
        const rows = readDailyRosterRows() || [];
        const todayStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd");
        const hit = rows.find(r => r.date === todayStr && r.route && ((dName && r.name.includes(dName)) || (vNo && r.bus === String(vNo))));
        if (hit) {
          if (!rNo) rNo = hit.route.replace(/[^0-9A-Z].*$/i, '');
          if (!vNo && hit.bus) vNo = hit.bus;
        }
      } catch (e1) {}
    }
    // 노선번호나 차량번호 중 하나라도 없으면 '노선 배정표'에서 정보 검색
    if (!rNo || !vNo) {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const sheet = ss.getSheetByName('노선 배정표') || ss.getSheetByName('DB');
      if (sheet) {
        const data = sheet.getDataRange().getValues();
        const searchKey = dName || vNo; 
        
        // 뒤에서부터 검색하여 가장 최신/오늘 배차를 찾음
        for (let i = data.length - 1; i >= 0; i--) {
          const rowStr = data[i].join(" ");
          if (searchKey && rowStr.includes(searchKey)) {
             try {
               const j = JSON.parse(String(data[i][1]));
               if (!rNo && j.route && j.route !== '-') rNo = j.route;
               if (!vNo && j.busNo && j.busNo !== '-' && j.busNo !== '미배차') vNo = j.busNo;
             } catch(e) {
               const rMatch = rowStr.match(/(?:노선|배차)[:\s]*([0-9A-Z]+)번/i) || rowStr.match(/([0-9A-Z]+)번/i);
               const vMatch = rowStr.match(/차량\s+(\d{4})/i) || rowStr.match(/(\d{4})호/i) || rowStr.match(/\b(\d{4})\b/);
               if (!rNo && rMatch) rNo = rMatch[1];
               if (!vNo && vMatch) vNo = vMatch[1];
             }
             if (dName && !rowStr.includes(dName)) dName = "해당";
             break;
          }
        }
      }
    }

    if (!rNo) return "기사님 또는 차량의 노선 번호를 찾을 수 없어 실시간 위치를 조회할 수 없습니다.";

    // TAGO BIS 조회
    const bisXml = getIncheonBusLive(rNo, vNo) || "";
    if (bisXml.includes("ERROR") || bisXml === "") {
      return `${rNo}번 노선의 실시간 위치 데이터를 불러올 수 없습니다.`;
    }

    let busList = [];
    const regex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = regex.exec(bisXml)) !== null) {
      const item = match[1];
      const nodeNm = (item.match(/<nodenm>(.*?)<\/nodenm>/) || [])[1];
      const plainNo = (item.match(/<vehicleno>(.*?)<\/vehicleno>/) || [])[1];
      if (nodeNm && plainNo) busList.push({ nodeNm: nodeNm, plainNo: plainNo });
    }

    if (busList.length > 0) {
      if (vNo) {
        let myBusIdx = busList.findIndex(b => b.plainNo.includes(vNo));
        let title = dName ? `${dName} 기사님의 ` : "";
        title += `${rNo}번 ${vNo}호 차량`;
        
        if (myBusIdx !== -1) {
          return `${title}은(는) 현재 [${busList[myBusIdx].nodeNm}] 정류장을 지나고 있습니다.`;
        } else {
          return `${title}은(는) 현재 운행 중인 노선 위 버스 목록에 잡히지 않습니다. 차고지 대기 중이거나 단말기가 꺼져 있을 수 있습니다.`;
        }
      } else {
        return `${rNo}번 노선에는 현재 ${busList.length}대의 버스가 운행 중입니다. 특정 기사님이나 차량번호를 물어보시면 정확한 위치를 찾아드릴게요.`;
      }
    } else {
      return `현재 ${rNo}번 노선에 운행 중인 차량이 한 대도 없습니다.`;
    }
  } catch (e) {
    return "위치 검색 중 오류 발생: " + e.toString();
  }
}