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
      ? '휴일에 기사님들과 공유할 주의사항 등을 입력하세요. (자동 저장)'
      : '해당 노선 기사님들과 공유할 주의사항 등을 입력하세요. (자동 저장)';
  } else if (tabName === 'shift') {
    const lbl = document.getElementById('shiftMemoHeaderLabel');
    if (lbl) {
      lbl.innerText = isHoliday ? '휴일 특이사항 (전체 공유)' : `교대 특이사항 (${targetKey}번 인계)`;
    }
    textarea.placeholder = isHoliday
      ? '휴일 특이사항을 입력하세요. (자동 저장)'
      : '다음 교대자에게 인계할 차량/운행 특이사항을 입력하세요. (자동 저장)';
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
          textarea.value = serverContent;
          localStorage.setItem(localCacheKey, serverContent);
          autoResizeTextarea(textarea);
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

// 7. 실시간 자동저장(Debounce 1.2초) 및 세션 구분선/서명 자동 바인딩
const folderMemoTimers = {};
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

    // 입력 시 높이 자동 조절 및 디바운스 자동 저장
    textarea.oninput = function() {
      autoResizeTextarea(textarea);
      sessionExitFlags[cfg.cat] = false;

      if (statusText) {
        statusText.innerText = "⏳ 저장 중...";
        statusText.style.color = "#f59e0b";
        statusText.style.opacity = '1';
      }

      if (folderMemoTimers[cfg.cat]) clearTimeout(folderMemoTimers[cfg.cat]);
      folderMemoTimers[cfg.cat] = setTimeout(() => {
        saveFolderCardMemoNow(cfg.cat, textarea, statusText, cfg.sign);
      }, 1200);
    };

    // 포커스 벗어날 때 (메뉴 나가기): 서명 확정 & 즉시 저장, 다음 진입 시 구분선 플래그 활성화
    textarea.onblur = function() {
      if (folderMemoTimers[cfg.cat]) clearTimeout(folderMemoTimers[cfg.cat]);
      sessionExitFlags[cfg.cat] = true;
      saveFolderCardMemoNow(cfg.cat, textarea, statusText, cfg.sign);
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

// 8. 실제 구글 시트 BOARD_DB 저장 함수 (바로 수정하고 자동 저장)
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
