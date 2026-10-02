// ================================================================
// 🔐 [사용자 확인] Auth.js
// - 웹 앱 주소는 공개라서, 로그인한 사용자만 서버 기능을 쓰게 한다.
// - 요청마다 u(이름)와 p(기사번호 6자리 / 가족 비밀번호 4자리)를 받아 사용자 목록(DB의 yeongjong_users_db)과 맞춰 본다.
// - 로그인 전에 부를 수 있는 것은 login_by_pin, register_driver, register_family 뿐이다.
// - 사용자 목록은 이 파일의 함수로만 고친다 (아무나 save_to_server 로 덮어쓸 수 없다).
// ================================================================

const AUTH_ADMIN_NAME = '유재필';
const AUTH_USERS_KEY = 'yeongjong_users_db';
const AUTH_PUBLIC_ACTIONS = { login_by_pin: true, register_driver: true, register_family: true };
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
  const list = users.filter(function (u) { return u && u.name; }).map(function (u) { return authPublicUser_(u, !!matched[u.name]); });
  const data = {};
  data[AUTH_USERS_KEY] = JSON.stringify(list);
  return { success: true, matched: any, data: data };
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
  return authUpdateUsers_(function (list) {
    const exist = list.find(function (u) { return u && u.name === name; });
    if (exist && exist.userType === 'family') return { success: false, message: '가족 사용자로 이미 등록된 이름입니다.' };
    if (exist && /^\d{6}$/.test(String(exist.pin || '').trim())) return { success: false, message: '이미 가입된 이름입니다. 기사번호로 로그인해 주세요.' };
    if (list.some(function (u) { return u && u.name !== name && u.userType !== 'family' && String(u.pin || '').trim() === pin; })) {
      return { success: false, message: '이미 다른 기사님이 사용 중인 기사번호입니다.' };
    }
    const now = new Date().toISOString();
    if (exist) {
      exist.pin = pin; exist.phone = phone; exist.active = true; exist.userType = 'driver'; exist.registeredAt = now;
    } else {
      list.push({ name: name, pin: pin, phone: phone, active: true, userType: 'driver', registeredAt: now });
    }
    return { success: true, save: true };
  });
}

function authRegisterFamily_(p) {
  const name = authCleanName_(p.name);
  const pin = String(p.pin || '').trim();
  const target = authCleanName_(p.target);
  if (!name || name.length > 20) return { success: false, message: '가족 이름을 확인해 주세요.' };
  if (!/^\d{4}$/.test(pin)) return { success: false, message: '가족 비밀번호는 숫자 4자리입니다.' };
  // 공유받을 기사님 본인의 기사번호를 알아야 등록할 수 있다
  const owner = authCheck_(target, p.targetPin);
  if (!owner || owner.userType === 'family') return { success: false, message: '기사님 이름과 기사번호가 맞지 않습니다.' };
  return authUpdateUsers_(function (list) {
    if (list.some(function (u) { return u && u.name === name; })) return { success: false, message: '이미 등록된 이름입니다.' };
    list.push({ name: name, pin: pin, active: true, userType: 'family', targetDriver: target });
    return { success: true, save: true };
  });
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

function authAdminDeleteUser_(viewer, name) {
  if (!authIsAdmin_(viewer)) return { success: false, message: '관리자만 할 수 있습니다.' };
  name = String(name || '').trim();
  if (!name || name === AUTH_ADMIN_NAME) return { success: false, message: '관리자 계정은 삭제할 수 없습니다.' };
  return authUpdateUsers_(function (list) {
    const idx = list.findIndex(function (u) { return u && u.name === name; });
    if (idx < 0) return { success: false, message: '사용자를 찾지 못했습니다.' };
    list.splice(idx, 1);
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
    case 'admin_delete_user': return authAdminDeleteUser_(viewer, p.name);
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
