// ================================================================
function loadLatestColleagueMessage() {
  let loaded = false;

  // 1단계: 브라우저 캐시에서 즉시 로드
  const localData = localStorage.getItem('latest_colleague_msg');
  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      if (Array.isArray(parsed) && parsed.length > 0) {
        renderMessages(parsed);
        loaded = true;
      }
    } catch (e) {
      console.warn("로컬 한마디 파싱 에러:", e);
    }
  }

  // 2단계: 구글 시트 서버 최신 데이터 동기화
  if (typeof google !== 'undefined' && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(res => {
        if (res) {
          try {
            localStorage.setItem('latest_colleague_msg', res);
            const parsed = JSON.parse(res);
            if (Array.isArray(parsed) && parsed.length > 0) {
              renderMessages(parsed);
              return;
            }
          } catch (e) {}
        }
        if (!loaded) {
          renderMessages([]);
        }
      })
      .withFailureHandler(err => {
        console.warn("한마디 서버 수신 실패:", err);
        if (!loaded) {
          renderMessages([]);
        }
      })
      .loadKeyFromServer('latest_colleague_msg');
  } else if (!loaded) {
    renderMessages([]);
  }
}

    // ================================================================
    // 🛰️ [스마트폰 고정밀 실시간 GPS 내비게이션 & 정류장 감지 엔진]
    // - 기사님 운전석 스마트폰 GPS를 심장으로 삼아 0초 리얼타임 감지!
    // - 정류장 반경 진입 시 오차시간을 즉시 계산해 다음 정류장까지 완벽 동결(Lock)!
    // ================================================================
    window.liveGpsWatchId = null;
    window.lastGpsPosition = null;
    window.lastPassedStopIndex = null;

    // 두 좌표 간 거리 계산 (단위: 미터, 하버사인 정밀 공식)
    function calculateGpsDistanceMeters(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
        const R = 6371000; // 지구 반지름 (미터)
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Math.round(R * c);
    }

    // 라이브 모달이 실제로 열려 있는지 여부 (GPS는 이 동안에만 허용)
    function isLiveModalOpen() {
        const modal = document.getElementById('liveModal');
        return !!(modal && modal.classList.contains('active') && modal.style.display !== 'none');
    }

    // 🛰️ 스마트폰 GPS 추적 완전 해제 (배터리 보호) — 모달 닫힘 시 호출
    function stopLiveGpsTracking() {
        if (window.liveGpsWatchId !== null && window.liveGpsWatchId !== undefined && navigator.geolocation) {
            navigator.geolocation.clearWatch(window.liveGpsWatchId);
        }
        window.liveGpsWatchId = null;
        window.lastGpsPosition = null;
        window.curBusGpsLat = null;
        window.curBusGpsLon = null;
        window.curBusSpeed = null;
    }

    // 스마트폰 GPS 실시간 추적 시작 (라이브 모달이 열려 있을 때만 동작)
    function startLiveGpsTracking(duty) {
        stopLiveGpsTracking();

        // 모달이 닫힌 상태(비동기 지연 콜백, 권한 요청 응답 등)에서는 절대 시작하지 않음
        if (!isLiveModalOpen()) {
            console.log("🔋 [GPS] 라이브 모달이 닫혀 있어 위치 추적을 시작하지 않습니다.");
            return;
        }

        if (!navigator.geolocation) {
            console.warn("⚠️ 이 브라우저는 GPS를 지원하지 않습니다.");
            updateGpsVehicleHeader(duty, null, true);
            return;
        }

        console.log("🛰️ [GPS 엔진 가동] 실시간 위성 위치 추적을 시작합니다.");
        window._gpsDuty = duty;
        window._gpsWatchStartedAt = Date.now();
        window._gpsLastFixAt = 0;

        const options = {
            enableHighAccuracy: true, // 고정밀 GPS 위성 모드
            maximumAge: 1000,         // 1초 이내 위치
            timeout: 10000            // 타임아웃
        };

        window.liveGpsWatchId = navigator.geolocation.watchPosition(
            (pos) => {
                if (!isLiveModalOpen()) { stopLiveGpsTracking(); return; }
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                const speedKmh = pos.coords.speed !== null && pos.coords.speed >= 0 ? Math.round(pos.coords.speed * 3.6) : null;
                const accuracy = Math.round(pos.coords.accuracy || 0);

                window.curBusGpsLat = lat;
                window.curBusGpsLon = lon;
                window.curBusSpeed = speedKmh;
                window.lastGpsPosition = { lat, lon, speedKmh, accuracy, time: new Date() };
                window._gpsLastFixAt = Date.now();

                // 위치 수신 성공 시 권한 배너 즉시 숨김
                const permBanner = document.getElementById('gpsPermissionBanner');
                if (permBanner) permBanner.style.display = 'none';

                // 1. 상단 차량번호 바에 실시간 GPS & 속도 상태 표시
                updateGpsVehicleHeader(duty, speedKmh, false);

                // 2. 정류장 자동 통과 감지 및 실시간 오차 계산 실행
                onGpsLocationUpdate(lat, lon, speedKmh, duty);
            },
            (err) => {
                console.warn("⚠️ GPS 수신 오류:", err.message, "코드:", err.code);
                handleGpsPermissionError(err, duty);
            },
            options
        );
    }

    // 📍 [위치(GPS) 권한 오류 및 상태 처리]
    function handleGpsPermissionError(err, duty) {
        if (window.simState && window.simState.active) return;
        const banner = document.getElementById('gpsPermissionBanner');
        const titleEl = document.getElementById('gpsBannerTitle');
        const descEl = document.getElementById('gpsBannerDesc');
        const bisVehicleEl = document.getElementById('bisVehicleNo');
        const gpsStatusText = document.getElementById('gpsStatusText');
        const plate = duty && duty.busNo ? (String(duty.busNo).includes('인천') ? duty.busNo : `인천70아${duty.busNo}`) : '배차 차량 없음';

        if (banner) banner.style.display = 'block';
        setGpsBadgeBad(true);

        if (err && err.code === 1) { // PERMISSION_DENIED (권한 거부/미허용)
            if (titleEl) titleEl.innerText = '위치(GPS) 권한을 허용해 주세요';
            if (descEl) descEl.innerText = '실시간 정류장 통과와 오차시간 확인을 위해 [위치 허용]을 눌러주세요.';
            if (bisVehicleEl) bisVehicleEl.innerText = `${plate} · ⚠️ 위치권한 필요`;
            if (gpsStatusText) gpsStatusText.innerText = '⚠️ 위치권한 필요';
        } else if (err && err.code === 2) { // POSITION_UNAVAILABLE (기기 위치 꺼짐)
            if (titleEl) titleEl.innerText = '스마트폰 [위치(GPS)]를 켜주세요';
            if (descEl) descEl.innerText = '휴대폰 상단 알림창을 내려 [위치]를 켠 후 화면을 터치해 주세요.';
            if (bisVehicleEl) bisVehicleEl.innerText = `${plate} · ⚠️ GPS 꺼짐`;
            if (gpsStatusText) gpsStatusText.innerText = '⚠️ GPS 꺼짐';
        } else {
            if (titleEl) titleEl.innerText = 'GPS 위성 신호 찾는 중...';
            if (descEl) descEl.innerText = '차량 외부나 창가 쪽에서 GPS 신호가 수신되면 자동 연결됩니다.';
            if (bisVehicleEl) bisVehicleEl.innerText = `${plate} · 📡 GPS 수신 대기`;
            if (gpsStatusText) gpsStatusText.innerText = 'GPS 수신 대기';
        }
    }

    // 📍 [사용자 직접 위치 권한 요청 트리거]
    function requestGpsPermission() {
        if (!navigator.geolocation) {
            alert('이 기기/브라우저는 GPS 위치 기능을 지원하지 않습니다.');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const banner = document.getElementById('gpsPermissionBanner');
                if (banner) banner.style.display = 'none';
                const duty = typeof getTodayDutyInfo === 'function' ? getTodayDutyInfo() : { busNo: '1214' };
                startLiveGpsTracking(duty);
            },
            (err) => {
                if (err.code === 1) {
                    alert('위치 권한이 차단되어 있습니다.\n\n[해결 방법]\n1. 브라우저 상단 주소창 왼쪽 자물쇠(🔒) 또는 설정 아이콘을 누릅니다.\n2. [사이트 설정] 또는 [위치] 항목을 찾아 "허용"으로 변경해 주세요.');
                } else if (err.code === 2) {
                    alert('스마트폰의 [위치(GPS)]가 꺼져 있습니다.\n\n스마트폰 화면 상단바를 아래로 내려 [위치] 아이콘을 켜주세요.');
                } else {
                    // 시간 초과 등: 신호를 잡는 중일 수 있으니 추적은 그대로 시작 (수신되면 자동 연결)
                    const duty = typeof getTodayDutyInfo === 'function' ? getTodayDutyInfo() : { busNo: '1214' };
                    startLiveGpsTracking(duty);
                }
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    }

    // 상단 차량번호 바 실시간 렌더링
    function updateGpsVehicleHeader(duty, speedKmh, isWaiting) {
        if (window.simState && window.simState.active) return; // 모의주행 중에는 실제 GPS가 헤더를 덮어쓰지 않음
        const bisVehicleEl = document.getElementById('bisVehicleNo');
        const gpsStatusText = document.getElementById('gpsStatusText');
        const plate = duty && duty.busNo ? (String(duty.busNo).includes('인천') ? duty.busNo : `인천70아${duty.busNo}`) : '배차 차량 없음';

        setSpeedDisplay(isWaiting ? null : speedKmh);
        // 차량번호 줄에는 번호만 표시 (GPS 상태는 오른쪽 뱃지에만 표시)
        if (bisVehicleEl) bisVehicleEl.innerText = plate;
        if (isWaiting) {
            if (gpsStatusText) gpsStatusText.innerText = 'GPS 수신 대기';
        } else if (speedKmh !== null) {
            if (gpsStatusText) gpsStatusText.innerText = `GPS (${speedKmh} km/h)`;
            setGpsBadgeBad(false);
        } else {
            if (gpsStatusText) gpsStatusText.innerText = 'GPS 연결됨';
            setGpsBadgeBad(false);
        }
    }

    // ================================================================
    // 🔴 [GPS 끊김 감지] 위치 수신이 한동안 없으면 우측 상단 GPS 버튼이 빨간색으로 바뀜
    //  - 버튼을 누르면 재연결 창이 뜸 (관리자 1.2초 꾹 누르기는 그대로 모의주행 패널)
    // ================================================================
    var GPS_STALE_MS = 15 * 1000;        // 마지막 위치 수신 후 15초 넘으면 끊김으로 판단
    var GPS_AUTO_RETRY_MS = 30 * 1000;   // 끊긴 채로 있으면 30초마다 자동 재시도

    function setGpsBadgeBad(bad, text) {
        const badge = document.getElementById('gpsAdminTrigger');
        const icon = document.getElementById('gpsBadgeIcon');
        const txt = document.getElementById('gpsStatusText');
        if (!badge) return;
        if (bad) {
            badge.style.color = '#fecaca';
            badge.style.background = 'rgba(127, 29, 29, 0.95)';
            badge.style.borderColor = '#ef4444';
            badge.classList.add('gps-badge-bad');
            if (icon) icon.style.color = '#fca5a5';
            if (txt && text) txt.innerText = text;
        } else {
            badge.style.color = '#38bdf8';
            badge.style.background = 'rgba(15, 23, 42, 0.92)';
            badge.style.borderColor = 'rgba(56, 189, 248, 0.55)';
            badge.classList.remove('gps-badge-bad');
            if (icon) icon.style.color = '#38bdf8';
        }
    }

    function checkGpsStale() {
        if (window.simState && window.simState.active) return;            // 모의주행 중에는 검사 안 함
        if (!isLiveModalOpen() || window.liveGpsWatchId == null) return;   // 추적 중일 때만
        const base = window._gpsLastFixAt || window._gpsWatchStartedAt || Date.now();
        if (Date.now() - base > GPS_STALE_MS) {
            setGpsBadgeBad(true, 'GPS 끊김');
            setSpeedDisplay(null);
            // 끊긴 채로 계속되면 조용히 다시 연결 시도
            if (Date.now() - (window._gpsLastRetryAt || 0) > GPS_AUTO_RETRY_MS) {
                window._gpsLastRetryAt = Date.now();
                startLiveGpsTracking(window._gpsDuty || (typeof getTodayDutyInfo === 'function' ? getTodayDutyInfo() : null));
            }
        }
    }
    setInterval(checkGpsStale, 3000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) checkGpsStale(); });

    // GPS 버튼을 눌렀을 때: 재연결 창
    function onGpsBadgeClick() {
        if (Date.now() - (window._gpsLongPressAt || 0) < 1500) return;   // 관리자 꾹 누르기 직후의 클릭은 무시
        if (window.simState && window.simState.active) return;
        const bad = document.getElementById('gpsAdminTrigger')?.classList.contains('gps-badge-bad');
        const doReconnect = () => {
            setGpsBadgeBad(false);
            const txt = document.getElementById('gpsStatusText');
            if (txt) txt.innerText = 'GPS 연결 중...';
            window._gpsLastFixAt = 0;
            window._gpsWatchStartedAt = Date.now();
            requestGpsPermission();
        };
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: bad ? 'GPS 연결이 끊어졌어요' : 'GPS를 다시 연결할까요?',
                text: bad ? '[다시 연결]을 누르면 위치를 새로 잡아요.' : '지금은 정상 연결 중이에요. 그래도 다시 연결할 수 있어요.',
                icon: bad ? 'warning' : 'question',
                showCancelButton: true,
                confirmButtonText: '다시 연결',
                cancelButtonText: '닫기',
                confirmButtonColor: '#0284c7',
                background: '#1e293b',
                color: '#fff'
            }).then(r => { if (r.isConfirmed) doReconnect(); });
        } else if (confirm(bad ? 'GPS 연결이 끊어졌습니다. 다시 연결할까요?' : 'GPS를 다시 연결할까요?')) {
            doReconnect();
        }
    }

    // 🎯 [핵심] GPS 위치 수신 시 정류장 통과 판정 및 오차시간 확정 잠금(Lock)
    function onGpsLocationUpdate(lat, lon, speedKmh, duty) {
        if (typeof gpsRecAdd === 'function') gpsRecAdd(lat, lon, speedKmh, window.lastGpsPosition ? window.lastGpsPosition.accuracy : 0);
        if (typeof navOnGps === 'function') { try { navOnGps(lat, lon); } catch (e) { console.warn('길안내 오류:', e); } }
        const masterCache = window.standardMasterCache || window.currentTripMasterCache || [];
        if (!masterCache || masterCache.length === 0) return;

        const now = new Date();
        const curWallSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

        const getRowName = (r) => r ? String(Array.isArray(r) ? r[5] : (r.name || r.stopName || r[5] || '')).trim() : '';
        const getRowTime = (r) => r ? String(Array.isArray(r) ? r[6] : (r.stdTime || r.time || r[6] || '')).trim() : '';

        // 1. 기준 정류장 앵커 산출 (이전 통과 정류장 기준 또는 시각 기준)
        let anchorIdx = 0;
        if (window.lastPassedStopIndex !== null && window.lastPassedStopIndex >= 0) {
            anchorIdx = window.lastPassedStopIndex;
        } else {
            let minDiff = Infinity;
            for (let i = 0; i < masterCache.length; i++) {
                let sSec = parseTimeToSeconds(getRowTime(masterCache[i]));
                if (sSec > 0) {
                    let d = Math.abs(curWallSec - sSec);
                    if (d < minDiff) { minDiff = d; anchorIdx = i; }
                }
            }
        }

        // 2. 전방 및 주변 정류장 탐색 (앞뒤 5개 정류장 슬라이딩 윈도우)
        let winStart = Math.max(0, anchorIdx - 1);
        let winEnd = Math.min(masterCache.length - 1, anchorIdx + 4);

        let closestIdx = -1;
        let minDistance = Infinity;

        for (let i = winStart; i <= winEnd; i++) {
            let row = masterCache[i];
            let stopLat = parseFloat(row.lat !== undefined ? row.lat : (Array.isArray(row) ? row[8] : null));
            let stopLng = parseFloat(row.lng !== undefined ? row.lng : (Array.isArray(row) ? row[9] : null));

            if (stopLat && stopLng) {
                let dist = calculateGpsDistanceMeters(lat, lon, stopLat, stopLng);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestIdx = i;
                }
            }
        }

        // 3. 정류장 통과 판정 (반경 50m 이내 진입 시)
        if (closestIdx !== -1 && minDistance <= 55) {
            if (window.lastPassedStopIndex !== closestIdx) {
                window.lastPassedStopIndex = closestIdx;
                window.lastMatchedMasterIndex = closestIdx;

                let curRow = masterCache[closestIdx];
                let stdTimeStr = getRowTime(curRow);
                let stdSec = parseTimeToSeconds(stdTimeStr);

                // ⏱️ [오차시간 계산 및 100% 자물쇠 잠금]
                if (stdSec > 0) {
                    let diffSec = curWallSec - stdSec;
                    if (diffSec > 43200) diffSec -= 86400;
                    else if (diffSec < -43200) diffSec += 86400;
                    let diffMin = Math.round(diffSec / 60);

                    if (Math.abs(diffMin) <= 60) {
                        const absMin = Math.abs(diffMin);
                        let badgeText = absMin === 0 ? "0" : (diffMin > 0 ? `+${absMin}` : `-${absMin}`);
                        let badgeColor = delayBadgeColor(diffMin);

                        window.bisStopLockState = window.bisStopLockState || {};
                        window.bisStopLockState.lockedStopKey = "GPS_STOP_" + closestIdx;
                        window.bisStopLockState.lockedDelayText = badgeText;
                        window.bisStopLockState.lockedTargetColor = badgeColor;

                        applyLockedDelayBadge(badgeText, badgeColor);
                        console.log(`🎯 [GPS 정류장 통과 감지] ${getRowName(curRow)} (거리: ${minDistance}m) -> 오차: ${badgeText}분 확정 동결!`);
                    } else {
                        // 이상치(60분 초과): 이전 정류장 오차가 남지 않도록 초기화
                        window.bisStopLockState = window.bisStopLockState || {};
                        window.bisStopLockState.lockedStopKey = "GPS_STOP_" + closestIdx;
                        window.bisStopLockState.lockedDelayText = "-";
                        window.bisStopLockState.lockedTargetColor = "#94a3b8";
                        applyLockedDelayBadge("-", "#94a3b8");
                    }
                }
            }
        }

        // 4. 3번째 카드(소통정보 카드) 다음 정류장 / 다음다음 정류장 자동 표출
        let displayTargetIdx = (window.lastPassedStopIndex !== null) ? window.lastPassedStopIndex + 1 : anchorIdx;
        displayTargetIdx = Math.min(masterCache.length - 1, Math.max(0, displayTargetIdx));

        let nextRow = masterCache[displayTargetIdx] || masterCache[0];
        let afterRow = masterCache[displayTargetIdx + 1] || null;

        let nName = nextRow ? getRowName(nextRow) : '다음 정류장';
        let nTime = nextRow ? getRowTime(nextRow) : '--:--:--';
        let aName = afterRow ? getRowName(afterRow) : '(종점 도착)';
        let aTime = afterRow ? getRowTime(afterRow) : '-';
        let curRow = displayTargetIdx > 0 ? masterCache[displayTargetIdx - 1] : null;

        if (typeof updateTrafficStopSequence === 'function') {
            updateTrafficStopSequence(nName, nTime, aName, aTime, undefined, curRow ? getRowName(curRow) : '', curRow ? getRowTime(curRow) : '');
        }
    }

    // ================================================================
    // 🎮 [관리자 전용 비밀 모의주행(시뮬레이터) 엔진]
    // ================================================================
    window.simState = {
        active: false,
        timer: null,
        currentIndex: 0,
        delayOffsetSec: 0,
        autoPlay: false
    };

    // 관리자 트리거 초기화 (롱프레스 & 더블탭/클릭)
    function initGpsAdminTrigger() {
        const trigger = document.getElementById('gpsAdminTrigger');
        const vehiclePlate = document.getElementById('bisVehicleNo');
        if (!trigger) return;

        let pressTimer = null;
        let startX = 0, startY = 0;

        const startPress = (e) => {
            if (e.touches && e.touches[0]) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }
            if (pressTimer) clearTimeout(pressTimer);
            pressTimer = setTimeout(() => {
                if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
                window._gpsLongPressAt = Date.now();
                toggleAdminSimPanel(true);
            }, 1200); // 1.2초 길게 누르면 비밀 패널 오픈!
        };

        const cancelPress = () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        const onTouchMove = (e) => {
            if (e.touches && e.touches[0]) {
                const dx = Math.abs(e.touches[0].clientX - startX);
                const dy = Math.abs(e.touches[0].clientY - startY);
                if (dx > 10 || dy > 10) cancelPress();
            }
        };

        trigger.addEventListener('touchstart', startPress, { passive: true });
        trigger.addEventListener('touchend', cancelPress, { passive: true });
        trigger.addEventListener('touchcancel', cancelPress, { passive: true });
        trigger.addEventListener('touchmove', onTouchMove, { passive: true });
        trigger.addEventListener('mousedown', startPress);
        trigger.addEventListener('mouseup', cancelPress);
        trigger.addEventListener('mouseleave', cancelPress);
        trigger.addEventListener('dblclick', () => toggleAdminSimPanel(true));

        if (vehiclePlate) {
            vehiclePlate.addEventListener('dblclick', () => toggleAdminSimPanel(true));
        }
    }

    // 패널 열기/닫기
    function toggleAdminSimPanel(show) {
        const panel = document.getElementById('adminSimPanel');
        if (!panel) return;
        if (show === undefined) {
            panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? 'block' : 'none';
        } else {
            panel.style.display = show ? 'block' : 'none';
        }

        if (panel.style.display === 'block') {
            updateSimPanelDisplay();
            panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    // 모의주행 시간표 로드 (근무표 수정 없이 원하는 노선 즉시 로드)
    async function loadSimSchedule() {
        const sel = document.getElementById('simRouteSelect');
        const val = sel ? sel.value : '206_PM_1';
        const parts = val.split('_');
        const route = parts[0] || '206';
        const shift = parts[1] || 'PM';
        const trip = parts[2] || '1';

        // ★ 내 근무 회차: 저장된 근무표 앵커로 표준시간을 계산해서(계산 방식) 모의주행에 사용
        if (val === 'TODAY') {
            const ans = prompt('몇 회차로 시험할까요? (숫자만 입력)', '1');
            if (ans === null) return;
            const prevRound = window.currentTripRoundNumber;
            window.currentTripRoundNumber = `${parseInt(ans, 10) || 1}회차`;
            let d;
            try { d = getTodayDutyInfo(); } finally { window.currentTripRoundNumber = prevRound; }
            if (!d || !d.tripTimes) {
                alert('선택한 날짜에 저장된 근무표에서 그 회차의 시간을 찾지 못했습니다.\n(근무가 등록된 날짜인지, 회차 번호가 맞는지 확인하세요)');
                return;
            }
            const rows = await StdCalc.computeTripRows(d.routeShort, d.baseRoute, d.tripTimes);
            if (!rows) {
                alert('계산 불가: ' + (StdCalc.getLastError() || '앵커/시간을 확인하세요'));
                return;
            }
            window.standardMasterCache = rows;
            window.currentTripMasterCache = rows;
            window.lastPassedStopIndex = null;
            window.simState.currentIndex = 0;
            window.simState.active = true;
            console.log(`🧮 [모의주행-내 근무] ${d.uniqueKey} ${d.routeShort} ${JSON.stringify(d.tripTimes)} → ${rows.length}개 정류장`);
            updateSimPanelDisplay();
            simStepForward(0);
            return;
        }

        const uniqueKey = `${route}${shift}${trip}`;
        const duty = {
            routeNo: route,
            shift: shift,
            tripNo: trip,
            uniqueKey: uniqueKey,
            busNo: '1214'
        };

        const loadBtn = (typeof event !== 'undefined' && event && event.target) ? event.target : null;
        if (loadBtn) loadBtn.innerText = '로드 중...';

        await loadStandardMasterCache(duty);

        if (loadBtn) loadBtn.innerText = '완료!';
        setTimeout(() => { if (loadBtn) loadBtn.innerText = '시간표 로드'; }, 1000);

        window.simState.currentIndex = 0;
        window.simState.active = true;
        updateSimPanelDisplay();

        // 1번 정류장으로 즉시 위치 시뮬레이션
        simStepForward(0);
    }

    // 패널 UI 갱신
    function updateSimPanelDisplay() {
        const master = window.standardMasterCache || [];
        const idxText = document.getElementById('simStopIndexText');
        const nameText = document.getElementById('simStopNameText');
        const timeText = document.getElementById('simStopTimeText');
        const autoBtn = document.getElementById('simAutoPlayBtn');

        const curIdx = window.simState.currentIndex;
        const total = master.length;

        if (idxText) idxText.innerText = total > 0 ? `${curIdx + 1} / ${total}` : '0 / 0';

        if (master.length > 0 && master[curIdx]) {
            const row = master[curIdx];
            const sName = Array.isArray(row) ? row[5] : (row.name || row.stopName || '');
            const sTime = Array.isArray(row) ? row[6] : (row.stdTime || row.time || '');
            if (nameText) nameText.innerText = sName || '정류소 미지정';
            if (timeText) timeText.innerText = sTime || '--:--:--';
        } else {
            if (nameText) nameText.innerText = '시간표를 로드하세요';
            if (timeText) timeText.innerText = '--:--:--';
        }

        if (autoBtn) {
            if (window.simState.autoPlay) {
                autoBtn.innerText = '⏸ 일시정지';
                autoBtn.style.background = '#eab308';
            } else {
                autoBtn.innerText = '▶ 5초 자동 주행';
                autoBtn.style.background = '#16a34a';
            }
        }
    }

    // 다음 정류장으로 전진 (수동 또는 자동)
    function simStepForward(targetIndex) {
        const master = window.standardMasterCache || [];
        if (!master || master.length === 0) {
            alert('먼저 [시간표 로드] 버튼을 눌러 노선 데이터를 불러와 주세요!');
            return;
        }

        window.simState.active = true;

        if (targetIndex !== undefined) {
            window.simState.currentIndex = targetIndex;
        } else {
            if (window.simState.currentIndex < master.length - 1) {
                window.simState.currentIndex++;
            } else {
                window.simState.currentIndex = 0; // 종점 도달 시 1번으로 순환
            }
        }

        const idx = window.simState.currentIndex;
        const row = master[idx];
        const stopLat = parseFloat(row.lat !== undefined ? row.lat : (Array.isArray(row) ? row[8] : 37.4912));
        const stopLng = parseFloat(row.lng !== undefined ? row.lng : (Array.isArray(row) ? row[9] : 126.4952));
        const stdTimeStr = Array.isArray(row) ? row[6] : (row.stdTime || row.time || '');

        updateSimPanelDisplay();

        // 상단 헤더를 모의주행 상태로 변경
        const bisVehicleEl = document.getElementById('bisVehicleNo');
        if (bisVehicleEl) bisVehicleEl.innerText = `인천70아1214 · 🎮 모의주행 (45 km/h)`;
        const gpsStatusText = document.getElementById('gpsStatusText');
        if (gpsStatusText) gpsStatusText.innerText = `모의주행 (${idx + 1}/${master.length})`;

        // 가상 정류장 도달 이벤트 전달
        simTriggerStopArrival(idx, stopLat, stopLng, stdTimeStr);
    }

    // 이전 정류장으로 후진
    function simStepBackward() {
        const master = window.standardMasterCache || [];
        if (!master || master.length === 0) return;
        if (window.simState.currentIndex > 0) {
            window.simState.currentIndex--;
            simStepForward(window.simState.currentIndex);
        }
    }

    // 가상 정류장 도착 처리 및 오차 계산
    function simTriggerStopArrival(idx, lat, lon, stdTimeStr) {
        const master = window.standardMasterCache || [];

        window.curBusGpsLat = lat;
        window.curBusGpsLon = lon;
        window.curBusSpeed = 45;
        window.lastPassedStopIndex = idx;
        window.lastMatchedMasterIndex = idx;

        // 사용자가 설정한 offset(정시/지연/조기) 반영
        let diffSec = window.simState.delayOffsetSec !== undefined ? window.simState.delayOffsetSec : 0;
        let diffMin = Math.round(diffSec / 60);

        const absMin = Math.abs(diffMin);
        let badgeText = absMin === 0 ? "0" : (diffMin > 0 ? `+${absMin}` : `-${absMin}`);
        let badgeColor = delayBadgeColor(diffMin);

        window.bisStopLockState = window.bisStopLockState || {};
        window.bisStopLockState.lockedStopKey = "GPS_SIM_" + idx;
        window.bisStopLockState.lockedDelayText = badgeText;
        window.bisStopLockState.lockedTargetColor = badgeColor;

        applyLockedDelayBadge(badgeText, badgeColor);

        // 3번째 카드(소통 카드) 다음 정류장 표출
        let displayTargetIdx = Math.min(master.length - 1, idx + 1);
        let nextRow = master[displayTargetIdx] || master[0];
        let afterRow = master[displayTargetIdx + 1] || null;

        const getRowName = (r) => r ? String(Array.isArray(r) ? r[5] : (r.name || r.stopName || '')).trim() : '';
        const getRowTime = (r) => r ? String(Array.isArray(r) ? r[6] : (r.stdTime || r.time || '')).trim() : '';

        let nName = nextRow ? getRowName(nextRow) : '다음 정류장';
        let nTime = nextRow ? getRowTime(nextRow) : '--:--:--';
        let aName = afterRow ? getRowName(afterRow) : '(종점 도착)';
        let aTime = afterRow ? getRowTime(afterRow) : '-';
        let curRow = displayTargetIdx > 0 ? masterCache[displayTargetIdx - 1] : null;

        if (typeof updateTrafficStopSequence === 'function') {
            updateTrafficStopSequence(nName, nTime, aName, aTime, undefined, curRow ? getRowName(curRow) : '', curRow ? getRowTime(curRow) : '');
        }

        console.log(`🎮 [모의주행 통과] #${idx + 1} ${getRowName(master[idx])} -> 오차: ${badgeText}분 확정 동결!`);
    }

    // 오차시간 강제 변경 테스트 (0분 정시, -4분 지연 등)
    function simSetDelayOffset(minutes) {
        window.simState.delayOffsetSec = minutes * 60;
        const curIdx = window.simState.currentIndex;
        const master = window.standardMasterCache || [];
        if (master.length > 0) {
            const row = master[curIdx];
            const stdTimeStr = Array.isArray(row) ? row[6] : (row.stdTime || row.time || '');
            simTriggerStopArrival(curIdx, 37.4912, 126.4952, stdTimeStr);
        }
    }

    // 자동 주행 토글 (5초 간격)
    function toggleSimAutoPlay() {
        if (window.simState.autoPlay) {
            window.simState.autoPlay = false;
            if (window.simState.timer) clearInterval(window.simState.timer);
            window.simState.timer = null;
        } else {
            const master = window.standardMasterCache || [];
            if (!master || master.length === 0) {
                alert('먼저 [시간표 로드]를 눌러주세요!');
                return;
            }
            window.simState.autoPlay = true;
            if (window.simState.timer) clearInterval(window.simState.timer);
            window.simState.timer = setInterval(() => {
                simStepForward();
            }, 5000);
        }
        updateSimPanelDisplay();
    }

    // 모의주행 종료 및 실제 GPS 복귀
    function stopAdminSim() {
        if (window.simState.timer) clearInterval(window.simState.timer);
        window.simState.timer = null;
        window.simState.autoPlay = false;
        window.simState.active = false;

        const duty = typeof getTodayDutyInfo === 'function' ? getTodayDutyInfo() : { busNo: '1214' };
        if (typeof startLiveGpsTracking === 'function') {
            startLiveGpsTracking(duty);
        }

        const gpsStatusText = document.getElementById('gpsStatusText');
        if (gpsStatusText) gpsStatusText.innerText = 'GPS 연결됨';

        toggleAdminSimPanel(false);
        alert('모의주행이 종료되었습니다. 실제 스마트폰 GPS 모드로 복귀했습니다.');
    }

    // ⏱️ [보조 주기적 타이머] 회차 전환 및 시퀀스 박스 동기화 (외부 BIS 호출은 중단)
    function startBisTimer(duty) {
        if (window.liveIntervalTimer) clearInterval(window.liveIntervalTimer);

        if (typeof isWithinOperatingHours === 'function' && !isWithinOperatingHours()) {
            return;
        }

        window.liveIntervalTimer = setInterval(() => {
            const currentModal = document.getElementById('liveModal');
            if (!currentModal || currentModal.style.display === 'none' || !currentModal.classList.contains('active')) {
                clearInterval(window.liveIntervalTimer);
                window.liveIntervalTimer = null;
                return;
            }

            // 회차 시퀀스 및 회차 전환 감지
            if (typeof syncSequenceBoxesFromMainSchedule === 'function') {
                syncSequenceBoxesFromMainSchedule();
            }
            const curDuty = typeof getTodayDutyInfo === 'function' ? getTodayDutyInfo() : duty;
            if (curDuty && curDuty.uniqueKey) {
                const simRunning = window.simState && window.simState.active;   // 모의주행 중에는 시험용 시간표를 덮어쓰지 않음
                if (!simRunning && (duty.uniqueKey !== curDuty.uniqueKey || !window.standardMasterCache || window.standardMasterCache.length === 0)) {
                    duty = curDuty;
                    window.lastMatchedMasterIndex = null;
                    window.lastPassedStopIndex = null;
                    if (window.bisStopLockState) window.bisStopLockState.lockedStopKey = null;
                    loadStandardMasterCache(curDuty);
                }
            }
        }, 15000);
    }

    // ⏱️ [오차시간 통합 계산 & 배지 렌더러] (3번째 박스와 100% 동일한 데이터 소스 연동)
    function syncLiveDelayBadgeWithTargetTime(targetTimeStr, stopName) {
        try {
            const badgeEl = document.getElementById('bisDelayBadge');
            if (!badgeEl) return;

            // 🔒 [기사님 지침 100% 준수] 현재 정류장 통과 오차가 이미 고정(Lock)되어 있다면 다음 정류장 도착 전까지 절대 재계산/덮어쓰기 금지!
            if (window.bisStopLockState && window.bisStopLockState.lockedStopKey && window.bisStopLockState.lockedDelayText && window.bisStopLockState.lockedDelayText !== "-") {
                applyLockedDelayBadge(window.bisStopLockState.lockedDelayText, window.bisStopLockState.lockedTargetColor);
                return;
            }

            let cleanTime = String(targetTimeStr || '').replace(/[\[\]]/g, '').trim();
            if (!cleanTime || cleanTime === '-' || cleanTime === '--:--:--' || cleanTime === '--:--') {
                return;
            }

            const now = new Date();
            const currentWallSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
            const standardSec = parseTimeToSeconds(cleanTime);

            if (standardSec <= 0) return;

            let diffSec = currentWallSec - standardSec;
            // 24시간 자정 경계 보정 (예: 23:58 vs 00:02)
            if (diffSec > 43200) diffSec -= 86400;
            else if (diffSec < -43200) diffSec += 86400;

            let diffMin = Math.round(diffSec / 60);

            // 🛡️ 이상치 방어 (60분 초과)
            if (Math.abs(diffMin) > 60) return;

            // ±5분까지 초록, ±6분부터 주황
            let badgeText = diffMin === 0 ? "0" : (diffMin > 0 ? `+${diffMin}` : `-${Math.abs(diffMin)}`);
            let badgeColor = delayBadgeColor(diffMin);

            // 배지 UI 즉시 갱신 (GmarketSans, 고시인성 네온 색상)
            badgeEl.innerText = badgeText;
            badgeEl.style.display = "inline-flex";
            badgeEl.style.alignItems = "center";
            badgeEl.style.justifyContent = "center";
            badgeEl.style.fontFamily = "'GmarketSans', -apple-system, sans-serif";
            badgeEl.style.fontSize = "24px";
            badgeEl.style.fontWeight = "900";
            badgeEl.style.color = badgeColor;
            badgeEl.style.border = `2.5px solid ${badgeColor}`;
            badgeEl.style.background = (badgeColor === "#34c759" || badgeColor === "#00ff66")
                ? "rgba(52, 199, 89, 0.18)"
                : "rgba(245, 158, 11, 0.2)";
            badgeEl.style.boxShadow = `0 0 14px ${badgeColor}66`;

            // 현재 정류장 기준으로 고정 → 다음 정류장 통과(GPS) 전까지 유지
            window.bisStopLockState = window.bisStopLockState || {};
            window.bisStopLockState.lockedStopKey = "TIME_" + (stopName || cleanTime);
            window.bisStopLockState.lockedDelayText = badgeText;
            window.bisStopLockState.lockedTargetColor = badgeColor;
        } catch (err) {
            console.warn("⚠️ [syncLiveDelayBadgeWithTargetTime] 오류:", err);
        }
    }

    // 🚦 신호등 알약 상태 적용: state = 'ok' | 'slow' | 'jam' | 'off'
    function setTrafficLamp(state, label) {
        const flow = document.querySelector('#liveModal .tf-flow');
        const txt = document.getElementById('trafficFlowStatusText');
        if (flow) flow.setAttribute('data-s', state);
        if (txt) txt.innerText = label;
    }

    // 정류장 카드 가운데 속도계: 속도를 모르면 "--"
    function setSpeedDisplay(speedKmh) {
        const el = document.getElementById('tfSpeedNum');
        if (el) el.innerText = (speedKmh === null || speedKmh === undefined || isNaN(speedKmh)) ? '--' : String(speedKmh);
    }

    // 표준시간 표시: 시:분은 크게, 초는 작고 흐리게
    function setStopTimeText(el, timeStr) {
        if (!el) return;
        const m = /^(\d{1,2}:\d{2})(:\d{2})$/.exec(String(timeStr));
        if (m) el.innerHTML = m[1] + '<span class="tf-sec">' + m[2] + '</span>';
        else el.innerText = timeStr;
    }

    // 🚦 [3번째 박스] 도로 소통 및 2연속 정류장 흐름(다음 정류장 ━━━━ 다음다음 정류장) 렌더러
    function updateTrafficStopSequence(nextName, nextTime, afterName, afterTime, statusOverride, curName, curTime) {
        try {
            // 좌측 = 현재 정류장, 우측 = 다음 정류장 (ID는 기존 호환 유지: Next=좌측, After=우측)
            const curEl = document.getElementById('trafficStopNameNext');
            const curTimeEl = document.getElementById('trafficStopTimeNext');
            const nextEl = document.getElementById('trafficStopNameAfter');
            const nextTimeEl = document.getElementById('trafficStopTimeAfter');
            const glowLine = document.getElementById('trafficFlowGlowLine');
            const flowDot = document.getElementById('trafficFlowDot');
            const statusText = document.getElementById('trafficFlowStatusText');

            // 1. 명칭 정제 및 fallback
            let cleanNextName = String(nextName || '').trim();
            if (!cleanNextName || cleanNextName === '-' || cleanNextName === 'null') cleanNextName = "다음 정류장";
            let cleanNextTime = String(nextTime || '').trim();
            if (!cleanNextTime || cleanNextTime === '-' || cleanNextTime === 'null') cleanNextTime = "--:--:--";
            cleanNextTime = cleanNextTime.replace(/\[|\]/g, ''); // 괄호 완벽 제거

            let cleanAfterName = String(afterName || '').trim();
            if (!cleanAfterName || cleanAfterName === '-' || cleanAfterName === 'null') cleanAfterName = "(종점 도착)";
            let cleanAfterTime = String(afterTime || '').trim();
            if (!cleanAfterTime || cleanAfterTime === '-' || cleanAfterTime === 'null') cleanAfterTime = "-";
            cleanAfterTime = cleanAfterTime.replace(/\[|\]/g, ''); // 괄호 완벽 제거

            // 🛡️ [종점 튐 방어] 갱신 시 갑자기 '(종점 도착)'이 들어오려 할 때 직전 정상 다음 정류장 보존
            if (cleanNextName === "(종점 도착)" && window.lastValidNextStop && window.lastValidNextStop.name && window.lastValidNextStop.name !== "(종점 도착)") {
                cleanNextName = window.lastValidNextStop.name;
                cleanNextTime = window.lastValidNextStop.time || cleanNextTime;
            } else if (cleanNextName && cleanNextName !== "(종점 도착)" && cleanNextName !== "다음 정류장") {
                window.lastValidNextStop = { name: cleanNextName, time: cleanNextTime };
            }

            let cleanCurName = String(curName || '').trim();
            if (!cleanCurName || cleanCurName === '-' || cleanCurName === 'null') cleanCurName = "출발 전";
            let cleanCurTime = String(curTime || '').trim().replace(/\[|\]/g, '');
            if (!cleanCurTime || cleanCurTime === '-' || cleanCurTime === 'null') cleanCurTime = "--:--:--";

            if (curEl) {
                curEl.innerText = cleanCurName;
                curEl.title = cleanCurName;
            }
            setStopTimeText(curTimeEl, cleanCurTime);

            if (nextEl) {
                nextEl.innerText = cleanNextName;
                nextEl.title = cleanNextName;
            }
            setStopTimeText(nextTimeEl, cleanNextTime);

            // ⏱️ [오차시간 실시간 동기화] 3번째 박스의 다음 정류장 표준시간으로 오차 배지 즉시 계산!
            // 오차는 '현재 정류장' 기준. 현재 정류장이 없으면(출발 전) 갱신하지 않음
            if (cleanCurTime && cleanCurTime !== '--:--:--' && cleanCurTime !== '-') {
                syncLiveDelayBadgeWithTargetTime(cleanCurTime, cleanCurName);
            }

            // 2. 도로 소통 상태 판별 (원활 / 서행 / 정체)
            let flowStatus = statusOverride;
            if (!flowStatus) {
                flowStatus = determineRoadTrafficStatus(cleanNextName, cleanAfterName);
            }

            // 3. 네온 글로우 라인 색상 및 소통 상태 텍스트 적용
            let themeColor = '#22c55e'; // 소통원활 (에메랄드 그린)
            let glowColor = 'rgba(34, 197, 94, 0.75)';
            let statusLabel = '소통원활';

            if (flowStatus === 'jam' || flowStatus === '정체') {
                themeColor = '#ef4444'; // 정체 (네온 레드)
                glowColor = 'rgba(239, 68, 68, 0.8)';
                statusLabel = '정체';
            } else if (flowStatus === 'slow' || flowStatus === '서행') {
                themeColor = '#f59e0b'; // 서행 (네온 앰버/주황)
                glowColor = 'rgba(245, 158, 11, 0.8)';
                statusLabel = '서행';
            } else {
                themeColor = '#22c55e'; // 소통원활
                glowColor = 'rgba(34, 197, 94, 0.75)';
                statusLabel = '소통원활';
            }

            setTrafficLamp((flowStatus === 'jam' || flowStatus === '정체') ? 'jam' : (flowStatus === 'slow' || flowStatus === '서행') ? 'slow' : 'ok', statusLabel);

            // 이전 호환용 ID 동기화
            const old1 = document.getElementById('trafficStopName1');
            if (old1) old1.innerText = cleanNextName;
            const old2 = document.getElementById('trafficStopName2');
            if (old2) old2.innerText = cleanAfterName;
        } catch (e) {
            console.warn("⚠️ [updateTrafficStopSequence] 렌더링 예외:", e);
        }
    }

    // 🚦 [표준시간 마스터 데이터로부터 3번째 박스 즉시 렌더링 (0ms 빠른 바인딩)]
    function updateTrafficStopFromMaster(masterList) {
        if (!masterList || !Array.isArray(masterList) || masterList.length === 0) return;
        // 모의주행 중에는 현재 시각 기준 자동 표출이 시뮬레이터의 정류장 표시를 덮어쓰지 않도록 건너뜀
        if (window.simState && window.simState.active) return;
        try {
            const now = new Date();
            let curWallSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

            const getRowName = (r) => r ? String(Array.isArray(r) ? r[5] : (r.name || r.stopName || r[5] || '')).trim() : '';
            const getRowTime = (r) => r ? String(Array.isArray(r) ? r[6] : (r.stdTime || r.time || r[6] || '')).trim() : '';

            // 🌙 자정을 넘는 회차: 표준시간이 00:xx 로 되돌아가는 지점부터 하루(86400초)를 더해 이어지게 보정
            const unwrapped = [];
            let dayOffset = 0, prevSec = -1;
            for (let i = 0; i < masterList.length; i++) {
                let sec = parseTimeToSeconds(getRowTime(masterList[i]));
                if (prevSec >= 0 && sec + dayOffset < prevSec - 43200) dayOffset += 86400;
                unwrapped.push(sec + dayOffset);
                prevSec = sec + dayOffset;
            }
            // 회차가 자정을 넘고 현재가 자정 이후(예: 00:30)라면 현재 시각에도 하루를 더해 비교
            if (dayOffset > 0 && unwrapped.length > 0 && curWallSec < unwrapped[0] - 43200) curWallSec += 86400;

            // 현재 시각보다 이후에 있는 첫 정류장 탐색
            let targetIdx = -1;
            for (let i = 0; i < masterList.length; i++) {
                let sSec = unwrapped[i];
                if (sSec > curWallSec) {
                    targetIdx = i;
                    break;
                }
            }
            if (targetIdx === -1) {
                targetIdx = Math.max(0, masterList.length - 2);
            }

            let nextRow = masterList[targetIdx] || masterList[0];
            let afterRow = masterList[targetIdx + 1] || null;

            let nName = nextRow ? (getRowName(nextRow) || '다음 정류장') : '다음 정류장';
            let nTime = nextRow ? (getRowTime(nextRow) || '--:--:--') : '--:--:--';
            let aName = afterRow ? (getRowName(afterRow) || '(종점 도착)') : '(종점 도착)';
            let aTime = afterRow ? (getRowTime(afterRow) || '-') : '-';

            let masterCurRow = targetIdx > 0 ? masterList[targetIdx - 1] : null;
            updateTrafficStopSequence(nName, nTime, aName, aTime, undefined, masterCurRow ? getRowName(masterCurRow) : '', masterCurRow ? getRowTime(masterCurRow) : '');

            // ⏱️ 초기 오차시간 배지 산출 (모달 오픈 즉시 0ms 표시)
            if (!window.bisStopLockState || !window.bisStopLockState.lockedDelayText || window.bisStopLockState.lockedDelayText === "-") {
                let curRow = masterList[Math.max(0, targetIdx - 1)] || masterList[0];
                let curTimeSec = parseTimeToSeconds(getRowTime(curRow));
                if (curTimeSec > 0) {
                    let initDiffSec = curWallSec - curTimeSec;
                    if (initDiffSec > 43200) initDiffSec -= 86400;
                    else if (initDiffSec < -43200) initDiffSec += 86400;
                    let initDiffMin = Math.round(initDiffSec / 60);
                    if (Math.abs(initDiffMin) <= 30) {
                        let badgeText = initDiffMin === 0 ? "0" : (initDiffMin > 0 ? `+${initDiffMin}` : `-${Math.abs(initDiffMin)}`);
                        let badgeColor = delayBadgeColor(initDiffMin);
                        applyLockedDelayBadge(badgeText, badgeColor);
                    }
                }
            }
        } catch (err) {
            console.warn("⚠️ [updateTrafficStopFromMaster] 오류:", err);
        }
    }

    // 🚦 [실시간 도로 소통 상태 판별 엔진]
    function determineRoadTrafficStatus(stopA, stopB) {
        try {
            const items = window.lastTrafficFlowItems;
            if (!items || !Array.isArray(items) || items.length === 0) return 'smooth';

            const combined = `${stopA || ''} ${stopB || ''}`;
            let matchedItem = null;
            for (let it of items) {
                let road = String(it.roadName || it.roadname || it.road || '').trim();
                if (road && combined.includes(road)) {
                    matchedItem = it;
                    break;
                }
            }

            if (!matchedItem && items.length > 0) {
                let totalSpeed = 0, count = 0;
                for (let it of items) {
                    let spd = parseFloat(it.speed || it.prcsSpd || 0);
                    if (spd > 0) { totalSpeed += spd; count++; }
                }
                if (count > 0) {
                    let avg = totalSpeed / count;
                    if (avg < 25) return 'jam';
                    if (avg < 45) return 'slow';
                    return 'smooth';
                }
            }

            if (matchedItem) {
                let spd = parseFloat(matchedItem.speed || matchedItem.prcsSpd || 0);
                if (spd > 0 && spd < 20) return 'jam';
                if (spd > 0 && spd < 40) return 'slow';
            }
        } catch (e) {}
        return 'smooth';
    }

    // 🚨 [돌발상황 다시보기 및 테스트 함수] (소통창 터치 시 발동)
    function triggerTrafficIncidentTest(customText) {
        try {
            const glowLine = document.getElementById('trafficFlowGlowLine');
            const flowDot = document.getElementById('trafficFlowDot');
            const statusText = document.getElementById('trafficFlowStatusText');
            const oldStatusText = statusText ? statusText.innerText : '소통원활';

            // 최근 국토부 돌발상황이 있으면 그것을 표출, 없으면 데모 표출
            let hasRealAlert = window.liveTrafficAlerts && window.liveTrafficAlerts.length > 0;
            let titleText = '⚠️ [돌발상황] 공항신도시JC 사고';
            let descText = '전방 1.2km 지점 2차로 추돌사고 처리 중 (정체)';
            let voiceText = '전방 1킬로미터, 공항신도시 제이씨 부근에 사고 돌발상황이 발생했습니다. 안전운행 하세요.';

            if (typeof customText === 'string' && customText) {
                hasRealAlert = true;
            }
            if (hasRealAlert) {
                let realRaw = (typeof customText === 'string' && customText) ? customText : String(window.liveTrafficAlerts[0] || '');
                titleText = '🚨 실시간 도로 돌발 알림';
                descText = realRaw.replace(/🚨\s*\[돌발\]\s*/, '');
                voiceText = `주의하세요. ${descText}. 안전운행 하세요.`;
            }

            // 1. 신호등을 빨간불(돌발 주의)로 전환
            setTrafficLamp('jam', '돌발 주의');

            // 2. SweetAlert2 알림 팝업
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    toast: true,
                    position: 'top',
                    icon: 'warning',
                    title: titleText,
                    text: descText,
                    showConfirmButton: false,
                    timer: 8000,
                    timerProgressBar: true,
                    background: '#1e293b',
                    color: '#ffffff'
                });
            }

            // 3. 🔊 TTS 음성 안내
            if ('speechSynthesis' in window) {
                try {
                    window.speechSynthesis.cancel();
                    const testMsg = new SpeechSynthesisUtterance(voiceText);
                    testMsg.lang = 'ko-KR';
                    testMsg.rate = 1.0;
                    testMsg.pitch = 1.0;
                    window.speechSynthesis.speak(testMsg);
                } catch(voiceErr) {
                    console.warn("TTS 음성 출력 실패:", voiceErr);
                }
            }

            // 4. 15초 후 자동 복원 (빨간불 깜빡임 유지)
            setTimeout(() => {
                const st = document.getElementById('trafficFlowStatusText');
                if (st && st.innerText === '돌발 주의') setTrafficLamp('ok', oldStatusText);
            }, 15000);

        } catch (err) {
            console.error("돌발상황 안내 에러:", err);
        }
    }

    // [노선 매핑 테이블 - 브라우저 로컬 조회용]
    const CLIENT_ROUTE_MAP = {
        "202": "ICB365000059",
        "202A": "ICB368000006",
        "203": "ICB365000060",
        "203A": "ICB368000056",
        "204": "ICB365000445",
        "205": "ICB368000003",
        "206": "ICB368000041",
        "221": "ICB368000054",
        "281": "ICB368000065",
        "282": "ICB368000066"
    };

    // [실시간 버스 정보 고속 수신 함수 - 현재 GPS 단독 사용으로 완전 차단됨]
    async function fetchLiveBisForLiveModal(routeShort, targetBusNo) {
        return; // GPS 기능과의 충돌을 막기 위해 차단
    }

    function fallbackGasProxyBis(routeShort, targetBusNo) {
        return; // GPS 기능과의 충돌을 막기 위해 차단
    }
