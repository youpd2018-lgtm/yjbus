    // ================================================================
    // 🔒 [오차시간 절대 고정 저장소]
    // ================================================================
    if (!window.bisStopLockState) {
        window.bisStopLockState = {
            lockedStopKey: null,      // 현재 고정된 정류장 고유 식별값
            lockedDelayText: "0",     // 고정된 오차 텍스트 (+1, -2, 0 등)
            lockedTargetColor: "#00ff66"
        };
    }

    // ================================================================
    // 🛰️ [실시간 BIS 파서] 정류장 ID 매칭 및 오차시간 절대 동결(Lock) 엔진 (차단됨)
    // ================================================================
    function parseAndApplyBisData(xmlText, targetPlateNo) {
        return; // GPS 기능에 모든 권한 위임
    }

    // ================================================================
    // 🏷️ [오차 배지 스타일러]
    // ================================================================
    // 오차 배지 색 규칙: ±5분까지 초록, ±6분부터 주황
    function delayBadgeColor(diffMin) {
        return Math.abs(diffMin) >= 6 ? "#f59e0b" : "#34c759";
    }

    function applyLockedDelayBadge(displayText, targetColor) {
        const badgeEl = document.getElementById('bisDelayBadge');
        const nextStopBox = document.querySelector('.current-stop-highlight-bar');

        if (badgeEl) {
            badgeEl.innerText = displayText || "0";
            badgeEl.style.display = "inline-flex";
            badgeEl.style.border = `2.5px solid ${targetColor}`;
            badgeEl.style.color = "#ffffff";
            badgeEl.style.background = (targetColor === "#00ff66" || targetColor === "#34c759") ? "rgba(52, 199, 89, 0.2)" : (targetColor === "#f59e0b" ? "rgba(245, 158, 11, 0.2)" : "rgba(148, 163, 184, 0.15)");
            badgeEl.style.boxShadow = `0 0 14px ${targetColor}55`;
        }

        if (nextStopBox) {
            nextStopBox.style.border = `2px solid ${targetColor}`;
        }
    }

    // ================================================================
    // ⏱️ [시간 변환기] 문자열 및 Date 객체를 초(Seconds) 단위로 안전 변환
    // ================================================================
    function parseTimeToSeconds(timeStr) {
        if (!timeStr) return 0;
        if (timeStr instanceof Date) {
            return timeStr.getHours() * 3600 + timeStr.getMinutes() * 60 + timeStr.getSeconds();
        }
        let clean = String(timeStr).trim();
        if (clean === '' || clean === '-' || clean === '--:--:--') return 0;

        let parts = clean.split(':').map(Number);
        if (parts.length === 2) {
            return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60;
        } else if (parts.length >= 3) {
            return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
        }
        return 0;
    }

    function formatSecondsToHHMMSS(totalSeconds) {
        let sec = totalSeconds % (24 * 3600);
        let h = Math.floor(sec / 3600);
        let m = Math.floor((sec % 3600) / 60);
        let s = sec % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    // 🎯 7. 이벤트 바인딩 리스너
    document.addEventListener('click', function (event) {
        let liveBtn = event.target.closest('.live-icon-btn');
        if (liveBtn) {
            event.stopPropagation();
            event.preventDefault();
            if (typeof openLiveModal === 'function') {
                openLiveModal();
            }
        }
    });

    // ==========================================
    // 🛡️ [공통 유틸리티] DOM 안전 텍스트 주입 함수
    // - HTML 태그(id)가 존재할 때만 innerText를 안전하게 변경하여 Null 에러 방지
    // ==========================================
    function safeSetText(id, text) {
        let el = document.getElementById(id);
        if (el) {
            el.innerText = (text !== null && text !== undefined) ? text : '-';
        }
    }

    // ==========================================
    // ⚙️ [전역 변수 설정]
    // ==========================================
    let currentDriver = "유재필";
    let targetDriverName = "유재필";
    let isFamilyUser = false;
    const ADMIN_DRIVER = "유재필";
    let currentWeeklyStartDate = new Date();
    let alarmPlayed = false;
    // ==========================================
    // 💡 [화면 꺼짐 방지 & 세션 유지 모듈]
    // - 기기가 절전 상태로 들어가 웹앱 탭이 강제 종료/새로고침되는 현상을 완벽 차단합니다.
    // ==========================================
    let wakeLock = null;           // 화면 꺼짐 방지 객체 저장 변수
    let keepAliveTimer = null;      // 구글 앱스 스크립트 30분 세션 만료 방지용 타이머

    // [화면 꺼짐 방지 활성화 함수]
    // 운행 중 화면이 저절로 꺼져서 연결이 끊어지는 것을 방지합니다.
    async function requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('💡 [WakeLock] 화면 꺼짐 방지 활성화 성공');

                // 화면 잠금 해제 이벤트 감지 시 재연결 대비
                wakeLock.addEventListener('release', () => {
                    console.log('💡 [WakeLock] 화면 꺼짐 방지가 해제되었습니다.');
                });
            }
        } catch (err) {
            console.warn('⚠️ WakeLock 활성화 실패 (브라우저 지원 여부 확인):', err);
        }
    }

    // [화면 꺼짐 방지 해제 함수]
    // 로그아웃 시 배터리 절약을 위해 화면 꺼짐 방지를 해제합니다.
    function releaseWakeLock() {
        if (wakeLock !== null) {
            wakeLock.release().then(() => {
                wakeLock = null;
            });
        }
    }

    // [앱 복귀 시 화면 꺼짐 방지 재가동 리스너]
    // 기사님이 다른 앱(카카오톡, 전화 등)을 보다가 돌아왔을 때 꺼짐 방지를 다시 켭니다.
    document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
            await requestWakeLock();
        }
    });

    // [구글 세션 만료 방지용 백그라운드 핑(Keep-Alive)]
    // GAS 웹앱의 25~30분 토큰 만료를 방지하기 위해 10분마다 서버와 가벼운 통신을 유지합니다.
    function startSessionKeepAlive() {
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        keepAliveTimer = setInterval(() => {
            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(() => {
                        console.log('🔄 [Keep-Alive] 구글 세션 정상 유지 중 (' + new Date().toLocaleTimeString() + ')');
                    })
                    .withFailureHandler((err) => {
                        console.warn('⚠️ [Keep-Alive] 핑 실패 (재연결 대기):', err);
                    })
                    .loadFromServer(); // 가벼운 세션 갱신 호출
            }
        }, 10 * 60 * 1000); // 10분 주기 실행 (세션 만료 시간인 30분보다 훨씬 전에 갱신)
    }

    let selectedPaintColor = 'black';

    // 💡 구글 시트 데이터 기반으로 동작하므로 초기 더미 객체는 빈 값으로 유지
    const defaultRouteDataMap = {};

    function getDefaultUsers() {
        return [
            { name: "유재필", pin: "5289", active: true, userType: "driver" },
            { name: "정윤하", pin: "0004", active: true, userType: "driver" },
            { name: "위에", pin: "1127", active: true, userType: "family", targetDriver: "유재필" },
            { name: "김대규", pin: "1111", active: true, userType: "driver" },
            { name: "전지현", pin: "9999", active: true, userType: "driver" },
            { name: "영심이", pin: "9999", active: true, userType: "family", targetDriver: "유재필" }
        ];
    }

    function getUsersList() {
        let str = localStorage.getItem('yeongjong_users_db');
        if (str) {
            try { return JSON.parse(str); } catch (e) { }
        }
        let def = getDefaultUsers();
        localStorage.setItem('yeongjong_users_db', JSON.stringify(def));
        return def;
    }

    function saveUsersList(list) {
        localStorage.setItem('yeongjong_users_db', JSON.stringify(list));
        if (typeof google !== 'undefined' && google.script && google.script.run) {
            google.script.run.saveToServer('yeongjong_users_db', JSON.stringify(list));
        }
    }

    function getDefaultDistanceByRoute(routeName) {
        if (!routeName) return 34;
        if (routeName.includes("202")) return 100;
        if (routeName.includes("203")) return 76;
        if (routeName.includes("204")) return 90;
        if (routeName.includes("205")) return 68;
        if (routeName.includes("206")) return 70;
        if (routeName.includes("221")) return 74;
        if (routeName.includes("281")) return 75;
        if (routeName.includes("282")) return 72;
        return 34;
    }

    function getDriverKey(key) {
        let driver = isFamilyUser ? targetDriverName : currentDriver;
        return `jpil_user_${driver}_${key}`;
    }

    async function loadDataFromGAS() {
        return new Promise((resolve) => {
            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(function (data) {
                        for (let key in data) { localStorage.setItem(key, data[key]); }
                        resolve();
                    })
                    .withFailureHandler(function () { resolve(); })
                    .loadFromServer();
            } else { resolve(); }
        });
    }

    function saveToGAS(key, value, isShared = false) {
        let actualKey = isShared ? key : getDriverKey(key);
        let strValue = typeof value === 'object' ? JSON.stringify(value) : value;

        localStorage.setItem(actualKey, strValue);

        if (typeof google !== 'undefined' && google.script && google.script.run) {
            google.script.run.saveToServer(actualKey, strValue);
        }
    }

    let routeDataMap = {};

    // ==========================================
    // 🚀 [웹앱 로드 완료 시점] 전체 초기화 및 데이터 로드
    // ==========================================
    window.onload = async function () {
        // 0. 상단 '오늘의 한마디' 박스: 다른 초기화(서버 대기·근무표 그리기)보다 먼저, 실패해도 영향 없게 바로 불러오고 5분마다 새로 고침
        try {
            if (typeof loadLatestColleagueMessage === 'function') {
                loadLatestColleagueMessage();
                setInterval(function () {
                    if (!document.hidden) loadLatestColleagueMessage();
                }, 5 * 60 * 1000);
            }
        } catch (e) { console.warn('한마디 초기 로드 실패:', e); }

        // 1. 오늘 날짜를 YYYY-MM-DD 형식으로 안전하게 생성
        let now = new Date();
        let y = now.getFullYear();
        let m = String(now.getMonth() + 1).padStart(2, '0');
        let d = String(now.getDate()).padStart(2, '0');
        let todayStr = `${y}-${m}-${d}`;

        // 2. 날짜 선택창과 일정 등록창에 오늘 날짜 기본 입력
        let searchDateEl = document.getElementById('searchDate');
        let regDateEl = document.getElementById('regDate');
        if (searchDateEl) searchDateEl.value = todayStr;
        if (regDateEl) regDateEl.value = todayStr;

        // 3. 구글 서버(GAS) 데이터 및 공유 노선 데이터 동기화
        await loadDataFromGAS();
        loadSharedRouteData();
        initGateway();

        // 💡 [핵심 보강] 데이터가 준비되었으므로 즉시 오늘 근무표를 화면에 그리기
        if (typeof searchSchedule === 'function') {
            searchSchedule();
        }

        // 전체 노선 시간표 UI 초기화 (메인 화면)
        if (typeof initAllRouteTimetableUI === 'function') initAllRouteTimetableUI();

        // 4. 실시간 카운트다운 타이머 및 월 선택기 초기화
        setInterval(updateLiveStatusAndHighlight, 1000);
        initMonthSelect();

    };

    function initGateway() {
        document.getElementById('gatewayPinInput').value = '';
        document.getElementById('gatewayNewName').value = '';
        document.getElementById('gatewayNewPin').value = '';
        const ph = document.getElementById('gatewayNewPhone'); if (ph) ph.value = '';
        document.getElementById('gatewayFamilyName').value = '';
        document.getElementById('gatewayFamilyPin').value = '';
        document.getElementById('gatewayUserSelectionArea').style.display = 'none';
        document.getElementById('userSelectList').innerHTML = '';

        let drivers = getUsersList().filter(u => u.userType !== 'family');
        let sel = document.getElementById('gatewayFamilyTargetDriver');
        if (sel) {
            sel.innerHTML = '';
            drivers.forEach(d => {
                let opt = document.createElement('option');
                opt.value = d.name;
                opt.innerText = `${d.name} 기사님`;
                sel.appendChild(opt);
            });
        }
    }

    // 대문의 [기사님 가입] / [가족 사용자 등록] 접고 펴기
    function toggleAccordion(contentId, headerEl) {
        const content = document.getElementById(contentId);
        if (!content) return;
        const open = !content.classList.contains('open');
        content.classList.toggle('open', open);
        const arrow = headerEl && headerEl.querySelector ? headerEl.querySelector('.arrow') : null;
        if (arrow) arrow.style.transform = open ? 'rotate(90deg)' : '';
    }
    window.toggleAccordion = toggleAccordion;

    // 기사 로그인 규칙: 기사번호 6자리가 비밀번호. 예전 4자리 기사 정보는 로그인할 수 없고 다시 가입해야 함 (가족은 4자리 그대로)
    function isDriverV2(u) {
        return !!u && u.userType !== 'family' && /^\d{6}$/.test(String(u.pin || '').trim());
    }
    function isValidLoginUser(u) {
        if (!u) return false;
        if (u.userType === 'family') return true;
        return isDriverV2(u);
    }

    // 가입 직전에 서버의 최신 사용자 목록을 받아옴 (다른 사람 가입 기록을 덮어쓰지 않도록). 서버에 연결하지 못하면 null
    function fetchFreshUsers(cb) {
        if (typeof google === 'undefined' || !google.script || !google.script.run) { cb(getUsersList()); return; }
        google.script.run
            .withSuccessHandler(function (data) {
                let list = null;
                try {
                    const raw = data && data['yeongjong_users_db'];
                    list = (typeof raw === 'string') ? JSON.parse(raw) : raw;
                } catch (e) { list = null; }
                if (Array.isArray(list)) {
                    localStorage.setItem('yeongjong_users_db', JSON.stringify(list));
                    cb(list);
                } else {
                    cb(getUsersList());
                }
            })
            .withFailureHandler(function () { cb(null); })
            .loadFromServer();
    }

    function gatewaySaveDriver() {
        const name = document.getElementById('gatewayNewName').value.trim();
        const pin = document.getElementById('gatewayNewPin').value.trim();
        const phone = (document.getElementById('gatewayNewPhone').value || '').replace(/[^0-9]/g, '');

        if (!name) { alert("이름을 입력해주세요."); return; }
        if (!/^\d{6}$/.test(pin)) { alert("기사번호 6자리 숫자를 입력해주세요."); return; }
        if (!/^\d{10,11}$/.test(phone)) { alert("전화번호를 숫자만 10~11자리로 입력해주세요."); return; }

        fetchFreshUsers(function (users) {
            if (!users) { alert("서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해주세요."); return; }

            const exist = users.find(u => u.name === name);
            if (exist && exist.userType === 'family') { alert("가족 사용자로 이미 등록된 이름입니다."); return; }
            if (exist && isDriverV2(exist)) { alert("이미 가입된 이름입니다.\n위쪽 번호 입력칸에 기사번호 6자리를 넣어 로그인해주세요."); return; }
            if (users.some(u => u.name !== name && isDriverV2(u) && String(u.pin).trim() === pin)) {
                alert("이미 다른 기사님이 사용 중인 기사번호입니다."); return;
            }

            const now = new Date().toISOString();
            if (exist) {
                // 예전(4자리)에 등록했던 이름: 새 정보로 바꾸고, 기존 근무 기록은 그대로 사용
                exist.pin = pin;
                exist.phone = phone;
                exist.active = true;
                exist.userType = 'driver';
                exist.registeredAt = now;
            } else {
                users.push({ name: name, pin: pin, phone: phone, active: true, userType: 'driver', registeredAt: now });
            }
            saveUsersList(users);
            document.getElementById('gatewayNewName').value = '';
            document.getElementById('gatewayNewPin').value = '';
            alert(`'${name}' 기사님 가입이 완료되었습니다!\n위쪽 번호 입력칸에 기사번호 6자리를 넣어 로그인해주세요.`);

            toggleAccordion('addUserAccordionContent', document.getElementById('addUserAccordionContent').previousElementSibling);
            initGateway();
        });
    }

    function gatewaySaveUsers(type) {
        if (type === 'driver') {
            gatewaySaveDriver();
            return;
        } else if (type === 'family') {
            let name = document.getElementById('gatewayFamilyName').value.trim();
            let pin = document.getElementById('gatewayFamilyPin').value.trim();
            let target = document.getElementById('gatewayFamilyTargetDriver').value;

            if (!name) { alert("가족 이름을 입력해주세요."); return; }
            if (!pin || pin.length !== 4) { alert("4자리 비밀번호를 입력해주세요."); return; }
            if (!target) { alert("공유받을 기사님을 선택해주세요."); return; }

            let users = getUsersList();
            users.push({ name: name, pin: pin, active: true, userType: 'family', targetDriver: target });
            saveUsersList(users);

            document.getElementById('gatewayFamilyName').value = '';
            document.getElementById('gatewayFamilyPin').value = '';
            alert(`'${name}' 가족 사용자가 추가되었습니다!\n(${target} 기사님의 근무표가 공유됩니다)`);

            toggleAccordion('addFamilyAccordionContent', document.getElementById('addFamilyAccordionContent').previousElementSibling);
        }
        initGateway();
    }


    // ==========================================
    // 📱 [메인 네비게이션] 페이지/탭 전환 제어 함수
    // ==========================================
    function switchPage(pageId) {
        // 1. 모든 메인 페이지 숨기기
        const pages = document.querySelectorAll('.page');
        pages.forEach(p => p.style.display = 'none');

        // 2. 모든 네비게이션 탭 버튼 비활성화 (file-tab, nav-btn, tab-btn 통합 감지)
        const navBtns = document.querySelectorAll('.file-tab, .nav-btn, .tab-btn');
        navBtns.forEach(btn => btn.classList.remove('active'));

        // 3. 요청된 페이지 표시
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.style.display = 'block';
        }

        // 4. 클릭된 탭 버튼 활성화 스타일 적용 (onclick 속성으로 찾아서 active 적용)
        const activeNavBtn = document.querySelector(`[onclick*="${pageId}"]`);
        if (activeNavBtn) {
            activeNavBtn.classList.add('active');
        }

        // 5. 페이지별 특수 로직 (관리자 노선설정 진입 시 첫번째 서브탭 자동 선택)
        if (pageId === 'routeConfigPage') {
            if (typeof switchAdminSubTab === 'function') {
                switchAdminSubTab('timetable');
            }
        }
    }

    // ==========================================
    // 🔓 [게이트웨이] 사용자 선택 및 메인 화면 진입
    // ==========================================

    // ==========================================
    // 🔓 [게이트웨이] 사용자(기사/가족) 선택 및 메인 화면 진입 함수
    // - 로그인한 기사 정보를 브라우저(localStorage)에 영구 보관하여
    //   30분이 지나거나 새로고침이 발생해도 절대 대문으로 튕기지 않도록 방어합니다.
    // ==========================================
    function selectDriver(userObj) {
        if (!userObj || !userObj.name) return;

        currentDriver = userObj.name;
        window.currentDriver = userObj.name;

        // 🔑 [핵심] 새로고침 대비 로그인 세션 저장 (30분 튕김 방지)
        localStorage.setItem('loggedInUser', userObj.name);
        localStorage.setItem('yeongjong_logged_user', JSON.stringify(userObj));
        if (userObj.pin) {
            localStorage.setItem('autoLoginPin', userObj.pin);
        }

        // 가족 사용자 여부 및 타겟 기사님 설정
        if (userObj.userType === 'family') {
            isFamilyUser = true;
            targetDriverName = userObj.targetDriver;
            safeSetText('currentDriverDisplay', `${currentDriver} (가족: ${targetDriverName} 기사님)`);
        } else {
            isFamilyUser = false;
            targetDriverName = currentDriver;
            safeSetText('currentDriverDisplay', currentDriver);
        }

        // 헤더 타이틀 이름 반영
        const headerTitle = document.getElementById('headerTitleText');
        if (headerTitle) {
            headerTitle.textContent = `${currentDriver} 기사님 근무표`;
        }

        // 탭 메뉴 권한 제어 (가족은 1,2번 탭 / 관리자는 4번 노선설정 탭 표시)
        let tabSettings = document.getElementById('tabSettings');         // 3번 근무설정 탭
        let tabRouteConfig = document.getElementById('tabRouteConfig');     // 4번 관리자 노선설정 탭

        const tabEmergency = document.getElementById('tabEmergency');
        if (isFamilyUser) {
            if (tabSettings) tabSettings.style.display = 'none';
            if (tabRouteConfig) tabRouteConfig.style.display = 'none';
            if (tabEmergency) tabEmergency.style.display = 'none';
        } else {
            if (tabSettings) tabSettings.style.display = 'flex';
            if (tabEmergency) tabEmergency.style.display = 'flex';
            if (currentDriver === ADMIN_DRIVER || currentDriver.includes('유재필')) {
                if (tabRouteConfig) tabRouteConfig.style.display = 'flex';
            } else {
                if (tabRouteConfig) tabRouteConfig.style.display = 'none';
            }
        }

        // 대문(게이트웨이) 숨기기 및 메인 앱 표시
        const gatewayPage = document.getElementById('gatewayPage');
        if (gatewayPage) {
            gatewayPage.style.display = 'none';
            gatewayPage.classList.remove('active');
        }

        const appNavTabs = document.getElementById('appNavTabs');
        if (appNavTabs) appNavTabs.style.display = 'flex';

        // 🎙️ 로그인 완료 후 플로팅 마이크 위젯 표시 (가족 사용자는 숨김)
        const voiceWidget = document.getElementById('floatingVoiceWidget');
        if (voiceWidget) voiceWidget.style.display = isFamilyUser ? 'none' : 'flex';

        const mainAppEl = document.getElementById('mainAppContainer') || document.getElementById('mainPage') || document.getElementById('schedulePage');
        if (mainAppEl) {
            mainAppEl.style.display = 'block';
            mainAppEl.classList.add('active');
        }

        // 💡 화면 꺼짐 방지 가동 & 세션 연장 핑 가동
        requestWakeLock();
        startSessionKeepAlive();

        // 데이터 동기화 및 메인 화면 렌더링
        loadSharedRouteData();
        refreshAllUI();
        switchPage('mainPage');
        searchSchedule();
        if (typeof loadScheduleForEdit === 'function') loadScheduleForEdit();
        if (typeof loadTodayMemo === 'function') setTimeout(loadTodayMemo, 150);
    }

    // ==========================================
    // 🛡️ [권한 제어] 가족 사용자 및 관리자 메뉴 탭 제어
    // ==========================================
    function applyUserPermissions() {
        // 관리자(유재필 님) 전용 노선설정 탭 버튼
        const adminTabBtn = document.getElementById('navBtnRouteConfig');

        if (adminTabBtn) {
            // 관리자인 경우에만 노선설정 탭 보이기
            if (currentDriver === ADMIN_DRIVER && !isFamilyUser) {
                adminTabBtn.style.display = 'flex';
            } else {
                adminTabBtn.style.display = 'none';
            }
        }

        // 가족 사용자인 경우 제약사항 처리 (필요시)
        if (isFamilyUser) {
            // 가족 사용자는 수정 관련 버튼 제한
            const editBtns = document.querySelectorAll('.driver-only-edit');
            editBtns.forEach(btn => btn.style.display = 'none');
        }
    }

    function loadSharedRouteData() {
        let savedMap = localStorage.getItem('yeongjong_shared_routeDataMap');
        if (savedMap) {
            try {
                routeDataMap = JSON.parse(savedMap);
                if (Object.keys(routeDataMap).length === 0) routeDataMap = defaultRouteDataMap;
            } catch (e) { routeDataMap = defaultRouteDataMap; }
        } else {
            routeDataMap = defaultRouteDataMap;
        }
    }

    function saveSharedRouteData() {
        saveToGAS('yeongjong_shared_routeDataMap', routeDataMap, true);
    }

    function refreshAllUI() {
        if (typeof initRouteDropdowns === 'function') initRouteDropdowns();
        if (typeof renderEditRouteOptions === 'function') renderEditRouteOptions();
        renderAdminUserManageList();
    }

    function renderAdminUserManageList() {
        let container = document.getElementById('adminUserManageList');
        if (!container) return;
        container.innerHTML = '';
        let users = getUsersList();

        users.forEach((u, index) => {
            let div = document.createElement('div');
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.style.background = 'var(--container-bg)';
            div.style.padding = '8px 10px';
            div.style.borderRadius = '6px';
            div.style.border = '1px solid var(--border-color)';

            let userTypeBadge = u.userType === 'family' ? `<span style="color:#d97706; font-size:11px;">[가족: ${u.targetDriver}]</span>` : '<span style="color:var(--primary); font-size:11px;">[기사]</span>';
            let infoText = `<div><strong>${u.name}</strong> <span style="font-size:12px; color:var(--sub-text);">(번호: ${u.pin}${u.phone ? ' · ' + u.phone : ''})</span> ${userTypeBadge}${(u.userType !== 'family' && !isDriverV2(u)) ? ' <span style="color:#ef4444; font-size:11px;">[재가입 필요]</span>' : ''}</div>`;

            let btnArea = document.createElement('div');
            btnArea.style.display = 'flex';
            btnArea.style.gap = '4px';

            if (u.name !== ADMIN_DRIVER) {
                let delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'mini-btn danger';
                delBtn.innerText = '삭제';
                delBtn.onclick = function () { adminDeleteUser(index); };
                btnArea.appendChild(delBtn);
            }

            div.innerHTML = infoText;
            div.appendChild(btnArea);
            container.appendChild(div);
        });
    }

    function adminDeleteUser(index) {
        let users = getUsersList();
        if (users[index].name === ADMIN_DRIVER) { alert("관리자 계정은 삭제할 수 없습니다."); return; }
        if (confirm(`'${users[index].name}' 사용자를 바로 삭제하시겠습니까?`)) {
            users.splice(index, 1);
            saveUsersList(users);
            renderAdminUserManageList();
        }
    }


    function getFormattedDate(d) {
        let year = d.getFullYear();
        let month = String(d.getMonth() + 1).padStart(2, '0');
        let day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // ==========================================
    // 📱 [메인 네비게이션] 4개 페이지 탭 전환 함수
    // ==========================================
    function switchPage(pageId) {
        // 권한 예외 처리
        if (isFamilyUser && (pageId === 'settingsPage' || pageId === 'routeConfigPage' || pageId === 'emergencyPage')) {
            alert("가족 사용자는 해당 메뉴를 사용할 수 없습니다.");
            return;
        }
        let isAdmin = (currentDriver === ADMIN_DRIVER || (typeof currentDriver === 'string' && currentDriver.includes('유재필')));
        if (!isFamilyUser && !isAdmin && pageId === 'routeConfigPage') {
            alert("관리자 전용 메뉴입니다.");
            return;
        }

        // 모든 페이지 비활성화
        document.querySelectorAll('.page').forEach(p => {
            if (p.id !== 'gatewayPage') p.classList.remove('active');
        });

        // 모든 네비게이션 탭 버튼 비활성화
        document.querySelectorAll('.file-tab').forEach(t => t.classList.remove('active'));

        // 대상 페이지 활성화
        let targetPage = document.getElementById(pageId);
        if (targetPage) targetPage.classList.add('active');

        // 🏷️ [상단 헤더 동적 타이틀 전환] 대문 vs 로그인 후
        const headerTitle = document.getElementById('headerTitleText');
        if (headerTitle) {
            if (pageId === 'gatewayPage') {
                headerTitle.textContent = '영종운수 스마트근무표';
            } else {
                let name = window.currentDriver || localStorage.getItem('loggedInUser') || '';
                headerTitle.textContent = name ? `${name} 기사님 근무표` : '영종운수 스마트근무표';
            }
        }

        // 🎙️ 대문화면에서는 마이크 숨김, 로그인 후에는 노출
        const voiceWidget = document.getElementById('floatingVoiceWidget');
        if (voiceWidget) {
            voiceWidget.style.display = (pageId === 'gatewayPage' || isFamilyUser) ? 'none' : 'flex';
        }

        // 각 탭별 처리 및 active 클래스 부여
        if (pageId === 'mainPage') {
            let tab = document.getElementById('tabMain');
            if (tab) tab.classList.add('active');
            searchSchedule();
        } else if (pageId === 'statsPage') {
            let tab = document.getElementById('tabStats');
            if (tab) tab.classList.add('active');
            if (!window.currentStatsSubView) window.currentStatsSubView = 'summary';
            selectStatsSubView(window.currentStatsSubView);
        } else if (pageId === 'emergencyPage') {
            let tab = document.getElementById('tabEmergency');
            if (tab) tab.classList.add('active');
            if (typeof renderEmergencyPage === 'function') renderEmergencyPage();
        } else if (pageId === 'settingsPage') {
            let tab = document.getElementById('tabSettings');
            if (tab) tab.classList.add('active');
            if (typeof selectSettingsView === 'function') selectSettingsView('schedule');
        } else if (pageId === 'routeConfigPage') {
            // 4번 노선설정 탭 진입 시
            let tab = document.getElementById('tabRouteConfig');
            if (tab) tab.classList.add('active');
            // 첫 번째 서브 탭(시간표 및 거리 수정)으로 자동 열기
            switchAdminSubTab('timetable');
        }
    }
