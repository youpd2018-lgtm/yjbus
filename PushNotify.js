// ================================================================
// 🔔 [서버 푸시 발송] PushNotify.js
// - '첫 운행 1시간 전' 알림: 매분 실행되는 트리거(checkFirstRunPush)가 오늘 배차를 검사해
//   기사의 FCM 토큰(DB 시트 'fcm_{기사명}_...')으로 푸시를 발송합니다.
// - 사전 설정(1회):
//   1) 스크립트 속성 FCM_SERVICE_ACCOUNT = Firebase 서비스 계정 JSON 전체 (절대 코드/저장소에 넣지 마세요)
//   2) (선택) 스크립트 속성 APP_URL = 알림 클릭 시 열 주소
//   3) 편집기에서 installFirstRunPushTrigger() 를 한 번 실행
// ================================================================

const PUSH_TZ_OFFSET = '+09:00';               // 근무표 기준 시간대 (KST)
const PUSH_LEAD_MIN = 60;                      // 첫 운행 몇 분 전에 알릴지
const PUSH_DEFAULT_APP_URL = 'https://youpd2018-lgtm.github.io/yjbus/';
const PUSH_WORK_TYPES = ['정상', '대타'];       // 알림 대상 근무 형태

// ---------------------------------------------------------------
// 순수 로직 (시트/네트워크 의존 없음)
// ---------------------------------------------------------------

function pushParseMinutes_(timeStr) {
  const m = String(timeStr || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]); // 24:10 처럼 자정 넘김 표기도 허용
}

// 회차 행에서 출발 시각: time1 우선, 비어 있으면 앞쪽 컬럼부터 첫 유효 시각 (화면 로직과 동일)
function pushRowStartTime_(row) {
  if (!row) return null;
  if (pushParseMinutes_(row.time1) !== null) return String(row.time1).trim();
  for (let c = 2; c <= 10; c++) {
    if (pushParseMinutes_(row['time' + c]) !== null) return String(row['time' + c]).trim();
  }
  return null;
}

function pushIsYellowRow_(row) {
  if (!row) return false;
  return Object.keys(row).some(function (k) { return /^c\d+$/.test(k) && row[k] === 'yellow'; });
}

// 첫 운행 시각 판별: 오전 = 첫 회차, 오후 = 교대(yellow) 회차의 바로 다음 회차
function getFirstRunTime(list, timeType) {
  if (!Array.isArray(list) || list.length === 0) return null;
  if (String(timeType || '').indexOf('오전') !== -1) return pushRowStartTime_(list[0]);

  let yellowIdx = -1;
  for (let i = 0; i < list.length; i++) {
    if (pushIsYellowRow_(list[i])) { yellowIdx = i; break; }
  }
  if (yellowIdx === -1 && list.length >= 3) yellowIdx = 2; // 화면과 동일한 기본 교대 위치
  if (yellowIdx === -1) return null;
  const next = list[yellowIdx + 1] || list[yellowIdx];
  return pushRowStartTime_(next);
}

// 'YYYY-MM-DD' + 'HH:MM' → epoch ms (KST)
function pushToEpochMs_(dateStr, timeStr) {
  const mins = pushParseMinutes_(timeStr);
  if (mins === null) return null;
  return new Date(dateStr + 'T00:00:00' + PUSH_TZ_OFFSET).getTime() + mins * 60000;
}

// 발송 조건: (첫 운행 - 60분) 이상이고 첫 운행 전일 때만 (늦게 켜진 트리거가 지난 알림을 뒤늦게 보내지 않도록)
function shouldSendFirstRunPush(nowMs, firstRunMs, leadMin) {
  if (firstRunMs === null || firstRunMs === undefined) return false;
  return nowMs >= firstRunMs - (leadMin || PUSH_LEAD_MIN) * 60000 && nowMs < firstRunMs;
}

function pushTryParse_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(String(v)); } catch (e) { return null; }
}

// ---------------------------------------------------------------
// 메인 트리거 함수 (매분 실행)
// ---------------------------------------------------------------

function checkFirstRunPush() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return; // 중복 실행 방지
  try {
    const now = new Date();
    const nowMs = now.getTime();
    const today = Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd');

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('DB');
    if (!sheet) return;
    const rows = sheet.getDataRange().getValues();
    const db = {};
    for (let i = 0; i < rows.length; i++) if (rows[i][0]) db[String(rows[i][0])] = rows[i][1];

    const props = PropertiesService.getScriptProperties();
    const schedRe = /^jpil_user_(.+)_sched_(\d{4}-\d{2}-\d{2})$/;

    Object.keys(db).forEach(function (key) {
      const m = key.match(schedRe);
      if (!m || m[2] !== today) return;
      const driver = m[1];

      const sched = pushTryParse_(db[key]);
      if (!sched || PUSH_WORK_TYPES.indexOf(String(sched.workType || '').trim()) === -1) return;
      if (!sched.route || !sched.seq) return;

      const list = pushTryParse_(db['yeongjong_shared_tt_' + sched.route + '_' + sched.seq]);
      const firstRun = getFirstRunTime(list, sched.time);
      const firstRunMs = pushToEpochMs_(today, firstRun);
      if (!shouldSendFirstRunPush(nowMs, firstRunMs, PUSH_LEAD_MIN)) return;

      const sentKey = 'push_first_' + today + '_' + driver;
      if (props.getProperty(sentKey)) return; // 이미 발송함

      const tokens = pushCollectTokens_(db, driver);
      if (tokens.length === 0) return;

      const body = '첫 운행 ' + firstRun + ' 출발 1시간 전입니다.'
        + (sched.busNo ? ' (차량 ' + sched.busNo + ')' : '')
        + ' ' + sched.route + ' ' + sched.seq;
      const sent = pushSendToTokens_(driver, tokens, {
        title: '🚌 첫 운행 1시간 전',
        body: body,
        tag: 'first-run-' + today,
        url: props.getProperty('APP_URL') || PUSH_DEFAULT_APP_URL
      });
      if (sent > 0) props.setProperty(sentKey, String(nowMs)); // 1건 이상 성공 시에만 발송 완료 처리
    });

    pushCleanupSentFlags_(props, today);
  } finally {
    lock.releaseLock();
  }
}

// DB의 'fcm_{기사명}_...' 키에서 해당 기사의 토큰 수집 (빈 값=해제된 토큰 제외, 중복 제거)
function pushCollectTokens_(db, driver) {
  const prefix = 'fcm_' + driver + '_';
  const seen = {};
  const out = [];
  Object.keys(db).forEach(function (k) {
    if (k.indexOf(prefix) !== 0) return;
    const v = pushTryParse_(db[k]);
    if (!v || !v.token || seen[v.token]) return;
    seen[v.token] = true;
    out.push({ token: v.token, dbKey: k });
  });
  return out;
}

// 오늘 이전의 발송 기록은 정리 (스크립트 속성 용량 보호)
function pushCleanupSentFlags_(props, today) {
  const all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    const m = k.match(/^push_first_(\d{4}-\d{2}-\d{2})_/);
    if (m && m[1] < today) props.deleteProperty(k);
  });
}

// ---------------------------------------------------------------
// FCM HTTP v1 발송
// ---------------------------------------------------------------

function pushSendToTokens_(driver, tokens, msg) {
  const sa = pushGetServiceAccount_();
  const accessToken = pushGetAccessToken_(sa);
  const url = 'https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send';
  let ok = 0;

  tokens.forEach(function (t) {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + accessToken },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        message: {
          token: t.token,
          // data 메시지: 서비스 워커(onBackgroundMessage)가 표시
          data: { title: msg.title, body: msg.body, tag: msg.tag, url: msg.url },
          webpush: { headers: { Urgency: 'high', TTL: '3600' } }
        }
      })
    });
    const code = res.getResponseCode();
    if (code === 200) { ok++; return; }
    const text = res.getContentText();
    console.warn('FCM 발송 실패', driver, code, text.slice(0, 300));
    // 만료/무효 토큰은 DB에서 비움 (saveToServer 빈 값 = 해제)
    if (code === 404 || (code === 400 && /UNREGISTERED|INVALID_ARGUMENT/.test(text))) {
      try { saveToServer(t.dbKey, ''); } catch (e) {}
    }
  });
  return ok;
}

function pushGetServiceAccount_() {
  const raw = PropertiesService.getScriptProperties().getProperty('FCM_SERVICE_ACCOUNT');
  if (!raw) throw new Error('스크립트 속성 FCM_SERVICE_ACCOUNT(서비스 계정 JSON)가 설정되지 않았습니다.');
  return JSON.parse(raw);
}

function pushB64Url_(input) {
  const bytes = typeof input === 'string' ? Utilities.newBlob(input).getBytes() : input;
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

// 서비스 계정 JWT → OAuth2 액세스 토큰 (캐시 50분)
function pushGetAccessToken_(sa) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('fcm_access_token');
  if (cached) return cached;

  const nowSec = Math.floor(Date.now() / 1000);
  const header = pushB64Url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = pushB64Url_(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600
  }));
  const unsigned = header + '.' + claim;
  const signature = pushB64Url_(Utilities.computeRsaSha256Signature(unsigned, sa.private_key));

  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + signature }
  });
  const json = JSON.parse(res.getContentText());
  if (!json.access_token) throw new Error('FCM 액세스 토큰 발급 실패: ' + res.getContentText().slice(0, 200));
  cache.put('fcm_access_token', json.access_token, 3000);
  return json.access_token;
}

// ---------------------------------------------------------------
// 설치/테스트 도우미 (Apps Script 편집기에서 수동 실행)
// ---------------------------------------------------------------

function installFirstRunPushTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkFirstRunPush') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkFirstRunPush').timeBased().everyMinutes(1).create();
  console.log('checkFirstRunPush 트리거(1분 간격)를 설치했습니다.');
}

// 특정 기사에게 테스트 푸시 발송: sendTestPush('홍길동')
function sendTestPush(driverName) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('DB');
  const rows = sheet.getDataRange().getValues();
  const db = {};
  for (let i = 0; i < rows.length; i++) if (rows[i][0]) db[String(rows[i][0])] = rows[i][1];
  const tokens = pushCollectTokens_(db, driverName);
  if (tokens.length === 0) { console.log('등록된 FCM 토큰이 없습니다: ' + driverName); return 0; }
  return pushSendToTokens_(driverName, tokens, {
    title: '🔔 테스트 알림', body: driverName + ' 기사님, 푸시 알림이 정상 동작합니다.',
    tag: 'test', url: PropertiesService.getScriptProperties().getProperty('APP_URL') || PUSH_DEFAULT_APP_URL
  });
}
