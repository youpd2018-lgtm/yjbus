  
    // ==========================================
    // LIVE 모달 연동 및 시퀀스 그리드 정밀 표준시간 계산 최종 수정본 (컨테이너 분리 적용)
    // ==========================================

    window.currentTripMasterCache = window.currentTripMasterCache || [];
    window.liveIntervalTimer = null; // 자동 갱신 타이머 전역 변수

    // ================================================================
    // 📋 [Live 모달] 오늘 운행 데이터 및 고유키(H열) 조립 함수 (202A / 203A 스마트 스위칭 완벽 적용)
    // ================================================================
    function getTodayDutyInfo() {
        const routeText = document.getElementById('resRoute')?.innerText.trim() || '202';
        const rawSeqText = document.getElementById('resSeqNum')?.innerText.trim() || '1';
        const seqNumText = rawSeqText.replace(/[^0-9]/g, '') || '1';
        const rawBusNo = document.getElementById('resBusNo')?.innerText.trim() || '';
        const cleanBusNo = rawBusNo.replace(/[^0-9]/g, '');

        let searchDateEl = document.getElementById('searchDate');
        let searchDateStr = searchDateEl ? searchDateEl.value : new Date().toISOString().split('T')[0];
        let detectedBusCount = "4";

        try {
            let driverKey = typeof getDriverKey === 'function' ? getDriverKey(`sched_${searchDateStr}`) : `sched_${searchDateStr}`;
            let saved = localStorage.getItem(driverKey);
            if (saved) {
                let schedData = JSON.parse(saved);
                let targetStr = (schedData.route || '') + " " + (schedData.busCount || '');
                let match = targetStr.match(/(\d+)\s*대/);
                if (match) detectedBusCount = match[1];
            }
        } catch (e) { }

        if (detectedBusCount === "4") {
            const subText = document.getElementById('resRouteSub')?.innerText.trim() || '';
            let subMatch = subText.match(/(\d+)\s*대/);
            if (subMatch) {
                detectedBusCount = subMatch[1];
            } else {
                let routeMatch = routeText.match(/(\d+)\s*대/);
                if (routeMatch) detectedBusCount = routeMatch[1];
            }
        }

        // 기본 노선 번호 (202, 203 등)
        const baseRoute = routeText.split(/[^0-9]/)[0] || '202';
        let effectiveRoute = baseRoute;

        // 🛡️ 노선별 기본 인가 대수 폴백 (4대로 잘못 남아 고유키가 불일치하는 현상 원천 차단)
        if (detectedBusCount === "4") {
            const defaultBusCounts = {
                "202": "16",
                "203": "11",
                "204": "4",
                "205": "5",
                "206": "6",
                "221": "2",
                "281": "3",
                "282": "2"
            };
            if (defaultBusCounts[baseRoute]) {
                detectedBusCount = defaultBusCounts[baseRoute];
            }
        }

        // 🎯 [실시간 현재 운행 회차 자동 판별 엔진]
        let currentTripRound = 1;
        try {
            // 📏 [회차 판정 규칙] 오늘 내 회차들의 시간표 시각과 현재 시각을 비교한다.
            //   - 어떤 회차의 첫 시각 ~ 마지막 시각(+지연 여유 15분) 사이면 그 회차 운행 중
            //   - 회차 사이(앞 회차 종료 후)면 곧 출발할 다음 회차 (출발 전)
            //   - 마지막 회차가 끝났으면 마지막 회차 유지
            let clockTrip = 0;
            try {
                let dk = typeof getDriverKey === 'function' ? getDriverKey(`sched_${searchDateStr}`) : `sched_${searchDateStr}`;
                let sv = localStorage.getItem(dk);
                if (sv && typeof customGetItem === 'function' && typeof parseTimeToDate === 'function') {
                    let sd = JSON.parse(sv);
                    let list = customGetItem(sd.route, sd.seq);
                    if (list && list.length > 0) {
                        const nowMs = Date.now();
                        // 내 근무 구간(오전/오후 교대 기준)만 본다
                        let yi = -1;
                        for (let i = 0; i < list.length && yi < 0; i++) {
                            for (let c = 1; c <= 5; c++) { if (list[i]['c' + c] === 'yellow') { yi = i; break; } }
                        }
                        let from = 0, to = list.length - 1;
                        if (sd.time === '오전') { to = (yi !== -1) ? yi : Math.min(2, list.length - 1); }
                        else if (sd.time === '오후') { from = (yi !== -1) ? yi + 1 : Math.min(3, list.length - 1); }
                        for (let i = from; i <= to; i++) {
                            let ts = [];
                            for (let c = 1; c <= 5; c++) {
                                const v = list[i]['time' + c];
                                if (!v) continue;
                                const d = parseTimeToDate(v, searchDateStr);
                                if (!d) continue;
                                let ms = d.getTime();
                                if (ts.length && ms < ts[ts.length - 1] - 2 * 3600000) ms += 86400000;   // 자정 넘김
                                ts.push(ms);
                            }
                            if (!ts.length) continue;
                            const endMs = ts[ts.length - 1] + 15 * 60000;
                            clockTrip = i + 1;
                            if (nowMs <= endMs) break;   // 지금 운행 중이거나 출발 전인 첫 회차
                        }
                    }
                }
            } catch (e) { clockTrip = 0; }

            if (clockTrip > 0) {
                currentTripRound = clockTrip;
            } else if (window.currentTripRoundNumber) {
                let match = String(window.currentTripRoundNumber).match(/(\d+)\s*회차/);
                if (match) {
                    currentTripRound = parseInt(match[1], 10) || 1;
                } else {
                    currentTripRound = parseInt(String(window.currentTripRoundNumber).replace(/[^0-9]/g, ''), 10) || 1;
                }
            }
        } catch (e) {
            currentTripRound = 1;
        }

        // 🛡️ [회차 유지] 시간표상 다음 회차로 넘어갈 시각이어도, 지연으로 아직 이번 회차 종점에 도착하지 못했으면
        //    (직전에 GPS로 이 회차를 운행 중이었고 종점 미도착) 다음 회차로 바꾸지 않는다 → 오차시간이 다음 회차 기준으로 어긋나는 문제 방지
        try {
            const st = JSON.parse(localStorage.getItem('yb_live_turn') || 'null');
            if (st && st.date === searchDateStr && st.turn >= 1 && !st.reachedEnd &&
                currentTripRound > st.turn && currentTripRound <= st.turn + 2 && (Date.now() - (st.at || 0)) < 30 * 60000) {
                currentTripRound = st.turn;
            }
        } catch (e) { }

        // 순번은 저장된 오늘 근무(화면 표시와 같은 원본)에서 읽는다. 화면 글자가 어긋나도 내 순번이 바뀌지 않게 함
        let seqInt = parseInt(seqNumText, 10) || 1;
        try {
            let dk0 = typeof getDriverKey === 'function' ? getDriverKey(`sched_${searchDateStr}`) : `sched_${searchDateStr}`;
            let sv0 = localStorage.getItem(dk0);
            if (sv0) {
                const m0 = String(JSON.parse(sv0).seq || '').match(/\d+/);
                if (m0) seqInt = parseInt(m0[0], 10) || seqInt;
            }
        } catch (e) { }
        const countInt = parseInt(detectedBusCount, 10) || 16;
        const turnInt = parseInt(currentTripRound, 10) || 1;

        // 🌟 [202A / 203A 실전 운행 특수 로직]
        if (turnInt === 1) {
            // 🚌 202번 1회차 특수 운행 조건:
            // - 평일 16대: 12, 13, 14 순번
            // - 휴일 12대: 8, 9, 10 순번
            // - 방학 15대: 11, 12, 13 순번
            if (baseRoute === '202') {
                if ((countInt === 16 && [12, 13, 14].includes(seqInt)) ||
                    (countInt === 12 && [8, 9, 10].includes(seqInt)) ||
                    (countInt === 15 && [11, 12, 13].includes(seqInt))) {
                    effectiveRoute = '202A';
                }
            }
            // 🚌 203번 1회차 특수 운행 조건 (마지막 순번):
            // - 평일 11대: 11 순번
            // - 방학 10대: 10 순번
            // - 토요일 9대: 9 순번
            // - 일/공휴일 8대: 8 순번
            else if (baseRoute === '203') {
                if (seqInt === countInt || (countInt >= 8 && seqInt >= countInt)) {
                    effectiveRoute = '203A';
                }
            }
        }
        // 2회차 이후:
        // 202번: 1회차 202A 종료 후 공항->대우하나 공차회송 뒤 2회차는 202 정규 편도 운행 (effectiveRoute = '202')
        // 203번: 마지막순번 1회차(203A+203) 종료 뒤 2회차 이후는 203 정규 운행 (effectiveRoute = '203')
        else {
            effectiveRoute = baseRoute;
        }

        // 💡 [핵심] 프론트엔드에서 H열 고유키(예: 202A161201, 203A111101)를 정밀 조립합니다.
        const cleanBusCount = String(detectedBusCount).replace(/[^0-9]/g, ''); // 시트 H열 키 형식과 일치 (0패딩 없음)
        const seqFormatted = String(seqInt).padStart(2, '0');
        const turnFormatted = String(turnInt).padStart(2, '0');

        const assembledUniqueKey = `${effectiveRoute}${cleanBusCount}${seqFormatted}${turnFormatted}`;

        console.log("🔑 [getTodayDutyInfo 조립 결과]", assembledUniqueKey, {
            baseRoute, effectiveRoute, cleanBusCount, seqFormatted, turnFormatted, turnInt
        });

        // 🧮 오늘 회차의 근무표 앵커시간(time1~3): 표준시간 계산 엔진(StdCalc)용
        let tripTimes = null;
        try {
            let dk = typeof getDriverKey === 'function' ? getDriverKey(`sched_${searchDateStr}`) : `sched_${searchDateStr}`;
            let savedDuty = localStorage.getItem(dk);
            if (savedDuty && typeof customGetItem === 'function') {
                let sd = JSON.parse(savedDuty);
                let tt = customGetItem(sd.route, sd.seq);
                if (tt && tt[turnInt - 1]) {
                    let row = tt[turnInt - 1];
                    tripTimes = { time1: row.time1 || '', time2: row.time2 || '', time3: row.time3 || '' };
                }
            }
        } catch (e) { }

        return {
            tripTimes: tripTimes,
            rawRoute: routeText,
            baseRoute: baseRoute,
            routeShort: effectiveRoute, // BIS 조회 및 노선키용 (202A, 203A 자동 분기)
            busCount: cleanBusCount,
            busNo: cleanBusNo,
            seq: seqNumText,
            turnNum: turnInt,
            uniqueKey: assembledUniqueKey, // 조립된 고유키 백엔드로 전달
            tripMasterId: assembledUniqueKey
        };
    }

    // 🛡️ [엄격한 원칙 적용] 운행 시간 내에만 백엔드로 standard_master 최초 저장을 요청하는 함수
    function executeFreshCalculationAndSave(rawRoute, numericBus, currentTurn) {
        try {
            const duty = getTodayDutyInfo();

            // 1. 휴무일 또는 노선 누락 검사
            if (!duty || duty.time === '휴무' || !rawRoute) {
                console.warn("⛔ [저장 차단] 오늘은 휴무일이거나 노선 정보가 없어 standard_master에 저장하지 않습니다.");
                return;
            }

            // 2. 시퀀스 그리드의 기준 시간(P1, P2, P3) 추출 및 유효성 검사
            const p1Time = document.getElementById('seqPoint1Time')?.innerText.trim() || '';
            const p2Time = document.getElementById('seqPoint2Time')?.innerText.trim() || '';
            const p3Time = document.getElementById('seqPoint3Time')?.innerText.trim() || '';

            if (!p1Time || p1Time === '--:--' || p1Time.includes('NaN')) {
                console.warn("⛔ [저장 차단] 첫 회차 시작 시간이 아직 로드되지 않았거나 운행 전입니다.");
                return;
            }

            // 3. 현재 시각과 첫 회차 시작 시간 비교 (시작 10분 전부터만 허용)
            const now = new Date();
            let timeParts = p1Time.split(':');
            let startTime = new Date(now);
            startTime.setHours(parseInt(timeParts[0] || 0, 10));
            startTime.setMinutes(parseInt(timeParts[1] || 0, 10));
            startTime.setSeconds(parseInt(timeParts[2] || 0, 10));

            let bufferStartTime = new Date(startTime.getTime() - (10 * 60 * 1000)); // 시작 10분 전

            if (now < bufferStartTime) {
                console.warn(`⛔ [저장 차단] 아직 운행 시작 전입니다. (현재: ${now.toLocaleTimeString()}, 허용시작: ${bufferStartTime.toLocaleTimeString()})`);
                return;
            }

            // 4. 프론트 연산을 생략하고 백엔드로 P1, P2, P3 전달하여 산출 및 저장
            if (typeof google !== 'undefined' && google.script && google.script.run) {
                let cleanRoute = String(rawRoute).replace(/[^0-9]/g, '');
                let cleanBus = String(numericBus).replace(/[^0-9]/g, '') || "4";
                let cleanTurn = String(currentTurn).trim();

                google.script.run
                    .withSuccessHandler(res => {
                        console.log("✅ [운행 시간 내] 백엔드 standard_master 신규 생성/저장 완료:", res);
                        if (res && res.success && typeof checkAndInitializeStandardMaster === 'function') {
                            checkAndInitializeStandardMaster(); // 캐시 재동기화
                        }
                    })
                    .withFailureHandler(err => console.error("❌ standard_master 저장 통신 실패:", err))
                    .createAndSaveFreshStandardMaster(cleanRoute, cleanBus, cleanTurn, p1Time, p2Time, p3Time);
            }

        } catch (e) {
            console.error("❌ executeFreshCalculationAndSave 예외 발생:", e);
        }
    }

    // ==========================================
    // 운행시간 판정 / 오차 로그 전송 / BIS 날짜 검사 헬퍼 스크립트
    // ==========================================

    // 🎯 1. 근무 시간(첫 회차 시작 10분 전 ~ 마지막 회차 종료) 및 휴무 여부 판정 함수
    function isWithinOperatingHours() {
        try {
            const searchDateEl = document.getElementById('searchDate');
            if (!searchDateEl || !searchDateEl.value) {
                console.warn("🔍 [시간 판정] searchDate 엘리먼트 또는 값이 없습니다.");
                return false;
            }
            const searchDateStr = searchDateEl.value;

            const driverKey = typeof getDriverKey === 'function' ? getDriverKey(`sched_${searchDateStr}`) : `sched_${searchDateStr}`;
            const saved = localStorage.getItem(driverKey);
            if (!saved) {
                console.warn("🔍 [시간 판정] localStorage에 스케줄 데이터가 없습니다. (key: " + driverKey + ")");
                return false;
            }

            const schedData = JSON.parse(saved);
            if (schedData.time === '휴무' || !schedData.route) {
                console.warn("🔍 [시간 판정] 오늘은 휴무일이거나 노선 정보가 없습니다.");
                return false;
            }

            const route = schedData.route;
            const seq = schedData.seq;
            const list = typeof customGetItem === 'function' ? customGetItem(route, seq) : null;
            const commonHeaders = typeof getHeaderArray === 'function' ? getHeaderArray(route, seq) : [];
            const colCount = commonHeaders.length;

            if (!list || list.length === 0) {
                console.warn("🔍 [시간 판정] 시퀀스 그리드 데이터(list)가 비어있습니다.");
                return false;
            }

            // 당일 전체 운행의 첫 시작 시간(P1)과 마지막 종료 시간 도출
            let firstTripTimeStr = null;
            for (let i = 0; i < list.length; i++) {
                if (list[i] && list[i].time1 && list[i].time1.trim() !== '') {
                    firstTripTimeStr = list[i].time1;
                    break;
                }
            }
            
            let lastTripTimeStr = null;
            
            // list를 뒤에서부터 탐색하여 유효한 마지막 도착 시간을 찾음
            for (let i = list.length - 1; i >= 0; i--) {
                const trip = list[i];
                for (let c = colCount; c >= 1; c--) {
                    if (trip[`time${c}`] && trip[`time${c}`].trim() !== '') {
                        lastTripTimeStr = trip[`time${c}`];
                        break;
                    }
                }
                if (lastTripTimeStr) break;
            }

            if (!firstTripTimeStr || !lastTripTimeStr) {
                console.warn("🔍 [시간 판정] 첫 회차 시작 시간 또는 마지막 회차 종료 시간을 찾을 수 없습니다.");
                return false;
            }

            const now = new Date();
            const startTime = typeof parseTimeToDate === 'function' ? parseTimeToDate(firstTripTimeStr, searchDateStr) : new Date();
            const endTime = typeof parseTimeToDate === 'function' ? parseTimeToDate(lastTripTimeStr, searchDateStr) : new Date();

            if (!startTime || !endTime) return false;

            // 자정을 넘어가는 마지막 회차 예외 처리
            if (endTime.getTime() < startTime.getTime()) {
                endTime.setDate(endTime.getDate() + 1);
            }

            // 현재 시각이 (첫 시작 시간 10분 전 ~ 마지막 도착 시간) 범위 내에 있는지 검증
            const bufferStartTime = new Date(startTime.getTime() - (10 * 60 * 1000));

            console.log(`⏱️ [시간 판정 검사] 현재시각: ${now.toLocaleTimeString()}, 허용범위: ${bufferStartTime.toLocaleTimeString()} ~ ${endTime.toLocaleTimeString()}`);

            if (now >= bufferStartTime && now <= endTime) {
                return true;
            } else {
                console.warn("⛔ [시간 판정] 현재 시각이 운행 시간 범위를 벗어났습니다.");
                return false;
            }
        } catch (e) {
            console.warn("⚠️ 근무 시간 판정 중 예외 발생:", e);
            return false;
        }
    }

    // 🎯 2. P2 또는 P3 지점 도달 시 핵심 오차 로그 서버(Code.gs) 전송
    function sendCoreErrorLogToServer(p2Err, p3Err) {
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const duty = typeof getTodayDutyInfo === 'function' ? getTodayDutyInfo() : {};

        let rawBusCount = duty.busCount || "4대";
        let numericBus = String(rawBusCount).replace(/[^0-9]/g, '') || "4";

        const payload = {
            date: dateStr,
            route: duty.rawRoute || '202번',
            busCount: numericBus,
            turn: window.currentTripRoundNumber || '1순번 1회차',
            p2Error: p2Err || "-",
            p3Error: p3Err || "-",
            userName: "유재필"
        };

        if (typeof google !== 'undefined' && google.script && google.script.run) {
            google.script.run
                .withSuccessHandler(res => console.log("✅ 오차 로그 통합 저장 완료:", res))
                .withFailureHandler(err => console.error("❌ 오차 로그 저장 실패:", err))
                .saveCoreErrorLog(payload);
        } else {
            console.log("🧪 [테스트 모드] 통합 오차 로그 데이터:", payload);
        }
    }

    // 🎯 3. BIS 조회 허용 날짜 검사 (오늘/어제/내일 및 예외 상황 보장)
    function isBisAllowedForDate() {
        let searchDateEl = document.getElementById('searchDate');
        let targetDateStr = searchDateEl ? searchDateEl.value : '';

        if (!targetDateStr) {
            const dateTextEl = document.getElementById('dateDisplayText');
            if (dateTextEl) {
                targetDateStr = dateTextEl.innerText.trim();
            }
        }

        // 날짜를 명확히 판별할 수 없는 경우 멈춤을 방지하기 위해 기본 허용
        if (!targetDateStr) return true;

        const now = new Date();
        const parseNum = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

        const todayNum = parseNum(now);
        const tomorrowNum = parseNum(new Date(now.getTime() + 24 * 60 * 60 * 1000));
        const yesterdayNum = parseNum(new Date(now.getTime() - 24 * 60 * 60 * 1000));

        let targetDigits = targetDateStr.replace(/[^0-9]/g, '').substring(0, 8);

        return targetDigits === todayNum || targetDigits === tomorrowNum || targetDigits === yesterdayNum || targetDigits === '';
    }

    // (중복 선언 방지: getTodayDutyInfo 함수는 스크립트 상단에 통합 스마트 버전으로 단일 정의되어 있습니다.)

    function getBoxContainer(timeEl) {
        if (!timeEl) return null;
        return timeEl.closest('.seq-box, .item-box, .card, .box, li, div') || timeEl.parentElement;
    }

    // ==========================================
    // 시퀀스 박스 동기화 및 UI 바인딩 스크립트 (수정본)
    // ==========================================

    window.isFetchingMasterData = false;

    // 🎯 메인 스케줄 데이터 기반으로 P1/P2/P3 시퀀스 박스 동기화 (2개/3개 정류장 완벽 대응, 미사용 제거)
    function syncSequenceBoxesFromMainSchedule() {
        try {
            const searchDateEl = document.getElementById('searchDate');
            if (!searchDateEl || !searchDateEl.value) return;
            const searchDateStr = searchDateEl.value;

            // 헬퍼 함수 안전 호출 (미정의 시 기본 키 사용)
            const storageKey = typeof getDriverKey === 'function'
                ? getDriverKey(`sched_${searchDateStr}`)
                : `sched_${searchDateStr}`;

            const saved = localStorage.getItem(storageKey);
            if (!saved) return;
            const schedData = JSON.parse(saved);

            const route = schedData.route;
            const seq = schedData.seq;

            if (typeof customGetItem !== 'function' || typeof getHeaderArray !== 'function') return;

            const list = customGetItem(route, seq);
            const commonHeaders = getHeaderArray(route, seq);
            const colCount = commonHeaders ? commonHeaders.length : 0;

            if (!list || list.length === 0 || colCount === 0) return;

            const timeType = schedData.time;
            let yellowRowIdx = -1;

            // 교대 기준(노란색 셀) 탐색
            for (let i = 0; i < list.length; i++) {
                let r = list[i];
                for (let c = 1; c <= colCount; c++) {
                    if (r[`c${c}`] === 'yellow') {
                        yellowRowIdx = i;
                        break;
                    }
                }
                if (yellowRowIdx !== -1) break;
            }

            // 근무 형태(오전/오후)에 따른 회차 범위 설정
            let myStartTripIdx = 0;
            let myEndTripIdx = list.length - 1;

            if (timeType === '오전') {
                myStartTripIdx = 0;
                myEndTripIdx = (yellowRowIdx !== -1) ? yellowRowIdx : Math.min(2, list.length - 1);
            } else if (timeType === '오후') {
                myStartTripIdx = (yellowRowIdx !== -1) ? yellowRowIdx + 1 : Math.min(3, list.length - 1);
                myEndTripIdx = list.length - 1;
            }

            const now = new Date();
            let stopsSequence = [];
            let prevDate = null;

            // 전체 운행 시퀀스 배열 구축
            for (let i = myStartTripIdx; i <= myEndTripIdx; i++) {
                let tripData = list[i];
                let currentTripHeaders = commonHeaders;
                if (i === 0 && typeof getFirstTripHeaderArray === 'function') {
                    let firstHeaderInfo = getFirstTripHeaderArray(route, seq);
                    if (firstHeaderInfo && firstHeaderInfo.enabled && Array.isArray(firstHeaderInfo.headers) && firstHeaderInfo.headers.length > 0) {
                        currentTripHeaders = firstHeaderInfo.headers;
                    }
                }

                for (let c = 1; c <= colCount; c++) {
                    let tStr = tripData[`time${c}`];
                    if (!tStr || String(tStr).trim() === '' || String(tStr).trim() === '-') continue;

                    let tDate = typeof parseTimeToDate === 'function' ? parseTimeToDate(tStr, searchDateStr) : null;
                    if (!tDate) continue;

                    if (prevDate && tDate.getTime() < prevDate.getTime() - (2 * 60 * 60 * 1000)) {
                        tDate.setDate(tDate.getDate() + 1);
                    }
                    prevDate = new Date(tDate);

                    stopsSequence.push({
                        tripIdx: i + 1,
                        stopIdx: c,
                        stopName: currentTripHeaders[c - 1] || `정류장${c}`,
                        timeStr: tStr,
                        timeDate: tDate,
                        color: tripData[`c${c}`] || '',
                        isLastStop: (c === colCount)
                    });
                }
            }

            // 현재 시각 기준 타겟 회차 자동 선택
            let nextStop = stopsSequence.find(s => s.timeDate > now) || stopsSequence[stopsSequence.length - 1];
            let targetTripIdx = nextStop ? nextStop.tripIdx : (myStartTripIdx + 1);
            // 회차는 getTodayDutyInfo의 '현재 시각 비교 규칙'과 항상 같게 맞춘다 (표시·기록·표준시간이 서로 다른 회차를 보지 않도록)
            try {
                const dd = getTodayDutyInfo();
                if (dd && dd.turnNum >= myStartTripIdx + 1 && dd.turnNum <= myEndTripIdx + 1) targetTripIdx = dd.turnNum;
            } catch (e) { }
            window.currentTripRoundNumber = targetTripIdx;

            let tripData = list[targetTripIdx - 1];
            if (!tripData) return;

            // 1회차 전용 헤더 vs 일반 헤더 분기
            let activeHeaders = commonHeaders;
            if (targetTripIdx === 1 && typeof getFirstTripHeaderArray === 'function') {
                let firstInfo = getFirstTripHeaderArray(route, seq);
                if (firstInfo && firstInfo.enabled && Array.isArray(firstInfo.headers) && firstInfo.headers.length > 0) {
                    activeHeaders = firstInfo.headers;
                }
            }

            // 유효 정류장 추출 (시간이 입력된 실제 경유지들)
            let validStops = [];
            for (let c = 1; c <= colCount; c++) {
                let tStr = tripData[`time${c}`];
                if (tStr && String(tStr).trim() !== '' && String(tStr).trim() !== '-') {
                    let displayTime = tStr.length >= 8 ? tStr.substring(0, 5) : tStr;
                    let tDate = typeof parseTimeToDate === 'function' ? parseTimeToDate(tStr, searchDateStr) : null;

                    validStops.push({
                        stopIndex: c,
                        time: displayTime,
                        loc: activeHeaders[c - 1] || '-',
                        timeDate: tDate,
                        color: tripData[`c${c}`] || ''
                    });
                }
            }

            // DOM 엘리먼트 바인딩
            const gridContainer = document.getElementById('iosSeqGridContainer');
            const box1 = document.getElementById('seqBoxContainer1');
            const box2 = document.getElementById('seqBoxContainer2');
            const box3 = document.getElementById('seqBoxContainer3');
            const arrow1 = document.getElementById('seqArrow1');
            const arrow2 = document.getElementById('seqArrow2');

            safeSetText('liveCurrentTripBadge', `${targetTripIdx}회차 운행`);

            // 다음 도착할 타겟 정류장 인덱스 계산
            let nextTargetIdx = -1;
            for (let k = 0; k < validStops.length; k++) {
                if (validStops[k].timeDate && validStops[k].timeDate > now) {
                    nextTargetIdx = k;
                    break;
                }
            }
            if (nextTargetIdx === -1) nextTargetIdx = validStops.length - 1;

            if (validStops.length === 0) {
                if (box1) box1.style.display = 'none';
                if (arrow1) arrow1.style.display = 'none';
                if (box2) box2.style.display = 'none';
                if (arrow2) arrow2.style.display = 'none';
                if (box3) box3.style.display = 'none';
            } else if (validStops.length === 1) {
                renderSingleSeqBox(box1, 'seqPoint1Loc', 'seqPoint1Time', validStops[0], true, false);
                if (arrow1) arrow1.style.display = 'none';
                if (box2) box2.style.display = 'none';
                if (arrow2) arrow2.style.display = 'none';
                if (box3) box3.style.display = 'none';
                if (gridContainer) gridContainer.classList.remove('two-items');
            } else if (validStops.length === 2) {
                // 2개 정류장 (편도 또는 1회차 편도): Box 1 (출발지) ➔ Box 2 (도착지)
                let isPast0 = (nextTargetIdx > 0);
                let isTarget0 = (nextTargetIdx === 0);
                let isTarget1 = (nextTargetIdx === 1);

                renderSingleSeqBox(box1, 'seqPoint1Loc', 'seqPoint1Time', validStops[0], isTarget0, isPast0);
                if (arrow1) arrow1.style.display = 'inline-flex';

                renderSingleSeqBox(box2, 'seqPoint2Loc', 'seqPoint2Time', validStops[1], isTarget1, false);

                if (arrow2) arrow2.style.display = 'none';
                if (box3) box3.style.display = 'none';
                if (gridContainer) gridContainer.classList.add('two-items');
            } else {
                // 3개 이상 정류장: Box 1 (출발) ➔ Box 2 (중간/회차) ➔ Box 3 (종점)
                let midIdx = Math.floor(validStops.length / 2);
                let lastIdx = validStops.length - 1;

                let isPast0 = (nextTargetIdx > 0);
                let isTarget0 = (nextTargetIdx === 0);

                let isPastMid = (nextTargetIdx > midIdx);
                let isTargetMid = (nextTargetIdx >= 1 && nextTargetIdx <= midIdx);

                let isTargetLast = (nextTargetIdx >= lastIdx);

                renderSingleSeqBox(box1, 'seqPoint1Loc', 'seqPoint1Time', validStops[0], isTarget0, isPast0);
                if (arrow1) arrow1.style.display = 'inline-flex';

                renderSingleSeqBox(box2, 'seqPoint2Loc', 'seqPoint2Time', validStops[midIdx], isTargetMid, isPastMid);
                if (arrow2) arrow2.style.display = 'inline-flex';

                renderSingleSeqBox(box3, 'seqPoint3Loc', 'seqPoint3Time', validStops[lastIdx], isTargetLast, false);
                if (box3) box3.style.display = 'flex';

                if (gridContainer) gridContainer.classList.remove('two-items');
            }

            // standard_master 및 BIS 계산 시 사용할 전역 동기화 데이터
            window.currentActiveTripRange = {
                tripIdx: targetTripIdx,
                validStops: validStops,
                startTime: validStops[0]?.time,
                endTime: validStops[validStops.length - 1]?.time
            };

            // 🚦 [3번째 박스 사전 렌더링] masterCache(실제 세부 BIS 정류장명) 우선 표출
            if (window.standardMasterCache && window.standardMasterCache.length > 0 && typeof updateTrafficStopFromMaster === 'function') {
                updateTrafficStopFromMaster(window.standardMasterCache);
            }

            console.log(`🎯 [회차 ${targetTripIdx}] 시퀀스 동기화 완료 (유효 거점: ${validStops.length}개)`);

        } catch (e) {
            console.warn("⚠️ 동기화 예외 발생:", e);
        }
    }

// 🎯 개별 시퀀스 박스 스타일링 및 하이라이트/디밍 함수
function renderSingleSeqBox(boxEl, locId, timeId, stop, isTarget, isPast) {
  if (!boxEl) return;
  boxEl.style.display = 'flex';
  safeSetText(locId, stop.loc || '-');
  safeSetText(timeId, stop.time || '--:--');
  boxEl.style.transition = 'all 0.25s ease';

  let timeEl = document.getElementById(timeId);
  if (timeEl) timeEl.style.color = '#fff';
  if (stop.color === 'yellow') {
    if (timeEl) timeEl.style.color = '#fbbf24';
  } else if (stop.color === 'red' || stop.color === 'important') {
    if (timeEl) timeEl.style.color = '#ef4444';
  } else if (stop.color === 'blue') {
    if (timeEl) timeEl.style.color = '#38bdf8';
  }

  // 박스의 인라인 스타일 리셋 (CSS 클래스로만 발광 제어)
  boxEl.style.backgroundColor = '';
  boxEl.style.borderColor = '';
  boxEl.style.boxShadow = '';

  // 🌟 오차시간 색 연동 및 회전 클래스 제거, 순수 active-target 클래스만 부여
  if (isTarget) {
    boxEl.classList.add('active-target');
    boxEl.classList.remove('active-seq');
    boxEl.style.opacity = '1';
  } else {
    boxEl.classList.remove('active-target');
    boxEl.classList.remove('active-seq');
    if (isPast) {
      boxEl.style.opacity = '0.45';
    } else {
      boxEl.style.opacity = '0.9';
    }
  }
}


    // ================================================================
    // 🚀 [Live 모달 열기] 화면 표시 및 실시간 BIS/표준시간 동시 호출
    // ================================================================
    // 📱 화면 회전: 평소엔 세로 고정, 라이브 모달이 열려 있는 동안만 가로 허용 (안드로이드 설치 앱용. 아이폰은 이 API가 없어 폰 설정대로 돌아감)
    function ybLockOrientation(mode) {
        try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock(mode).catch(function () { }); } catch (e) { }
    }
    ybLockOrientation('portrait');
    // 🪞 좌우반전 (가로 모드, 앞유리 반사용). 선택은 폰에 기억
    function applyLiveMirror() {
        try {
            var on = localStorage.getItem('yb_live_mirror') === '1';
            var el = document.querySelector('#liveModal .ios-widget-modal');
            if (el) el.classList.toggle('mirrored', on);
        } catch (e) { }
    }
    function toggleLiveMirror() {
        try { localStorage.setItem('yb_live_mirror', localStorage.getItem('yb_live_mirror') === '1' ? '0' : '1'); } catch (e) { }
        applyLiveMirror();
    }
    window.toggleLiveMirror = toggleLiveMirror;
    async function openLiveModal() {
        applyLiveMirror();
        ybLockOrientation('any');
        if (typeof navRefreshButtons === 'function') { try { navRefreshButtons(); } catch (e) { } }
        // 가족 사용자는 라이브 모달을 사용하지 않음 (기사님 전용)
        if (typeof isFamilyUser !== 'undefined' && isFamilyUser) return;
        // 0. 모달 열릴 때 이전 매칭 상태 및 잠금 상태 초기화 (회차 간 간섭 방지)
        window.lastMatchedMasterIndex = null;
        window.lastPassedStopIndex = null; // 재오픈 시 현재 정류장 통과를 다시 감지해 오차를 재고정
        window.bisStopLockState = window.bisStopLockState || {};
        window.bisStopLockState.lockedStopKey = null;
        window.bisStopLockState.lockedDelayText = "0";
        window.bisStopLockState.lockedTargetColor = "#00ff66";

        // 1. 시퀀스 박스(P1, P2, P3) 시간 동기화 (메인 시간표 기반)
        if (typeof syncSequenceBoxesFromMainSchedule === 'function') {
            syncSequenceBoxesFromMainSchedule();
        }

        // 1-1. 3번째 박스(다음 정류장 - 다음다음 정류장) 캐시 즉시 바인딩 (0ms 빠른 노출)
        if (window.standardMasterCache && window.standardMasterCache.length > 0 && typeof updateTrafficStopFromMaster === 'function') {
            updateTrafficStopFromMaster(window.standardMasterCache);
        }

        // 2. 모달 날짜 텍스트 세팅
        const dateTextEl = document.getElementById('dateDisplayText');
        const liveDateEl = document.getElementById('liveModalDateText');
        if (dateTextEl && liveDateEl) liveDateEl.innerText = dateTextEl.innerText;

        // 3. 날씨 정보 및 오늘의 한마디 실시간 로드
        if (typeof fetchYeongjongWeather === 'function') fetchYeongjongWeather();
        if (typeof loadLatestColleagueMessage === 'function') loadLatestColleagueMessage();

        // 🌟 [오늘의 한마디] 오직 '오늘(당일)'인 경우에만 표시, 과거/미래 날짜에는 완전히 숨김
        const msgWidget = document.getElementById('liveMessageWidget');
        const isTodayDate = (function() {
            let targetDateStr = '';
            const searchDateEl = document.getElementById('searchDate');
            if (searchDateEl && searchDateEl.value) {
                targetDateStr = searchDateEl.value;
            } else if (dateTextEl && dateTextEl.innerText) {
                targetDateStr = dateTextEl.innerText.trim();
            }

            if (!targetDateStr) return false; // 판별 불가 시 안전하게 숨김

            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            const todayDigits = `${y}${m}${d}`;
            const targetDigits = targetDateStr.replace(/[^0-9]/g, '').substring(0, 8);

            return targetDigits === todayDigits;
        })();

        if (msgWidget) {
            if (isTodayDate) {
                msgWidget.style.display = 'block';
                if (typeof loadLatestColleagueMessage === 'function') loadLatestColleagueMessage();
            } else {
                msgWidget.style.display = 'block';   // 한마디 박스는 메인 상단에 있으므로 날짜와 상관없이 유지
            }
        }

        // 4. 모달 레이어 표시
        const modal = document.getElementById('liveModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('active');
        }

        // 5. 근무시간 외 검사 안내 (모달 열기 및 표준시간 조회를 차단하지 않고 상태 표시)
        const isOperating = typeof isWithinOperatingHours === 'function' ? isWithinOperatingHours() : true;
        const isDateAllowed = typeof isBisAllowedForDate === 'function' ? isBisAllowedForDate() : true;

        const duty = typeof getTodayDutyInfo === 'function' ? getTodayDutyInfo() : {};
        const bisVehicleEl = document.getElementById('bisVehicleNo');

        // 🚦 [운행일 여부 강력 검사] 휴일/미등록/휴무/대기 등 운행일이 아니면 기능 차단
        const rawRoute = document.getElementById('resRoute')?.innerText.trim() || '';
        const isNotDrivingDay = rawRoute === '-' || rawRoute === '휴일' || rawRoute.includes('휴무') || rawRoute.includes('미등록') || rawRoute.includes('대기') || !/\d/.test(rawRoute);

        if (isNotDrivingDay) {
            // 모든 주요 기능 표시를 "-" 로 통일
            if (bisVehicleEl) bisVehicleEl.innerText = "-";
            applyLockedDelayBadge("-", "#94a3b8");
            
            // 박스 세개 (P1, P2, P3) 딜레이, 장소, 시간 모두 '-'
            ['1','2','3'].forEach(num => {
                const delay = document.getElementById(`p${num}_delay`); if (delay) delay.innerText = '-';
                const loc = document.getElementById(`seqPoint${num}Loc`); if (loc) loc.innerText = '-';
                const time = document.getElementById(`seqPoint${num}Time`); if (time) time.innerText = '-';
            });
            
            // 교통정보 (소통 원활 등) 표시란 모두 '-'
            const nextName = document.getElementById('trafficStopNameNext'); if (nextName) nextName.innerText = '-';
            const nextTime = document.getElementById('trafficStopTimeNext'); if (nextTime) nextTime.innerText = '-';
            const afterName = document.getElementById('trafficStopNameAfter'); if (afterName) afterName.innerText = '-';
            const afterTime = document.getElementById('trafficStopTimeAfter'); if (afterTime) afterTime.innerText = '-';
            if (typeof setTrafficLamp === 'function') setTrafficLamp('off', '-');

            const liveModalRoute = document.querySelector('#liveModal .route-badge');
            if (liveModalRoute) liveModalRoute.innerText = "-";

            // 교통 소통정보 티커도 "휴식" 모드
            window.liveTrafficAlerts = ["🏖️ [운행 휴무] 오늘은 운행일이 아닙니다. 푹 쉬세요!"];
            if (typeof renderMessages === 'function' && typeof currentMsgRotationList !== 'undefined') {
                const baseMsgs = currentMsgRotationList; // loading 제거 완료된 리스트
                renderMessages(baseMsgs);
            }

            // GPS 및 타이머 기능 완전히 차단 (운행일만 동작하도록 보장)
            return;
        }

        if (!duty || !duty.busNo) {
            if (bisVehicleEl) bisVehicleEl.innerText = "배차 차량 정보 없음";
            return;
        }

        // 🔍 [디버그] 조립된 키를 화면에 표시
        const debugKeyEl = document.getElementById('debugAssembledKey');
        if (debugKeyEl && duty.uniqueKey) debugKeyEl.innerText = duty.uniqueKey;

        // 초기 오차 배지 상태 ("-")
        applyLockedDelayBadge("-", "#94a3b8");

        // 차량 헤더 초기 상태 설정 (차량번호만 선명하게 표시)
        if (bisVehicleEl) {
            let plateStr = duty.busNo ? (String(duty.busNo).includes('인천') ? duty.busNo : `인천70아${duty.busNo}`) : '배차 차량 없음';
            bisVehicleEl.innerText = plateStr;
        }

        // 💡 [표준시간 마스터 로드] 운행시간 외여도 시간표 대조를 위해 반드시 로드
        loadStandardMasterCache(duty);

        // 🛰️ [신규 GPS 엔진 가동] 실시간 기사님 스마트폰 GPS 추적 및 정류장 자동 감지 시작!
        if (typeof startLiveGpsTracking === 'function') {
            startLiveGpsTracking(duty);
        }
        if (typeof initGpsAdminTrigger === 'function') {
            initGpsAdminTrigger();
        }
        if (typeof startBisTimer === 'function') {
            startBisTimer(duty);
        }
    }

    // ================================================================
    // 📥 [표준시간 수신] 고유키 기반 standard_master 직결 로더 (GAS & GitHub Pages 완벽 대응)
    // ================================================================
    function loadStandardMasterCache(duty) {
        return new Promise((resolve) => {
            if (!duty) duty = {};
            // 지금 운행 중인 회차 기록 (같은 회차면 '종점 도착' 여부를 그대로 유지)
            try {
                if (duty.turnNum) {
                    const dStr = (document.getElementById('searchDate') || {}).value || new Date().toISOString().split('T')[0];
                    const old = JSON.parse(localStorage.getItem('yb_live_turn') || 'null');
                    const same = old && old.date === dStr && old.turn === duty.turnNum;
                    localStorage.setItem('yb_live_turn', JSON.stringify({ date: dStr, turn: duty.turnNum, reachedEnd: same ? !!old.reachedEnd : false, at: Date.now() }));
                }
            } catch (e) { }
            const rawKey = duty.uniqueKey || duty.tripMasterId || '';
            const uniqueKey = String(rawKey).trim().toUpperCase().replace(/[^0-9A-Z]/g, '');

            if (!uniqueKey) {
                resolve({ success: false });
                return;
            }

            // 1. 클라이언트 메모리 캐시 확인 (0ms 즉시 응답)
            window.masterKeyMemoryCache = window.masterKeyMemoryCache || {};
            if (window.masterKeyMemoryCache[uniqueKey] && window.masterKeyMemoryCache[uniqueKey].length > 0) {
                const data = window.masterKeyMemoryCache[uniqueKey];
                window.standardMasterCache = data;
                window.currentTripMasterCache = data;
                console.log(`📥 [표준시간 캐시 적중] 키: ${uniqueKey} (총 ${data.length}개 정류장)`);
                if (typeof updateTrafficStopFromMaster === 'function') {
                    updateTrafficStopFromMaster(data);
                }
                resolve({ success: true, data: data });
                return;
            }

            const applyResult = (res) => {
                if (res && res.success && res.data && res.data.length > 0) {
                    window.masterKeyMemoryCache[uniqueKey] = res.data;
                    window.standardMasterCache = res.data;
                    window.currentTripMasterCache = res.data;
                    if (!res.calculated && window.StdCalc && window.StdCalc.getMode() === 'compare') {
                        window.StdCalc.compareWithLegacy(duty, res.data);
                    }
                    console.log(`📥 [고유키 매칭 완료] 키: ${uniqueKey} (총 ${res.data.length}개 정류장 수신)`);

                    if (typeof updateTrafficStopFromMaster === 'function') {
                        updateTrafficStopFromMaster(res.data);
                    }
                } else {
                    console.warn(`⚠️ [standard_master] 일치하는 회차 데이터가 없습니다. (요청 키: ${uniqueKey})`);
                    // 원인을 정류장 카드에 짧게 보여 줌 (노선 정보를 못 받았을 때 기사가 알 수 있게)
                    try {
                        const why = (window.StdCalc && window.StdCalc.getLastError && window.StdCalc.getLastError()) || '표준시간을 계산할 수 없습니다';
                        const nm = document.getElementById('trafficStopNameNext');
                        if (nm) { const em = why.match(/"error":"([^"]*)"/); nm.textContent = '⚠ ' + (em ? em[1] : why.replace(/^\[[^\]]*\]\s*/, '')).slice(0, 40); nm.title = why; }
                    } catch (e) { }
                    // 🛡️ 기존 캐시가 이미 존재한다면 빈 배열로 날리지 않고 안전하게 유지!
                    if (!window.standardMasterCache || window.standardMasterCache.length === 0) {
                        window.standardMasterCache = [];
                        window.currentTripMasterCache = [];
                    }
                }
                resolve(res || { success: false });
            };

            // 🧮 표준시간은 노선 JSON + 근무표 앵커로 계산한다 (옛 standard_master 시트 방식은 삭제됨)
            if (window.StdCalc && duty.tripTimes) {
                window.StdCalc.computeTripRows(duty.routeShort, duty.baseRoute, duty.tripTimes)
                    .then(rows => {
                        if (rows && rows.length > 0) applyResult({ success: true, data: rows, calculated: true });
                        else applyResult({ success: false });
                    })
                    .catch(() => applyResult({ success: false }));
            } else {
                applyResult({ success: false });
            }
        });
    }

    function closeLiveModal() {
        ybLockOrientation('portrait');
        const modal = document.getElementById('liveModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
        }


        // 🛰️ GPS 추적 안전 중단 (배터리 보호)
        if (typeof stopLiveGpsTracking === 'function') {
            stopLiveGpsTracking();
        } else if (window.liveGpsWatchId != null && navigator.geolocation) {
            navigator.geolocation.clearWatch(window.liveGpsWatchId);
            window.liveGpsWatchId = null;
        }

        if (window.liveIntervalTimer) {
            clearInterval(window.liveIntervalTimer);
            window.liveIntervalTimer = null;
        }
    }

    
    // ================================================================
    // 🌤️ [실시간 영종도 날씨] Open-Meteo API 호출 (API 키 불필요, 고신뢰)
    // ================================================================
    var WEATHER_REFRESH_MS = 20 * 60 * 1000;   // 날씨는 20분에 한 번만 새로 받아옴
    window._weatherCache = window._weatherCache || null;   // { at: 받은 시각(ms), current: {...} }

    // 풍향(도) → 한글 방위 (바람이 불어오는 방향)
    function windDirToText(deg) {
        if (typeof deg !== 'number') return '';
        var names = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
        return names[Math.round(deg / 45) % 8] + '풍';
    }

    // 풍속(m/s) 단계: 운전에 영향이 커지는 기준으로 색과 문구를 정함
    function windLevelInfo(ms) {
        if (ms >= 14) return { text: '위험', color: '#f87171' };
        if (ms >= 10) return { text: '강풍', color: '#fb923c' };
        if (ms >= 7)  return { text: '주의', color: '#fde047' };
        return { text: '보통', color: '#86efac' };
    }

    function renderYeongjongWeather(current) {
        const tempEl = document.getElementById('weatherTempDisplay');
        const statusEl = document.getElementById('weatherStatusDisplay');
        const windEl = document.getElementById('weatherWindDisplay');
        const levelEl = document.getElementById('weatherWindLevel');
        const iconEl = document.getElementById('weatherIconDisplay');

        if (tempEl) tempEl.innerText = `${Math.round(current.temperature_2m)}℃`;

        const wind = Number(current.wind_speed_10m) || 0;
        const gust = Number(current.wind_gusts_10m);
        const dir = windDirToText(current.wind_direction_10m);
        if (windEl) {
            let t = `${dir ? dir + ' ' : ''}${wind.toFixed(1)}m/s`;
            if (!isNaN(gust) && gust > 0) t += ` (돌풍 ${gust.toFixed(1)})`;
            windEl.innerText = t;
        }
        if (levelEl) {
            const lv = windLevelInfo(wind);
            levelEl.innerText = lv.text;
            levelEl.style.color = lv.color;
        }

        const code = current.weather_code;
        let weatherText = "맑음";
        let emoji = '☀️';
        if (code === 0) {
            weatherText = "맑음";
        } else if (code >= 1 && code <= 3) {
            weatherText = code === 1 ? "구름조금" : "흐림";
            emoji = '☁️';
        } else if (code === 45 || code === 48) {
            weatherText = "안개";
            emoji = '🌫️';
        } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
            weatherText = "비";
            emoji = '🌧️';
        } else if (code >= 71 && code <= 77) {
            weatherText = "눈";
            emoji = '❄️';
        } else if (code >= 95) {
            weatherText = "뇌우";
            emoji = '🌩️';
        }
        if (statusEl) statusEl.innerText = weatherText;
        if (iconEl) iconEl.innerText = emoji;
    }

    // force=true: 무조건 새로 받아옴(20분 타이머) / 그 외: 20분이 안 지났으면 저장해 둔 값을 그대로 표시
    async function fetchYeongjongWeather(force) {
        try {
            const cache = window._weatherCache;
            if (force !== true && cache && (Date.now() - cache.at) < WEATHER_REFRESH_MS) {
                renderYeongjongWeather(cache.current);
                return;
            }

            const statusEl = document.getElementById('weatherStatusDisplay');
            if (statusEl && !cache) statusEl.innerText = "조회 중...";

            const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=37.4917&longitude=126.4883&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=ms&timezone=Asia%2FSeoul");
            if (!res.ok) throw new Error("Weather HTTP " + res.status);
            const data = await res.json();
            window._weatherCache = { at: Date.now(), current: data.current };
            renderYeongjongWeather(data.current);
        } catch (e) {
            console.warn("날씨 정보 조회 실패:", e);
            if (window._weatherCache) {
                renderYeongjongWeather(window._weatherCache.current);   // 실패 시 마지막으로 받은 값 유지
            } else {
                const statusEl = document.getElementById('weatherStatusDisplay');
                if (statusEl) statusEl.innerText = "조회 실패";
            }
        }
    }

    // 20분마다 자동 갱신 (모달을 닫아 둔 동안에도 값이 최신이 되도록)
    if (!window.weatherIntervalTimer) {
        window.weatherIntervalTimer = setInterval(function () { fetchYeongjongWeather(true); }, WEATHER_REFRESH_MS);
    }


// ================================================================
// 🚨 새 돌발·교통 정보 자동 알림: 팝업 + 음성 안내 + 신호등 빨간불 깜빡임 (신호등을 눌렀을 때와 같은 동작)
//  - 라이브 모달이 열려 있을 때만 알림 (열려 있지 않으면 다음 갱신 때 다시 확인)
//  - 같은 돌발은 한 번만 알림
//  - 버스에서 NEAR_KM 이내(또는 거리를 알 수 없는 것)만 알림. 여러 건이면 9초 간격으로 차례로
// ================================================================
(function () {
    var NEAR_KM = 3;
    var GAP_MS = 9000;
    var seen = {};
    var queue = [];
    var busy = false;

    function distOf(text) {
        var m = /\(([\d.]+)km 전방\)/.exec(text);
        return m ? parseFloat(m[1]) : null;
    }
    function next() {
        var text = queue.shift();
        if (!text) { busy = false; return; }
        busy = true;
        if (typeof triggerTrafficIncidentTest === 'function') triggerTrafficIncidentTest(text);
        setTimeout(next, GAP_MS);
    }

    window.renderLiveModalAlerts = function () {
        var modal = document.getElementById('liveModal');
        var open = !!(modal && modal.classList.contains('active'));
        if (!open) return;
        (window.liveTrafficAlerts || []).forEach(function (t) {
            if (seen[t]) return;
            seen[t] = true;   // 멀어서 알리지 않는 것도 다시 검사하지 않음
            var d = distOf(t);
            if (d === null || d <= NEAR_KM) queue.push(t);
        });
        if (!busy && queue.length > 0) next();
    };
})();
