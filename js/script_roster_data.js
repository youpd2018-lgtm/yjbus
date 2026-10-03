// ================================================================
// 📅 [근무표 - GitHub 데이터] data/roster/all.json 으로 기사들의 날짜별 근무(jpil_user_<이름>_sched_<날짜>)를 채운다
// - 원본은 data/roster/roster.csv (tools/build_roster.py 로 all.json 생성)
// - 근무표에는 근무하는 사람만 있다. 기사 명단(drivers)에 있는데 그 날짜에 없는 기사는 휴무로 처리한다
// - 규칙: 사용자가 앱에서 직접 고친 근무(jpil_user_<이름>_schededit_<날짜> 표시)는 절대 덮어쓰지 않는다. 그 외에는 GitHub 값이 우선
// - 서버(구글 시트) 데이터를 받은 직후에 채우기 때문에 loadDataFromGAS 뒤에 끼워 넣는다
// ================================================================
(function () {
  const LS_KEY = 'yb_roster_v1';
  const MIGRATE_KEY = 'yb_roster_migrated';
  const URL = 'data/roster/all.json';
  const EDITS_URL = 'data/roster/edits.json';   // 사용자가 앱에서 고친 근무 (GithubWrite.js 가 기록)
  const EDITS_KEY = 'yb_edits_v1';
  const RECENT_MS = 15 * 60 * 1000;           // 방금 내가 고친 값은 15분 동안 내 폰 값을 지킨다(GitHub 반영 지연 대비)
  let data = null; // { rev, days: { '2026-10-04': { '이름': {workType,busNo,route,seq,time} } } }
  let edits = null; // { days: { '2026-10-04': { '이름': {workType,...} } } }
  try { data = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { data = null; }
  try { edits = JSON.parse(localStorage.getItem(EDITS_KEY) || 'null'); } catch (e) { edits = null; }

  const OFF = { workType: '휴무', busNo: '', route: '', seq: '', time: '' };
  function dash(v) { return v === '' || v == null ? '-' : v; }
  function toSched(r) {
    const off = r.workType === '휴무';
    return JSON.stringify({
      workType: r.workType, busNo: off ? '-' : dash(r.busNo), route: dash(r.route),
      seq: off ? '-' : dash(r.seq), time: off ? '-' : dash(r.time)
    });
  }
  function dayStr(offset) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function fetchEdits() {
    return fetch(EDITS_URL, { cache: 'no-cache' })
      .then(res => res.ok ? res.json() : (res.status === 404 ? { days: {} } : Promise.reject(new Error('HTTP ' + res.status))))
      .then(json => { if (json && json.days) { edits = json; try { localStorage.setItem(EDITS_KEY, JSON.stringify(json)); } catch (e) { } } })
      .catch(err => console.warn('고친 근무 받기 실패(저장된 것 사용):', err));
  }
  function editOf(date, name) { return (edits && edits.days && edits.days[date] && edits.days[date][name]) || null; }
  // 방금 이 폰에서 고친 값이면 true (GitHub 반영 전까지 폰 값을 지킴). GitHub 에 같은 날 고친 기록이 없으면 계속 지킴
  function keepLocal(markKey, ed) {
    const mark = localStorage.getItem(markKey);
    if (!mark) return false;
    return !ed || (Date.now() - (parseInt(mark, 10) || 0) < RECENT_MS);
  }

  function fetchRoster() {
    return fetch(URL, { cache: 'no-cache' })
      .then(res => res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)))
      .then(json => {
        if (json && json.days) { data = json; try { localStorage.setItem(LS_KEY, JSON.stringify(json)); } catch (e) { } }
      })
      .catch(err => console.warn('근무표 받기 실패(저장된 것 사용):', err));
  }

  // 반환: 바뀐 칸 수
  function fill() {
    if (!data || !data.days) return 0;
    const from = dayStr(-1);
    const first = !localStorage.getItem(MIGRATE_KEY);
    let changed = 0;
    for (const date of Object.keys(data.days)) {
      if (date < from) continue;
      const people = data.days[date];
      const everyone = Array.from(new Set([...(data.drivers || []), ...Object.keys(people)]));
      for (const name of everyone) {
        const key = `jpil_user_${name}_sched_${date}`;
        const markKey = `jpil_user_${name}_schededit_${date}`;
        const ed = editOf(date, name);
        const gh = toSched(ed || people[name] || OFF);
        const cur = localStorage.getItem(key);
        if (keepLocal(markKey, ed)) continue; // 직접 고친 근무: 최우선
        if (cur === gh) continue;
        // 처음 한 번: 이미 있던 값이 GitHub 값과 다르면 직접 고친 것일 수 있으니 지키고 표시해 둔다
        if (first && cur) { try { localStorage.setItem(markKey, '1'); } catch (e) { } continue; }
        try { localStorage.setItem(key, gh); changed++; } catch (e) { }
      }
    }
    if (first) { try { localStorage.setItem(MIGRATE_KEY, '1'); } catch (e) { } }
    // 내가 고친 지난 근무(어제 이전)도 GitHub 고친 기록에서 채움
    try {
      const me = (typeof isFamilyUser !== 'undefined' && isFamilyUser) ? targetDriverName : currentDriver;
      if (me && edits && edits.days) {
        Object.keys(edits.days).forEach(date => {
          const ed = edits.days[date][me];
          if (!ed || (date >= from && data.days[date])) return;
          const key = `jpil_user_${me}_sched_${date}`, markKey = `jpil_user_${me}_schededit_${date}`;
          if (keepLocal(markKey, ed)) return;
          const v = toSched(ed);
          if (localStorage.getItem(key) !== v) { try { localStorage.setItem(key, v); changed++; } catch (e) { } }
        });
      }
    } catch (e) { }
    return changed;
  }

  // 📚 내 지난 근무: GitHub 월별 기록(data/roster/history/YYYY-MM.json)에서 '내 이름'만 읽어 jpil_user_<이름>_sched_<날짜> 를 채운다
  //    (달 파일의 rev 가 바뀐 달만 다시 받음. 앱에서 직접 고친 근무는 덮어쓰지 않음. 그 날짜에 내 이름이 없으면 휴무)
  const HIST_REV_KEY = 'yb_roster_hist_rev';
  function fillHistory() {
    let driverName = null;
    try { driverName = (typeof isFamilyUser !== 'undefined' && isFamilyUser) ? targetDriverName : currentDriver; } catch (e) { }
    if (!driverName) return Promise.resolve(0);
    let revs = {}; try { revs = JSON.parse(localStorage.getItem(HIST_REV_KEY) || '{}') || {}; } catch (e) { revs = {}; }
    return fetch('data/roster/history/index.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(idx => {
        if (!idx || !idx.months) return 0;
        const todo = Object.keys(idx.months).filter(m => revs[driverName + '|' + m] !== idx.months[m]);
        return Promise.all(todo.map(m => fetch('data/roster/history/' + m + '.json', { cache: 'no-cache' })
          .then(r => r.ok ? r.json() : null)
          .then(j => {
            if (!j || !j.days) return 0;
            let n = 0;
            Object.keys(j.days).forEach(date => {
              const key = `jpil_user_${driverName}_sched_${date}`;
              const ed = editOf(date, driverName);
              if (keepLocal(`jpil_user_${driverName}_schededit_${date}`, ed)) return;
              const gh = toSched(ed || j.days[date][driverName] || OFF);
              if (localStorage.getItem(key) !== gh) { try { localStorage.setItem(key, gh); n++; } catch (e) { } }
            });
            revs[driverName + '|' + m] = idx.months[m];
            return n;
          }).catch(() => 0))).then(arr => {
            try { localStorage.setItem(HIST_REV_KEY, JSON.stringify(revs)); } catch (e) { }
            return arr.reduce((x, y) => x + y, 0);
          });
      })
      .catch(() => 0);
  }
  window.ytRosterFillHistory = fillHistory;

  // 서버 데이터를 받은 직후에 채운다 (GitHub 근무표는 최대 3초만 기다린다)
  const origLoad = window.loadDataFromGAS;
  if (typeof origLoad === 'function') {
    window.loadDataFromGAS = async function () {
      try { await origLoad.apply(this, arguments); } catch (e) { }
      try {
        await Promise.race([Promise.all([fetchRoster(), fetchEdits()]), new Promise(r => setTimeout(r, 3000))]);
        fill();
        await fillHistory();
      } catch (e) { console.warn('근무표 채우기 실패:', e); }
    };
  } else {
    // 서버 불러오기 함수가 없으면 따로 받아서 채운다
    Promise.all([fetchRoster(), fetchEdits()]).then(() => { if (fill() && typeof window.searchSchedule === 'function') window.searchSchedule(); fillHistory(); });
  }
  window.ytRosterFill = fill;

  // ✍️ 내가 고친 근무를 서버(Apps Script)를 거쳐 GitHub(data/roster/edits.json)에 기록한다. 실패하면 대기열에 두고 다음에 다시 보낸다
  const PENDING_KEY = 'yb_duty_pending';
  let flushing = false;
  function loadPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]') || []; } catch (e) { return []; } }
  function savePending(a) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(a)); } catch (e) { } }
  function flushPending() {
    if (flushing || !window.GAS_WEB_APP_URL) return;
    const q = loadPending();
    if (!q.length) return;
    flushing = true;
    const it = q[0];
    fetch(window.GAS_WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'save_my_duty', driver: it.name, date: it.date, entry: it.entry }) })
      .then(r => r.json())
      .then(res => {
        flushing = false;
        if (res && res.success) { savePending(loadPending().filter(x => !(x.name === it.name && x.date === it.date && JSON.stringify(x.entry) === JSON.stringify(it.entry)))); flushPending(); }
        else console.warn('내 근무 GitHub 저장 실패(나중에 다시 보냄):', res && res.error);
      })
      .catch(() => { flushing = false; });
  }
  window.ytSaveMyDuty = function (date, entry) {
    const name = (typeof isFamilyUser !== 'undefined' && isFamilyUser) ? targetDriverName : currentDriver;
    if (!name) return;
    try { localStorage.setItem(`jpil_user_${name}_schededit_${date}`, String(Date.now())); } catch (e) { }
    const q = loadPending().filter(x => !(x.name === name && x.date === date)); // 같은 날짜의 이전 대기는 최신 값으로 교체
    q.push({ name: name, date: date, entry: entry });
    savePending(q);
    flushPending();
  };
  setTimeout(flushPending, 4000);
})();
