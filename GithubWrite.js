// ================================================================
// ✍️ [GitHub에 내 근무 수정 기록] GithubWrite.js
// - 사용자가 앱에서 고친 근무를 data/roster/edits.json 에 기록한다 (시트 DB에는 저장하지 않음)
// - 쓰는 열쇠(토큰)는 Apps Script '스크립트 속성' GITHUB_TOKEN 에만 둔다 (앱·GitHub 파일에는 없음)
// - 모양: {"rev":"...","days":{"2026-10-04":{"이름":{workType,busNo,route,seq,time}}}}
// - 같은 날짜·기사의 기록이 있으면 덮어쓰고, 없으면 새로 만든다. entry 가 null 이면 그 기록을 지운다(회사 근무표대로 되돌림)
// - 회사 전체 근무표(roster.csv/all.json)는 이 파일을 건드리지 않으므로, 근무표를 새로 올려도 사용자가 고친 값은 그대로다
// ================================================================
const GHW_REPO = 'youpd2018-lgtm/yjbus';
const GHW_BRANCH = 'main';
const GHW_EDITS_PATH = 'data/roster/edits.json';

function ghwApi_(method, path, payload) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN') || '';
  if (!token) return { code: 0, error: 'no_token' };
  const opt = {
    method: method, muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'yjbus-gas' }
  };
  if (payload) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(payload); }
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + GHW_REPO + '/contents/' + path + (method === 'GET' ? '?ref=' + GHW_BRANCH : ''), opt);
  let body = null; try { body = JSON.parse(res.getContentText('UTF-8')); } catch (e) { }
  return { code: res.getResponseCode(), body: body };
}

function ghwTodayKst_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
}

function ghwDayDiff_(date) {
  const a = new Date(date + 'T00:00:00+09:00').getTime(), b = new Date(ghwTodayKst_() + 'T00:00:00+09:00').getTime();
  return Math.round((a - b) / 86400000);
}

function ghwClean_(v, n) { return String(v == null ? '' : v).replace(/[\r\n\t]/g, ' ').trim().substr(0, n || 30); }

// p: {driver, date, entry|null}  (driver 는 Code.js 에서 로그인 사용자 기준으로 이미 확인됨)
function saveMyDuty(p) {
  const name = ghwClean_(p.driver, 20), date = String(p.date || '');
  if (!name) return { success: false, error: 'no_driver' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: 'bad_date' };
  const diff = ghwDayDiff_(date);
  if (isNaN(diff) || diff < -90 || diff > 120) return { success: false, error: 'date_range' };
  let entry = null;
  if (p.entry && typeof p.entry === 'object') {
    entry = { workType: ghwClean_(p.entry.workType, 10), busNo: ghwClean_(p.entry.busNo, 12), route: ghwClean_(p.entry.route, 30), seq: ghwClean_(p.entry.seq, 10), time: ghwClean_(p.entry.time, 10) };
    if (!entry.workType) return { success: false, error: 'bad_entry' };
  }
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { success: false, error: 'busy' }; }
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const got = ghwApi_('GET', GHW_EDITS_PATH);
      if (got.error) return { success: false, error: got.error };
      let doc = { rev: '', days: {} }, sha;
      if (got.code === 200 && got.body && got.body.content) {
        sha = got.body.sha;
        try { doc = JSON.parse(Utilities.newBlob(Utilities.base64Decode(String(got.body.content).replace(/\s/g, ''))).getDataAsString('UTF-8')); } catch (e) { return { success: false, error: 'parse' }; }
        if (!doc.days) doc.days = {};
      } else if (got.code !== 404) {
        return { success: false, error: 'github_' + got.code };
      }
      if (entry) {
        doc.days[date] = doc.days[date] || {};
        doc.days[date][name] = entry;
      } else if (doc.days[date]) {
        delete doc.days[date][name];
        if (!Object.keys(doc.days[date]).length) delete doc.days[date];
      }
      const body = JSON.stringify(doc.days, Object.keys(doc.days).sort());
      doc.rev = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, body).map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').substr(0, 8);
      const text = JSON.stringify({ rev: doc.rev, days: doc.days });
      const put = ghwApi_('PUT', GHW_EDITS_PATH, {
        message: '근무 수정: ' + name + ' ' + date + (entry ? '' : ' (되돌림)'),
        content: Utilities.base64Encode(Utilities.newBlob(text).getBytes()),
        branch: GHW_BRANCH, sha: sha
      });
      if (put.code === 200 || put.code === 201) {
        try { const c = CacheService.getScriptCache(); for (let i = 0; i < 6; i++) c.remove('gh_' + GHW_EDITS_PATH + '_' + i); c.remove('gh_' + GHW_EDITS_PATH + '_n'); } catch (e) { }
        return { success: true };
      }
      if (put.code !== 409 && put.code !== 422) return { success: false, error: 'github_' + put.code };
      Utilities.sleep(800); // 다른 쪽이 먼저 바꿨으면 다시 읽어서 재시도
    }
    return { success: false, error: 'conflict' };
  } finally {
    lock.releaseLock();
  }
}
