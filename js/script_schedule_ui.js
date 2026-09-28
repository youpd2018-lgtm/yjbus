    // ==========================================
    // 📂 [4번째 조각] 노선 드롭다운, 일정 등록/편집, 헤더 로더
    // ==========================================

    function initRouteDropdowns() {
        renderRouteOptions('sched');
    }

    // 최근 수정한 근무일정 노선명을 기억할 변수 (전역 선언)
    let lastEditedWorkRoute = '';

    // ==========================================
    // 🚌 [노선 선택 드롭다운] 열기/닫기 토글 함수
    // ==========================================
    function toggleRouteDropdown(target) {
        const container = document.getElementById(`${target}RouteOptions`);
        if (!container) return;

        // 내용이 비어있으면 노선 목록 즉시 생성
        if (container.children.length === 0) {
            renderRouteOptions(target);
        }

        // 열려 있으면 닫고, 닫혀 있으면 최상단으로 팝업
        if (container.style.display === 'block') {
            container.style.display = 'none';
        } else {
            renderRouteOptions(target); // 최신 노선 목록 갱신
            container.style.display = 'block';
        }
    }

    // ==========================================
    // 📋 [노선 목록 렌더러] 다크모드 버튼 목록 동적 생성
    // ==========================================
    function renderRouteOptions(target) {
        const container = document.getElementById(`${target}RouteOptions`);
        if (!container) return;
        container.innerHTML = '';

        let regRouteEl = document.getElementById('regRoute');
        let currentSelected = regRouteEl ? regRouteEl.value : '';
        let keys = Object.keys(routeDataMap || {});

        // 노선 데이터가 비어있을 때 대비
        if (keys.length === 0 && typeof defaultRouteDataMap !== 'undefined') {
            routeDataMap = defaultRouteDataMap;
            keys = Object.keys(routeDataMap || {});
        }

        // 노선 정렬 (통합 정렬 규칙: 번호 낮은 순 -> 평일/휴일 -> 방학 맨 아래)
        keys = sortRouteList(keys);

        if (!keys.includes(currentSelected) && keys.length > 0) {
            currentSelected = keys[0];
        }

        // 각 노선별 선택 버튼 생성
        keys.forEach(route => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.innerText = route;
            btn.style.width = '100%';
            btn.style.textAlign = 'left';
            btn.style.padding = '12px 14px';
            btn.style.marginBottom = '4px';
            btn.style.borderRadius = '6px';
            btn.style.fontSize = '15px';
            btn.style.fontWeight = 'bold';
            btn.style.cursor = 'pointer';
            btn.style.border = '1px solid #334155';
            btn.style.display = 'block';

            // 현재 선택된 노선은 파란색으로 하이라이트
            if (route === currentSelected) {
                btn.style.background = '#2563eb';
                btn.style.color = '#ffffff';
                btn.style.borderColor = '#60a5fa';
            } else {
                btn.style.background = '#0f172a';
                btn.style.color = '#cbd5e1';
            }

            // 터치 시 해당 노선 반영 후 창 닫기 및 순번 자동 갱신
            btn.onclick = function () {
                if (regRouteEl) regRouteEl.value = route;
                safeSetText('schedRouteSelectedText', route);
                container.style.display = 'none';
                updateRegSeqOptions(); // 노선 대수에 맞춰 순번 목록 재계산
            };
            container.appendChild(btn);
        });

        if (keys.length > 0) {
            if (regRouteEl && !regRouteEl.value) regRouteEl.value = currentSelected;
            safeSetText('schedRouteSelectedText', regRouteEl ? regRouteEl.value : currentSelected);
            updateRegSeqOptions();
        }
    }

    // ==========================================
    // 🔢 [순번 옵션 생성기] 노선명(예: 16대)을 읽어 1~16순번 자동 채우기
    // ==========================================
    function updateRegSeqOptions() {
        let regRouteEl = document.getElementById('regRoute');
        let route = regRouteEl ? regRouteEl.value : '';
        let seqSelect = document.getElementById('regSeq');
        if (!seqSelect) return;

        let prevVal = seqSelect.value;
        seqSelect.innerHTML = '';

        let workType = document.getElementById('workType')?.value;
        let routeValue = route;
        let numEl = document.getElementById('busLedDisplay');
        let subEl = document.getElementById('routeSubDisplay');

        if (workType === '휴무' || routeValue === '휴무' || routeValue === '休') {
            if (numEl) {
                numEl.innerText = '충전중';
                numEl.style.color = '#38bdf8'; /* Cyan to match LED */
            }
            if (subEl) {
                subEl.innerText = '휴무';
                subEl.style.color = '#38bdf8';
            }
            return;
        }

        // 노선 이름에서 운행 대수 추출 (예: 202평일(16대) -> 16)
        let count = 4;
        let match = String(route).match(/(\d+)\s*대/);
        if (match) {
            count = parseInt(match[1], 10);
        }

        // 1순번부터 끝 순번까지 셀렉트 박스에 추가
        for (let i = 1; i <= count; i++) {
            let opt = document.createElement('option');
            opt.value = `${i}순번`;
            opt.innerText = `${i}순번`;
            seqSelect.appendChild(opt);
        }

        // 이전에 선택했던 순번이 유효하면 그대로 유지
        if (prevVal && Array.from(seqSelect.options).some(o => o.value === prevVal)) {
            seqSelect.value = prevVal;
        } else {
            seqSelect.value = '1순번';
        }

        if (subEl) {
            remainder = remainder.replace(/\(|\)/g, '');
            subEl.innerText = remainder;
            subEl.style.color = '#38bdf8';
        }
    }

    // 밖을 터치했을 때 노선 드롭다운 자동 닫기
    document.addEventListener('click', function (e) {
        const box = document.querySelector('.route-dropdown-box');
        const container = document.getElementById('schedRouteOptions');
        if (box && container && !box.contains(e.target)) {
            container.style.display = 'none';
        }
    });

    // ==========================================
    // 🔓 [입력 잠금 완전 해제 함수] 상시 열림 유지
    // ==========================================
    function enableScheduleEditMode() {
        // 모든 요소를 활성화 상태로 유지
        ['workType', 'regBusNo', 'regSeq', 'workTimeType'].forEach(id => {
            let el = document.getElementById(id);
            if (el) el.disabled = false;
        });
        let schedRouteDisplayBtn = document.getElementById('schedRouteDisplayBtn');
        if (schedRouteDisplayBtn) schedRouteDisplayBtn.style.pointerEvents = 'auto';
    }

    function disableScheduleEditMode() {
        // 더 이상 기사님들의 입력을 강제로 잠그지 않습니다. (상시 편집 모드 유지)
        enableScheduleEditMode();
    }

    // ==========================================
    // 👁️ [근무 형태 토글] 휴무 선택 시 노선/차량 숨김
    // ==========================================
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

    // ==========================================
    // 📅 [일정 로드] 날짜 선택 시 저장된 내 근무 데이터 채우기
    // ==========================================
    function loadScheduleForEdit() {
        let dateEl = document.getElementById('regDate');
        let date = dateEl ? dateEl.value : '';
        if (!date) return;

        let driverKey = typeof getDriverKey === 'function' ? getDriverKey(`sched_${date}`) : `sched_${date}`;
        let saved = localStorage.getItem(driverKey);

        if (saved) {
            let data = JSON.parse(saved);
            let workTypeEl = document.getElementById('workType');
            if (workTypeEl) workTypeEl.value = data.workType || '정상';

            toggleInputs();

            if (data.workType !== '휴무') {
                let busNoEl = document.getElementById('regBusNo');
                let regRouteEl = document.getElementById('regRoute');
                let regSeqEl = document.getElementById('regSeq');
                let workTimeTypeEl = document.getElementById('workTimeType');

                if (busNoEl) busNoEl.value = data.busNo || '';
                if (data.route && regRouteEl) {
                    regRouteEl.value = data.route;
                    safeSetText('schedRouteSelectedText', data.route);
                }
                updateRegSeqOptions();
                if (regSeqEl) regSeqEl.value = data.seq || '1순번';
                if (workTimeTypeEl) workTimeTypeEl.value = data.time || '오전';
            }
        } else {
            // 일정이 없는 빈 날짜일 때 기본값 설정
            let workTypeEl = document.getElementById('workType');
            if (workTypeEl) workTypeEl.value = '정상';

            toggleInputs();

            let busNoEl = document.getElementById('regBusNo');
            let regRouteEl = document.getElementById('regRoute');
            let regSeqEl = document.getElementById('regSeq');
            let workTimeTypeEl = document.getElementById('workTimeType');

            if (busNoEl) busNoEl.value = '';
            let firstRoute = Object.keys(routeDataMap || {})[0] || "202평일(16대)";
            if (regRouteEl) regRouteEl.value = firstRoute;
            safeSetText('schedRouteSelectedText', firstRoute);

            updateRegSeqOptions();
            if (regSeqEl) regSeqEl.value = '1순번';
            if (workTimeTypeEl) workTimeTypeEl.value = '오전';
        }

        // 항상 활성화 유지
        enableScheduleEditMode();
    }

    // ==========================================
    // 💾 [일정 저장] 입력한 스케줄을 저장하고 메인 화면과 즉시 동기화
    // ==========================================
    function saveSchedule() {
        let dateEl = document.getElementById('regDate');
        let date = dateEl ? dateEl.value : '';
        if (!date) {
            alert("등록할 날짜를 선택해주세요.");
            return;
        }

        let workType = document.getElementById('workType')?.value || '정상';
        let selectedRoute = workType === '휴무' ? '-' : (document.getElementById('regRoute')?.value || '-');

        let data = {
            workType: workType,
            busNo: workType === '휴무' ? '-' : (document.getElementById('regBusNo')?.value || ''),
            route: selectedRoute,
            seq: workType === '휴무' ? '-' : (document.getElementById('regSeq')?.value || '1순번'),
            time: workType === '휴무' ? '-' : (document.getElementById('workTimeType')?.value || '오전')
        };

        if (workType !== '휴무' && selectedRoute !== '-') {
            lastEditedWorkRoute = selectedRoute;
        }

        // 구글 시트 및 브라우저에 저장
        let driverKey = typeof getDriverKey === 'function' ? getDriverKey(`sched_${date}`) : `sched_${date}`;
        localStorage.setItem(driverKey, JSON.stringify(data));
        if (typeof saveToGAS === 'function') {
            saveToGAS(`sched_${date}`, data);
        }

        alert(`✅ [${date}] 근무 일정이 성공적으로 저장되었습니다!`);

        // 메인 화면 및 카드 즉시 갱신
        if (typeof searchSchedule === 'function') searchSchedule();
        if (typeof refreshAllUI === 'function') refreshAllUI();
    }

    function getHeaderArray(route, seq) {
        let seqHeaderKey = `yeongjong_seq_header_${route}_${seq}`;
        let savedSeqHeader = localStorage.getItem(seqHeaderKey);
        if (savedSeqHeader) {
            try {
                let parsed = JSON.parse(savedSeqHeader);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            } catch (e) { }
        }
        if (routeDataMap[route] && routeDataMap[route].headers && Array.isArray(routeDataMap[route].headers)) {
            return routeDataMap[route].headers;
        }
        return ["차고지", "대우하나", "차고지"];
    }

    function getFirstTripHeaderArray(route, seq) {
        let key = `yeongjong_first_header_${route}_${seq}`;
        let saved = localStorage.getItem(key);
        if (saved) {
            try {
                let parsed = JSON.parse(saved);
                if (parsed && Array.isArray(parsed.headers)) {
                    return parsed;
                }
            } catch (e) { }
        }
        return { enabled: false, headers: [] };
    }




    // ================================================================
    // 🏷️ [1번 카드] 순번 UI 안전 렌더링 함수
    // - '1', '1순번' 등 어떤 데이터가 들어와도 항상 일관되게 '1순번'으로 조합
    // - 부모 태그를 통째로 덮어쓰지 않고 내부 구조를 완벽하게 유지·복원합니다.
    // ================================================================
    function updateResSeqDisplay(seqValue) {
        const badgeEl = document.querySelector('.bus-driver-seq-badge') || document.querySelector('.pill-badge-seq');
        const numEl = document.getElementById('resSeqNum');
        const unitEl = document.getElementById('resSeqUnit');
        const bliSeqNumEl = document.getElementById('bliSeqNum');
        const bliSeqLabelEl = document.getElementById('bliSeqLabel');

        if (!seqValue || seqValue === '-' || seqValue === '휴무' || seqValue === '휴일' || seqValue === '休' || seqValue === '미등록') {
            if (badgeEl) badgeEl.style.display = 'none';
            if (numEl) numEl.innerText = '';
            if (unitEl) unitEl.innerText = '';
            if (bliSeqNumEl) bliSeqNumEl.innerText = '';
            if (bliSeqLabelEl) bliSeqLabelEl.innerText = '';
            return;
        }

        if (badgeEl) badgeEl.style.display = 'inline-flex';
        const match = String(seqValue).match(/\d+/);
        const numOnly = match ? match[0] : seqValue;

        if (numEl) numEl.innerText = numOnly;
        if (unitEl) unitEl.innerText = '순번';
        if (bliSeqNumEl) bliSeqNumEl.innerText = numOnly;
        if (bliSeqLabelEl) bliSeqLabelEl.innerText = '순번';
    }


    // 🏷️ [1번 카드] 노선 UI 안전 렌더링 함수
    // - 숫자 부분(또는 노선명)을 버스 상단 LED 전광판에 주입하고,
    // - '평일 16대', '휴일 12대' 등 부가 정보는 202 바로 아래에 시인성 높은 크기로 배치합니다.
    function updateResRouteDisplay(routeValue, workType) {
        const numEl = document.getElementById('resRouteNumber');
        const subEl = document.getElementById('resRouteSub');
        const fullEl = document.getElementById('resRoute');
        const bliRouteNumEl = document.getElementById('bliRouteNum');
        const bliWorkTypeEl = document.getElementById('bliWorkType');
        const bliAmPmEl = document.getElementById('bliAmPm');

        if (fullEl) fullEl.innerText = routeValue || '-';

        // 오전/오후 표시 (resTime에서 가져옴)
        if (bliAmPmEl) {
            const timeEl = document.getElementById('resTime');
            const timeVal = timeEl ? timeEl.innerText.trim() : '';
            bliAmPmEl.innerText = (timeVal && timeVal !== '-') ? timeVal : '';
        }

        // 💡 [근무정보가 들어간 날이 아닌 날(휴일/휴무/미등록 등)] 3D 버스 LED 전광판에 일체 아무것도 출력하지 않음
        const isNoWork = (
            !workType || workType === '휴무' || workType === '휴일' || workType === '미등록' ||
            workType === '연차' || workType === '공가' || workType === '병가' ||
            !routeValue || routeValue === '-' || routeValue === '휴무' || routeValue === '휴일' ||
            routeValue === '休' || routeValue === '충전중' || routeValue === '미등록'
        );

        if (isNoWork) {
            if (numEl) numEl.innerText = '';
            if (subEl) subEl.innerText = '';
            if (bliRouteNumEl) bliRouteNumEl.innerText = '';
            if (bliWorkTypeEl) bliWorkTypeEl.innerText = '';
            if (bliAmPmEl) bliAmPmEl.innerText = '';
            return;
        }

        if (bliWorkTypeEl) bliWorkTypeEl.innerText = workType || '';

        let str = String(routeValue).trim();
        let match = str.match(/^([^\d]*)(\d+)(.*)$/);
        if (match) {
            let prefix = match[1] || '';
            let routeDigits = match[2] || '';
            let remainder = (match[3] || '').trim();
            if (numEl) {
                numEl.innerText = prefix ? `${prefix}${routeDigits}` : routeDigits;
                numEl.style.color = '#38bdf8';
            }
            if (subEl) {
                remainder = remainder.replace(/[()（）]/g, '');
                subEl.innerText = remainder;
                subEl.style.color = '#38bdf8';
            }
            if (bliRouteNumEl) bliRouteNumEl.innerText = prefix ? `${prefix}${routeDigits}` : routeDigits;
        } else {
            if (numEl) {
                numEl.innerText = str;
                numEl.style.color = '#38bdf8';
            }
            if (subEl) {
                subEl.innerText = '';
            }
            if (bliRouteNumEl) bliRouteNumEl.innerText = str;
        }
    }


    /**
    * 📅 [메인 기능] 선택된 날짜의 근무 일정 및 노선 정보 조회 함수
    * - 날짜가 비어있는 상태로 호출되더라도 즉시 오늘 날짜(YYYY-MM-DD)를 스스로 채워 넣고 중단 없이 계속 진행합니다.
    */
    function searchSchedule() {
        let dateInput = document.getElementById('searchDate');

        // 💡 [핵심 방어] 새로고침 직후 날짜창이 비어있다면 즉시 오늘 날짜를 스스로 채워 넣음
        if (dateInput && !dateInput.value) {
            let now = new Date();
            let y = now.getFullYear();
            let m = String(now.getMonth() + 1).padStart(2, '0');
            let d = String(now.getDate()).padStart(2, '0');
            dateInput.value = `${y}-${m}-${d}`;
        }

        let dateStr = dateInput ? dateInput.value : '';
        if (!dateStr) return;

        // 요일 계산 및 헤더 날짜 텍스트 세팅 (예: 2026-09-14 (월))
        let d = new Date(dateStr);
        let days = ['일', '월', '화', '수', '목', '금', '토'];
        let dayStr = days[d.getDay()];
        safeSetText('dateDisplayText', `${dateStr} (${dayStr})`);

        // 선택한 날짜의 개인 근무 데이터 가져오기
        let driverKey = typeof getDriverKey === 'function' ? getDriverKey(`sched_${dateStr}`) : `sched_${dateStr}`;
        let saved = localStorage.getItem(driverKey);

        // 1. 데이터가 아예 없는 미등록 날짜 처리
        if (!saved) {
            safeSetText('resType', '미등록');
            safeSetText('resTime', '-');
            safeSetText('resBusNo', '');
            safeSetText('resRoute', '-');
            updateResRouteDisplay('', '미등록');
            updateResSeqDisplay(null);
            safeSetText('resStartTime', '-');
            safeSetText('resEndTime', '-');
            safeSetText('resHandoverTime', '-');
            safeSetText('bliStartTime', '-');
            safeSetText('bliEndTime', '-');
            safeSetText('bliHandoverTime', '-');
            safeSetText('bliBusNo', '-');
            safeSetText('resWorkDistance', '-');

            setMainCardStatus(false, '', '미등록', '#94a3b8');

            let tableEl = document.getElementById('resTimetable');
            if (tableEl) tableEl.innerHTML = '<div style="text-align:center; padding: 20px 0; color:#94a3b8;">등록된 근무 일정이 없습니다.</div>';

            safeSetText('liveCardStatus', '⏳ 일정 미등록');
            safeSetText('liveCardTimeLeft', '-');
            safeSetText('liveCardDetail', '해당 날짜의 근무 일정이 없습니다.');
            safeSetText('liveCardWarmMessage', '근무 일정을 등록해주세요!');

            if (typeof loadTodayMemo === 'function') loadTodayMemo();
            if (typeof calculateStats === 'function') calculateStats();
            return;
        }

        let data = JSON.parse(saved);
        safeSetText('resType', data.workType || '-');
        safeSetText('resTime', data.time || '-');

        // 🚌 [차량번호 & LED] 휴무/휴일/미등록 등 근무정보가 없는 날은 차량번호 및 LED 일체 빈칸 유지
        const isOffWork = (data.workType === '휴무' || data.workType === '휴일' || data.workType === '연차' || data.workType === '공가' || data.workType === '병가');
        let busDigits = (!isOffWork && data.busNo && data.busNo !== '-') ? (data.busNo.replace(/[^\d]/g, '') || data.busNo) : '';
        safeSetText('resBusNo', busDigits);
        safeSetText('resRoute', data.route || '-');
        safeSetText('bliBusNo', busDigits || '-');


        // 💡 [핵심] 노선(202 / 평일 16대)과 순번(운전석 사람 그림자+3순번) 안전 주입
        updateResRouteDisplay(isOffWork ? '' : (data.route || '-'), data.workType);
        updateResSeqDisplay(isOffWork ? null : data.seq);

        // 2. 휴무일 처리
        if (isOffWork) {
            safeSetText('resRoute', '휴무');
            updateResRouteDisplay('', data.workType);
            updateResSeqDisplay(null);
            safeSetText('resBusNo', '');
            safeSetText('resStartTime', '-');
            safeSetText('resEndTime', '-');
            safeSetText('resHandoverTime', '-');
            safeSetText('bliStartTime', '-');
            safeSetText('bliEndTime', '-');
            safeSetText('bliHandoverTime', '-');
            safeSetText('bliBusNo', '-');
            safeSetText('resWorkDistance', '0 km');

            // 정류장 표지판: 카운트 없이 '휴무' 텍스트만 표시
            setMainCardStatus(false, '', '휴무', '#22c55e');

            let tableEl = document.getElementById('resTimetable');
            if (tableEl) tableEl.innerHTML = '<div style="text-align:center; padding: 20px 0; color:#22c55e; font-weight: bold;">금일은 편안한 휴무일입니다. ☕</div>';

            safeSetText('liveCardStatus', '☕ 휴무일');
            safeSetText('liveCardTimeLeft', '-');
            safeSetText('liveCardDetail', '오늘은 편안한 휴무일입니다.');
            safeSetText('liveCardWarmMessage', '따뜻한 차 한 잔과 함께 충분한 휴식을 취해보세요! ☕');

            if (typeof loadFolderMemoTab === 'function') {
                try {
                    loadFolderMemoTab('route');
                    loadFolderMemoTab('shift');
                    loadFolderMemoTab('memo');
                } catch(e) {}
            }
            if (typeof loadTodayMemo === 'function') loadTodayMemo();
            if (typeof calculateStats === 'function') calculateStats();
            return;
        }

        // 3. 정상/대타 근무일 3분할 시간 (시작시간 / 종료시간 / 교대시간) 계산
        let timing = calculateStartAndHandoverTime(data.route, data.seq, data.time);
        safeSetText('resStartTime', timing && timing.startTime ? timing.startTime : '-');
        safeSetText('resEndTime', timing && timing.endTime ? timing.endTime : '-');
        safeSetText('resHandoverTime', timing && timing.handoverTime ? timing.handoverTime : '-');
        safeSetText('bliStartTime', timing && timing.startTime ? timing.startTime : '-');
        safeSetText('bliEndTime', timing && timing.endTime ? timing.endTime : '-');
        safeSetText('bliHandoverTime', timing && timing.handoverTime ? timing.handoverTime : '-');

        let list = customGetItem(data.route, data.seq);

        let summary = calculateWorkSummary(list, data.time, data.route, data.seq);
        if (summary) {
            safeSetText('resWorkDistance', `${summary.distance} km (${summary.timeStr})`);
        } else {
            safeSetText('resWorkDistance', '-');
        }

        // 💡 [미래/과거 날짜 메인 화면 정류장 표지판 안내 동기화]
        let nowDate = new Date();
        let yyyy = nowDate.getFullYear();
        let mm = String(nowDate.getMonth() + 1).padStart(2, '0');
        let dd = String(nowDate.getDate()).padStart(2, '0');
        let todayYmd = `${yyyy}-${mm}-${dd}`;

        if (dateStr > todayYmd) {
            setMainCardStatus(false, '', '운행준비중', '#f59e0b');
        } else if (dateStr < todayYmd) {
            setMainCardStatus(false, '', '운행종료', '#94a3b8');
        } else {
            setMainCardStatus(true, '교대까지', '00:00', '#ffffff');
        }

        // 4. 공식 시간표 렌더링 및 실시간 타이머 가동
        if (typeof renderMainTimetable === 'function') renderMainTimetable(data.route, data.seq);

        if (typeof loadTodayMemo === 'function') loadTodayMemo();
        if (typeof updateLiveStatusAndHighlight === 'function') updateLiveStatusAndHighlight();
        if (typeof calculateStats === 'function') calculateStats();

        // 💡 [BOARD_DB 메모 동기화] 당일 노선 번호(예: 281번)에 맞추어 노선정보 및 교대정보 즉시 갱신
        if (typeof loadFolderMemoTab === 'function') {
            try {
                loadFolderMemoTab('route');
                loadFolderMemoTab('shift');
                loadFolderMemoTab('memo');
            } catch(e) {}
        }
    }


    function getValidStartTime(tripObj, colCount) {
        if (!tripObj) return '-';
        for (let c = 1; c <= colCount; c++) {
            let val = tripObj[`time${c}`];
            if (val && val.trim() !== '') return val.trim();
        }
        return '-';
    }

    function getValidEndTime(tripObj, colCount, isLastTrip = false) {
        if (!tripObj) return '-';
        if (isLastTrip) {
            let t3 = tripObj[`time3`] ? tripObj[`time3`].trim() : '';
            if (!t3) {
                let t2 = tripObj[`time2`] ? tripObj[`time2`].trim() : '';
                if (t2) return t2;
            }
        }
        for (let c = colCount; c >= 1; c--) {
            let val = tripObj[`time${c}`];
            if (val && val.trim() !== '') return val.trim();
        }
        return '-';
    }

    function calculateStartAndHandoverTime(route, seq, timeType) {
        let list = customGetItem(route, seq);
        if (!list || list.length === 0) return { startTime: '-', endTime: '-', handoverTime: '-', startEndDisplay: '-' };

        let colCount = getHeaderArray(route, seq).length;

        let yellowRowIdx = -1;
        let yellowTimeVal = '-';

        for (let i = 0; i < list.length; i++) {
            let r = list[i];
            for (let c = 1; c <= colCount; c++) {
                if (r[`c${c}`] === 'yellow') {
                    yellowRowIdx = i;
                    yellowTimeVal = r[`time${c}`] || '-';
                    break;
                }
            }
            if (yellowRowIdx !== -1) break;
        }

        if (yellowRowIdx === -1 && list.length >= 3) {
            yellowRowIdx = 2;
            yellowTimeVal = getValidEndTime(list[2], colCount, 2 === list.length - 1);
        }

        let startTime = '-';
        let endTime = '-';
        let handoverTime = yellowTimeVal;

        if (timeType === '오전') {
            startTime = getValidStartTime(list[0], colCount);
            endTime = yellowTimeVal;
        } else {
            let pmStartIdx = yellowRowIdx + 1;
            if (pmStartIdx < list.length) {
                startTime = getValidStartTime(list[pmStartIdx], colCount);
            } else if (list[yellowRowIdx]) {
                startTime = getValidStartTime(list[yellowRowIdx], colCount);
            }
            let lastTrip = list[list.length - 1];
            endTime = lastTrip ? getValidEndTime(lastTrip, colCount, true) : '-';
        }

        let startEndDisplay = `${startTime} / ${endTime}`;
        return { startTime, endTime, handoverTime, startEndDisplay };
    }

    function customGetItem(route, seq) {
        let saved = localStorage.getItem(`yeongjong_shared_tt_${route}_${seq}`);
        if (saved) { try { return JSON.parse(saved); } catch (e) { } }
        if (routeDataMap[route] && routeDataMap[route].data && routeDataMap[route].data[seq]) {
            return routeDataMap[route].data[seq];
        }
        let defaultDist = getDefaultDistanceByRoute(route);
        let default6List = [];
        for (let i = 0; i < 6; i++) {
            default6List.push({ time1: "06:00", time2: "07:00", time3: "08:00", c1: "black", c2: "black", c3: "black", dist: defaultDist });
        }
        return default6List;
    }

    function renderMainTimetable(route, seq) {
        let list = customGetItem(route, seq);
        let container = document.getElementById('resTimetable');
        if (!list || list.length === 0) {
            container.innerHTML = '시간표 데이터가 없습니다.';
            return;
        }

        let commonHeaders = getHeaderArray(route, seq);
        let firstHeaderInfo = getFirstTripHeaderArray(route, seq);

        let html = `<table class="schedule-table" id="mainScheduleTable">
                <thead>`;

        // (핵심복원) 1회차 전용 헤더가 사용중일 때 첫 줄에 올바르게 적용되도록 수정 완료
        if (firstHeaderInfo.enabled && firstHeaderInfo.headers && firstHeaderInfo.headers.length > 0) {
            html += `<tr style="background: var(--header-bg); font-weight:bold; color: var(--primary);"><th>회</th>`;
            firstHeaderInfo.headers.forEach(fh => html += `<th>${fh || '-'}</th>`);
            html += `</tr>`;
        } else {
            html += `<tr style="background: var(--header-bg); font-weight:bold;"><th>회</th>`;
            commonHeaders.forEach(h => html += `<th>${h || '-'}</th>`);
            html += `</tr>`;
        }

        html += `</thead><tbody>`;

        list.forEach((r, idx) => {
            let isLast = (idx === list.length - 1);
            let startT = getValidStartTime(r, commonHeaders.length);
            let endT = getValidEndTime(r, commonHeaders.length, isLast);

            // 만약 1회차 헤더를 사용 중이고 2회차 시작 시점이라면 공용 헤더 반복 출력
            if (idx === 1 && firstHeaderInfo.enabled) {
                html += `<tr style="background: var(--header-bg); font-weight:bold;"><th>회</th>`;
                commonHeaders.forEach(h => html += `<th>${h || '-'}</th>`);
                html += `</tr>`;
            }

            html += `<tr data-time1="${startT}" data-timelast="${endT}" data-rowidx="${idx}">
                    <td><strong>${idx + 1}</strong></td>`;
            for (let i = 1; i <= commonHeaders.length; i++) {
                let tVal = r[`time${i}`] || '';
                let cVal = r[`c${i}`] || 'black';
                html += `<td><span class="effect-${cVal}">${tVal || '-'}</span></td>`;
            }
            html += `</tr>`;
        });
        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    function timeToSeconds(tStr) {
        if (!tStr || tStr === '-' || tStr.trim() === '') return null;
        let parts = tStr.trim().split(':');
        if (parts.length < 2) return null;
        let h = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10);
        let s = parts.length > 2 ? parseInt(parts[2], 10) : 0;
        if (isNaN(h) || isNaN(m)) return null;
        return h * 3600 + m * 60 + s;
    }

    function formatSecondsToHMS(secs) {
        if (secs < 0) secs = 0;
        let h = Math.floor(secs / 3600);
        let m = Math.floor((secs % 3600) / 60);
        let s = secs % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    // 💡 [초단위 제거] HH:MM 형태의 시·분 포맷 함수
    function formatSecondsToHM(secs) {
        if (secs < 0) secs = 0;
        let h = Math.floor(secs / 3600);
        let m = Math.floor((secs % 3600) / 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // 💡 [1번 카드 우측 - 정감있는 정류장 표지판] 상태 및 카운트다운/텍스트 안전 주입 함수
    // - isCountdown: true일 경우 "00:00 남음" 표시 (상단에 "교대까지" 또는 "N회차 출발까지" 표기)
    // - isCountdown: false일 경우 "운행중", "휴무", "미등록", "운행종료", "운행준비중" 텍스트만 깔끔하게 표시
    function setMainCardStatus(arg1, arg2, arg3, arg4, arg5, arg6) {
        let isCountdown = false;
        let label = '';
        let value = '';
        let valColor = '#ffffff';

        if (typeof arg1 === 'boolean') {
            isCountdown = arg1;
            label = arg2 || '';
            value = arg3 || '';
            valColor = arg4 || '#ffffff';
        } else {
            // 구 시그니처 호환: (label, iconName, iconColor, valueText, valueColor, valueFontSize)
            label = arg1 || '';
            value = arg4 || '';
            valColor = arg5 || '#ffffff';
            if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
                isCountdown = true;
            } else {
                isCountdown = false;
            }
        }

        const subLabelEl = document.getElementById('resStopSignSubLabel');
        const timerWrapEl = document.getElementById('resMainCountdownTimerWrap');
        const timerEl = document.getElementById('resMainCountdownTimer');
        const suffixEl = document.getElementById('resMainCountdownSuffix');
        const legacyTextEl = document.getElementById('resMainStatusText');
        const bliCountdownWrapEl = document.getElementById('bliCountdownWrap');
        const bliCountdownLabelEl = document.getElementById('bliCountdownLabel');
        const bliCountdownTimerEl = document.getElementById('bliCountdownTimer');

        if (legacyTextEl) legacyTextEl.innerText = label;

        if (isCountdown) {
            if (subLabelEl) {
                subLabelEl.innerText = label;
                subLabelEl.style.display = 'block';
                subLabelEl.style.color = '#fed7aa';
                subLabelEl.style.fontSize = '11.5px';
                subLabelEl.style.fontWeight = '700';
            }
            if (timerWrapEl) timerWrapEl.style.display = 'flex';
            if (timerEl) {
                timerEl.innerText = value;
                timerEl.style.color = valColor || '#ffffff';
                timerEl.style.fontSize = '22px';
                timerEl.style.fontWeight = '900';
                timerEl.style.letterSpacing = '-0.5px';
            }
            if (suffixEl) {
                suffixEl.style.display = 'none'; // '남음' 텍스트 삭제
            }
            if (bliCountdownWrapEl) bliCountdownWrapEl.style.display = 'block';
            if (bliCountdownLabelEl) bliCountdownLabelEl.innerText = label;
            if (bliCountdownTimerEl) bliCountdownTimerEl.innerText = value;
        } else {
            if (bliCountdownWrapEl) bliCountdownWrapEl.style.display = 'none';
            // 비카운트다운 텍스트 모드: 운행중, 휴무일, 미등록, 운행종료, 운행준비중 등
            const isGreenState = (value === '운행중' || value === '휴무' || value === '휴무일');
            const stateColor = isGreenState ? '#4ade80' : (value === '운행준비중' ? '#fbbf24' : '#94a3b8');

            let displayValue = value;
            let iconHtml = '';

            if (value.includes('휴무')) {
                displayValue = '휴무일';
                iconHtml = '<iconify-icon icon="solar:cup-outline" style="font-size: 1.1em; vertical-align: -3px; margin-left: 4px;"></iconify-icon>';
            } else if (value.includes('운행중')) {
                iconHtml = '<iconify-icon icon="solar:bus-outline" style="font-size: 1.1em; vertical-align: -3px; margin-left: 4px;"></iconify-icon>';
            } else if (value.includes('미등록')) {
                iconHtml = '<iconify-icon icon="solar:danger-circle-outline" style="font-size: 1.1em; vertical-align: -3px; margin-left: 4px;"></iconify-icon>';
            } else if (value.includes('운행종료')) {
                iconHtml = '<iconify-icon icon="solar:flag-outline" style="font-size: 1.1em; vertical-align: -3px; margin-left: 4px;"></iconify-icon>';
            } else if (value.includes('운행준비중')) {
                iconHtml = '<iconify-icon icon="solar:settings-outline" style="font-size: 1.1em; vertical-align: -3px; margin-left: 4px;"></iconify-icon>';
            } else {
                iconHtml = '<iconify-icon icon="solar:chat-line-outline" style="font-size: 1.1em; vertical-align: -3px; margin-left: 4px;"></iconify-icon>';
            }

            if (subLabelEl) {
                // 이모지 깜빡임(flicker) 방지를 위해 내용이 변경되었을 때만 업데이트
                const newHtml = displayValue + iconHtml;
                if (subLabelEl.innerHTML !== newHtml) {
                    subLabelEl.innerHTML = newHtml;
                }
                subLabelEl.style.display = 'block';
                subLabelEl.style.color = stateColor;
                subLabelEl.style.fontSize = '18px';
            }
            // 하단에는 시간 타이머 외에는 텍스트가 들어가지 않게 하고, 타이머 없을 때는 완전히 비워둠
            if (timerWrapEl) {
                timerWrapEl.style.display = 'none';
            }
            if (timerEl) {
                timerEl.innerText = '';
            }
            if (suffixEl) {
                suffixEl.style.display = 'none';
            }
        }
    }

    // 📁 [3번 카드] '오늘의 시간표' 파일첩 접이식 토글 함수
    function toggleTodayTimetable() {
        if (typeof switchScheduleTab === 'function') {
            switchScheduleTab('timetable');
        }
    }

    function updateLiveStatusAndHighlight() {
        let table = document.getElementById('mainScheduleTable');
        let liveCardStatus = document.getElementById('liveCardStatus');
        let liveCardTimeLeft = document.getElementById('liveCardTimeLeft');
        let liveCardTimeSub = document.getElementById('liveCardTimeSub');
        let indicator = document.getElementById('liveStatusIndicator');

        // 1. 필수 요소 확인
        if (!liveCardStatus) return;

        let searchDateEl = document.getElementById('searchDate');
        if (!searchDateEl || !searchDateEl.value) return;
        let searchDateStr = searchDateEl.value;

        let now = new Date();
        let todayStr = typeof getFormattedDate === 'function' ? getFormattedDate(now) : '';

        let saved = localStorage.getItem(getDriverKey(`sched_${searchDateStr}`));
        let schedData = null;
        if (saved) {
            try { schedData = JSON.parse(saved); } catch (e) { }
        }

        let liveAccordionTitle = document.getElementById('liveAccordionTitle');
        if (liveAccordionTitle && schedData) {
            if (schedData.workType === '휴무' || schedData.workType === '미등록') {
                liveAccordionTitle.innerHTML = `<iconify-icon icon="mdi:timetable" class="app-icon"></iconify-icon> 공유 운행 시간표`;
            } else {
                liveAccordionTitle.innerHTML = `<iconify-icon icon="mdi:timetable" class="app-icon"></iconify-icon> ${schedData.route} ${schedData.seq}`;
            }
        }

        let workType = schedData ? schedData.workType : '미등록';

        // 2. 휴무일 처리
        if (workType === '휴무') {
            liveCardStatus.innerText = '☕ 휴무일';
            if (liveCardTimeLeft) liveCardTimeLeft.innerText = '-';
            if (liveCardTimeSub) liveCardTimeSub.innerText = '휴무';
            if (indicator) indicator.style.backgroundColor = '#8ab4f8';

            setMainCardStatus(false, '', '휴무', '#22c55e');
            return;
        }

        // 3. 미등록 처리
        if (!saved || workType === '미등록') {
            liveCardStatus.innerText = '⏳ 일정 미등록';
            if (liveCardTimeLeft) liveCardTimeLeft.innerText = '-';
            if (liveCardTimeSub) liveCardTimeSub.innerText = '미등록';
            if (indicator) indicator.style.backgroundColor = '#8ab4f8';

            setMainCardStatus(false, '', '미등록', '#94a3b8');
            return;
        }

        // 4. 오전/오후 교대 근무 구간(myStartTripIdx ~ myEndTripIdx) 계산
        let timeType = schedData.time;
        let route = schedData.route;
        let seq = schedData.seq;
        let list = customGetItem(route, seq);
        let commonHeaders = getHeaderArray(route, seq);
        let colCount = commonHeaders.length;

        let myStartTripIdx = 0;
        let myEndTripIdx = list.length - 1;
        let yellowRowIdx = -1;

        for (let i = 0; i < list.length; i++) {
            let r = list[i];
            for (let c = 1; c <= colCount; c++) {
                if (r[`c${c}`] === 'yellow') { yellowRowIdx = i; break; }
            }
            if (yellowRowIdx !== -1) break;
        }

        if (timeType === '오전') {
            myStartTripIdx = 0;
            myEndTripIdx = (yellowRowIdx !== -1) ? yellowRowIdx : Math.min(2, list.length - 1);
        } else if (timeType === '오후') {
            myStartTripIdx = (yellowRowIdx !== -1) ? yellowRowIdx + 1 : Math.min(3, list.length - 1);
            myEndTripIdx = list.length - 1;
        }

        // 5. 과거 날짜 및 미래 날짜 차단 (자정 연장선 방어 포함)
        if (todayStr && searchDateStr < todayStr) {
            let isLateNightShift = (now.getHours() < 5);
            if (!isLateNightShift) {
                liveCardStatus.innerText = '🏁 운행 완료';
                if (liveCardTimeLeft) liveCardTimeLeft.innerText = '00:00:00';
                if (liveCardTimeSub) liveCardTimeSub.innerText = '운행 완료';
                if (indicator) indicator.style.backgroundColor = '#8ab4f8';

                setMainCardStatus(false, '', '운행종료', '#94a3b8');
                return;
            }
        }
        if (todayStr && searchDateStr > todayStr) {
            liveCardStatus.innerText = '⏳ 운행전 (운행 예정)';
            if (liveCardTimeLeft) liveCardTimeLeft.innerText = '-';
            if (liveCardTimeSub) liveCardTimeSub.innerText = '운행 대기중';
            if (indicator) indicator.style.backgroundColor = '#fbbc05';

            setMainCardStatus(false, '', '운행준비중', '#f59e0b');
            return;
        }

        // 6. 내 담당 회차의 '모든 경유지 시간'을 순차적인 배열(Stops)로 만들기
        let stopsSequence = [];
        let prevDate = null;
        let tableRows = table ? Array.from(table.querySelectorAll('tbody tr[data-time1]')) : [];

        // 🌟 모든 회차 상태 클래스 초기화
        tableRows.forEach(r => r.classList.remove('past-trip', 'highlight-next-trip', 'my-shift-trip'));

        // 🌟 [1. 운행 마친 회차 행 판별] -> 흐릿하게 디밍 처리하여 회차 완료를 명확히 표시
        if (todayStr && searchDateStr < todayStr) {
            tableRows.forEach(r => r.classList.add('past-trip'));
        } else if (todayStr && searchDateStr === todayStr) {
            list.forEach((tripData, tripIdx) => {
                let tripRow = tableRows.find(r => parseInt(r.getAttribute('data-rowidx')) === tripIdx) || null;
                if (!tripRow) return;
                let isLast = (tripIdx === list.length - 1);
                let endT = (typeof getValidEndTime === 'function') 
                    ? getValidEndTime(tripData, colCount, isLast) 
                    : tripData[`time${colCount}`];
                if (endT) {
                    let endD = parseTimeToDate(endT, searchDateStr);
                    if (endD && now > endD) {
                        tripRow.classList.add('past-trip');
                    }
                }
            });
        }

        // 🌟 [2. 내가 운행할 회차행 지정] -> 투명 유리글라스 느낌의 배경 효과 부여
        for (let i = myStartTripIdx; i <= myEndTripIdx; i++) {
            let tripRow = tableRows.find(r => parseInt(r.getAttribute('data-rowidx')) === i) || null;
            if (tripRow && !tripRow.classList.contains('past-trip')) {
                tripRow.classList.add('my-shift-trip');
            }
        }

        for (let i = myStartTripIdx; i <= myEndTripIdx; i++) {
            let tripData = list[i];
            let tripRow = tableRows.find(r => parseInt(r.getAttribute('data-rowidx')) === i) || null;

            for (let c = 1; c <= colCount; c++) {
                let tStr = tripData[`time${c}`];
                if (!tStr) continue;

                let tDate = parseTimeToDate(tStr, searchDateStr);
                if (!tDate) continue;

                if (prevDate && tDate.getTime() < prevDate.getTime() - (2 * 60 * 60 * 1000)) {
                    tDate.setDate(tDate.getDate() + 1);
                }
                prevDate = new Date(tDate);

                stopsSequence.push({
                    tripIdx: i + 1,
                    stopIdx: c,
                    stopName: commonHeaders[c - 1] || `목적지${c}`,
                    timeStr: tStr,
                    timeDate: tDate,
                    row: tripRow,
                    isLastStop: (c === colCount)
                });
            }
        }

        if (stopsSequence.length === 0) return;

        // 현재 시각보다 미래의 가장 가까운 경유지 찾기
        let nextStop = stopsSequence.find(s => s.timeDate > now);

        // 7. 상황별 UI 및 카운트다운 업데이트 (메인화면 및 라이브모달 연동)
        let firstStop = stopsSequence[0];
        let lastStop = stopsSequence[stopsSequence.length - 1];

        if (!nextStop || now > lastStop.timeDate) {
            liveCardStatus.innerText = '운행이 종료되었습니다';
            if (liveCardTimeLeft) liveCardTimeLeft.innerText = '00:00:00';
            if (liveCardTimeSub) liveCardTimeSub.innerText = '수고하셨습니다!';
            if (indicator) indicator.style.backgroundColor = '#8ab4f8';

            setMainCardStatus(false, '', '운행종료', '#94a3b8');
        } else if (now >= firstStop.timeDate && now <= lastStop.timeDate) {
            // ⭐ [운행중] 근무 시간 내 운행 진행 중: 현재/다음 회차에 네온 유리글라스 하이라이트 부여
            if (nextStop.row) {
                nextStop.row.classList.remove('my-shift-trip');
                nextStop.row.classList.add('highlight-next-trip');
            }

            let seqVal = (schedData && schedData.seq) ? schedData.seq : '1순번';
            let seqStr = seqVal.includes('순번') ? seqVal : `${seqVal}순번`;
            window.currentTripRoundNumber = `${seqStr} ${nextStop.tripIdx}회차`;

            let leftSecs = Math.floor((nextStop.timeDate.getTime() - now.getTime()) / 1000);
            let hmsTime = formatSecondsToHMS(leftSecs);
            let hmTime = formatSecondsToHM(leftSecs);

            if (liveCardTimeLeft) liveCardTimeLeft.innerText = hmsTime;
            if (liveCardTimeSub) liveCardTimeSub.innerText = '';

            // ⭐ [라이브 모달 상태 복원 & 정류장 표지판 연동]
            if (nextStop.stopIdx === 1) {
                // 출발지 대기 중 (운행 출발 전) -> 출발장소명이 아닌 '운행대기중' 표기!
                liveCardStatus.innerText = `[${window.currentTripRoundNumber}] 운행대기중`;
                if (indicator) indicator.style.backgroundColor = '#fbbc05';

                // 메인 카드 정류장 표지판: N회차 출발까지 00:00:00 남음
                setMainCardStatus(true, `${nextStop.tripIdx}회차 출발까지`, hmsTime, '#ffffff');
            } else {
                // 운행 중 (다음 정류장으로 이동 중)
                liveCardStatus.innerText = `[${window.currentTripRoundNumber}] ${nextStop.stopName}까지`;
                if (indicator) indicator.style.backgroundColor = '#34a853';

                // 메인 카드 정류장 표지판: 카운트 없이 '운행중' 텍스트만 표시
                setMainCardStatus(false, '', '운행중', '#22c55e');
            }
        } else {
            // ⭐ [운행전 / 교대전] 아직 오늘 운행 시작 전: 첫 회차에 하이라이트 적용
            if (firstStop && firstStop.row && searchDateStr === todayStr && !firstStop.row.classList.contains('past-trip')) {
                firstStop.row.classList.remove('my-shift-trip');
                firstStop.row.classList.add('highlight-next-trip');
            }
            let seqVal = (schedData && schedData.seq) ? schedData.seq : '1순번';
            let seqStr = seqVal.includes('순번') ? seqVal : `${seqVal}순번`;
            window.currentTripRoundNumber = `${seqStr} ${firstStop.tripIdx}회차`;

            let timing = (typeof calculateStartAndHandoverTime === 'function')
                ? calculateStartAndHandoverTime(schedData.route, schedData.seq, schedData.time)
                : null;
            let handoverDate = (timing && timing.handoverTime && timing.handoverTime !== '-')
                ? parseTimeToDate(timing.handoverTime, searchDateStr)
                : null;

            let isBeforeHandover = (handoverDate && now < handoverDate);
            let targetDate = isBeforeHandover ? handoverDate : firstStop.timeDate;
            let targetLabel = isBeforeHandover ? '교대까지' : `${firstStop.tripIdx}회차 출발까지`;

            let leftSecs = Math.max(0, Math.floor((targetDate.getTime() - now.getTime()) / 1000));
            let hmTime = formatSecondsToHM(leftSecs); // HH:MM 표기

            // 라이브 모달: 예전 표시 방식대로 [n순번 n회차] 운행대기중
            let hmsTime = formatSecondsToHMS(leftSecs);
            if (liveCardTimeLeft) liveCardTimeLeft.innerText = hmsTime;
            liveCardStatus.innerText = `[${window.currentTripRoundNumber}] 운행대기중`;
            if (indicator) indicator.style.backgroundColor = '#fbbc05';

            // 메인 카드 정류장 표지판: 교대까지 또는 1회차 출발까지 00:00:00 남음
            setMainCardStatus(true, targetLabel, hmsTime, '#ffffff');
        }

        // [추가] 라이브 모달 시퀀스 위젯 실시간 디밍 처리
        if (window.currentActiveTripRange && window.currentActiveTripRange.validStops) {
            let searchDateStr = searchDateEl.value;
            let nowTime = new Date();
            for (let k = 1; k <= 3; k++) {
                let boxEl = document.getElementById('seqBoxContainer' + k);
                if (!boxEl || boxEl.style.display === 'none') continue;

                let timeId = 'seqPoint' + k + 'Time';
                let timeText = document.getElementById(timeId) ? document.getElementById(timeId).innerText : null;
                if (timeText && timeText.includes(':')) {
                    let boxDate = parseTimeToDate(timeText, searchDateStr);
                    // 타겟이 아니면서 시간이 지났으면 디밍
                    if (boxDate && boxDate < nowTime && !boxEl.classList.contains('active-target')) {
                        boxEl.style.opacity = '0.45';
                    }
                }
            }
        }
    }

    // 중복 삭제 후 하나만 남긴 날짜 파싱 함수
    function parseTimeToDate(timeStr, baseDateStr) {
        if (!timeStr || !baseDateStr) return null;

        // "25:30" 또는 "01:30" 형식을 분리
        let parts = timeStr.trim().split(':');
        if (parts.length < 2) return null;

        let hh = parseInt(parts[0], 10);
        let mm = parseInt(parts[1], 10);

        let [yyyy, month, dd] = baseDateStr.split('-').map(Number);
        if (!yyyy || !month || !dd) return null;

        // 기본 날짜 객체 생성 (로컬 타임 존 기준)
        let d = new Date(yyyy, month - 1, dd, 0, 0, 0);

        // 24시 이상일 경우 (예: 25시 30분 -> +1일 01시 30분)
        if (hh >= 24) {
            let addDays = Math.floor(hh / 24);
            let realHour = hh % 24;
            d.setDate(d.getDate() + addDays);
            d.setHours(realHour, mm, 0, 0);
        } else {
            d.setHours(hh, mm, 0, 0);
        }

        return d;
    }

    function calculateWorkSummary(list, timeType, route, seq) {
        if (!list || list.length === 0) return { distance: 0, timeStr: '0시간 0분', totalSecs: 0 };

        let totalDist = 0;
        let totalSecs = 0;
        let colCount = getHeaderArray(route, seq).length;

        // 교대(yellow) 행 위치 탐색
        let yellowRowIdx = -1;
        for (let i = 0; i < list.length; i++) {
            let r = list[i];
            for (let c = 1; c <= colCount; c++) {
                if (r[`c${c}`] === 'yellow') { yellowRowIdx = i; break; }
            }
            if (yellowRowIdx !== -1) break;
        }

        let startIdx = 0;
        let endIdx = list.length - 1;

        if (timeType === '오전') {
            endIdx = (yellowRowIdx !== -1) ? yellowRowIdx : Math.min(2, list.length - 1);
        } else if (timeType === '오후') {
            startIdx = (yellowRowIdx !== -1) ? yellowRowIdx + 1 : Math.min(3, list.length - 1);
        }

        for (let i = startIdx; i <= endIdx; i++) {
            if (list[i]) {
                let d = parseFloat(list[i].dist) || getDefaultDistanceByRoute(route);
                totalDist += d;

                let tStart = getValidStartTime(list[i], colCount);
                let tEnd = getValidEndTime(list[i], colCount, i === list.length - 1);
                let sSec = timeToSeconds(tStart);
                let eSec = timeToSeconds(tEnd);

                if (sSec !== null && eSec !== null) {
                    if (eSec < sSec) eSec += 24 * 3600; // 자정 넘김 처리
                    totalSecs += (eSec - sSec);
                }
            }
        }

        let h = Math.floor(totalSecs / 3600);
        let m = Math.round((totalSecs % 3600) / 60); // 반올림 처리
        if (m === 60) { h += 1; m = 0; }

        return { distance: totalDist, timeStr: `${h}시간 ${m}분`, totalSecs: totalSecs };
    }
