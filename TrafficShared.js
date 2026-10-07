// 🚦 소통·돌발정보 공유 저장소 (2026-10-07)
// 국토교통부 주소는 Apps Script에서 막혀 있어, 운행 중인 폰 한 대가 영종·청라 전체를 받아 여기에 올리고
// 다른 폰은 여기서 읽는다. 값이 10분(소통)/30분(돌발) 지났을 때만 한 대가 새로 받는다(월 호출 한도 절약).
// kind: 't' = 소통정보 { 링크번호: 속도 }, 'e' = 돌발정보 [ { roadName, message, eventDetailType, coordX, coordY } ]
var TRAFFIC_SHARED_MAX_ = 95000;   // 캐시 값 1개 한도(100KB) 아래
var TRAFFIC_SHARED_TTL_ = 21600;   // 6시간
var TRAFFIC_SHARED_MONTH_LIMIT_ = 4800;   // 국토부 월 5000건 중 여유를 둔 상한

function trafficSharedGet_() {
  var c = CacheService.getScriptCache(), out = { success: true, now: Date.now() };
  ['t', 'e'].forEach(function (k) {
    var raw = c.get('tl_' + k);
    if (raw) { try { out[k] = JSON.parse(raw); } catch (err) { } }
  });
  return out;
}

// 새로 받을 사람을 한 명만 정한다: 같은 종류는 90초 안에 한 번만 허락
function trafficSharedClaim_(kind) {
  if (kind !== 't' && kind !== 'e') return { success: false, error: 'bad kind' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (err) { return { success: true, ok: false }; }
  try {
    var c = CacheService.getScriptCache();
    if (c.get('tl_claim_' + kind)) return { success: true, ok: false };
    // 월 호출 한도(5000건) 보호: 이번 달 허락한 횟수가 4800번을 넘으면 더 허락하지 않는다
    var props = PropertiesService.getScriptProperties(), ym = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMM');
    var cnt = (props.getProperty('TL_MONTH') === ym) ? Number(props.getProperty('TL_COUNT') || 0) : 0;
    if (cnt >= TRAFFIC_SHARED_MONTH_LIMIT_) return { success: true, ok: false, limit: true };
    props.setProperty('TL_MONTH', ym); props.setProperty('TL_COUNT', String(cnt + 1));
    c.put('tl_claim_' + kind, String(Date.now()), 90);
    return { success: true, ok: true };
  } finally { lock.releaseLock(); }
}

function trafficSharedPut_(kind, data) {
  if (kind !== 't' && kind !== 'e') return { success: false, error: 'bad kind' };
  if (!data || typeof data !== 'object') return { success: false, error: 'bad data' };
  var raw = JSON.stringify({ at: Date.now(), data: data });
  if (raw.length > TRAFFIC_SHARED_MAX_) return { success: false, error: 'too big' };
  CacheService.getScriptCache().put('tl_' + kind, raw, TRAFFIC_SHARED_TTL_);
  return { success: true };
}
