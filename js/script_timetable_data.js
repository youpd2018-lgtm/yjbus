// ================================================================
// 📅 [개별 시간표 - GitHub 데이터] data/timetable/all.json 을 읽어 시간표·장소 이름을 제공한다
// - 원본은 data/timetable/timetable.csv (tools/build_timetable.py 로 all.json 생성)
// - 시간표/장소 헤더/1회차 전용 헤더를 이 데이터로 대체하고, 없는 노선·순번은 기존(구글 시트) 방식으로 대신한다
// - 한 번 받은 데이터는 폰에 저장해 두어 다음 실행부터 바로 쓰고, 뒤에서 최신본을 받아 갱신한다
// ================================================================
(function () {
  const LS_KEY = 'yb_tt_data_v1';
  const URL = 'data/timetable/all.json';
  let data = null; // { rev, tt: { '202평일(16대)': { '1': [rounds] } } }

  try { data = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { data = null; }

  function seqNum(seq) { const m = String(seq || '').match(/\d+/); return m ? m[0] : ''; }
  function getRounds(route, seq) {
    const r = data && data.tt && data.tt[route];
    const list = r && r[seqNum(seq)];
    return (Array.isArray(list) && list.length) ? list : null;
  }
  // 순번의 '정상' 장소 이름 = 마지막 회차의 장소 (1회차만 다른 순번이 있기 때문)
  function normalPlaces(rounds) { return rounds[rounds.length - 1].places; }

  const origGetItem = window.customGetItem;
  const origGetHeader = window.getHeaderArray;
  const origGetFirst = window.getFirstTripHeaderArray;

  window.customGetItem = function (route, seq) {
    const rounds = getRounds(route, seq);
    if (!rounds) return origGetItem ? origGetItem(route, seq) : [];
    return rounds.map(r => ({
      time1: r.time1, time2: r.time2, time3: r.time3,
      c1: r.c1 || 'black', c2: r.c2 || 'black', c3: r.c3 || 'black', dist: r.dist
    }));
  };
  window.getHeaderArray = function (route, seq) {
    const rounds = getRounds(route, seq);
    if (!rounds) return origGetHeader ? origGetHeader(route, seq) : ['차고지', '대우하나', '차고지'];
    return normalPlaces(rounds).slice();
  };
  window.getFirstTripHeaderArray = function (route, seq) {
    const rounds = getRounds(route, seq);
    if (!rounds) return origGetFirst ? origGetFirst(route, seq) : { enabled: false, headers: [] };
    const normal = normalPlaces(rounds);
    const first = rounds[0].places;
    const same = first.every((p, i) => p === normal[i]);
    return same ? { enabled: false, headers: [] } : { enabled: true, headers: first.slice() };
  };
  window.ytTimetableRounds = getRounds;
  // GitHub 시간표에 있는 노선 이름 목록 / 노선별 순번 개수 (근무정보 > 노선시간표 목록용)
  window.ytTimetableRoutes = function () { return data && data.tt ? Object.keys(data.tt) : []; };
  window.ytTimetableSeqCount = function (route) {
    const r = data && data.tt && data.tt[route];
    return r ? Object.keys(r).length : 0;
  };

  function refresh() {
    fetch(URL, { cache: 'no-cache' })
      .then(res => res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)))
      .then(json => {
        if (!json || !json.tt) return;
        const changed = !data || data.rev !== json.rev;
        data = json;
        try { localStorage.setItem(LS_KEY, JSON.stringify(json)); } catch (e) { }
        // 처음 받았거나 새 버전이면 화면을 다시 그림
        if (changed && typeof window.searchSchedule === 'function') { try { window.searchSchedule(); } catch (e) { } }
        if (changed && typeof window.initAllRouteTimetableUI === 'function') { try { window.initAllRouteTimetableUI(); } catch (e) { } }
        if (changed && typeof window.initRouteDropdowns === 'function') { try { window.initRouteDropdowns(); } catch (e) { } }
      })
      .catch(err => console.warn('개별 시간표 받기 실패(저장된 것 또는 기존 방식 사용):', err));
  }
  refresh();
})();
