// ================================================================
// 🚌 [공공데이터 버스 API 모듈] BusApi.js
// ================================================================

// 💡 영종운수 8대 정규 노선 + 새벽 특수 노선(202A, 203A) 공식 고유 Route ID 매핑 테이블
const YEONGJONG_ROUTE_MAP = {
  "202": "ICB365000059",  // 202번 정규 (인천공항T1장기주차장 ~ 대우하나)
  "202A": "ICB368000006", // 202A번 새벽 (신현여중후문 ~ 공항T1)
  "203": "ICB365000060",  // 203번 정규 (영종버스공영차고지 ~ 인천공항T2)
  "203A": "ICB368000056", // 203A번 새벽 (영종스타힐스옆문 ~ 공항T2 14번)
  "204": "ICB365000445",  // 204번 정규 (영종아레나 ~ 입구지입구)
  "205": "ICB368000003",  // 205번 정규 (영종아레나 ~ 인천공항T2)
  "206": "ICB368000041",  // 206번 정규 (영종버스공영차고지 ~ 인천공항T1)
  "221": "ICB368000054",  // 221번 정규 (영종버스공영차고지 ~ 인천공항T2)
  "281": "ICB368000065",  // 281번 정규 (인천공항T2 ~ 대우하나)
  "282": "ICB368000066"   // 282번 정규 (우미린1단지후문 ~ 석남역)
};

// 🚌 1. TAGO 노선번호 조회 API로 정식 routeId 취득 (직결 맵 우선 + 정확 일치 폴백)
function getTagoRouteId(routeNo) {
  if (!routeNo) return null;
  // 💡 [핵심] 영문자('A' 등)를 보존하여 202A, 203A 노선번호가 202로 훼손되지 않도록 보호합니다.
  var cleanNo = String(routeNo).trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!cleanNo) return null;

  // 1. 영종운수 공식 노선 직결 테이블 우선 반환 (0ms 즉시 반환 & 100% 정확)
  if (YEONGJONG_ROUTE_MAP[cleanNo]) {
    return YEONGJONG_ROUTE_MAP[cleanNo];
  }

  // 2. 캐시 확인 (새로운 캐시 키 버전 v3)
  var cache = CacheService.getScriptCache();
  var cachedId = cache.get("TAGO_ROUTE_ID_V3_" + cleanNo);
  if (cachedId) return cachedId;

  try {
    var serviceKey = typeof BUS_SERVICE_KEY !== 'undefined' ? BUS_SERVICE_KEY : "ldmePwR9ORO9g6kIfA72AI7pu0YL2Fz%2Ba%2BwOGUyihH89yRYXL7pncSbytwR9IpM3Z3wuUrGJ7lmrMNTi03Mpmg%3D%3D";
    var url = "http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteNoList"
      + "?serviceKey=" + serviceKey
      + "&cityCode=23"
      + "&routeNo=" + cleanNo
      + "&_type=xml";

    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var xmlText = response.getContentText();

    // 💡 항목별로 파싱하여 routeno가 완전 일치하는 routeid만 추출
    var itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    var itemMatch;
    var matchedRouteId = null;

    while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
      var itemXml = itemMatch[1];
      var noMatch = itemXml.match(/<routeno>(.*?)<\/routeno>/i);
      var idMatch = itemXml.match(/<routeid>(.*?)<\/routeid>/i);

      if (noMatch && idMatch && noMatch[1].trim().toUpperCase() === cleanNo) {
        matchedRouteId = idMatch[1].trim();
        break; // 완전 일치 발견 시 즉시 종료
      }
    }

    // 만약 완전 일치가 없고 첫 번째라도 있다면 최후의 폴백
    if (!matchedRouteId) {
      var fallbackMatch = xmlText.match(/<routeid>(.*?)<\/routeid>/i);
      if (fallbackMatch && fallbackMatch[1]) {
        matchedRouteId = fallbackMatch[1].trim();
      }
    }

    if (matchedRouteId) {
      cache.put("TAGO_ROUTE_ID_V3_" + cleanNo, matchedRouteId, 21600);
      Logger.log("✅ [노선ID 조회 성공] " + cleanNo + "번 -> ID: " + matchedRouteId);
      return matchedRouteId;
    } else {
      Logger.log("⚠️ 노선 ID를 찾지 못함. XML 응답: " + xmlText);
    }
  } catch (e) {
    Logger.log("❌ getTagoRouteId 에러: " + e.toString());
  }
  return null;
}

// 🚌 2. 취득한 routeId로 실시간 버스 위치 조회 (특수노선 202A/203A 스마트 트윈 폴백 지원)
function getIncheonBusLive(routeShort, targetPlateNo) {
  try {
    var serviceKey = typeof BUS_SERVICE_KEY !== 'undefined' ? BUS_SERVICE_KEY : "ldmePwR9ORO9g6kIfA72AI7pu0YL2Fz%2Ba%2BwOGUyihH89yRYXL7pncSbytwR9IpM3Z3wuUrGJ7lmrMNTi03Mpmg%3D%3D";

    var routeId = getTagoRouteId(routeShort);
    if (!routeId) {
      return "ERROR_ROUTE_ID_NOT_FOUND";
    }

    var url = "http://apis.data.go.kr/1613000/BusLcInfoInqireService/getRouteAcctoBusLcList"
      + "?serviceKey=" + serviceKey
      + "&cityCode=23"
      + "&routeId=" + routeId
      + "&numOfRows=100"
      + "&pageNo=1"
      + "&_type=xml";

    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var xmlText = response.getContentText();

    // 💡 [스마트 트윈 안테나 폴백]
    // 202A 또는 203A 조회 시, 타겟 차량번호가 202A/203A에 잡히지 않으면
    // 기사님이 아직 단말기를 정규 노선(202/203)으로 켜두셨을 가능성을 대비해 정규 노선도 함께 조회하여 병합합니다.
    var cleanRoute = String(routeShort || '').trim().toUpperCase();
    var cleanPlate = String(targetPlateNo || '').replace(/[^0-9]/g, '');

    if ((cleanRoute === '202A' || cleanRoute === '203A') && cleanPlate) {
      var hasBus = xmlText.indexOf(cleanPlate) !== -1;
      if (!hasBus) {
        var regularRoute = cleanRoute.replace('A', '');
        var regularRouteId = YEONGJONG_ROUTE_MAP[regularRoute];
        if (regularRouteId) {
          try {
            var fallbackUrl = "http://apis.data.go.kr/1613000/BusLcInfoInqireService/getRouteAcctoBusLcList"
              + "?serviceKey=" + serviceKey
              + "&cityCode=23"
              + "&routeId=" + regularRouteId
              + "&numOfRows=100"
              + "&pageNo=1"
              + "&_type=xml";
            var fallbackRes = UrlFetchApp.fetch(fallbackUrl, { muteHttpExceptions: true });
            var fallbackXml = fallbackRes.getContentText();
            if (fallbackXml.indexOf(cleanPlate) !== -1) {
              Logger.log("📡 [트윈 안테나 감지] " + cleanRoute + " 대신 정규 " + regularRoute + "에서 차량 " + cleanPlate + " 포착 성공!");
              return fallbackXml; // 정규 노선에서 차량 발견 시 반환
            }
          } catch (fallbackErr) {
            Logger.log("⚠️ 트윈 폴백 조회 중 오류: " + fallbackErr.toString());
          }
        }
      }
    }

    return xmlText;
  } catch (e) {
    Logger.log("❌ GAS fetch 에러: " + e.toString());
    return "ERROR_GAS: " + e.toString();
  }
}

// ================================================================
// 🚨 [국토교통부 ITS] 실시간 교통 돌발상황 및 소통정보 모듈
// ================================================================
const ITS_API_KEY = "6d86062ec0c14cee9f37825336f7608c";

// 1. 실시간 돌발상황 (사고, 공사, 통제) 조회 및 3분 캐싱
function getTrafficIncidentLive() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("ITS_INCIDENTS_V2");
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }

  try {
    const url = "https://openapi.its.go.kr:9443/eventInfo?apiKey=" + ITS_API_KEY + "&type=all&eventType=all&getType=json";
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json = JSON.parse(response.getContentText());

    let items = [];
    if (json && json.body && Array.isArray(json.body.items)) {
      items = json.body.items;
    }

    // 영종도, 인천, 공항고속도로, 경인선 등 수도권 서부 관내 중심 필터링
    const incheonIncidents = items.filter(function(item) {
      const cx = parseFloat(item.coordX);
      const cy = parseFloat(item.coordY);
      const rName = String(item.roadName || '');
      const msg = String(item.message || '');

      const isCoordMatch = (cx >= 126.30 && cx <= 126.85 && cy >= 37.30 && cy <= 37.65);
      const isNameMatch = rName.indexOf('영종') !== -1 || rName.indexOf('인천') !== -1 || rName.indexOf('공항') !== -1 || rName.indexOf('경인') !== -1 || rName.indexOf('제2경인') !== -1 || rName.indexOf('북인천') !== -1 || rName.indexOf('청라') !== -1 || rName.indexOf('하늘') !== -1;
      const isMsgMatch = msg.indexOf('영종') !== -1 || msg.indexOf('인천') !== -1 || msg.indexOf('공항') !== -1 || msg.indexOf('대교') !== -1;

      return isCoordMatch || isNameMatch || isMsgMatch;
    });

    const result = {
      success: true,
      timestamp: Utilities.formatDate(new Date(), "GMT+9", "yyyy-MM-dd HH:mm:ss"),
      incidents: incheonIncidents.length > 0 ? incheonIncidents : items.slice(0, 5)
    };

    cache.put("ITS_INCIDENTS_V2", JSON.stringify(result), 180); // 3분 캐시
    return result;
  } catch (err) {
    Logger.log("❌ getTrafficIncidentLive 에러: " + err.toString());
    return { success: false, error: err.toString(), incidents: [] };
  }
}

// 2. 실시간 교통 소통 정보 조회 (영종/인천 일대 바운딩 박스)
function getTrafficFlowLive() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("ITS_TRAFFIC_FLOW_V2");
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }

  try {
    const url = "https://openapi.its.go.kr:9443/trafficInfo?apiKey=" + ITS_API_KEY 
      + "&type=all&getType=json&minX=126.35&maxX=126.85&minY=37.35&maxY=37.65";
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json = JSON.parse(response.getContentText());

    let items = [];
    if (json && json.body && Array.isArray(json.body.items)) {
      items = json.body.items;
    }

    const result = {
      success: true,
      timestamp: Utilities.formatDate(new Date(), "GMT+9", "yyyy-MM-dd HH:mm:ss"),
      items: items.slice(0, 80)
    };

    cache.put("ITS_TRAFFIC_FLOW_V2", JSON.stringify(result), 180); // 3분 캐시
    return result;
  } catch (err) {
    Logger.log("❌ getTrafficFlowLive 에러: " + err.toString());
    return { success: false, error: err.toString(), items: [] };
  }
}
