// ================================================================
// 📅 [구차장용 로컬 데이터] 일일근무표(오늘~5일) + 노선 시간표(routeDataMap)를 폰에서 조합
// - 앱을 열면 서버(get_daily_roster)에서 근무표를 받아 localStorage 'yb_daily_roster'에 저장
// - 구차장 질문 시 서버 시트 검색 없이 이 데이터로 수첩(buildDailyRosterReport)을 만든다
// ================================================================
const DAILY_ROSTER_KEY = 'yb_daily_roster';

function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadDailyRosterCache() {
  try {
    const o = JSON.parse(localStorage.getItem(DAILY_ROSTER_KEY) || 'null');
    if (o && Array.isArray(o.rows)) return o;
  } catch (e) { }
  return null;
}

function refreshDailyRoster(force) {
  const cached = loadDailyRosterCache();
  // 하루 한 번: 오늘 이미 받아 둔 게 있으면 다시 받지 않는다
  if (!force && cached && cached.savedDate === localDateStr()) return;
  if (!window.GAS_WEB_APP_URL) return;
  fetch(window.GAS_WEB_APP_URL + '?action=get_daily_roster&days=5')
    .then(r => r.json())
    .then(data => {
      if (data && data.success && Array.isArray(data.rows)) {
        try {
          localStorage.setItem(DAILY_ROSTER_KEY, JSON.stringify({ fetchedAt: Date.now(), savedDate: localDateStr(), today: data.today, rows: data.rows }));
        } catch (e) { }
      } else {
        console.warn('일일근무표 불러오기 실패:', data && data.error);
      }
    })
    .catch(err => console.warn('일일근무표 네트워크 오류:', err));
}

// 앱을 연 뒤 화면이 뜨고 조금 있다가 조용히 받아 둔다 (하루 한 번, 날짜가 바뀌면 다시)
window.addEventListener('load', () => setTimeout(() => refreshDailyRoster(false), 3000));
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDailyRoster(false); });

function loadRouteDataMapLocal() {
  try {
    const m = JSON.parse(localStorage.getItem('yeongjong_shared_routeDataMap') || '{}');
    return (m && typeof m === 'object') ? m : {};
  } catch (e) { return {}; }
}

// 노선 시간표 한 순번을 글로 만든다 (노란색 칸 = 교대시간)
// headers[0]=출발 장소, headers[1]=기점(회차) 장소, headers[2]=도착 장소 / time1=출발, time2=기점, time3=도착
const TT_ROLE = ['출발', '기점(회차)', '도착'];
function describeSeqTimetable(routeMap, route, seqLabel) {
  const rt = routeMap && routeMap[route];
  const rounds = rt && rt.data && rt.data[seqLabel];
  if (!Array.isArray(rounds) || rounds.length === 0) return '';
  const heads = (rt.headers || []);
  let swap = '';
  const lines = rounds.map((r, i) => {
    const cells = [];
    ['1', '2', '3'].forEach((n, k) => {
      const t = r['time' + n];
      if (!t) return;
      const isSwap = r['c' + n] === 'yellow';
      if (isSwap) swap = `${t} (${heads[k] || TT_ROLE[k]})`;
      cells.push(`${TT_ROLE[k]} ${heads[k] || ''} ${t}${isSwap ? '(교대시간)' : ''}`.replace(/\s+/g, ' '));
    });
    return `${i + 1}회차: ${cells.join(' / ')}`;
  });
  const placeLine = `※ ${route} 장소: 출발=${heads[0] || '-'}, 기점(회차)=${heads[1] || '-'}, 도착=${heads[2] || '-'}`;
  return placeLine + '\n  ' + lines.join('\n  ') + (swap ? `\n  ※ 교대시간: ${swap}` : '');
}

// 질문에서 날짜를 읽는다 (오늘/내일/모레/글피, N월 N일, N일). 못 읽으면 null
function parseQuestionDate(query, todayStr) {
  const base = new Date(todayStr + 'T00:00:00');
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const add = n => { const d = new Date(base); d.setDate(d.getDate() + n); return fmt(d); };
  if (/글피/.test(query)) return add(3);
  if (/모레/.test(query)) return add(2);
  if (/내일/.test(query)) return add(1);
  if (/오늘/.test(query)) return add(0);
  let m = query.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (m) return `${base.getFullYear()}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  m = query.match(/(\d{1,2})\s*일/);
  if (m) {
    const d = new Date(base.getFullYear(), base.getMonth(), parseInt(m[1], 10));
    return fmt(d);
  }
  return null;
}

// 🧠 구차장 수첩의 '일일근무표 + 시간표' 부분
function buildDailyRosterReport(queryText, myName) {
  const roster = loadDailyRosterCache();
  if (!roster || roster.rows.length === 0) return '';
  const query = (queryText || '').trim();
  const rows = roster.rows.map(r => ({ date: r[0], name: r[1], type: r[2], route: r[3], bus: r[4], seq: r[5], time: r[6] }));
  const todayStr = roster.today || rows[0].date;
  const routeMap = loadRouteDataMapLocal();
  const seqNo = s => parseInt(String(s).replace(/[^0-9]/g, ''), 10);
  const isWork = r => r.route && r.route !== '-' && r.seq && r.seq !== '-';
  const fmtRow = r => `${r.name} ${isWork(r) ? `${r.route} ${r.seq} ${r.time} 차량 ${r.bus || '-'}` : r.type || '휴무'}`;

  const out = [`\n[일일근무표 (폰에 저장된 공식 근무표, 기준 ${todayStr}, ${new Date(roster.fetchedAt || Date.now()).toLocaleTimeString('ko-KR')} 갱신)]`];

  // 1. 질문이 가리키는 날짜 (없으면 내가 일하는 가장 가까운 날)
  const mine = rows.filter(r => r.name === myName).sort((a, b) => a.date.localeCompare(b.date));
  let targetDate = parseQuestionDate(query, todayStr);
  if (!targetDate) {
    const nextWork = mine.find(isWork);
    targetDate = nextWork ? nextWork.date : todayStr;
  }

  // 2. 내 근무 (오늘~5일)
  out.push(`- ${myName} 기사님 근무: ` + (mine.length ? mine.map(r => `${r.date} ${isWork(r) ? `${r.route} ${r.seq} ${r.time} 차량 ${r.bus || '-'}` : (r.type || '휴무')}`).join(' / ') : '일일근무표에 없음'));

  // 3. 기준 날짜의 내 순번: 시간표, 교대자, 앞·뒷순번
  const myT = mine.find(r => r.date === targetDate && isWork(r));
  if (myT) {
    out.push(`\n[${targetDate} ${myName} 기사님: ${myT.route} ${myT.seq} ${myT.time}]`);
    const tt = describeSeqTimetable(routeMap, myT.route, myT.seq);
    if (tt) out.push(`- 시간표 (${myT.route} ${myT.seq}):\n  ${tt}`);
    const same = rows.filter(r => r.date === targetDate && r.route === myT.route && r.seq === myT.seq && r.name !== myName);
    out.push(`- 같은 순번 교대 기사님: ${same.length ? same.map(r => `${r.name}(${r.time}, 차량 ${r.bus || '-'})`).join(', ') : '없음'}`);
    const n = seqNo(myT.seq);
    [[n - 1, '앞순번'], [n + 1, '뒷순번']].forEach(([k, label]) => {
      const list = rows.filter(r => r.date === targetDate && r.route === myT.route && seqNo(r.seq) === k);
      if (list.length) out.push(`- ${label}(${k}순번): ` + list.map(r => `${r.name}(${r.time}, 차량 ${r.bus || '-'})`).join(', '));
    });
  } else {
    out.push(`- ${targetDate}에는 ${myName} 기사님 운행이 일일근무표에 없습니다.`);
  }

  // 4. 질문에 나온 기사님 이름 / 차량번호
  const names = Array.from(new Set(rows.map(r => r.name))).filter(nm => nm && nm !== myName && query.includes(nm));
  names.slice(0, 3).forEach(nm => {
    const list = rows.filter(r => r.name === nm).sort((a, b) => a.date.localeCompare(b.date));
    out.push(`\n[${nm} 기사님 근무] ` + list.map(r => `${r.date} ${isWork(r) ? `${r.route} ${r.seq} ${r.time} 차량 ${r.bus || '-'}` : (r.type || '휴무')}`).join(' / '));
    const t = list.find(r => r.date === targetDate && isWork(r));
    if (t) {
      const tt = describeSeqTimetable(routeMap, t.route, t.seq);
      if (tt) out.push(`  ${targetDate} 시간표 (${t.route} ${t.seq}):\n  ${tt}`);
    }
  });
  const busM = query.match(/(?:^|\D)(\d{4})(?:\D|$)/);
  if (busM) {
    const list = rows.filter(r => String(r.bus).includes(busM[1])).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    if (list.length) out.push(`\n[차량 ${busM[1]} 배차] ` + list.map(r => `${r.date} ${r.name}(${r.route} ${r.seq} ${r.time})`).join(' / '));
  }

  // 5. 노선·순번을 직접 말한 경우 (예: "202 3순번")
  const rs = query.match(/(\d{3}[A-Z]?)\s*(?:번|번\s*버스)?\s*(\d{1,2})\s*순번/i);
  if (rs) {
    const list = rows.filter(r => r.date === targetDate && r.route.startsWith(rs[1]) && seqNo(r.seq) === parseInt(rs[2], 10));
    if (list.length) {
      out.push(`\n[${targetDate} ${rs[1]}번 ${rs[2]}순번] ` + list.map(fmtRow).join(' / '));
      const tt = describeSeqTimetable(routeMap, list[0].route, list[0].seq);
      if (tt) out.push(`  시간표:\n  ${tt}`);
    }
  }
  return out.join('\n');
}
