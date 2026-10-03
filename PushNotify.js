// ================================================================
// 🔔 [서버 푸시 발송] PushNotify.js
// - '첫 운행 1시간 전' 알림: 5분마다 실행되는 트리거(checkFirstRunPush)가 오늘 배차를 검사해
//   기사의 FCM 토큰(DB 시트 'fcm_{기사명}_...')으로 푸시를 발송합니다.
//   (실행 시간 절약: 아래 PUSH_ACTIVE_HOURS 시간대 밖에서는 시트를 읽지 않고 바로 종료)
// - 사전 설정(1회):
//   1) 스크립트 속성 FCM_SERVICE_ACCOUNT = Firebase 서비스 계정 JSON 전체 (절대 코드/저장소에 넣지 마세요)
//   2) (선택) 스크립트 속성 APP_URL = 알림 클릭 시 열 주소
//   3) 편집기에서 installFirstRunPushTrigger() 를 한 번 실행
// ================================================================

const PUSH_TZ_OFFSET = '+09:00';               // 근무표 기준 시간대 (KST)
const PUSH_LEAD_MIN = 60;                      // 첫 운행 몇 분 전에 알릴지
const PUSH_DEFAULT_APP_URL = 'https://youpd2018-lgtm.github.io/yjbus/';
const PUSH_WORK_TYPES = ['정상', '대타'];       // 알림 대상 근무 형태
// 실제로 검사하는 시간대(KST, 시 단위, 끝 시각 포함). 이 밖의 시간에는 바로 종료합니다.
//  - 오전 근무(첫 운행 04~07시): 알림은 03~06시  → [3, 6]  (6시대 전체 포함)
//  - 오후 근무(첫 운행 12~16시): 알림은 11~15시  → [11, 15] (15시대 전체 포함)
const PUSH_ACTIVE_HOURS = [[3, 6], [11, 15]];
const PUSH_TRIGGER_INTERVAL_MIN = 5;           // 트리거 실행 간격(분): 1, 5, 10, 15, 30 중 하나

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

// 현재 시(KST, 0~23)가 검사 대상 시간대인지 확인
function isPushActiveHour(hour) {
  return PUSH_ACTIVE_HOURS.some(function (r) { return hour >= r[0] && hour <= r[1]; });
}

function pushTryParse_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(String(v)); } catch (e) { return null; }
}

// ---------------------------------------------------------------
// 메인 트리거 함수 (5분마다 실행)
// ---------------------------------------------------------------

function checkFirstRunPush() {
  const now = new Date();
  // 검사 시간대가 아니면 시트를 읽지 않고 바로 종료 (실행 시간 한도 보호)
  if (!isPushActiveHour(Number(Utilities.formatDate(now, 'Asia/Seoul', 'H')))) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return; // 중복 실행 방지
  try {
    const nowMs = now.getTime();
    const today = Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd');

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('DB');
    if (!sheet) return;
    const rows = sheet.getDataRange().getValues();
    const db = {};
    for (let i = 0; i < rows.length; i++) if (rows[i][0]) db[String(rows[i][0])] = rows[i][1];

    const props = PropertiesService.getScriptProperties();
    const schedRe = /^jpil_user_(.+)_sched_(\d{4}-\d{2}-\d{2})$/;

    // 오늘 근무 목록: GitHub 근무표 + DB의 개인 근무(직접 고친 것은 DB 값이 우선, GitHub에 없는 기사는 DB 값 그대로)
    const todayScheds = {};
    Object.keys(db).forEach(function (key) {
      const m = key.match(schedRe);
      if (m && m[2] === today) todayScheds[m[1]] = pushTryParse_(db[key]);
    });
    try {
      const ghRows = ghRosterRows_(db);
      if (ghRows) ghRows.forEach(function (r) {
        if (r.date !== today) return;
        if (db['jpil_user_' + r.name + '_schededit_' + today] && todayScheds[r.name]) return; // 직접 고친 근무 우선
        todayScheds[r.name] = { workType: r.type, route: r.route, seq: r.seq, time: r.time, busNo: r.bus };
      });
    } catch (eGh) {}

    Object.keys(todayScheds).forEach(function (driver) {
      const sched = todayScheds[driver];
      if (!sched || PUSH_WORK_TYPES.indexOf(String(sched.workType || '').trim()) === -1) return;
      if (!sched.route || !sched.seq) return;

      let list = null;
      try { list = ghTimetableRounds_(sched.route, sched.seq); } catch (eTt) {}
      if (!list) list = pushTryParse_(db['yeongjong_shared_tt_' + sched.route + '_' + sched.seq]);
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
  ScriptApp.newTrigger('checkFirstRunPush').timeBased().everyMinutes(PUSH_TRIGGER_INTERVAL_MIN).create();
  console.log('checkFirstRunPush 트리거(' + PUSH_TRIGGER_INTERVAL_MIN + '분 간격)를 설치했습니다.');
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

// 편집기에서 이 함수를 선택해 실행: 스크립트 속성 TEST_PUSH_NAME 에 적힌 기사에게 테스트 푸시 발송
function sendTestPushToMe() {
  const name = PropertiesService.getScriptProperties().getProperty('TEST_PUSH_NAME');
  if (!name) { console.log('스크립트 속성 TEST_PUSH_NAME 에 기사 이름을 먼저 입력하세요.'); return 0; }
  return sendTestPush(name);
}


// ---------------------------------------------------------------
// 관리자가 직접 쓴 알림 보내기 (Auth.js의 admin_send_push 에서만 부름)
// sender: 알림 끝에 붙는 보낸사람 이름(선택)
// targets: '*' = 알림을 켜 둔 모든 기사 / 그 밖에는 쉼표로 이은 기사 이름
// ---------------------------------------------------------------
function pushAdminSend_(title, body, targets, sender) {
  title = String(title || '').trim().slice(0, 40);
  body = String(body || '').trim().slice(0, 200);
  sender = String(sender || '').trim().slice(0, 20);
  if (sender) body += '\n- ' + sender;   // 받는 사람이 누가 보냈는지 알 수 있게
  if (!title || !body) return { success: false, message: '제목과 내용을 모두 입력해 주세요.' };

  const users = authReadUsers_().filter(function (u) { return u && u.active !== false && u.userType !== 'family'; });
  let names;
  if (String(targets || '*') === '*') {
    names = users.map(function (u) { return u.name; });
  } else {
    const wanted = String(targets).split(',').map(function (n) { return n.trim(); }).filter(Boolean);
    names = users.map(function (u) { return u.name; }).filter(function (n) { return wanted.indexOf(n) >= 0; });
  }
  if (names.length === 0) return { success: false, message: '받을 기사가 없습니다.' };

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('DB');
  const rows = sheet.getDataRange().getValues();
  const db = {};
  for (let i = 0; i < rows.length; i++) if (rows[i][0]) db[String(rows[i][0])] = rows[i][1];

  const msg = { title: title, body: body, tag: 'admin-' + Date.now(), url: PropertiesService.getScriptProperties().getProperty('APP_URL') || PUSH_DEFAULT_APP_URL };
  let sentDrivers = 0;
  const noToken = [];
  names.forEach(function (name) {
    const tokens = pushCollectTokens_(db, name);
    if (tokens.length === 0) { noToken.push(name); return; }
    if (pushSendToTokens_(name, tokens, msg) > 0) sentDrivers++;
  });
  return { success: true, sent: sentDrivers, total: names.length, noToken: noToken };
}
