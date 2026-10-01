    // ================================================================
    // 🔀 [통합 노선 정렬 규칙]
    // 1. 노선번호 낮은 순 (숫자 오름차순)
    // 2. 평일 우선, 휴일/주말 뒤
    // 3. 방학 노선은 무조건 맨 아래 배치
    // ================================================================
    function sortRouteList(keys) {
        if (!keys || !Array.isArray(keys)) return [];

        function parseRouteInfo(str) {
            let s = String(str || '').trim();
            let isVac = s.includes('방학');

            // 1. 차량 대수 정보 제거 (예: "16대", "(12대)")
            let clean = s.replace(/\(?\s*\d+\s*대\s*\)?/g, '').trim();

            // 2. 요일/근무형태 분류 (1: 평일, 2: 토요일, 3: 휴일/주말/일요일, 4: 기타)
            let dayType = 4;
            if (clean.includes('평일') || clean.includes('평')) {
                dayType = 1;
            } else if (clean.includes('토요일') || clean.includes('토')) {
                dayType = 2;
            } else if (clean.includes('휴일') || clean.includes('휴') || clean.includes('주말') || clean.includes('일요일') || clean.includes('일') || clean.includes('공휴일')) {
                dayType = 3;
            }

            // 3. 접두어 및 노선 번호 추출 (예: "202평일" -> prefix: "", routeNum: 202 / "중구1평일" -> prefix: "중구", routeNum: 1)
            let match = clean.match(/^([^\d]*)(\d+)/);
            let prefix = match ? match[1].trim() : '';
            let routeNum = match ? parseInt(match[2], 10) : 999999;

            return {
                raw: s,
                isVac: isVac,
                prefix: prefix,
                routeNum: routeNum,
                dayType: dayType
            };
        }

        return keys.slice().sort((a, b) => {
            let infoA = parseRouteInfo(a);
            let infoB = parseRouteInfo(b);

            // 1. 방학 노선은 무조건 맨 아래
            if (infoA.isVac !== infoB.isVac) {
                return infoA.isVac ? 1 : -1;
            }

            // 2. 접두어 비교 (일반 번호 노선 우선, 특수 접두어는 가나다순)
            if (infoA.prefix !== infoB.prefix) {
                if (infoA.prefix === '') return -1;
                if (infoB.prefix === '') return 1;
                let pCmp = infoA.prefix.localeCompare(infoB.prefix, 'ko');
                if (pCmp !== 0) return pCmp;
            }

            // 3. 노선번호 낮은 순 (숫자 오름차순: 202 -> 203 -> 221 ...)
            if (infoA.routeNum !== infoB.routeNum) {
                return infoA.routeNum - infoB.routeNum;
            }

            // 4. 평일 우선 (평일=1 -> 토=2 -> 휴일=3)
            if (infoA.dayType !== infoB.dayType) {
                return infoA.dayType - infoB.dayType;
            }

            // 5. 기타 보조 문자열 정렬
            return String(a).localeCompare(String(b), 'ko');
        });
    }

    // ================================================================
    // 📊 [근무정보 서브 뷰 제어] 4대 액션 버튼 (노선시간표/주간일정/모든사용자/통계)
    // ================================================================
    window.currentStatsSubView = 'summary';

    function selectStatsSubView(subViewName) {
        window.currentStatsSubView = subViewName;

        const subViews = ['route', 'weekly', 'allUsers', 'summary'];
        const viewMap = {
            'route': 'subViewRoute',
            'weekly': 'subViewWeekly',
            'allUsers': 'subViewAllUsers',
            'summary': 'subViewSummary'
        };
        const btnMap = {
            'route': 'btnStatsRoute',
            'weekly': 'btnStatsWeekly',
            'allUsers': 'btnStatsAllUsers',
            'summary': 'btnStatsSummary'
        };

        subViews.forEach(v => {
            const vEl = document.getElementById(viewMap[v]);
            if (vEl) vEl.style.display = 'none';

            const bEl = document.getElementById(btnMap[v]);
            if (bEl) bEl.classList.remove('active');
        });

        const activeView = document.getElementById(viewMap[subViewName]);
        if (activeView) activeView.style.display = 'block';

        const activeBtn = document.getElementById(btnMap[subViewName]);
        if (activeBtn) activeBtn.classList.add('active');

        // 서브 뷰별 데이터 로드 및 초기화
        if (subViewName === 'route') {
            if (typeof initAllRouteTimetableUI === 'function') initAllRouteTimetableUI();
        } else if (subViewName === 'weekly') {
            if (typeof renderWeeklySchedule === 'function') renderWeeklySchedule();
        } else if (subViewName === 'allUsers') {
            if (typeof renderStatsAllUsersTable === 'function') renderStatsAllUsersTable();
        } else if (subViewName === 'summary') {
            if (typeof renderMonthlyStatsSummary === 'function') renderMonthlyStatsSummary();
        }
    }

    // ================================================================
    // 🏆 [통계 화면 렌더러] 1단: 나의 발자취 / 2단: 최고 기록 트로피
    // ================================================================
    window.statSummaryCurrentDate = window.statSummaryCurrentDate || new Date();

    function moveStatMonth(delta) {
        if (!window.statSummaryCurrentDate) window.statSummaryCurrentDate = new Date();
        window.statSummaryCurrentDate.setMonth(window.statSummaryCurrentDate.getMonth() + delta);
        renderMonthlyStatsSummary();
    }

    function renderMonthlyStatsSummary() {
        if (!window.statSummaryCurrentDate) window.statSummaryCurrentDate = new Date();
        const d = window.statSummaryCurrentDate;
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const daysInMonth = new Date(year, month, 0).getDate();

        safeSetText('statSummaryMonthDisplay', `${year}년 ${month}월`);

        let normalCount = 0, restCount = 0;
        let totalDist = 0, totalSecs = 0;
        let routeMap = {};
        let weekdayAm = 0, weekdayPm = 0, holidayAm = 0, holidayPm = 0;
        let currentStreak = 0;
        let myMaxStreak = 0;

        // 1단: 본인 데이터 집계
        for (let day = 1; day <= daysInMonth; day++) {
            let mStr = String(month).padStart(2, '0');
            let dStr = `${year}-${mStr}-${String(day).padStart(2, '0')}`;
            let key = typeof getDriverKey === 'function' ? getDriverKey(`sched_${dStr}`) : `sched_${dStr}`;
            let saved = localStorage.getItem(key);

            if (saved) {
                try {
                    let data = JSON.parse(saved);
                    let workType = data.workType ? String(data.workType).trim() : '';
                    if (workType === '휴무') {
                        restCount++;
                        currentStreak = 0;
                    } else if (workType === '정상' || workType === '대타') {
                        currentStreak++;
                        if (currentStreak > myMaxStreak) myMaxStreak = currentStreak;
                        normalCount++;
                        let isHoliday = (new Date(year, month - 1, day).getDay() === 0 || new Date(year, month - 1, day).getDay() === 6);
                        let workTime = data.time ? data.time.trim() : '';
                        if (isHoliday) {
                            if (workTime.includes('오전')) holidayAm++;
                            else holidayPm++;
                        } else {
                            if (workTime.includes('오전')) weekdayAm++;
                            else weekdayPm++;
                        }
                        if (data.route) {
                            let match = data.route.match(/\d+/);
                            let cleanR = match ? match[0] + '번' : data.route;
                            routeMap[cleanR] = (routeMap[cleanR] || 0) + 1;
                        }
                        if (typeof customGetItem === 'function' && typeof calculateWorkSummary === 'function') {
                            let list = customGetItem(data.route, data.seq);
                            if (list && list.length > 0) {
                                let summary = calculateWorkSummary(list, data.time, data.route, data.seq);
                                if (summary) {
                                    totalDist += Number(summary.distance) || 0;
                                    totalSecs += Number(summary.totalSecs) || 0;
                                }
                            }
                        }
                    } else if (workType === '휴일' || workType === '연차' || workType === '공가' || workType === '병가') {
                        currentStreak = 0;
                    }
                } catch (e) { }
            } else {
                currentStreak = 0;
            }
        }

        let h = Math.floor(totalSecs / 3600);
        let m = Math.round((totalSecs % 3600) / 60);
        if (m === 60) { h += 1; m = 0; }

        // 4박스 연동
        safeSetText('statMyDaysSummary', `${normalCount}일 / ${restCount}일`);
        safeSetText('statMyAmPm', `오전 ${weekdayAm + holidayAm}회 / 오후 ${weekdayPm + holidayPm}회`);
        let totalInfoEl = document.getElementById('statMyTotalInfo');
        if (totalInfoEl) {
            totalInfoEl.innerHTML = `${h}시간 ${m}분<br>${totalDist.toFixed(1)}KM`;
        }

        // 2단: 나의 운행 습관 (UI만 먼저. 값은 나중에 기능 연결)
        renderDrivingHabitRows();
    }

    // 급출발·급정거·과속·급회전·급차선 변경 5개 항목 (이번 회차 / 오늘 / 이달 공통)
    const DRIVING_HABIT_ITEMS = ['급출발', '급정거', '과속', '급회전', '급차선 변경'];

    function renderDrivingHabitRows(values) {
        ['cur', 'today', 'month'].forEach(scope => {
            const el = document.getElementById('habitList_' + scope);
            if (!el) return;
            const compact = scope === 'month';
            const v = (values && values[scope]) || {};
            el.innerHTML = DRIVING_HABIT_ITEMS.map(name => {
                const cnt = String(v[name] || 0).padStart(2, '0');
                return `<div style="display:flex; justify-content:space-between; align-items:center; font-size:${compact ? 11 : 13}px; padding:${compact ? 1 : 3}px 0; font-weight:bold; color:#94a3b8;">` +
                    `<span>${name}</span><span style="color:#e2e8f0; font-weight:900;">${cnt}회</span></div>`;
            }).join('');
        });
    }

    // ================================================================
    // 📅 [모든사용자 날짜 좌우 이동]
    // ================================================================
    window.allUsersSelectedDate = window.allUsersSelectedDate || new Date();

    function moveAllUsersDate(delta) {
        if (!window.allUsersSelectedDate) window.allUsersSelectedDate = new Date();
        window.allUsersSelectedDate.setDate(window.allUsersSelectedDate.getDate() + delta);
        renderStatsAllUsersTable();
    }

    // ================================================================
    // ⚙️ [근무설정 등록 날짜 좌우 이동]
    // ================================================================
    function moveSettingsDate(delta) {
        const regDateInput = document.getElementById('regDate');
        if (!regDateInput) return;
        let curDate = regDateInput.value ? new Date(regDateInput.value) : new Date();
        curDate.setDate(curDate.getDate() + delta);
        regDateInput.value = getFormattedDate(curDate);
        if (typeof loadScheduleForEdit === 'function') {
            loadScheduleForEdit();
        }
    }

    // 서브 탭 전환 및 데이터 연동
window.switchAdminSubTab = function(subTab) {
  const tabs = ['timetable', 'route', 'user'];
  
  tabs.forEach(tab => {
    const btn = document.getElementById('tabBtn' + tab.charAt(0).toUpperCase() + tab.slice(1));
    const page = document.getElementById('subPage' + tab.charAt(0).toUpperCase() + tab.slice(1));
    const isActive = (tab === subTab);

    if (page) {
      if (isActive) {
        page.classList.add('active');
        page.style.display = 'block';
      } else {
        page.classList.remove('active');
        page.style.display = 'none';
      }
    }
    if (btn) {
      btn.style.background = isActive ? '#f97316' : 'transparent';
      btn.style.color = isActive ? '#ffffff' : '#94a3b8';
      if (isActive) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });

  if (subTab === 'timetable') {
    if (typeof renderEditRouteOptions === 'function') renderEditRouteOptions();
    else if (typeof onEditRouteSelectionChange === 'function') onEditRouteSelectionChange();
  } else if (subTab === 'route') {
    if (typeof populateRouteActionSelect === 'function') populateRouteActionSelect();
  } else if (subTab === 'user') {
    if (typeof renderAdminUserManageList === 'function') renderAdminUserManageList();
  }
};

// 노선 설정 편집용 노선 목록 옵션 렌더링
function renderEditRouteOptions() {
  const editRouteSelect = document.getElementById('editRouteSelect');
  if (!editRouteSelect) return;
  let keys = Object.keys(window.routeDataMap || (typeof routeDataMap !== 'undefined' ? routeDataMap : {}));
  if (keys.length === 0) {
    editRouteSelect.innerHTML = '<option value="">등록된 노선 없음</option>';
  } else {
    keys = sortRouteList(keys);
    let curVal = editRouteSelect.value;
    editRouteSelect.innerHTML = keys.map(r => `<option value="${r}">${r}</option>`).join('');
    if (curVal && keys.includes(curVal)) {
      editRouteSelect.value = curVal;
    }
  }
  if (typeof onEditRouteSelectionChange === 'function') {
    onEditRouteSelectionChange();
  }
}

    function switchSettingsSubPage(pageId) {
        if (typeof checkAdminRouteEditAuth === 'function') {
            checkAdminRouteEditAuth();
        }

        document.querySelectorAll('.settings-sub-page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.settings-sub-tab').forEach(t => t.classList.remove('active'));

        let targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        if (pageId === 'regPage') {
            let subTab = document.getElementById('subTabReg');
            if (subTab) subTab.classList.add('active');
            if (typeof disableScheduleEditMode === 'function') disableScheduleEditMode();
        } else if (pageId === 'routePage') {
            let subTab = document.getElementById('subTabRoute');
            if (subTab) subTab.classList.add('active');
            if (typeof renderEditRouteOptions === 'function') renderEditRouteOptions();
            if (typeof cancelTimeEditMode === 'function') cancelTimeEditMode();
        } else if (pageId === 'userAdminPage') {
            renderAdminUserManageList();
        } else if (pageId === 'routeAdminPage') {
            if (typeof populateRouteActionSelect === 'function') {
                populateRouteActionSelect();
            }
        }
    }

    // ================================================================
    // 🚌 [근무정보 탭] 노선별 전체 시간표 셀렉트박스 초기화 및 렌더링 연동
    // ================================================================
    function initAllRouteTimetableUI() {
        const viewRouteSelect = document.getElementById('viewRouteSelect');
        const editRouteSelect = document.getElementById('editRouteSelect');

        let keys = Object.keys(window.routeDataMap || (typeof routeDataMap !== 'undefined' ? routeDataMap : {}));
        let optionsHtml = '';
        if (keys.length === 0) {
            optionsHtml = '<option value="">등록된 노선 없음</option>';
        } else {
            keys = sortRouteList(keys);
            optionsHtml = keys.map(r => `<option value="${r}">${r}</option>`).join('');
        }

        if (viewRouteSelect) {
            viewRouteSelect.innerHTML = optionsHtml;
            onViewRouteSelectionChange();
        }
        if (editRouteSelect) {
            editRouteSelect.innerHTML = optionsHtml;
            onEditRouteSelectionChange();
        }
    }

    function onViewRouteSelectionChange() {
        const routeSelect = document.getElementById('viewRouteSelect');
        const seqSelect = document.getElementById('viewSeqSelect');
        if (!routeSelect || !seqSelect) return;

        const route = routeSelect.value;
        seqSelect.innerHTML = '';
        let count = 4;
        let match = String(route).match(/(\d+)\s*대/);
        if (match) count = parseInt(match[1], 10);

        for (let i = 1; i <= count; i++) {
            seqSelect.innerHTML += `<option value="${i}순번">${i}순번</option>`;
        }
        onViewSelectionChange();
    }

    function onViewSelectionChange() {
        const routeSelect = document.getElementById('viewRouteSelect');
        const seqSelect = document.getElementById('viewSeqSelect');
        const displayArea = document.getElementById('routeTimetableDisplayArea');
        if (!routeSelect || !seqSelect || !displayArea) return;

        const route = routeSelect.value;
        const seq = seqSelect.value;

        if (!route || !seq) {
            displayArea.innerHTML = '<p style="font-size:12px; color:var(--sub-text, #94a3b8); text-align:center; padding:10px;">노선과 순번을 선택해주세요.</p>';
            return;
        }

        let list = customGetItem(route, seq) || [];
        let commonHeaders = getHeaderArray(route, seq) || [];
        let firstHeaderInfo = getFirstTripHeaderArray(route, seq) || { enabled: false, headers: [] };

        if (list.length === 0) {
            displayArea.innerHTML = '<p style="font-size:12px; color:var(--sub-text, #94a3b8); text-align:center; padding:10px;">저장된 시간표 데이터가 없습니다.</p>';
            return;
        }

        let html = `<table class="schedule-table"><thead>`;
        if (firstHeaderInfo.enabled && firstHeaderInfo.headers && firstHeaderInfo.headers.length > 0) {
            html += `<tr style="background:var(--header-bg); color:var(--primary);"><th>회</th>`;
            firstHeaderInfo.headers.forEach(h => html += `<th>${h || '-'}</th>`);
            html += `</tr>`;
        } else {
            html += `<tr style="background:var(--header-bg);"><th>회</th>`;
            commonHeaders.forEach(h => html += `<th>${h || '-'}</th>`);
            html += `</tr>`;
        }
        html += `</thead><tbody>`;

        list.forEach((r, rIdx) => {
            if (rIdx === 1 && firstHeaderInfo.enabled) {
                html += `<tr style="background:var(--header-bg); font-weight:bold;"><th>회</th>`;
                commonHeaders.forEach(h => html += `<th>${h || '-'}</th>`);
                html += `</tr>`;
            }
            html += `<tr><td><strong>${rIdx + 1}</strong></td>`;
            for (let cIdx = 1; cIdx <= commonHeaders.length; cIdx++) {
                let tVal = r[`time${cIdx}`] || '';
                let cVal = r[`c${cIdx}`] || 'black';
                html += `<td><span class="effect-${cVal}">${tVal || '-'}</span></td>`;
            }
            html += `</tr>`;
        });

        html += `</tbody></table>`;
        displayArea.innerHTML = html;
    }

    // 노선 선택 변경 시 대수(예: 16대)에 맞춰 순번 셀렉트박스(1순번 ~ N순번) 자동 생성
    function onEditRouteSelectionChange() {
        const routeSelect = document.getElementById('editRouteSelect');
        const seqSelect = document.getElementById('editSeqSelect');
        if (!routeSelect || !seqSelect) return;

        const route = routeSelect.value;
        seqSelect.innerHTML = '';

        let count = 4; // 기본값
        let match = String(route).match(/(\d+)\s*대/);
        if (match) {
            count = parseInt(match[1], 10);
        }

        for (let i = 1; i <= count; i++) {
            seqSelect.innerHTML += `<option value="${i}순번">${i}순번</option>`;
        }
        onEditSelectionChange();
    }

    // 순번 선택 변경 시 해당 순번의 전체 시간표 표를 화면에 렌더링
    function onEditSelectionChange() {
        const routeSelect = document.getElementById('editRouteSelect');
        const seqSelect = document.getElementById('editSeqSelect');

        // Admin UI renders directly into timeEditContainer via renderEditableTimetable
        if (typeof renderEditableTimetable === 'function') renderEditableTimetable();
    }

    // ================================================================
    // 👥 [모든 사용자 근무 현황] 우선순위 정렬 및 렌더링 (본인 > 근무 > 휴무 > 미등록)
    // ================================================================
    window.toggleFavorite = function (name) {
        let favs = JSON.parse(localStorage.getItem('user_favorites') || '[]');
        if (favs.includes(name)) {
            favs = favs.filter(n => n !== name);
        } else {
            favs.push(name);
        }
        localStorage.setItem('user_favorites', JSON.stringify(favs));
        if (typeof renderStatsAllUsersTable === 'function') renderStatsAllUsersTable();
    };

    function renderStatsAllUsersTable() {
        let targetDate = window.allUsersSelectedDate || (document.getElementById('searchDate')?.value ? new Date(document.getElementById('searchDate').value) : new Date());
        window.allUsersSelectedDate = targetDate;
        const targetDateStr = typeof getFormattedDate === 'function' ? getFormattedDate(targetDate) : targetDate.toISOString().split('T')[0];

        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const dayLabel = days[targetDate.getDay()];

        const dateDisplays = document.querySelectorAll('#allUsersModalDate');
        dateDisplays.forEach(el => el.innerText = `${targetDateStr} (${dayLabel})`);

        let rawUsers = typeof getUsersList === 'function' ? getUsersList().filter(u => u.userType !== 'family') : [];
        const containers = document.querySelectorAll('#allUsersCardsContainer');

        if (rawUsers.length === 0) {
            containers.forEach(c => c.innerHTML = '<div style="text-align:center; padding:15px; color:#94a3b8;">등록된 기사님이 없습니다.</div>');
            return;
        }

        let favs = JSON.parse(localStorage.getItem('user_favorites') || '[]');

        let usersWithStatus = rawUsers.map(u => {
            let saved = localStorage.getItem(`jpil_user_${u.name}_sched_${targetDateStr}`);
            let statusRank = 3;
            let schedData = null;

            if (saved) {
                try {
                    schedData = JSON.parse(saved);
                    let offWorkTypes = ['휴무', '휴일', '연차', '공가', '병가'];
                    if (offWorkTypes.includes(schedData.workType)) {
                        statusRank = 2;
                    } else {
                        statusRank = 1;
                    }
                } catch (e) { }
            }

            if (favs.includes(u.name)) {
                statusRank = 0.5;
            }
            if (u.name === window.currentDriver) {
                statusRank = 0;
            }

            return { user: u, statusRank: statusRank, schedData: schedData };
        });

        usersWithStatus.sort((a, b) => {
            if (a.statusRank !== b.statusRank) {
                return a.statusRank - b.statusRank;
            }
            return a.user.name.localeCompare(b.user.name, 'ko');
        });

        containers.forEach(c => c.innerHTML = '');

        usersWithStatus.forEach(item => {
            let u = item.user;
            let data = item.schedData;
            let route = '-', seqTime = '-', startEnd = '-', busNo = '-';

            if (data) {
                let offWorkTypes = ['휴무', '휴일', '연차', '공가', '병가'];
                if (offWorkTypes.includes(data.workType)) {
                    route = data.workType;
                    seqTime = '☕';
                } else {
                    route = data.route || '-';
                    seqTime = `${data.seq || ''} (${data.time || ''})`;
                    busNo = data.busNo || '-';
                    if (typeof calculateStartAndHandoverTime === 'function') {
                        let timing = calculateStartAndHandoverTime(data.route, data.seq, data.time);
                        startEnd = timing ? timing.startEndDisplay : '-';
                    }
                }
            } else {
                route = '미등록';
            }

            let isMe = (window.currentDriver === u.name);
            let isFav = favs.includes(u.name);
            let starIcon = isFav ? 'mdi:star' : 'mdi:star-outline';
            let starColor = isFav ? '#fbbf24' : '#64748b';

            let offWorkTypes = ['휴무', '휴일', '연차', '공가', '병가'];
            let isOffWork = offWorkTypes.includes(route) || route === '미등록';

            let card = document.createElement('div');
            card.style.display = 'flex';
            card.style.alignItems = 'stretch';
            card.style.border = isMe ? '1.5px solid #22c55e' : '1px solid #334155';
            card.style.borderRadius = '6px';
            card.style.overflow = 'hidden';
            card.style.background = isMe ? 'rgba(34, 197, 94, 0.08)' : '#0f172a';
            card.style.marginBottom = '6px';

            let infoHtml = '';
            if (isOffWork) {
                infoHtml = `
                    <span style="color: #94a3b8; font-size: 14.5px; padding: 4px 8px;">${route} ${route === '미등록' ? '❓' : '☕'}</span>
                `;
            } else {
                infoHtml = `
                                        <span style="color: #38bdf8; font-size: 14.5px; font-weight: 900; white-space: nowrap;">${route}</span>
                    <span style="color: #475569; font-size: 13px; margin: 0 3px;">|</span>
                    <span style="color: #22c55e; font-size: 14.5px; font-weight: bold; white-space: nowrap;">${seqTime}</span>
                    <span style="color: #475569; font-size: 13px; margin: 0 3px;">|</span>
                    <span style="color: #fbbf24; font-size: 14.5px; font-weight: bold; white-space: nowrap;">${busNo}</span>
                    <span style="color: #475569; font-size: 13px; margin: 0 3px;">|</span>
                    <span style="color: #cbd5e1; font-size: 14px; white-space: nowrap;">${startEnd}</span>
                `;
            }

            let nameColor = isMe ? '#22c55e' : '#cbd5e1';
            let nameDisplay = u.name;

            card.innerHTML = `
                <div style="width: 85px; background: #1e293b; border-right: 1px solid #334155; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 10px 0; gap: 4px; cursor: pointer;" onclick="window.toggleFavorite('${u.name}')">
                    <iconify-icon icon="${starIcon}" style="font-size: 16px; color: ${starColor};"></iconify-icon>
                    <span style="font-size: 14.5px; font-weight: bold; color: ${nameColor};">${nameDisplay}</span>
                </div>
                <div style="flex: 1; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; padding: 6px 8px;">
                    ${infoHtml}
                </div>
            `;

            containers.forEach(c => c.appendChild(card.cloneNode(true)));
        });

        // 표가 렌더링된 후 스크롤을 맨 위로 강제 이동
        setTimeout(() => {
            containers.forEach(c => {
                let scrollContainer = c.closest('.accordion-content') || c.closest('.live-modal-content') || c.parentElement;
                if (scrollContainer) {
                    scrollContainer.scrollTop = 0;
                }
            });
        }, 50);
    }

    // 기존의 길었던 openAllUsersModal 함수를 싹 지우고 아래 코드로 교체하세요!
    function openAllUsersModal() {
        // 1. 위에서 만든 강력한 통합 정렬/렌더링 함수를 호출
        renderStatsAllUsersTable();

        // 2. 모달창 띄우기
        let modal = document.getElementById('allUsersModal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    /**
     * ◀️▶️ [날짜 네비게이터] 이전 / 다음 날짜 이동 버튼 클릭 처리
     * @param {number} days - 이동할 일수 (-1: 이전날, 1: 다음날)
     */
    function moveDate(days) {
        let dateInput = document.getElementById('searchDate');
        if (!dateInput || !dateInput.value) return;

        // YYYY-MM-DD 포맷 안전 파싱 (시차로 인한 날짜 꼬임 방지)
        let parts = dateInput.value.split('-');
        let currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
        currentDate.setDate(currentDate.getDate() + days);

        let y = currentDate.getFullYear();
        let m = String(currentDate.getMonth() + 1).padStart(2, '0');
        let d = String(currentDate.getDate()).padStart(2, '0');

        dateInput.value = `${y}-${m}-${d}`;

        if (typeof onDateInputChange === 'function') {
            onDateInputChange();
        }
    }

    function onDateInputChange() {
        if (typeof searchSchedule === 'function') {
            searchSchedule();
        }
    }

    let currentTripMasterCache = []; // 시트 마스터 데이터 캐시


    function openWeeklyModal() {
        let searchDateVal = document.getElementById('searchDate')?.value;
        let cur = searchDateVal ? new Date(searchDateVal) : new Date();
        let day = cur.getDay();
        let diffToMon = (day === 0 ? -6 : 1 - day);
        currentWeeklyStartDate = new Date(cur.setDate(cur.getDate() + diffToMon));

        renderWeeklySchedule();
        let modal = document.getElementById('weeklyModal');
        if (modal) modal.classList.add('active');
    }

    function closeWeeklyModal() {
        let modal = document.getElementById('weeklyModal');
        if (modal) modal.classList.remove('active');
    }

    function openRouteDetailModal() {
        let modal = document.getElementById('routeDetailModal');
        if (modal) modal.classList.add('active');
    }

    function closeRouteDetailModal() {
        let modal = document.getElementById('routeDetailModal');
        if (modal) modal.classList.remove('active');
    }

    function moveWeek(dir) {
        currentWeeklyStartDate.setDate(currentWeeklyStartDate.getDate() + (dir * 7));
        renderWeeklySchedule();
    }

    function renderWeeklySchedule() {
        let start = new Date(currentWeeklyStartDate);

        // 💡 [핵심 버그 수정] 시작 날짜를 해당 주의 '월요일'로 정확하게 기준 보정
        let dayOfWeek = start.getDay(); // 0(일) ~ 6(토)
        let diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
        start.setDate(start.getDate() + diffToMon);

        let month = String(start.getMonth() + 1).padStart(2, '0');
        let firstDayOfMonth = new Date(start.getFullYear(), start.getMonth(), 1);
        let pastDaysOfMonth = (start - firstDayOfMonth) / 86400000;
        let weekNum = Math.ceil((pastDaysOfMonth + firstDayOfMonth.getDay() + 1) / 7);

        safeSetText('weeklyTitleText', `${start.getFullYear()}년 ${month}월 ${String(weekNum).padStart(2, '0')}주`);

        let container = document.getElementById('weeklyCardsContainer');
        if (!container) return;
        container.innerHTML = '';

        const weekDayLabels = ['일', '월', '화', '수', '목', '금', '토'];
        const todayStr = getFormattedDate(new Date());

        for (let i = 0; i < 7; i++) {
            let d = new Date(start);
            d.setDate(d.getDate() + i);
            let dateStr = getFormattedDate(d);
            let dayOfWeek = d.getDay();
            let dayLabel = `${d.getDate()}일(${weekDayLabels[dayOfWeek]})`;

            // 토요일, 일요일은 기본 빨간색 (공휴일 판별 로직 추가 가능)
            let isRedDay = (dayOfWeek === 0 || dayOfWeek === 6);

            let saved = localStorage.getItem(getDriverKey(`sched_${dateStr}`));
            let route = '-', seqTime = '-', busNo = '-', startEnd = '-';

            if (saved) {
                let data = JSON.parse(saved);
                if (data.workType === '휴무' || data.workType === '휴일' || data.workType === '연차' || data.workType === '공가' || data.workType === '병가') {
                    route = data.workType;
                    seqTime = '☕';
                    busNo = '-';
                    startEnd = '-';
                } else {
                    route = data.route || '-';
                    seqTime = `${data.seq || ''} (${data.time || ''})`;
                    busNo = data.busNo || '-';
                    if (typeof calculateStartAndHandoverTime === 'function') {
                        let timing = calculateStartAndHandoverTime(data.route, data.seq, data.time);
                        if (timing) {
                            startEnd = timing.startEndDisplay || '-';
                        }
                    }
                }
            }

            let card = document.createElement('div');

            // 한눈에 들어오는 컴팩트 박스 디자인 (오늘 강조 제거, 휴대폰 공간 최적화)
            card.style.display = 'flex';
            card.style.alignItems = 'stretch';
            card.style.border = '1px solid #334155';
            card.style.borderRadius = '6px';
            card.style.overflow = 'hidden';
            card.style.background = '#0f172a';
            card.style.marginBottom = '6px';

            // 요일/날짜 색상 (휴일 빨간색 처리만)
            let dateColor = isRedDay ? '#ef4444' : '#cbd5e1';

            // 근무 유무 확인 (정확한 단어 일치만 휴무로 간주)
            let offWorkTypes = ['휴무', '휴일', '연차', '공가', '병가'];
            let isOffWork = offWorkTypes.includes(route);

            let infoHtml = '';
            if (isOffWork) {
                infoHtml = `
                    <span style="color: #94a3b8; font-size: 14.5px; padding: 4px 8px;">${route} ☕</span>
                `;
            } else {
                // 4개의 정보 각각 분리된 묶음(배지) 디자인 (크기 20% 업그레이드)
                infoHtml = `
                                        <span style="color: #38bdf8; font-size: 14.5px; font-weight: 900; white-space: nowrap;">${route}</span>
                    <span style="color: #475569; font-size: 13px; margin: 0 3px;">|</span>
                    <span style="color: #22c55e; font-size: 14.5px; font-weight: bold; white-space: nowrap;">${seqTime}</span>
                    <span style="color: #475569; font-size: 13px; margin: 0 3px;">|</span>
                    <span style="color: #fbbf24; font-size: 14.5px; font-weight: bold; white-space: nowrap;">${busNo}</span>
                    <span style="color: #475569; font-size: 13px; margin: 0 3px;">|</span>
                    <span style="color: #cbd5e1; font-size: 14px; white-space: nowrap;">${startEnd}</span>
                `;
            }

            // 좌측 날짜 영역과 우측 정보 영역 완벽히 분리 (크기 20% 업그레이드)
            card.innerHTML = `
                <div style="width: 85px; background: #1e293b; border-right: 1px solid #334155; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 10px 0;">
                    <span style="font-size: 14.5px; font-weight: bold; color: ${dateColor};">${dayLabel}</span>
                </div>
                <div style="flex: 1; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; padding: 6px 8px;">
                    ${infoHtml}
                </div>
            `;

            container.appendChild(card);
        }
    }

    function toggleInputs() {
        const workType = document.getElementById('workType')?.value;
        const busSection = document.getElementById('busNoSection');
        const routeSection = document.getElementById('schedRouteSection');
        if (!busSection || !routeSection) return;

        if (workType === '휴무') {
            busSection.style.display = 'none';
            routeSection.style.display = 'none';
        } else {
            busSection.style.display = 'block';
            routeSection.style.display = 'block';
        }
    }
