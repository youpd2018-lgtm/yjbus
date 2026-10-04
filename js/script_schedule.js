// ================================================================
// 🗂️ [3단 서류철 위젯] 노선정보 / 교대정보 / 오늘의메모 통합 모듈 (BOARD_DB 시트 직결)
// ================================================================

// 1. 로그인 기사명 추출 헬퍼 (유재필 등)
function getLoggedInDriverName() {
  if (window.currentDriver && typeof window.currentDriver === 'string') return window.currentDriver.trim();
  if (typeof currentDriver !== 'undefined' && currentDriver) return String(currentDriver).trim();
  try {
    const saved = localStorage.getItem('loggedInUser');
    if (saved) {
      const u = JSON.parse(saved);
      if (u && u.name) return String(u.name).trim();
    }
  } catch(e) {}
  return "유재필";
}

// 2. 키값 추출 헬퍼 (노선번호 숫자만 / 날짜기사키)
function getCurrentActiveRouteNumber() {
  // 1) 현재 선택된 날짜의 개인 스케줄 데이터 확인 (최우선 정확도)
  try {
    const dateInput = document.getElementById('searchDate');
    const dateStr = dateInput ? dateInput.value : '';
    if (dateStr) {
      const driverKey = typeof getDriverKey === 'function' ? getDriverKey(`sched_${dateStr}`) : `sched_${dateStr}`;
      const saved = localStorage.getItem(driverKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (data && data.route && data.route !== '-' && data.route !== '휴무') {
          const m = String(data.route).match(/\d+/);
          if (m) return m[0];
        }
      }
    }
  } catch(e) {}

  // 2) 메인 화면에 렌더링된 resRoute
  const resRouteEl = document.getElementById('resRoute');
  if (resRouteEl && resRouteEl.innerText && resRouteEl.innerText !== '-' && resRouteEl.innerText !== '휴무') {
    const m = resRouteEl.innerText.match(/\d+/);
    if (m) return m[0];
  }

  // 3) 메인 화면 bliRouteNum (단, '-' 아닌 경우)
  const bliRouteEl = document.getElementById('bliRouteNum');
  if (bliRouteEl && bliRouteEl.innerText && bliRouteEl.innerText !== '-' && bliRouteEl.innerText !== '휴무') {
    const m = bliRouteEl.innerText.match(/\d+/);
    if (m) return m[0];
  }

  // 4) 등록 모달 regRoute
  const regRouteEl = document.getElementById('regRoute');
  if (regRouteEl && regRouteEl.value && regRouteEl.value !== '-' && regRouteEl.value !== '휴무') {
    const m = regRouteEl.value.match(/\d+/);
    if (m) return m[0];
  }

  // 5) 기본값
  return '281';
}

// 2-1. 휴일/휴무일 여부 판별 헬퍼
function isCurrentSelectedDateHoliday() {
  try {
    const dateInput = document.getElementById('searchDate');
    const dateStr = dateInput ? dateInput.value : '';
    if (dateStr) {
      const driverKey = typeof getDriverKey === 'function' ? getDriverKey(`sched_${dateStr}`) : `sched_${dateStr}`;
      const saved = localStorage.getItem(driverKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (data && (data.workType === '휴무' || data.workType === '휴일' || data.workType === '연차' || data.workType === '공가' || data.workType === '병가')) {
          return true;
        }
        if (data && (!data.route || data.route === '-' || data.route === '휴무' || data.route === '휴일')) {
          return true;
        }
      }
    }
  } catch(e) {}

  const resRoute = document.getElementById('resRoute');
  if (resRoute && (resRoute.innerText === '휴무' || resRoute.innerText === '휴일')) {
    return true;
  }
  const resType = document.getElementById('resType');
  if (resType && (resType.innerText === '휴무' || resType.innerText === '휴일')) {
    return true;
  }
  return false;
}

function getBoardTargetKey(category) {
  if (category === 'ROUTE' || category === 'SHIFT') {
    // 💡 [핵심] 휴일인 경우 별도의 키(HOLIDAY)로 완벽히 분리 관리 (다른 노선 메시지 혼선 차단)
    if (isCurrentSelectedDateHoliday()) {
      return 'HOLIDAY';
    }
    // 평일/운행일인 경우 노선 번호(281 등)로 매칭
    return getCurrentActiveRouteNumber();
  } else if (category === 'MEMO') {
    return typeof getMemoKey === 'function' ? getMemoKey() : 'today_memo';
  }
  return 'ALL';
}

// 3. 문장 끝 작성자 이름 (유재필) 형태 자동 부착 헬퍼
function applyDriverSignatureToContent(text, driverName) {
  if (!text || !text.trim() || !driverName) return text || '';
  const lines = text.split('\n');
  const sig = `(${driverName})`;

  // 맨 마지막 내용이 있는 줄 탐색
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line) {
      // 구분선인 경우 서명 부착 제외
      if (line.includes('───') || line.includes('---')) break;
      // 이미 (이름) 형태의 괄호로 끝나는 경우 중복 부착 방지
      const hasSig = /\([^)]+\)$/.test(line);
      if (!hasSig) {
        lines[i] = lines[i] + ` ${sig}`;
      }
      break;
    }
  }
  return lines.join('\n');
}

// 4. 화면 끝까지 칸이 커지며 넘치면 스크롤바가 생기는 반응형 높이 조절기
function autoResizeTextarea(textareaEl) {
  if (!textareaEl) return;
  textareaEl.style.height = 'auto';
  
  // 브라우저 뷰포트 하단 여백을 고려한 최대 가용 높이 계산 (화면 끝까지 늘어남)
  const rect = textareaEl.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight || 800;
  const maxAvailable = Math.max(220, windowHeight - rect.top - 60);

  const scrollHeight = textareaEl.scrollHeight;
  if (scrollHeight > maxAvailable) {
    textareaEl.style.height = maxAvailable + 'px';
    textareaEl.style.overflowY = 'auto';
  } else {
    textareaEl.style.height = Math.max(140, scrollHeight) + 'px';
    textareaEl.style.overflowY = 'hidden';
  }
}

// 5. 통합 시간표 및 메모 탭 전환 / 접이식 토글 함수
let currentScheduleTab = 'timetable';

function switchScheduleTab(tabName) {
  const body = document.getElementById('todayTimetableBody');
  const arrow = document.getElementById('todayTimetableArrow');
  if (!body) return;

  const isClosed = (body.style.display === 'none');

  // 저장하지 않고 다른 메뉴로 이동하거나 접으면 마지막 저장 상태로 되돌림
  if (currentScheduleTab !== 'timetable' && (tabName !== currentScheduleTab || !isClosed)) {
    revertUnsavedMemo(currentScheduleTab === 'route' ? 'ROUTE' : (currentScheduleTab === 'shift' ? 'SHIFT' : 'MEMO'));
  }

  // 같은 탭을 다시 터치한 경우: 접기/펼치기 토글
  if (tabName === currentScheduleTab) {
    if (isClosed) {
      body.style.display = 'block';
      if (arrow) arrow.style.transform = 'rotate(0deg)';
      updateScheduleTabStyles(tabName, true);
      if (tabName !== 'timetable') {
        const textareaId = (tabName === 'route') ? 'routeMemo' : ((tabName === 'shift') ? 'shiftMemo' : 'todayMemo');
        autoResizeTextarea(document.getElementById(textareaId));
      }
    } else {
      body.style.display = 'none';
      if (arrow) arrow.style.transform = 'rotate(-90deg)';
      updateScheduleTabStyles(tabName, false);
    }
    return;
  }

  // 다른 탭을 터치한 경우: 무조건 펼치고 해당 화면으로 전환
  currentScheduleTab = tabName;
  body.style.display = 'block';
  if (arrow) arrow.style.transform = 'rotate(0deg)';

  // 1) 패널 전환 (시간표 / 노선정보 / 교대정보 / 오늘의메모) + 애니메이션 재실행
  const panels = {
    timetable: document.getElementById('panelTimetable'),
    route: document.getElementById('panelRoute'),
    shift: document.getElementById('panelShift'),
    memo: document.getElementById('panelMemo')
  };

  Object.keys(panels).forEach(key => {
    const p = panels[key];
    if (p) {
      if (key === tabName) {
        p.style.display = 'block';
        // 애니메이션 부드러운 재실행
        p.classList.remove('hud-panel-content');
        void p.offsetWidth;
        p.classList.add('hud-panel-content');
      } else {
        p.style.display = 'none';
      }
    }
  });

  // 2) 탭 버튼 스타일 및 테두리 색상/네온 글로우 갱신
  updateScheduleTabStyles(tabName, true);

  // 3) 메모 탭인 경우 데이터 로드 및 높이 조절
  if (tabName !== 'timetable') {
    if (typeof sessionExitFlags !== 'undefined') {
      sessionExitFlags['ROUTE'] = true;
      sessionExitFlags['SHIFT'] = true;
    }
    loadFolderMemoTab(tabName);
    const textareaId = (tabName === 'route') ? 'routeMemo' : ((tabName === 'shift') ? 'shiftMemo' : 'todayMemo');
    setTimeout(() => {
      autoResizeTextarea(document.getElementById(textareaId));
    }, 50);
  }
}

function updateScheduleTabStyles(activeTab, isOpen) {
  const tabs = ['timetable', 'route', 'shift', 'memo'];
  const btnMap = {
    timetable: document.getElementById('todayTimetableTabBtn'),
    route: document.getElementById('tabBtnRoute'),
    shift: document.getElementById('tabBtnShift'),
    memo: document.getElementById('tabBtnMemo')
  };

  const activeThemes = {
    timetable: {
      color: '#38bdf8',
      bg: 'linear-gradient(135deg, rgba(14, 116, 144, 0.35) 0%, rgba(15, 23, 42, 0.9) 100%)',
      border: '1.8px solid #38bdf8',
      shadow: '0 0 16px rgba(56, 189, 248, 0.5), inset 0 0 10px rgba(56, 189, 248, 0.2)',
      textShadow: '0 0 8px rgba(56, 189, 248, 0.6)'
    },
    route: {
      color: '#38bdf8',
      bg: 'linear-gradient(135deg, rgba(2, 132, 199, 0.35) 0%, rgba(15, 23, 42, 0.9) 100%)',
      border: '1.8px solid #0ea5e9',
      shadow: '0 0 16px rgba(14, 165, 233, 0.5), inset 0 0 10px rgba(14, 165, 233, 0.2)',
      textShadow: '0 0 8px rgba(14, 165, 233, 0.6)'
    },
    shift: {
      color: '#fbbf24',
      bg: 'linear-gradient(135deg, rgba(217, 119, 6, 0.35) 0%, rgba(15, 23, 42, 0.9) 100%)',
      border: '1.8px solid #f59e0b',
      shadow: '0 0 16px rgba(245, 158, 11, 0.5), inset 0 0 10px rgba(245, 158, 11, 0.2)',
      textShadow: '0 0 8px rgba(245, 158, 11, 0.6)'
    },
    memo: {
      color: '#c084fc',
      bg: 'linear-gradient(135deg, rgba(147, 51, 234, 0.35) 0%, rgba(15, 23, 42, 0.9) 100%)',
      border: '1.8px solid #a855f7',
      shadow: '0 0 16px rgba(168, 85, 247, 0.5), inset 0 0 10px rgba(168, 85, 247, 0.2)',
      textShadow: '0 0 8px rgba(168, 85, 247, 0.6)'
    }
  };

  const bodyEl = document.getElementById('todayTimetableBody');
  if (bodyEl) {
    const theme = activeThemes[activeTab] || activeThemes.timetable;
    bodyEl.style.borderColor = theme.color;
    bodyEl.style.boxShadow = `0 10px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 20px ${theme.color}33`;
  }

  tabs.forEach(k => {
    const btn = btnMap[k];
    if (!btn) return;
    const isThisActive = (k === activeTab);
    if (isThisActive && isOpen) {
      btn.classList.add('active');
      const t = activeThemes[k];
      btn.style.background = t.bg;
      btn.style.border = t.border;
      btn.style.color = t.color;
      btn.style.boxShadow = t.shadow;
      btn.style.textShadow = t.textShadow;
      btn.style.fontWeight = '900';
    } else {
      btn.classList.remove('active');
      btn.style.background = 'rgba(30, 41, 59, 0.5)';
      btn.style.border = '1.5px solid rgba(255, 255, 255, 0.08)';
      btn.style.color = '#94a3b8';
      btn.style.boxShadow = 'none';
      btn.style.textShadow = 'none';
      btn.style.fontWeight = '800';
    }
  });
}

function switchFolderTab(tabName) {
  switchScheduleTab(tabName);
}

// 6. 단일 탭 데이터 로드 (BOARD_DB 연동)
function loadFolderMemoTab(tabName) {
  const category = (tabName === 'route') ? 'ROUTE' : ((tabName === 'shift') ? 'SHIFT' : 'MEMO');
  const targetKey = getBoardTargetKey(category);
  const isHoliday = (targetKey === 'HOLIDAY');

  const textareaId = (tabName === 'route') ? 'routeMemo' : ((tabName === 'shift') ? 'shiftMemo' : 'todayMemo');
  const statusId = (tabName === 'route') ? 'routeMemoSaveStatus' : ((tabName === 'shift') ? 'shiftMemoSaveStatus' : 'todayMemoSaveStatus');
  const textarea = document.getElementById(textareaId);
  const statusText = document.getElementById(statusId);
  if (!textarea) return;

  // 헤더 서브 라벨 및 플레이스홀더 동적 표기
  if (tabName === 'route') {
    const lbl = document.getElementById('routeMemoHeaderLabel');
    if (lbl) {
      lbl.innerText = isHoliday ? '휴일 주의사항 (전체 공유)' : `노선 주의사항 (${targetKey}번 전체 공유)`;
    }
    textarea.placeholder = isHoliday 
      ? '휴일에 기사님들과 공유할 주의사항 등을 입력하세요. (저장 버튼을 눌러야 저장됩니다)'
      : '해당 노선 기사님들과 공유할 주의사항 등을 입력하세요. (저장 버튼을 눌러야 저장됩니다)';
  } else if (tabName === 'shift') {
    const lbl = document.getElementById('shiftMemoHeaderLabel');
    if (lbl) {
      lbl.innerText = isHoliday ? '휴일 특이사항 (전체 공유)' : `교대 특이사항 (${targetKey}번 인계)`;
    }
    textarea.placeholder = isHoliday
      ? '휴일 특이사항을 입력하세요. (저장 버튼을 눌러야 저장됩니다)'
      : '다음 교대자에게 인계할 차량/운행 특이사항을 입력하세요. (저장 버튼을 눌러야 저장됩니다)';
  }

  // 1) 로컬 스토리지 캐시 우선 표시 (0ms 즉시 노출)
  const localCacheKey = `board_memo_${category}_${targetKey}`;
  const cached = localStorage.getItem(localCacheKey);
  if (cached !== null) {
    let cleanText = cached;
    if (cleanText.includes('---DIVIDER---')) {
      cleanText = cleanText.split(/\r?\n?---DIVIDER---\r?\n?/).filter(Boolean).join('\n──────────────────────────────\n');
    }
    textarea.value = cleanText;
    autoResizeTextarea(textarea);
  } else {
    textarea.value = '';
    autoResizeTextarea(textarea);
  }
  savedMemoText[category] = textarea.value;

  // 2) 구글 시트 BOARD_DB 서버 최신 데이터 비동기 로드
  if (typeof google !== 'undefined' && google.script && google.script.run && typeof google.script.run.loadBoardMemo === 'function') {
    if (statusText) {
      statusText.innerText = "☁️ 불러오는 중...";
      statusText.style.color = "#38bdf8";
      statusText.style.opacity = '1';
    }

    google.script.run
      .withSuccessHandler(res => {
        if (res && res.success && res.content !== undefined) {
          let serverContent = res.content || '';
          if (serverContent.includes('---DIVIDER---')) {
            serverContent = serverContent.split(/\r?\n?---DIVIDER---\r?\n?/).filter(Boolean).join('\n──────────────────────────────\n');
          }
          // 작성 중인(저장 전) 글이 있으면 서버 값으로 덮어쓰지 않음
          const isDirty = (textarea.value !== (savedMemoText[category] || ''));
          localStorage.setItem(localCacheKey, serverContent);
          if (!isDirty) {
            textarea.value = serverContent;
            savedMemoText[category] = serverContent;
            autoResizeTextarea(textarea);
          }
          if (statusText) {
            statusText.innerText = "☁️ 구글시트 동기화됨";
            statusText.style.color = "#22c55e";
            setTimeout(() => { if (statusText) statusText.style.opacity = '0'; }, 1500);
          }
        } else {
          if (statusText) statusText.style.opacity = '0';
        }
      })
      .withFailureHandler(err => {
        console.warn(`[BOARD_DB] ${category} 로드 실패:`, err);
        if (statusText) statusText.style.opacity = '0';
      })
      .loadBoardMemo(category, targetKey);
  }
}

// 7. 세션 구분선 바인딩 (자동 저장 없음)
// 📝 노선정보 / 교대정보 / 오늘의메모는 '저장' 버튼을 눌렀을 때만 저장됨 (자동 저장 없음)
//  - 저장 버튼 없이 다른 메뉴·페이지로 나가면 마지막 저장 상태로 되돌림
const savedMemoText = {};   // { ROUTE: '...', SHIFT: '...', MEMO: '...' } 마지막으로 저장(불러온) 글
const MEMO_UI = {
  ROUTE: { id: 'routeMemo', statusId: 'routeMemoSaveStatus', sign: false },
  SHIFT: { id: 'shiftMemo', statusId: 'shiftMemoSaveStatus', sign: false },
  MEMO:  { id: 'todayMemo', statusId: 'todayMemoSaveStatus', sign: false }
};

function revertUnsavedMemo(category) {
  const ui = MEMO_UI[category];
  if (!ui) return;
  const ta = document.getElementById(ui.id);
  if (!ta) return;
  const saved = savedMemoText[category];
  if (saved !== undefined && ta.value !== saved) {
    ta.value = saved;
    autoResizeTextarea(ta);
  }
  const st = document.getElementById(ui.statusId);
  if (st) st.style.opacity = '0';
}
function revertAllUnsavedMemos() {
  ['ROUTE', 'SHIFT', 'MEMO'].forEach(revertUnsavedMemo);
}

// 저장 버튼
function saveMemoByButton(category) {
  const ui = MEMO_UI[category];
  const ta = document.getElementById(ui.id);
  const st = document.getElementById(ui.statusId);
  if (!ta) return;
  saveFolderCardMemoNow(category, ta, st, ui.sign);
  logBoardMemoHistory(category, ta.value);   // 저장할 때마다 시트에 이력 한 줄 추가
  savedMemoText[category] = ta.value;
  const btn = document.getElementById(ui.id + 'SaveBtn');
  if (btn) { btn.disabled = false; }
}

const folderMemoTimers = {};

// 📜 [이력 기록] 노선정보 / 교대정보 / 오늘의메모를 수정하고 나갈 때마다 BOARD_DB에 새 줄로 쌓아 둠
//  - 화면에는 기존처럼 '마지막 상태'(ROUTE / SHIFT / MEMO 줄)만 보여 주고,
//  - 이력은 종류 ROUTE_LOG / SHIFT_LOG / MEMO_LOG, 구분 키 '날짜 시각|대상|기사', 내용 = 그때의 전체 글
//  - 같은 내용이면 다시 쌓지 않음
const lastLoggedMemo = {};
function logBoardMemoHistory(category, content) {
  try {
    const text = String(content || '');
    const targetKey = getBoardTargetKey(category);
    const memoId = category + '|' + targetKey;
    if (!text.trim()) return;
    let prev = lastLoggedMemo[memoId];
    if (prev === undefined) {
      try { prev = localStorage.getItem('board_log_' + memoId); } catch (e) { prev = null; }
    }
    if (prev === text) return;
    lastLoggedMemo[memoId] = text;
    try { localStorage.setItem('board_log_' + memoId, text); } catch (e) {}

    if (typeof google === 'undefined' || !google.script || !google.script.run) return;
    const d = new Date();
    const p2 = n => (n < 10 ? '0' : '') + n;
    const stamp = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' +
      p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
    const writer = getLoggedInDriverName() || '동료기사';
    google.script.run
      .withSuccessHandler(function () {})
      .withFailureHandler(function () {})
      .saveBoardMemo(category + '_LOG', stamp + '|' + targetKey + '|' + writer, text, writer);
  } catch (e) {
    console.warn('이력 기록 실패:', e);
  }
}

const sessionExitFlags = { ROUTE: true, SHIFT: true };

function setupFolderCardMemos() {
  const configs = [
    { cat: 'ROUTE', id: 'routeMemo', statusId: 'routeMemoSaveStatus', sign: false, divider: true },
    { cat: 'SHIFT', id: 'shiftMemo', statusId: 'shiftMemoSaveStatus', sign: false, divider: true },
    { cat: 'MEMO', id: 'todayMemo', statusId: 'todayMemoSaveStatus', sign: false, divider: false }
  ];

  configs.forEach(cfg => {
    const textarea = document.getElementById(cfg.id);
    const statusText = document.getElementById(cfg.statusId);
    if (!textarea) return;

    // 💡 [핵심] 메뉴를 나간 후 들어와서 새로 작성할 때 자동으로 얇은 회색 구분선 삽입
    textarea.onfocus = function() {
      if ((cfg.divider || cfg.sign) && sessionExitFlags[cfg.cat]) {
        const val = textarea.value;
        const trimmed = val.trim();
        const divider = '──────────────────────────────';
        if (trimmed.length > 0 && !trimmed.endsWith(divider)) {
          textarea.value = val.trimEnd() + '\n' + divider + '\n';
          textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
          autoResizeTextarea(textarea);
        }
        sessionExitFlags[cfg.cat] = false;
      }
    };

    // 입력 시 높이 자동 조절만 수행 (저장은 '저장' 버튼으로)
    textarea.oninput = function() {
      autoResizeTextarea(textarea);
      sessionExitFlags[cfg.cat] = false;
      if (statusText) {
        statusText.innerText = "✏️ 저장 전";
        statusText.style.color = "#f59e0b";
        statusText.style.opacity = '1';
      }
    };

    // 포커스가 벗어나도 저장하지 않음 (다음 진입 시 구분선 플래그만 활성화)
    textarea.onblur = function() {
      sessionExitFlags[cfg.cat] = true;
    };
  });

  // 초기 로드: 오늘의 시간표를 기본 활성화로 설정하고 메모 데이터 사전 캐시
  updateScheduleTabStyles('timetable', true);
  try {
    loadFolderMemoTab('route');
    loadFolderMemoTab('shift');
    loadFolderMemoTab('memo');
  } catch(e) {}

  // 창 크기 변경 시 높이 자동 재계산
  window.addEventListener('resize', () => {
    const activeTextarea = document.querySelector(`#panelRoute textarea, #panelShift textarea, #panelMemo textarea`);
    if (activeTextarea && activeTextarea.offsetParent !== null) autoResizeTextarea(activeTextarea);
  });
}

// 8. 실제 구글 시트 BOARD_DB 저장 함수 ('저장' 버튼에서 호출)
function saveFolderCardMemoNow(category, textarea, statusText, requireSignature) {
  if (!textarea) return;
  const targetKey = getBoardTargetKey(category);
  const driverName = getLoggedInDriverName();
  let rawContent = textarea.value;

  // 만약 내용 없이 구분선만 남겨두고 나간 경우 정리
  const trimmed = rawContent.trimEnd();
  if (trimmed.endsWith('──────────────────────────────')) {
    rawContent = trimmed.slice(0, -30).trimEnd();
    textarea.value = rawContent;
  }

  // 노선정보 / 교대정보: 더이상 사용자이름이 본문에 첨부되지 않음 (사용자 요청 반영)
  if (requireSignature && rawContent.trim()) {
    const signedContent = applyDriverSignatureToContent(rawContent, driverName);
    if (signedContent !== rawContent) {
      textarea.value = signedContent;
      rawContent = signedContent;
      autoResizeTextarea(textarea);
    }
  }

  // 1) 로컬 스토리지 즉시 캐시
  const localCacheKey = `board_memo_${category}_${targetKey}`;
  localStorage.setItem(localCacheKey, rawContent);
  if (category === 'MEMO') {
    localStorage.setItem(targetKey, rawContent);
  }

  // 노선정보 및 교대정보 작성 시 사용자이름 제외
  const memoWriter = (category === 'ROUTE' || category === 'SHIFT') ? '' : driverName;

  // 2) 구글 시트 BOARD_DB 서버 저장
  if (typeof google !== 'undefined' && google.script && google.script.run && typeof google.script.run.saveBoardMemo === 'function') {
    google.script.run
      .withSuccessHandler(res => {
        if (statusText) {
          statusText.innerText = "☁️ 구글시트 저장됨";
          statusText.style.color = "#22c55e";
          setTimeout(() => { if (statusText) statusText.style.opacity = '0'; }, 2000);
        }
      })
      .withFailureHandler(err => {
        console.warn(`[BOARD_DB] ${category} 저장 실패:`, err);
        if (statusText) {
          statusText.innerText = "⚠️ 임시저장(로컬)";
          statusText.style.color = "#ef4444";
        }
      })
      .saveBoardMemo(category, targetKey, rawContent, memoWriter);
  } else {
    if (statusText) {
      statusText.innerText = "☁️ 저장됨(로컬)";
      statusText.style.color = "#22c55e";
      setTimeout(() => { if (statusText) statusText.style.opacity = '0'; }, 2000);
    }
  }
}

// 레거시 함수 호환 래퍼
function loadTodayMemo() { loadFolderMemoTab('memo'); }
function setupTodayMemoAutoSave() { setupFolderCardMemos(); }
function updateBoardWriterLabels() { /* 통일된 단일창 모듈에서 자동 처리 */ }
function loadBoardItems(cat) { loadFolderMemoTab(cat === 'ROUTE' ? 'route' : (cat === 'SHIFT' ? 'shift' : 'memo')); }


// ================================================================
// 🧭 [노선지도 버튼] 오늘 내 근무 노선의 지도(route_map.html)를 앱 위에 덮어 연다
// - 아래에 라이브 모달을 같이 켜 둔다 → GPS·오차·운행습관 측정이 지도를 보는 동안에도 계속 돌아간다
// - 지도 화면에는 1초마다 시간카운트·오차배지를 넘겨 주고, 구차장 마이크 위치를 지도 카드 안에 맞춰 준다
// ================================================================
var _rm = null;   // { frame, timer, micStyle }

function openRouteMap() {
  if (_rm) return false;
  var url = 'route_map.html?embed=1';
  try {
    var name = getLoggedInDriverName();
    var d = new Date();
    var today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    var route = '';
    var sched = JSON.parse(localStorage.getItem('jpil_user_' + name + '_sched_' + today) || 'null');
    if (sched && sched.route && sched.route !== '-' && sched.workType !== '휴무') route = String(sched.route);
    if (!route) {
      var el = document.getElementById('bliRouteNum');
      if (el && el.innerText) route = el.innerText;
    }
    var m = route.match(/(\d{3})\s*([Aa]?)/);
    if (m) url += '&route=' + m[1] + m[2].toUpperCase();
  } catch (e) { }

  // 라이브 모달을 밑에 켜 둔다(운행습관·오차 측정용). 실패해도 지도는 연다
  try { if (typeof openLiveModal === 'function') openLiveModal(); } catch (e) { }

  var frame = document.createElement('iframe');
  frame.id = 'routeMapFrame';
  frame.src = url;
  frame.setAttribute('allow', 'geolocation');
  frame.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100%;height:100dvh;border:0;z-index:10001;background:#0f172a;';
  document.body.appendChild(frame);

  var widget = document.getElementById('floatingVoiceWidget');
  _rm = { frame: frame, timer: null, widget: widget, micStyle: widget ? widget.getAttribute('style') : null };
  _rm.timer = setInterval(pushRouteMapLive, 1000);
  window.addEventListener('message', routeMapMessage);
  return false;
}

function closeRouteMap() {
  if (!_rm) return;
  clearInterval(_rm.timer);
  window.removeEventListener('message', routeMapMessage);
  try { _rm.frame.remove(); } catch (e) { }
  if (_rm.widget) { if (_rm.micStyle == null) _rm.widget.removeAttribute('style'); else _rm.widget.setAttribute('style', _rm.micStyle); }
  _rm = null;
  try { if (typeof closeLiveModal === 'function') closeLiveModal(); } catch (e) { }
}

function pushRouteMapLive() {
  if (!_rm || !_rm.frame.contentWindow) return;
  var t = document.getElementById('liveCardTimeLeft'), b = document.getElementById('bisDelayBadge');
  var msg = { type: 'rm-live', time: t ? t.innerText.trim() : '', delay: '', dc: '', db: '', dbd: '' };
  if (b) {
    var cs = getComputedStyle(b);
    msg.delay = b.innerText.trim(); msg.dc = cs.color; msg.db = cs.backgroundColor; msg.dbd = cs.borderTopColor;
  }
  try { _rm.frame.contentWindow.postMessage(msg, location.origin); } catch (e) { }
}

function routeMapMessage(ev) {
  if (!_rm || ev.origin !== location.origin || !ev.data) return;
  var d = ev.data;
  if (d.type === 'rm-close') closeRouteMap();
  else if (d.type === 'rm-mic' && _rm.widget && d.rect) {
    // 구차장 마이크를 지도 카드 안의 빈 자리로 옮긴다
    var w = _rm.widget, sc = Math.max(0.4, Math.min(1, d.rect.h / 76));
    w.style.right = Math.round(window.innerWidth - d.rect.right) + 'px';
    w.style.bottom = Math.round(window.innerHeight - d.rect.bottom) + 'px';
    w.style.left = 'auto'; w.style.top = 'auto';
    w.style.transformOrigin = 'bottom right'; w.style.transform = 'scale(' + sc + ')';
    w.style.display = 'flex';
  }
}
