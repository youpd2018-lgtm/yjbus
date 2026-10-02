// ================================================================
// 📅 [근무표 - GitHub 데이터] data/roster/all.json 으로 기사들의 날짜별 근무(jpil_user_<이름>_sched_<날짜>)를 채운다
// - 원본은 data/roster/roster.csv (tools/build_roster.py 로 all.json 생성)
// - 규칙: 사용자가 앱에서 직접 고친 근무(jpil_user_<이름>_schededit_<날짜> 표시)는 절대 덮어쓰지 않는다. 그 외에는 GitHub 값이 우선
// - 서버(구글 시트) 데이터를 받은 직후에 채우기 때문에 loadDataFromGAS 뒤에 끼워 넣는다
// ================================================================
(function () {
  const LS_KEY = 'yb_roster_v1';
  const MIGRATE_KEY = 'yb_roster_migrated';
  const URL = 'data/roster/all.json';
  let data = null; // { rev, days: { '2026-10-04': { '이름': {workType,busNo,route,seq,time} } } }
  try { data = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { data = null; }

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
      for (const name of Object.keys(people)) {
        const key = `jpil_user_${name}_sched_${date}`;
        const markKey = `jpil_user_${name}_schededit_${date}`;
        const gh = toSched(people[name]);
        const cur = localStorage.getItem(key);
        if (localStorage.getItem(markKey)) continue; // 직접 고친 근무: 최우선
        if (cur === gh) continue;
        // 처음 한 번: 이미 있던 값이 GitHub 값과 다르면 직접 고친 것일 수 있으니 지키고 표시해 둔다
        if (first && cur) { try { localStorage.setItem(markKey, '1'); } catch (e) { } continue; }
        try { localStorage.setItem(key, gh); changed++; } catch (e) { }
      }
    }
    if (first) { try { localStorage.setItem(MIGRATE_KEY, '1'); } catch (e) { } }
    return changed;
  }

  // 서버 데이터를 받은 직후에 채운다 (GitHub 근무표는 최대 3초만 기다린다)
  const origLoad = window.loadDataFromGAS;
  if (typeof origLoad === 'function') {
    window.loadDataFromGAS = async function () {
      try { await origLoad.apply(this, arguments); } catch (e) { }
      try {
        await Promise.race([fetchRoster(), new Promise(r => setTimeout(r, 3000))]);
        fill();
      } catch (e) { console.warn('근무표 채우기 실패:', e); }
    };
  } else {
    // 서버 불러오기 함수가 없으면 따로 받아서 채운다
    fetchRoster().then(() => { if (fill() && typeof window.searchSchedule === 'function') window.searchSchedule(); });
  }
  window.ytRosterFill = fill;
})();
