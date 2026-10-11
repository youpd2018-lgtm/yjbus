// ================================================================
// 🔐 [사용자 확인] Auth.js
// - 웹 앱 주소는 공개라서, 로그인한 사용자만 서버 기능을 쓰게 한다.
// - 요청마다 u(이름)와 p(기사번호 6자리 / 가족 비밀번호 4자리)를 받아 사용자 목록(DB의 yeongjong_users_db)과 맞춰 본다.
// - 로그인 전에 부를 수 있는 것은 login_by_pin, register_driver, register_family 뿐이다.
// - 사용자 목록은 이 파일의 함수로만 고친다 (아무나 save_to_server 로 덮어쓸 수 없다).
// ================================================================

const AUTH_ADMIN_NAME = '유재필';
const AUTH_USERS_KEY = 'yeongjong_users_db';
const AUTH_DELETED_ADMIN_KEY = 'yeongjong_deleted_by_admin';   // 관리자가 지운 사용자 기록 (위와 같은 방식)
const AUTH_NOTICE_KEY = 'yeongjong_notices_v2';   // 공지사항 목록(최신이 맨 앞). 사용자는 앱을 열 때 자기에게 해당하는 최신 공지를 팝업으로 봄
const AUTH_DELETED_KEY = 'yeongjong_deleted_users';   // 스스로 탈퇴한 사용자 기록(DB 시트에서만 보임, 앱에는 안 내려보냄)
const AUTH_PUBLIC_ACTIONS = { login_by_pin: true, register_driver: true, register_family: true, get_route_stops: true }; // get_route_stops: 정류장 이름·위치·구간시간(공개 정보)이라 로그인 없이 허용 (사용자 지시 2026-10-02)
const AUTH_MAX_FAIL_PER_NAME = 15;     // 같은 이름으로 10분에 15번 틀리면 잠시 막음
const AUTH_MAX_FAIL_GLOBAL = 20;       // 기사번호만으로 찾는 로그인은 10분에 20번 틀리면 잠시 막음
const AUTH_FAIL_WINDOW_SEC = 600;
const AUTH_MAX_VALUE_CHARS = 40000;    // 한 칸에 저장할 수 있는 글자 수(시트 한도 50,000자보다 작게)

function authJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- 사용자 목록 읽기/쓰기 ----------
function authReadUsers_() {
  let raw = '';
  try { raw = loadKeyFromServer(AUTH_USERS_KEY); } catch (e) { raw = ''; }
  try {
    const list = JSON.parse(String(raw || '[]'));
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function authWriteUsers_(list) {
  saveToServer(AUTH_USERS_KEY, JSON.stringify(list));
}

// 읽고-고치고-쓰기를 한 번에 (동시에 가입해도 서로 덮어쓰지 않도록 잠금)
function authUpdateUsers_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const list = authReadUsers_();
    const res = fn(list);
    if (res && res.save) authWriteUsers_(list);
    return res;
  } finally {
    lock.releaseLock();
  }
}

// ---------- 번호 형식 / 일치 확인 ----------
function authPinOk_(u, pin) {
  if (!u || u.active === false) return false;
  const stored = String(u.pin || '').trim();
  if (!stored || stored !== pin) return false;
  return u.userType === 'family' ? /^\d{4}$/.test(pin) : /^\d{6}$/.test(pin);
}

function authCount_(key) { return Number(CacheService.getScriptCache().get(key) || 0); }
function authBump_(key) {
  const c = CacheService.getScriptCache();
  c.put(key, String(Number(c.get(key) || 0) + 1), AUTH_FAIL_WINDOW_SEC);
}

// 이름 + 번호로 사용자 확인. 맞으면 사용자 기록, 아니면 null
function authCheck_(name, pin) {
  name = String(name || '').trim();
  pin = String(pin || '').trim();
  if (!name || !pin || name.length > 30) return null;
  const failKey = 'authfail_' + name;
  if (authCount_(failKey) >= AUTH_MAX_FAIL_PER_NAME) return null;
  const u = authReadUsers_().find(function (x) { return x && x.name === name; });
  if (authPinOk_(u, pin)) return u;
  authBump_(failKey);
  return null;
}

// 요청 한 건의 사용자 확인. 로그인 전용 요청이면 user 는 null, 실패하면 error
function authGate_(p) {
  p = p || {};
  if (AUTH_PUBLIC_ACTIONS[String(p.action || '')]) return { user: null };
  const u = authCheck_(p.u, p.p);
  if (!u) return { error: { success: false, error: 'auth', message: '로그인이 필요합니다. 앱에서 다시 로그인해 주세요.' } };
  return { user: u };
}

function authIsAdmin_(u) { return !!u && u.name === AUTH_ADMIN_NAME && u.userType !== 'family'; }

// ---------- 내보낼 사용자 정보 (다른 사람 번호는 가린다) ----------
function authPublicUser_(u, withPin) {
  const isFamily = u.userType === 'family';
  const o = {
    name: u.name,
    userType: isFamily ? 'family' : 'driver',
    active: u.active !== false,
    v2: !isFamily && /^\d{6}$/.test(String(u.pin || '').trim())
  };
  if (u.targetDriver) o.targetDriver = u.targetDriver;
  if (!isFamily && u.phone) o.phone = u.phone;
  if (u.registeredAt) o.registeredAt = u.registeredAt;
  if (u.hideWork) o.hideWork = true;   // 내 근무 정보 감추기(모든사용자 화면에서 비공개로 보임)
  o.pin = withPin ? String(u.pin || '') : '';
  return o;
}

// 본인과 관리자에게만 번호를 보여 준다
function authUsersFor_(viewer, users) {
  const admin = authIsAdmin_(viewer);
  return users.filter(function (u) { return u && u.name; }).map(function (u) {
    return authPublicUser_(u, admin || (viewer && viewer.name === u.name));
  });
}

// ---------- DB 키 읽기/쓰기 허용 범위 ----------
function authOwnNames_(viewer) {
  const names = [viewer.name];
  if (viewer.userType === 'family' && viewer.targetDriver) names.push(viewer.targetDriver);
  return names;
}

function authCanRead_(viewer, key) {
  key = String(key || '');
  if (!viewer || !key) return false;
  if (key === 'latest_colleague_msg' || key.indexOf('yeongjong_shared_routememo_') === 0) return true;
  // 근무표(고친 근무 포함)는 GitHub에 공개된 정보와 같아서 모든 이름을 허용
  if (/^jpil_user_.+_(sched|schededit)_\d{4}-\d{2}-\d{2}$/.test(key)) return true;
  // 그 밖의 개인 기록은 본인(가족은 연결된 기사)만
  return authOwnNames_(viewer).some(function (n) { return key.indexOf('jpil_user_' + n + '_') === 0; });
}

function authCanWrite_(viewer, key, value) {
  key = String(key || '');
  if (!viewer || !key || key.length > 200) return false;
  if (value !== undefined && value !== null && String(value).length > AUTH_MAX_VALUE_CHARS) return false;
  if (key === AUTH_USERS_KEY) return false;
  if (key === 'latest_colleague_msg' || key.indexOf('yeongjong_shared_routememo_') === 0) return true;
  if (authOwnNames_(viewer).some(function (n) { return key.indexOf('jpil_user_' + n + '_') === 0; })) return true;
  if (viewer.userType !== 'family' && key.indexOf('fcm_' + viewer.name + '_') === 0) return true;
  return false;
}

// load_from_server 응답: 허용된 항목만 + 사용자 목록(가려서)
function authFilterDb_(viewer, db) {
  const out = {};
  Object.keys(db || {}).forEach(function (k) {
    if (k === AUTH_USERS_KEY) return;
    if (authCanRead_(viewer, k)) out[k] = db[k];
  });
  out[AUTH_USERS_KEY] = JSON.stringify(authUsersFor_(viewer, authReadUsers_()));
  return out;
}

// ---------- 로그인 (기사번호/비밀번호로 이름 찾기) ----------
function authLoginByPin_(pin) {
  pin = String(pin || '').trim();
  if (!/^(\d{4}|\d{6})$/.test(pin)) return { success: false, error: 'format', message: '기사번호 6자리 또는 가족 비밀번호 4자리를 입력해 주세요.' };
  if (authCount_('authfail_global') >= AUTH_MAX_FAIL_GLOBAL) {
    return { success: false, error: 'locked', message: '시도가 너무 많습니다. 10분 뒤에 다시 해 주세요.' };
  }
  const users = authReadUsers_();
  const matched = {};
  let any = false;
  users.forEach(function (u) {
    if (u && u.name && authPinOk_(u, pin)) {
      matched[u.name] = true; any = true;
      CacheService.getScriptCache().remove('authfail_' + u.name); // 번호를 맞게 입력했으면 잠금 해제
    }
  });
  if (!any) authBump_('authfail_global');
  // 가입은 했지만 관리자 승인 전인 사용자
  const pending = !any && users.some(function (u) { return u && u.name && u.active === false && String(u.pin || '').trim() === pin; });
  const list = users.filter(function (u) { return u && u.name; }).map(function (u) { return authPublicUser_(u, !!matched[u.name]); });
  const data = {};
  data[AUTH_USERS_KEY] = JSON.stringify(list);
  return { success: true, matched: any, pending: pending, data: data };
}

// ---------- 가입 ----------
function authRosterNames_() {
  try {
    const j = ghFetchJson_('data/roster/all.json');
    return (j && Array.isArray(j.drivers)) ? j.drivers : null;
  } catch (e) { return null; }
}

function authCleanName_(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }

function authRegisterDriver_(p) {
  const name = authCleanName_(p.name);
  const pin = String(p.pin || '').trim();
  const phone = String(p.phone || '').replace(/[^0-9]/g, '');
  if (!name || name.length > 20) return { success: false, message: '이름을 확인해 주세요.' };
  if (!/^\d{6}$/.test(pin)) return { success: false, message: '기사번호는 숫자 6자리입니다.' };
  if (phone && !/^\d{9,11}$/.test(phone)) return { success: false, message: '연락처는 숫자 9~11자리로 입력해 주세요.' };
  const roster = authRosterNames_();
  if (roster === null) return { success: false, message: '기사 명단을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  if (roster.indexOf(name) < 0) return { success: false, message: '기사 명단에 없는 이름입니다. 이름을 확인해 주세요.' };
  const res = authUpdateUsers_(function (list) {
    const exist = list.find(function (u) { return u && u.name === name; });
    if (exist && exist.userType === 'family') return { success: false, message: '가족 사용자로 이미 등록된 이름입니다.' };
    if (exist && /^\d{6}$/.test(String(exist.pin || '').trim())) return { success: false, message: '이미 가입된 이름입니다. 기사번호로 로그인해 주세요.' };
    if (list.some(function (u) { return u && u.name !== name && u.userType !== 'family' && String(u.pin || '').trim() === pin; })) {
      return { success: false, message: '이미 다른 기사님이 사용 중인 기사번호입니다.' };
    }
    const now = new Date().toISOString();
    if (exist) {
      exist.pin = pin; exist.phone = phone; exist.userType = 'driver'; exist.registeredAt = now;
    } else {
      list.push({ name: name, pin: pin, phone: phone, active: name === AUTH_ADMIN_NAME, userType: 'driver', registeredAt: now });
    }
    const me = list.find(function (u) { return u && u.name === name; });
    return { success: true, save: true, pending: me.active === false };
  });
  if (res && res.success && res.pending) authNotifyAdminSignup_(name, '기사');
  return res;
}

function authRegisterFamily_(p) {
  const name = authCleanName_(p.name);
  const pin = String(p.pin || '').trim();
  const target = authCleanName_(p.target);
  if (!name || name.length > 20) return { success: false, message: '가족 이름을 확인해 주세요.' };
  if (!/^\d{4}$/.test(pin)) return { success: false, message: '가족 비밀번호는 숫자 4자리입니다.' };
  // 기사번호 없이 가입하고, 관리자가 승인해야 로그인된다
  const driver = authReadUsers_().find(function (u) { return u && u.name === target && u.userType !== 'family' && u.active !== false; });
  if (!driver) return { success: false, message: '그 이름의 기사님을 찾지 못했습니다. 이름을 다시 확인해 주세요.' };
  const res = authUpdateUsers_(function (list) {
    if (list.some(function (u) { return u && u.name === name; })) return { success: false, message: '이미 등록된 이름입니다.' };
    // 가족은 승인 없이 바로 사용 (사용자 지시 2026-10-11). 한 기사님당 5명까지만 만들 수 있다.
    if (list.filter(function (u) { return u && u.userType === 'family' && u.targetDriver === target; }).length >= 5) {
      return { success: false, message: '이 기사님께 등록할 수 있는 가족 수(5명)를 넘었습니다.' };
    }
    list.push({ name: name, pin: pin, active: true, userType: 'family', targetDriver: target, registeredAt: new Date().toISOString() });
    return { success: true, save: true, pending: false };
  });
  if (res && res.success) authNotifyAdminSignup_(name, '가족', true);
  return res;
}

// 새 가입 신청이 들어오면 관리자(유재필)에게 푸시 알림 (실패해도 가입은 그대로 진행)
function authNotifyAdminSignup_(name, kind, autoApproved) {
  try { pushNotifyAdmin_(autoApproved ? '새 가족 사용자' : '새 가입 신청', autoApproved ? name + ' ' + kind + '님이 가입했습니다. (승인 없이 바로 사용 가능)' : name + ' ' + kind + '님이 가입을 신청했습니다. 사용자 관리에서 승인해 주세요.'); } catch (e) { console.warn('가입 알림 실패', e); }
}

// ---------- 로그인 후 사용자 관리 ----------
function authUpdateMyPhone_(viewer, phoneRaw) {
  const phone = String(phoneRaw || '').replace(/[^0-9]/g, '');
  if (phone && !/^\d{9,11}$/.test(phone)) return { success: false, message: '연락처는 숫자 9~11자리로 입력해 주세요.' };
  if (viewer.userType === 'family') return { success: false, message: '가족 사용자는 연락처를 저장하지 않습니다.' };
  return authUpdateUsers_(function (list) {
    const me = list.find(function (u) { return u && u.name === viewer.name; });
    if (!me) return { success: false, message: '사용자를 찾지 못했습니다.' };
    me.phone = phone;
    return { success: true, save: true };
  });
}

// 내 근무 정보 감추기 켜기/끄기 (본인만, 가족 계정은 불가)
function authSetHideWork_(viewer, on) {
  if (!viewer || viewer.userType === 'family') return { success: false, message: '가족 사용자는 사용할 수 없습니다.' };
  const flag = String(on) === '1' || String(on) === 'true';
  return authUpdateUsers_(function (list) {
    const me = list.find(function (u) { return u && u.name === viewer.name; });
    if (!me) return { success: false, message: '사용자를 찾지 못했습니다.' };
    if (flag) me.hideWork = true; else delete me.hideWork;
    return { success: true, save: true, hideWork: flag };
  });
}

// ---------- 공지사항 ----------
// 관리자가 [공지 배포]하면 목록 맨 앞에 쌓이고(예전 공지는 서버에 남음), 사용자는 자기에게 해당하는 가장 최근 공지 하나만 본다.
// 삭제하면 그 순간부터 배포되지 않는다. targets: '*'(전체) 또는 이름 배열.
function authReadNotices_() {
  let list = [];
  try { list = JSON.parse(String(loadKeyFromServer(AUTH_NOTICE_KEY) || '[]')); } catch (e) { list = []; }
  return Array.isArray(list) ? list : [];
}
function authNoticeFor_(n, name) {
  return n && (n.targets === '*' || (Array.isArray(n.targets) && n.targets.indexOf(name) >= 0));
}

function authGetNotice_(viewer) {
  if (!viewer || viewer.userType === 'family') return { success: true, notice: null };   // 가족 사용자는 공지 대상이 아님
  const list = authReadNotices_();   // 최신이 맨 앞
  const n = list.find(function (x) { return authNoticeFor_(x, viewer.name); });
  if (!n) return { success: true, notice: null };
  return { success: true, notice: { id: String(n.id), title: String(n.title || ''), body: String(n.body || '') } };
}

function authAdminPublishNotice_(viewer, p) {
  if (!authIsAdmin_(viewer)) return { success: false, message: '관리자만 할 수 있습니다.' };
  const title = String(p.title || '').trim().slice(0, 60);
  const body = String(p.body || '').trim().slice(0, 2000);
  if (!title && !body) return { success: false, message: '제목이나 내용을 써 주세요.' };
  let targets = '*';
  if (p.targets && String(p.targets) !== '*') {
    targets = String(p.targets).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    if (!targets.length) return { success: false, message: '받을 사람을 고르거나 전체로 보내 주세요.' };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const list = authReadNotices_();
    list.unshift({
      id: String(new Date().getTime()), title: title, body: body, targets: targets,
      createdAt: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss')
    });
    while (list.length > 1 && JSON.stringify(list).length > AUTH_MAX_VALUE_CHARS - 200) list.pop();
    saveToServer(AUTH_NOTICE_KEY, JSON.stringify(list));
    return { success: true };
  } finally { lock.releaseLock(); }
}

function authAdminListNotices_(viewer) {
  if (!authIsAdmin_(viewer)) return { success: false, message: '관리자만 할 수 있습니다.' };
  const list = authReadNotices_();
  const names = authReadUsers_().filter(function (u) { return u && u.name && u.active !== false && u.userType !== 'family'; }).map(function (u) { return u.name; });
  const live = {};   // 누군가에게 '가장 최근 공지'인 것 = 배포중
  names.forEach(function (nm) {
    const n = list.find(function (x) { return authNoticeFor_(x, nm); });
    if (n) live[n.id] = true;
  });
  return { success: true, notices: list.map(function (n) {
    return { id: n.id, title: n.title, body: n.body, targets: n.targets, createdAt: n.createdAt, live: !!live[n.id] };
  }) };
}

function authAdminDeleteNotice_(viewer, id) {
  if (!authIsAdmin_(viewer)) return { success: false, message: '관리자만 할 수 있습니다.' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const list = authReadNotices_().filter(function (n) { return String(n.id) !== String(id); });
    saveToServer(AUTH_NOTICE_KEY, JSON.stringify(list));
    return { success: true };
  } finally { lock.releaseLock(); }
}

function authAdminDeleteUser_(viewer, name) {
  if (!authIsAdmin_(viewer)) return { success: false, message: '관리자만 할 수 있습니다.' };
  name = String(name || '').trim();
  if (!name || name === AUTH_ADMIN_NAME) return { success: false, message: '관리자 계정은 삭제할 수 없습니다.' };
  return authUpdateUsers_(function (list) {
    const idx = list.findIndex(function (u) { return u && u.name === name; });
    if (idx < 0) return { success: false, message: '사용자를 찾지 못했습니다.' };
    const gone = list.splice(idx, 1)[0] || {};
    authLogDeleted_(gone, AUTH_DELETED_ADMIN_KEY);
    return { success: true, save: true };
  });
}

// 내 계정 삭제: 앱을 더 이상 쓰지 않는 본인만 자신의 사용자 정보를 지운다 (관리자 계정은 불가)
function authDeleteMe_(viewer) {
  if (!viewer || !viewer.name) return { success: false, message: '로그인 정보를 확인하지 못했습니다.' };
  if (viewer.name === AUTH_ADMIN_NAME) return { success: false, message: '관리자 계정은 삭제할 수 없습니다.' };
  const name = viewer.name;
  return authUpdateUsers_(function (list) {
    const idx = list.findIndex(function (u) { return u && u.name === name; });
    if (idx < 0) return { success: false, message: '사용자를 찾지 못했습니다.' };
    const gone = list.splice(idx, 1)[0] || {};
    authLogDeleted_(gone);
    return { success: true, save: true };
  });
}

// 탈퇴 기록 한 줄 추가 (기사번호는 남기지 않음, 오래된 것은 밀려남)
function authLogDeleted_(u, key) {
  key = key || AUTH_DELETED_KEY;
  try {
    let arr = [];
    try { arr = JSON.parse(String(loadKeyFromServer(key) || '[]')); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    arr.push({
      name: u.name || '', userType: u.userType || 'driver', phone: u.phone || '',
      targetDriver: u.targetDriver || '', deletedAt: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss')
    });
    while (JSON.stringify(arr).length > AUTH_MAX_VALUE_CHARS - 500) arr.shift();
    saveToServer(key, JSON.stringify(arr));
  } catch (e) { }
}

function authAdminApproveUser_(viewer, name) {
  if (!authIsAdmin_(viewer)) return { success: false, message: '관리자만 할 수 있습니다.' };
  name = String(name || '').trim();
  return authUpdateUsers_(function (list) {
    const u = list.find(function (x) { return x && x.name === name; });
    if (!u) return { success: false, message: '사용자를 찾지 못했습니다.' };
    u.active = true;
    return { success: true, save: true };
  });
}

// 사용자 관련 요청 처리 (doGet/doPost 공통). 해당 없으면 null
function authHandle_(p, viewer) {
  switch (String(p.action || '')) {
    case 'login_by_pin': return authLoginByPin_(p.pin);
    case 'register_driver': return authRegisterDriver_(p);
    case 'register_family': return authRegisterFamily_(p);
    case 'update_my_phone': return authUpdateMyPhone_(viewer, p.phone);
    case 'get_notice': return authGetNotice_(viewer);
    case 'admin_publish_notice': return authAdminPublishNotice_(viewer, p);
    case 'admin_list_notices': return authAdminListNotices_(viewer);
    case 'admin_delete_notice': return authAdminDeleteNotice_(viewer, p.id);
    case 'set_hide_work': return authSetHideWork_(viewer, p.on);
    case 'delete_my_account': return authDeleteMe_(viewer);
    case 'admin_approve_user': return authAdminApproveUser_(viewer, p.name);
    case 'admin_delete_user': return authAdminDeleteUser_(viewer, p.name);
    case 'admin_send_push': return authIsAdmin_(viewer) ? pushAdminSend_(p.title, p.body, p.targets, p.sender) : { success: false, message: '관리자만 할 수 있습니다.' };
    default: return null;
  }
}

// 운행습관 요청의 기사 이름: 본인(가족은 연결된 기사, 관리자는 지정한 기사)만 허용하고, 아니면 본인 이름으로 바꾼다
function authDriverFor_(viewer, wanted) {
  wanted = String(wanted || '').trim();
  if (authIsAdmin_(viewer) && wanted) return wanted;
  if (wanted && authOwnNames_(viewer).indexOf(wanted) >= 0) return wanted;
  return viewer.name;
}
