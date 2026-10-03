// ================================================================
// 🐙 [GitHub 데이터 읽기] GithubData.js
// - 시간표(data/timetable/all.json)와 전체 기사 근무표(data/roster/all.json)를 GitHub Pages에서 받아 온다
// - 구차장(Code.js)과 푸시 알림(PushNotify.js)이 구글 시트 대신 이 데이터를 먼저 쓴다. 못 받으면 기존 시트 방식으로 대신한다
// - 앱에서 직접 고친 근무(data/roster/edits.json, GithubWrite.js 가 기록)는 근무표 값보다 우선한다
// ================================================================
const GH_PAGES_BASE = 'https://youpd2018-lgtm.github.io/yjbus/';
const GH_CACHE_SEC = 300; // 5분

// JSON 파일 받기 (캐시는 한 칸 100KB 제한이라 90000자씩 나눠 저장). 실패하면 null
function ghFetchJson_(path) {
  const cache = CacheService.getScriptCache();
  const ck = 'gh_' + path;
  try {
    const n = Number(cache.get(ck + '_n') || 0);
    if (n > 0) {
      let txt = '';
      for (let i = 0; i < n; i++) {
        const part = cache.get(ck + '_' + i);
        if (part === null) { txt = null; break; }
        txt += part;
      }
      if (txt) return JSON.parse(txt);
    }
  } catch (e) {}
  try {
    const res = UrlFetchApp.fetch(GH_PAGES_BASE + path + '?t=' + Date.now(), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    const txt = res.getContentText('UTF-8');
    const json = JSON.parse(txt);
    try {
      const size = 90000, parts = Math.ceil(txt.length / size);
      for (let i = 0; i < parts; i++) cache.put(ck + '_' + i, txt.substr(i * size, size), GH_CACHE_SEC);
      cache.put(ck + '_n', String(parts), GH_CACHE_SEC);
    } catch (e) {}
    return json;
  } catch (e) {
    return null;
  }
}

// 시간표: route 이름('281휴일(7대)') + 순번('5순번' 또는 5) → 회차 목록 [{places,time1..3,c1..3,dist}]. 없으면 null
function ghTimetableRounds_(route, seq) {
  const j = ghFetchJson_('data/timetable/all.json');
  const r = j && j.tt && j.tt[route];
  const m = String(seq).match(/\d+/);
  const list = r && m && r[m[0]];
  return (Array.isArray(list) && list.length) ? list : null;
}

// routeDataMap 모양 {노선: {headers, data: {'N순번': 회차들}}} 으로 바꿔 돌려준다. 못 받으면 null
function ghRouteDataMap_() {
  const j = ghFetchJson_('data/timetable/all.json');
  if (!j || !j.tt) return null;
  const map = {};
  Object.keys(j.tt).forEach(function (route) {
    const seqs = j.tt[route], data = {};
    let headers = [];
    Object.keys(seqs).forEach(function (n) {
      const rounds = seqs[n];
      if (!rounds || !rounds.length) return;
      data[n + '순번'] = rounds;
      headers = rounds[rounds.length - 1].places || headers;
    });
    map[route] = { headers: headers, data: data };
  });
  return map;
}

// DB 시트 전체를 {키: 값} 으로 읽기
function ghReadDb_() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('DB');
  const db = {};
  if (!sheet) return db;
  const rows = sheet.getDataRange().getValues();
  for (let i = 0; i < rows.length; i++) if (rows[i][0]) db[String(rows[i][0])] = rows[i][1];
  return db;
}

function ghParse_(v) {
  if (v && typeof v === 'object') return v;
  try { return JSON.parse(String(v)); } catch (e) { return null; }
}

// 전체 기사 근무표 → [{date,name,type,route,bus,seq,time}]. 직접 고친 근무는 edits.json 값을 쓴다. 못 받으면 null
function ghRosterRows_(db) {
  const j = ghFetchJson_('data/roster/all.json');
  if (!j || !j.days) return null;
  // 사용자가 직접 고친 근무는 data/roster/edits.json (GitHub) 에 있다. 시트 DB는 보지 않는다
  const ed = ghFetchJson_('data/roster/edits.json');
  const edits = (ed && ed.days) ? ed.days : {};
  const rows = [];
  Object.keys(j.days).sort().forEach(function (date) {
    const people = j.days[date];
    // 근무표에는 근무하는 사람만 있다: 명단(drivers)에 있는데 그 날짜에 없으면 휴무
    const everyone = Object.keys(people);
    (j.drivers || []).forEach(function (n) { if (!people[n]) everyone.push(n); });
    everyone.forEach(function (name) {
      let rec = people[name] || { workType: '휴무' };
      if (edits[date] && edits[date][name]) rec = edits[date][name];
      const off = rec.workType === '휴무';
      const clean = function (v) { return (off || v === '-' || v == null) ? '' : String(v); };
      rows.push({ date: date, name: name, type: String(rec.workType || ''), route: clean(rec.route), bus: clean(rec.busNo), seq: clean(rec.seq), time: clean(rec.time) });
    });
  });
  return rows;
}
