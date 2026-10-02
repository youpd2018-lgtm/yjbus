    // ============================================================================
    // 📊 [통계 및 카드 연동] 1번 카드 데이터 직결 및 월간 통계 합산 함수
    // ============================================================================
    function calculateStats() {
        // ------------------------------------------------------------------------
        // [1. 공통 유틸리티] 안전한 DOM 텍스트 변경 헬퍼 함수
        // ------------------------------------------------------------------------
        function safeSetText(id, text) {
            let el = document.getElementById(id);
            if (el) el.innerText = text;
        }

        // ------------------------------------------------------------------------
        // [2. 특정 카드 UI / 1번 카드 데이터 추출] (1번 카드에서 직접 데이터 받아오기)
        // ------------------------------------------------------------------------
        // 1번 카드의 노선 정보 읽기
        let resRouteEl = document.getElementById('resRoute');
        let currentRouteText = resRouteEl ? resRouteEl.innerText.trim() : '';
        let cleanRouteNum = (currentRouteText.match(/\d+/) || [''])[0];

        // 1번 카드의 오늘 운행 거리 읽기
        let resDistEl = document.getElementById('resWorkDistance');
        let todayDistText = resDistEl ? resDistEl.innerText.replace('km', '').trim() : '0';
        let todayDistNum = parseFloat(todayDistText) || 0;

        // ------------------------------------------------------------------------
        // [3. 데이터 처리 / 월 선택 방어 로직] (월 선택값 없으면 현재 연/월 자동 설정)
        // ------------------------------------------------------------------------
        let selectEl = document.getElementById('statMonthSelect');
        let ym = selectEl ? selectEl.value : '';

        if (!ym) {
            let today = new Date();
            let curY = today.getFullYear();
            let curM = String(today.getMonth() + 1).padStart(2, '0');
            ym = `${curY}-${curM}`;
        }

        let parts = ym.split('-');
        let year = parseInt(parts[0], 10);
        let month = parseInt(parts[1], 10);
        let daysInMonth = new Date(year, month, 0).getDate();

        let normalCount = 0, restCount = 0;
        let weekdayAm = 0, weekdayPm = 0, holidayAm = 0, holidayPm = 0;
        let totalDist = 0, totalSecs = 0;
        let routeMap = {};

        let maxConsecutiveDays = 0;
        let consecutiveCountMap = {};
        let currentStreak = 0;
        let dMaxStreak = 0;

        // ------------------------------------------------------------------------
        // [4. 데이터 처리 / 월간 데이터 순회 집계]
        // ------------------------------------------------------------------------
        for (let day = 1; day <= daysInMonth; day++) {
            let mStr = String(month).padStart(2, '0');
            let dStr = `${year}-${mStr}-${String(day).padStart(2, '0')}`;

            // 기사 키값 안전 조회
            let key = typeof getDriverKey === 'function' ? getDriverKey(`sched_${dStr}`) : `sched_${dStr}`;
            let saved = localStorage.getItem(key);

            if (saved) {
                try {
                    let data = JSON.parse(saved);
                    let workType = data.workType ? String(data.workType).trim() : '';

                    if (workType === '휴무') {
                        restCount++;
                    } else if (workType === '정상' || workType === '대타') {
                        currentStreak++;
                        if (currentStreak > dMaxStreak) dMaxStreak = currentStreak;
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

                        // 노선별 운행 횟수 카운트
                        if (data.route) {
                            let routeNumMatch = data.route.match(/\d+/);
                            let cleanR = routeNumMatch ? routeNumMatch[0] : data.route;
                            routeMap[cleanR] = (routeMap[cleanR] || 0) + 1;
                        }

                        // 거리 및 시간 계산 (customGetItem & calculateWorkSummary 연동)
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
                    }
                } catch (e) {
                    console.error("데이터 파싱 에러:", e);
                }
            }
        }

        // 만약 월간 총 거리가 0으로 나왔는데 오늘 운행 거리가 있다면 오늘 거리를 최소 반영
        if (totalDist === 0 && todayDistNum > 0) {
            totalDist = todayDistNum;
        }

        // ------------------------------------------------------------------------
        // [5. 특정 카드 UI / 3번 카드 주황 버스 박스 연동]
        // ------------------------------------------------------------------------
        if (cleanRouteNum) {
            let count = routeMap[cleanRouteNum] || 1; // 오늘 1번 카드에 노선이 있으면 최소 1회 표시
            safeSetText('resTodayRouteCount', `${cleanRouteNum}·${count}회`);
        } else {
            safeSetText('resTodayRouteCount', '-');
        }

        // ------------------------------------------------------------------------
        // [6. 특정 카드 UI / 2번 카드(발자국) & 3번 카드(월 합산) 데이터 표출]
        // ------------------------------------------------------------------------
        let h = Math.floor(totalSecs / 3600);
        let m = Math.round((totalSecs % 3600) / 60);
        if (m === 60) { h += 1; m = 0; }

        // 2번 카드 아코디언 내용 연동
        safeSetText('footprint-month', `${month}월`);
        safeSetText('footprint-rest-days', `휴무 ${restCount}일`);
        safeSetText('footprint-work-days', `${normalCount}일 근무`);
        safeSetText('footprint-work-detail', `(오전 ${weekdayAm + holidayAm}회 / 오후 ${weekdayPm + holidayPm}회)`);

        // 통계 1단 (나의 발자취) 4박스 연동
        safeSetText('statMyDaysSummary', `${normalCount}일 / ${restCount}일`);
        safeSetText('statMyAmPm', `오전 ${weekdayAm + holidayAm}회 / 오후 ${weekdayPm + holidayPm}회`);

        let sortedRoutesFootprint = Object.entries(routeMap).sort((a, b) => b[1] - a[1]);
        let topRouteText = sortedRoutesFootprint.length > 0 ? `${sortedRoutesFootprint[0][0]}번 (${sortedRoutesFootprint[0][1]}회)` : '-';

        let totalInfoEl = document.getElementById('statMyTotalInfo');
        if (totalInfoEl) {
            totalInfoEl.innerHTML = `${h}시간 ${m}분<br>${totalDist.toFixed(1)}KM`;
        }

        // 3번 카드 아코디언 내용 연동
        safeSetText('stat-month', `${month}월`);
        safeSetText('stat-total-km', totalDist.toFixed(1));
        safeSetText('stat-total-time', `${h}시간 ${m}분`);

        // ------------------------------------------------------------------------
        // [6. 특정 메뉴 전용] 최다 노선 랭킹 & 연속 근무 기록
        // ------------------------------------------------------------------------
        let sortedRoutes = Object.entries(routeMap).sort((a, b) => b[1] - a[1]);
        if (sortedRoutes.length > 0) {
            safeSetText('best-route-1', `🥇 ${sortedRoutes[0][0]}번 (${sortedRoutes[0][1]}회)`);
            let el1 = document.getElementById('best-route-1');
            if (el1) { el1.style.fontSize = '14px'; el1.style.fontWeight = 'bold'; }

            if (sortedRoutes.length > 1) {
                safeSetText('best-route-2', `🥈 ${sortedRoutes[1][0]}번 (${sortedRoutes[1][1]}회)`);
                let el2 = document.getElementById('best-route-2');
                if (el2) { el2.style.fontSize = '12px'; el2.style.fontWeight = 'normal'; }
            } else { safeSetText('best-route-2', ''); }
        } else { safeSetText('best-route-1', '-'); safeSetText('best-route-2', ''); }

        if (maxConsecutiveDays > 0) {
            let countVal = consecutiveCountMap[maxConsecutiveDays] || 1;
            safeSetText('best-start-1', `🔥 ${maxConsecutiveDays}일 연속근무`);
            let sEl1 = document.getElementById('best-start-1');
            if (sEl1) { sEl1.style.fontSize = '14px'; sEl1.style.fontWeight = 'bold'; }

            safeSetText('best-start-2', `(${countVal}회)`);
            let sEl2 = document.getElementById('best-start-2');
            if (sEl2) { sEl2.style.fontSize = '12px'; sEl2.style.fontWeight = 'normal'; }
        } else {
            safeSetText('best-start-1', '기록 없음');
            safeSetText('best-start-2', '');
        }

        // ------------------------------------------------------------------------
        // [7. 백엔드/전체 데이터 비교] 다른 기사님 데이터 집계 및 1등 계산
        // ------------------------------------------------------------------------
        let drivers = getUsersList().filter(u => u.userType !== 'family');
        let bestTimeDriver = { name: currentDriver, secs: totalSecs };
        let bestDistDriver = { name: currentDriver, dist: totalDist };

        drivers.forEach(d => {
            let dName = d.name;
            if (dName === currentDriver) return;

            let dTotalSecs = 0;
            let dTotalDist = 0;
            let currentStreak = 0;
            let dMaxStreak = 0;

            for (let day = 1; day <= daysInMonth; day++) {
                let mStr = String(month).padStart(2, '0');
                let dStr = `${year}-${mStr}-${String(day).padStart(2, '0')}`;
                let saved = localStorage.getItem(`jpil_user_${dName}_sched_${dStr}`);
                if (saved) {
                    let data = JSON.parse(saved);
                    let workType = data.workType ? String(data.workType).trim() : '';
                    if (workType === '정상' || workType === '대타') {
                        currentStreak++;
                        if (currentStreak > dMaxStreak) dMaxStreak = currentStreak;
                        let list = customGetItem(data.route, data.seq);
                        if (list && list.length > 0) {
                            let summary = calculateWorkSummary(list, data.time, data.route, data.seq);
                            if (summary) {
                                dTotalDist += Number(summary.distance) || 0;
                                dTotalSecs += Number(summary.totalSecs) || 0;
                            }
                        }
                    } else if (workType === '휴무' || workType === '휴일' || workType === '연차' || workType === '공가' || workType === '병가') {
                        currentStreak = 0;
                    }
                } else {
                    currentStreak = 0;
                }
            }
            d.maxStreak = dMaxStreak;

            if (dTotalSecs > bestTimeDriver.secs) {
                bestTimeDriver = { name: dName, secs: dTotalSecs };
            }
            if (dTotalDist > bestDistDriver.dist) {
                bestDistDriver = { name: dName, dist: dTotalDist };
            }
        });

        let myCurrentStreak = 0;
        let myMaxStreak = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            let mStr = String(month).padStart(2, '0');
            let dStr = `${year}-${mStr}-${String(day).padStart(2, '0')}`;
            let saved = localStorage.getItem(`jpil_user_${currentDriver}_sched_${dStr}`);
            if (saved) {
                let data = JSON.parse(saved);
                let workType = data.workType ? String(data.workType).trim() : '';
                if (workType === '정상' || workType === '대타') {
                    myCurrentStreak++;
                    if (myCurrentStreak > myMaxStreak) myMaxStreak = myCurrentStreak;
                } else if (workType === '휴무' || workType === '휴일' || workType === '연차' || workType === '공가' || workType === '병가') {
                    myCurrentStreak = 0;
                }
            } else {
                myCurrentStreak = 0;
            }
        }

        let allDriversForStreak = [...drivers, { name: currentDriver, maxStreak: myMaxStreak }];
        let globalMaxStreak = 0;
        allDriversForStreak.forEach(d => {
            if (d.maxStreak > globalMaxStreak) globalMaxStreak = d.maxStreak;
        });

        if (globalMaxStreak > 0) {
            let driversWithMaxStreak = allDriversForStreak.filter(d => d.maxStreak === globalMaxStreak);
            let streakText = "";
            if (driversWithMaxStreak.length === 1) {
                streakText = `${driversWithMaxStreak[0].name} (${globalMaxStreak}일)`;
            } else {
                streakText = `${driversWithMaxStreak[0].name}(${globalMaxStreak}일) 외 ${driversWithMaxStreak.length - 1}명`;
            }
            safeSetText('rankBestStreak', streakText);
        } else {
            safeSetText('rankBestStreak', '기록 없음');
        }

        let topH = Math.floor(bestTimeDriver.secs / 3600);
        let topM = Math.round((bestTimeDriver.secs % 3600) / 60);
        if (topM === 60) { topH += 1; topM = 0; }

        safeSetText('best-end-1', `👑 ${bestTimeDriver.name} (${topH}시간 ${topM}분)`);
        let eEl1 = document.getElementById('best-end-1');
        if (eEl1) { eEl1.style.fontSize = '14px'; eEl1.style.fontWeight = 'bold'; }

        safeSetText('best-end-2', `거리: ${bestDistDriver.name} (${bestDistDriver.dist.toFixed(1)}KM)`);
        let eEl2 = document.getElementById('best-end-2');
        if (eEl2) { eEl2.style.fontSize = '12px'; eEl2.style.fontWeight = 'normal'; }
    }


    let isTimeEditActive = false;

    // 🎨 시간표 색상 팔레트 선택 함수
    function selectPaintColor(color) {
        selectedPaintColor = color;
        const colorButtons = [
            { id: 'btnColorBlack', color: 'black' },
            { id: 'btnColorRed', color: 'red' },
            { id: 'btnColorYellow', color: 'yellow' },
            { id: 'btnColorBlue', color: 'blue' }
        ];
        colorButtons.forEach(btnInfo => {
            const el = document.getElementById(btnInfo.id);
            if (el) {
                if (btnInfo.color === color) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            }
        });
    }

    // ✏️ 시간표 편집 모드 진입
    function enableTimeEditMode() {
        isTimeEditActive = true;

        const editArea = document.getElementById('editModeOnlyArea');
        const enableBtn = document.getElementById('enableEditBtn');
        const saveBtn = document.getElementById('saveEditBtn');
        const cancelBtn = document.getElementById('cancelEditBtn');

        if (editArea) editArea.style.display = 'block';
        if (enableBtn) enableBtn.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'inline-flex';
        if (cancelBtn) cancelBtn.style.display = 'inline-flex';

        if (typeof renderEditableTimetable === 'function') renderEditableTimetable();
    }

    // ❌ 시간표 편집 취소
    function cancelTimeEditMode() {
        isTimeEditActive = false;

        const editArea = document.getElementById('editModeOnlyArea');
        const enableBtn = document.getElementById('enableEditBtn');
        const saveBtn = document.getElementById('saveEditBtn');
        const cancelBtn = document.getElementById('cancelEditBtn');

        if (editArea) editArea.style.display = 'none';
        if (enableBtn) enableBtn.style.display = 'inline-flex';
        if (saveBtn) saveBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';

        if (typeof renderEditableTimetable === 'function') renderEditableTimetable();
    }

    // 🖱️ [핵심] 시간표 셀 클릭 시 시간 수정 & 색상 칠하기 처리
    function handleEditableCellClick(td, rIdx, cIdx) {
        if (!isTimeEditActive) return;
        if (td.querySelector('input')) return; // 이미 입력 중이면 중복 방지

        let routeSelect = document.getElementById('editRouteSelect');
        let seqSelect = document.getElementById('editSeqSelect');
        if (!routeSelect || !seqSelect) return;

        let route = routeSelect.value;
        let seq = seqSelect.value;
        let list = customGetItem(route, seq) || [];
        let row = list[rIdx];
        if (!row) return;

        let currentVal = row[`time${cIdx}`] || '';
        let applyColor = selectedPaintColor || row[`c${cIdx}`] || 'black';

        // 선택된 색상 즉시 반영
        row[`c${cIdx}`] = applyColor;

        // 인라인 입력 필드로 교체
        td.innerHTML = `<input type="text" class="editable-cell-input effect-${applyColor}" value="${currentVal}" style="width: 100%; min-width: 52px; text-align: center; font-weight: bold; font-size: 13px; background: #0f172a; border: 1.5px solid #f97316; border-radius: 4px; padding: 3px 2px; color: inherit;">`;

        const input = td.querySelector('input');
        if (!input) return;

        input.focus();
        input.select();

        let committed = false;
        function commitEdit() {
            if (committed) return;
            committed = true;
            let newVal = input.value.trim();
            row[`time${cIdx}`] = newVal;
            saveEditedTimetableSilently(list);
            td.innerHTML = `<span class="effect-${row[`c${cIdx}`] || 'black'}">${newVal || '-'}</span>`;
        }

        input.addEventListener('blur', commitEdit);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                committed = true;
                td.innerHTML = `<span class="effect-${row[`c${cIdx}`] || 'black'}">${currentVal || '-'}</span>`;
            }
        });
    }

    // 🗑️ 1회차 전용 헤더 취소 함수
    function removeFirstTripHeader() {
        let route = document.getElementById('editRouteSelect')?.value;
        let seq = document.getElementById('editSeqSelect')?.value;
        if (!route || !seq) return;

        let key = `yeongjong_first_header_${route}_${seq}`;
        let currentFirstHeader = getFirstTripHeaderArray(route, seq);
        currentFirstHeader.enabled = false;

        localStorage.setItem(key, JSON.stringify(currentFirstHeader));
        if (typeof saveToGAS === 'function') {
            saveToGAS(key, currentFirstHeader, true);
        }

        alert("1회차 전용 헤더가 비활성화되었습니다.");
        if (typeof renderEditableTimetable === 'function') renderEditableTimetable();
    }

    function renderEditableTimetable() {
        let container = document.getElementById('timeEditContainer');
        let routeSelect = document.getElementById('editRouteSelect');
        let seqSelect = document.getElementById('editSeqSelect');
        if (!container || !routeSelect || !seqSelect) return;

        let route = routeSelect.value;
        let seq = seqSelect.value;
        if (!route) return;

        let list = customGetItem(route, seq) || [];
        let commonHeaders = getHeaderArray(route, seq) || [];
        let firstHeaderInfo = getFirstTripHeaderArray(route, seq) || { enabled: false, headers: [] };

        let html = `<table class="schedule-table" id="editTable"><thead>`;

        // 1. 1회차 헤더가 활성화된 경우
        if (firstHeaderInfo.enabled && firstHeaderInfo.headers && firstHeaderInfo.headers.length > 0) {
            html += `<tr style="background:var(--header-bg); color:var(--primary);"><th>회</th>`;
            firstHeaderInfo.headers.forEach((h, idx) => {
                if (isTimeEditActive) {
                    html += `<th><input type="text" class="editable-cell-input first-header-input" style="font-size:11px;" value="${h || ''}" onchange="updateFirstHeaderName(${idx}, this.value, false)"></th>`;
                } else {
                    html += `<th>${h || '-'}</th>`;
                }
            });
            if (isTimeEditActive) {
                html += `<th>거리(km)</th>`;
            }
            html += `</tr>`;
        }
        // 2. 메인 헤더만 있는 경우
        else {
            html += `<tr style="background:var(--header-bg);"><th>회</th>`;
            commonHeaders.forEach((h, idx) => {
                if (isTimeEditActive) {
                    html += `<th><input type="text" class="editable-cell-input" style="font-size:11px;" value="${h || ''}" onchange="updateCommonHeaderName(${idx}, this.value, false)"></th>`;
                } else {
                    html += `<th>${h || '-'}</th>`;
                }
            });
            if (isTimeEditActive) {
                html += `<th>거리(km)</th>`;
            }
            html += `</tr>`;
        }
        html += `</thead><tbody>`;

        // 3. 본문 데이터 그리기
        list.forEach((r, rIdx) => {
            // 1회차 전용 헤더 사용 시 2회차(rIdx === 1) 상단에 메인 헤더 재출력
            if (rIdx === 1 && firstHeaderInfo.enabled) {
                html += `<tr style="background:var(--header-bg); font-weight:bold;"><th>회</th>`;
                commonHeaders.forEach(h => html += `<th>${h || '-'}</th>`);
                if (isTimeEditActive) {
                    html += `<th>거리(km)</th>`;
                }
                html += `</tr>`;
            }

            html += `<tr><td><strong>${rIdx + 1}</strong></td>`;
            for (let cIdx = 1; cIdx <= commonHeaders.length; cIdx++) {
                let tVal = r[`time${cIdx}`] || '';
                let cVal = r[`c${cIdx}`] || 'black';
                if (isTimeEditActive) {
                    html += `<td onclick="handleEditableCellClick(this, ${rIdx}, ${cIdx})" style="cursor:pointer;"><span class="effect-${cVal}">${tVal || '-'}</span></td>`;
                } else {
                    html += `<td><span class="effect-${cVal}">${tVal || '-'}</span></td>`;
                }
            }

            if (isTimeEditActive) {
                let distVal = r.dist || getDefaultDistanceByRoute(route);
                html += `<td><input type="number" class="editable-cell-input" value="${distVal}" onblur="updateRowDistance(${rIdx}, this.value)"></td>`;
            }
            html += `</tr>`;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;

        if (isTimeEditActive) {
            renderAdminControlInputs(route, seq, commonHeaders, firstHeaderInfo);
        }
    }

    function renderAdminControlInputs(route, seq, commonHeaders, firstHeaderInfo) {
        let commonArea = document.getElementById('commonHeaderInputsArea');
        if (commonArea) {
            commonArea.innerHTML = '';
            commonHeaders.forEach((h, idx) => {
                let div = document.createElement('div');
                div.className = 'header-input-group';
                div.innerHTML = `<span style="font-size:11px; width:45px;">장소${idx + 1}:</span><input type="text" value="${h || ''}" onchange="updateCommonHeaderName(${idx}, this.value, true)">`;
                commonArea.appendChild(div);
            });
        }

        let firstToggleBtn = document.getElementById('toggleFirstTripHeaderBtn');
        let addFirstBtn = document.getElementById('btnAddFirstTripCol');
        let removeFirstBtn = document.getElementById('btnRemoveFirstTripCol');
        let firstInputsArea = document.getElementById('firstTripHeaderInputsArea');

        if (firstHeaderInfo.enabled) {
            if (firstToggleBtn) { firstToggleBtn.innerText = '사용중'; firstToggleBtn.className = 'mini-btn success'; }
            if (addFirstBtn) addFirstBtn.style.display = 'inline-block';
            if (removeFirstBtn) removeFirstBtn.style.display = 'inline-block';
            if (firstInputsArea) {
                firstInputsArea.style.display = 'block';
                firstInputsArea.innerHTML = '';
                (firstHeaderInfo.headers || []).forEach((fh, idx) => {
                    let div = document.createElement('div');
                    div.className = 'header-input-group';
                    div.innerHTML = `<span style="font-size:11px; width:45px;">1회차${idx + 1}:</span><input type="text" value="${fh || ''}" onchange="updateFirstHeaderName(${idx}, this.value, true)">`;
                    firstInputsArea.appendChild(div);
                });
            }
        } else {
            if (firstToggleBtn) { firstToggleBtn.innerText = '사용안함'; firstToggleBtn.className = 'mini-btn'; }
            if (addFirstBtn) addFirstBtn.style.display = 'none';
            if (removeFirstBtn) removeFirstBtn.style.display = 'none';
            if (firstInputsArea) firstInputsArea.style.display = 'none';
        }
    }

    function updateCommonHeaderName(idx, val, shouldReRender = true) {
        let route = document.getElementById('editRouteSelect').value;
        let seq = document.getElementById('editSeqSelect').value;
        let headers = getHeaderArray(route, seq);
        headers[idx] = val;
        localStorage.setItem(`yeongjong_seq_header_${route}_${seq}`, JSON.stringify(headers));

        if (shouldReRender) {
            renderEditableTimetable();
        }
    }

    function updateFirstHeaderName(idx, val, shouldReRender = true) {
        let route = document.getElementById('editRouteSelect').value;
        let seq = document.getElementById('editSeqSelect').value;
        let info = getFirstTripHeaderArray(route, seq);
        info.headers[idx] = val;
        localStorage.setItem(`yeongjong_first_header_${route}_${seq}`, JSON.stringify(info));

        if (shouldReRender) {
            renderEditableTimetable();
        }
    }

    function toggleFirstTripHeaderUse() {
        let route = document.getElementById('editRouteSelect').value;
        let seq = document.getElementById('editSeqSelect').value;
        let info = getFirstTripHeaderArray(route, seq);
        info.enabled = !info.enabled;
        if (info.enabled && (!info.headers || info.headers.length === 0)) {
            info.headers = [...getHeaderArray(route, seq)];
        }
        localStorage.setItem(`yeongjong_first_header_${route}_${seq}`, JSON.stringify(info));
        renderEditableTimetable();
    }

    function addLocationColumn(type) {
        let route = document.getElementById('editRouteSelect').value;
        let seq = document.getElementById('editSeqSelect').value;
        let list = customGetItem(route, seq) || [];

        if (type === 'common') {
            let headers = getHeaderArray(route, seq);
            headers.push("장소");
            localStorage.setItem(`yeongjong_seq_header_${route}_${seq}`, JSON.stringify(headers));
            let newColIdx = headers.length;
            list.forEach(r => {
                r[`time${newColIdx}`] = '';
                r[`c${newColIdx}`] = 'black';
            });
        } else {
            let info = getFirstTripHeaderArray(route, seq);
            if (!info.headers) info.headers = [];
            info.headers.push("제목");
            localStorage.setItem(`yeongjong_first_header_${route}_${seq}`, JSON.stringify(info));
        }
        saveEditedTimetableSilently(list);
        renderEditableTimetable();
    }

    function removeLocationColumn(type) {
        let route = document.getElementById('editRouteSelect').value;
        let seq = document.getElementById('editSeqSelect').value;
        let list = customGetItem(route, seq) || [];

        if (type === 'common') {
            let headers = getHeaderArray(route, seq);
            if (headers.length <= 1) { alert("최소 1개의 장소는 있어야 합니다."); return; }
            let rmIdx = headers.length;
            headers.pop();
            localStorage.setItem(`yeongjong_seq_header_${route}_${seq}`, JSON.stringify(headers));

            list.forEach(r => {
                delete r[`time${rmIdx}`];
                delete r[`c${rmIdx}`];
            });
        } else {
            let info = getFirstTripHeaderArray(route, seq);
            if (!info.headers || info.headers.length <= 1) { alert("최소 1개의 헤더는 있어야 합니다."); return; }
            info.headers.pop();
            localStorage.setItem(`yeongjong_first_header_${route}_${seq}`, JSON.stringify(info));
        }

        saveEditedTimetableSilently(list);
        renderEditableTimetable();
    }

    function addTripRow() {
        let route = document.getElementById('editRouteSelect').value;
        let seq = document.getElementById('editSeqSelect').value;
        let list = customGetItem(route, seq) || [];
        let headers = getHeaderArray(route, seq);

        let newRow = { dist: getDefaultDistanceByRoute(route) };
        for (let i = 1; i <= headers.length; i++) {
            newRow[`time${i}`] = '';
            newRow[`c${i}`] = 'black';
        }
        list.push(newRow);

        saveEditedTimetableSilently(list);
        renderEditableTimetable();
    }

    function removeTripRow() {
        let route = document.getElementById('editRouteSelect').value;
        let seq = document.getElementById('editSeqSelect').value;
        let list = customGetItem(route, seq) || [];
        if (list.length <= 1) { alert("최소 1개의 회차는 유지해야 합니다."); return; }

        list.pop();
        saveEditedTimetableSilently(list);
        renderEditableTimetable();
    }

    function updateRowDistance(rIdx, val) {
        let route = document.getElementById('editRouteSelect').value;
        let seq = document.getElementById('editSeqSelect').value;
        let list = customGetItem(route, seq) || [];
        if (list[rIdx]) {
            list[rIdx].dist = parseFloat(val) || 0;
        }
        saveEditedTimetableSilently(list);
    }

    function saveEditedTimetableSilently(updatedList) {
        let route = document.getElementById('editRouteSelect').value;
        let seq = document.getElementById('editSeqSelect').value;
        let list = updatedList || customGetItem(route, seq);

        // GAS 저장 시 객체 그대로 전달 (내부 처리 방식에 맞게 선택)
        if (typeof saveToGAS === 'function') {
            saveToGAS(`yeongjong_shared_tt_${route}_${seq}`, list, true);
        }
    }

    function saveEditedTimetable() {
        let currentRouteName = document.getElementById('editRouteSelect').value;
        let currentSeq = document.getElementById('editSeqSelect').value;
        let currentList = customGetItem(currentRouteName, currentSeq);

        // 거리(km) 입력창이 활성화되어 있을 경우 최신값 반영
        let distInputs = document.querySelectorAll('#editTable input[type="number"]');
        distInputs.forEach((inp, idx) => {
            if (currentList[idx] && inp.value !== '') {
                currentList[idx].dist = parseFloat(inp.value) || 0;
            }
        });

        // 1. 기존 메인 시간표 및 헤더 저장 (현재 리스트 명시적 전달)
        saveEditedTimetableSilently(currentList);

        // 2. 메인 헤더 다른 노선에 동기화
        if (routeDataMap[currentRouteName] && routeDataMap[currentRouteName].headers) {
            let updatedHeaders = routeDataMap[currentRouteName].headers;
            syncHeadersForSameRouteNumber(currentRouteName, updatedHeaders);
        }

        // 3. 1회차 전용 헤더 변경사항 저장
        let firstHeaderKey = `yeongjong_first_header_${currentRouteName}_${currentSeq}`;
        let currentFirstHeader = getFirstTripHeaderArray(currentRouteName, currentSeq);

        if (currentFirstHeader && currentFirstHeader.enabled) {
            let firstTripInputs = document.querySelectorAll('.first-header-input');
            if (firstTripInputs.length > 0) {
                let newFirstHeaders = [];
                firstTripInputs.forEach(input => {
                    newFirstHeaders.push(input.value.trim());
                });
                currentFirstHeader.headers = newFirstHeaders;

                localStorage.setItem(firstHeaderKey, JSON.stringify(currentFirstHeader));

                if (typeof saveToGAS === 'function') {
                    saveToGAS(firstHeaderKey, currentFirstHeader, true);
                }
            }
        }

        alert("시간표가 정상적으로 저장되었습니다! 🎉");
        if (typeof cancelTimeEditMode === 'function') cancelTimeEditMode();
        if (typeof searchSchedule === 'function') searchSchedule();
    }

    // ==========================================
    // 노선 관리 / 아코디언 관련 기능 (통합)
    // ==========================================

    function toggleRouteEditAccordion() {
        const accordion = document.getElementById('routeAdminAccordion');
        if (!accordion) return;
        if (accordion.style.display === 'none' || !accordion.style.display) {
            accordion.style.display = 'block';
            populateRouteActionSelect();
        } else {
            accordion.style.display = 'none';
        }
    }

    function showAddRouteUi() {
        let ui = document.getElementById('addRouteUi');
        if (ui) ui.style.display = 'flex';
        let input = document.getElementById('newRouteNameInput');
        if (input) input.value = '';
    }

    function hideAddRouteUi() {
        let ui = document.getElementById('addRouteUi');
        if (ui) ui.style.display = 'none';
    }

    function showEditRouteUi() {
        let ui = document.getElementById('editRouteUi');
        if (ui) ui.style.display = 'flex';
        populateRouteActionSelect();
    }

    function populateRouteActionSelect() {
        const select = document.getElementById('routeActionSelect');
        if (!select) return;
        select.innerHTML = '';
        const keys = Object.keys(routeDataMap || {});
        keys.forEach(route => {
            let opt = document.createElement('option');
            opt.value = route;
            opt.innerText = route;
            select.appendChild(opt);
        });
    }

    // 중복 정의 제거 후 단일화된 addNewRoute
    function addNewRoute() {
        let input = document.getElementById('newRouteNameInput');
        let newName = input ? input.value.trim() : '';
        if (!newName) return alert("새 노선명을 입력하세요.");
        if (routeDataMap[newName]) return alert("이미 존재하는 노선명입니다.");

        routeDataMap[newName] = {
            headers: ["차고지", "회차지", "차고지"],
            data: {
                "1순번": [
                    { time1: "06:00", time2: "07:00", time3: "08:00", c1: "black", c2: "black", c3: "yellow", dist: 34 }
                ]
            }
        };

        if (typeof saveSharedRouteData === 'function') saveSharedRouteData();
        alert(`'${newName}' 노선이 추가되었습니다.`);
        if (input) input.value = '';
        hideAddRouteUi();

        if (typeof renderEditRouteOptions === 'function') renderEditRouteOptions();
        if (typeof initRouteDropdowns === 'function') initRouteDropdowns();
        if (typeof refreshAllUI === 'function') refreshAllUI();
    }

    function renameSelectedRoute() {
        let select = document.getElementById('routeActionSelect');
        let input = document.getElementById('editRouteNameInput');
        let target = select ? select.value : '';
        let newName = input ? input.value.trim() : '';

        if (!target || !newName) return alert("변경할 이름을 입력하세요.");
        if (routeDataMap[newName]) return alert("이미 존재하는 노선명입니다.");

        routeDataMap[newName] = JSON.parse(JSON.stringify(routeDataMap[target]));
        delete routeDataMap[target];

        if (typeof saveSharedRouteData === 'function') saveSharedRouteData();
        alert("노선 이름이 수정되었습니다.");
        populateRouteActionSelect();
        if (typeof refreshAllUI === 'function') refreshAllUI();
    }

    function copySelectedRoute() {
        let select = document.getElementById('routeActionSelect');
        let target = select ? select.value : '';
        if (!target) return alert("복사할 노선을 선택하세요.");
        let newName = target + "_복사본";

        routeDataMap[newName] = JSON.parse(JSON.stringify(routeDataMap[target]));
        if (typeof saveSharedRouteData === 'function') saveSharedRouteData();
        alert(`[${target}] 노선이 복사되었습니다.`);
        populateRouteActionSelect();
        if (typeof refreshAllUI === 'function') refreshAllUI();
    }

    function deleteSelectedRoute() {
        let select = document.getElementById('routeActionSelect');
        let target = select ? select.value : '';
        if (!target) return;
        if (Object.keys(routeDataMap).length <= 1) return alert("최소 1개의 노선은 남아있어야 합니다.");

        if (confirm(`정말 [${target}] 노선을 삭제하시겠습니까?`)) {
            delete routeDataMap[target];
            if (typeof saveSharedRouteData === 'function') saveSharedRouteData();
            alert("삭제되었습니다.");
            populateRouteActionSelect();
            if (typeof refreshAllUI === 'function') refreshAllUI();
        }
    }

    function createFirstTripHeader() {
        let route = document.getElementById('editRouteSelect').value;
        let seq = document.getElementById('editSeqSelect').value;
        let key = `yeongjong_first_header_${route}_${seq}`;
        let currentFirstHeader = getFirstTripHeaderArray(route, seq);

        currentFirstHeader.enabled = true;
        if (!currentFirstHeader.headers || currentFirstHeader.headers.length === 0) {
            currentFirstHeader.headers = getHeaderArray(route, seq);
        }

        localStorage.setItem(key, JSON.stringify(currentFirstHeader));
        if (typeof saveToGAS === 'function') {
            saveToGAS(key, currentFirstHeader, true);
        }

        alert("1회차 전용 헤더가 생성되었습니다. (메인 헤더는 2회차 위로 내려갑니다)");
        if (typeof renderEditableTimetable === 'function') renderEditableTimetable();
    }

    function checkAdminRouteEditAuth() {
        let userAdminBtn = document.getElementById('subTabUserAdmin');
        let routeAdminBtn = document.getElementById('subTabRouteAdmin');

        let isUserAdminVisible = userAdminBtn && userAdminBtn.style.display !== 'none';
        let isAdminUser = (typeof currentDriver !== 'undefined' && (currentDriver === ADMIN_DRIVER || currentDriver === '유재필'));

        if (isUserAdminVisible || isAdminUser) {
            if (userAdminBtn) userAdminBtn.style.display = 'inline-block';
            if (routeAdminBtn) routeAdminBtn.style.display = 'inline-block';
        } else {
            if (userAdminBtn) userAdminBtn.style.display = 'none';
            if (routeAdminBtn) routeAdminBtn.style.display = 'none';
        }
    }

    // ==========================================
    // 1. [수정됨] 같은 노선번호 헤더 강력 동기화 로직
    // ==========================================
    function syncHeadersForSameRouteNumber(baseRouteName, newHeaders) {
        let match = baseRouteName.match(/\d+/);
        if (!match) return;
        let routeNumber = match[0]; // 예: "202"

        let keys = Object.keys(routeDataMap);
        let isUpdated = false;

        keys.forEach(key => {
            let keyMatch = key.match(/\d+/);
            // 번호가 같은 노선(예: 202번 평일, 202번 방학)을 모두 찾음
            if (keyMatch && keyMatch[0] === routeNumber) {
                // 1) 화면 데이터 업데이트
                routeDataMap[key].headers = [...newHeaders];

                // 2) 만약 로컬스토리지에 개별 캐시가 있다면 강제로 덮어씌우기 (새로고침 방지)
                // (사용하시는 헤더 캐시 키 이름이 'yeongjong_header_노선명' 형태일 경우 대비)
                let cacheKey = `yeongjong_header_${key}`;
                if (localStorage.getItem(cacheKey)) {
                    localStorage.setItem(cacheKey, JSON.stringify([...newHeaders]));
                }

                isUpdated = true;
            }
        });

        if (isUpdated) {
            // 3) 전체 데이터를 구글 앱스 스크립트 서버로 확실하게 전송
            saveSharedRouteData();
            console.log(`[${routeNumber}]번 관련 노선들의 헤더가 모두 동기화 및 저장되었습니다.`);
        }
    }


    // ==========================================
    // 📝 [Today 메모 Key] 기사별(사용자별) + 날짜별 고유 Key 생성 함수
    // ==========================================
    function getMemoKey() {
        const dateStr = getSelectedDateStr(); // YYYY-MM-DD
        // 기존 getDriverKey 함수가 존재하면 기사ID_memo_YYYY-MM-DD 형태로 Key 생성
        if (typeof getDriverKey === 'function') {
            return getDriverKey(`memo_${dateStr}`);
        }
        return `user_today_memo_${dateStr}`;
    }

    // ==========================================
    // 📝 [Today 메모 1] 선택된 날짜(searchDate) 기반 YYYY-MM-DD 가져오기
    // ==========================================
    function getSelectedDateStr() {
        const searchDateInput = document.getElementById('searchDate');

        if (searchDateInput && searchDateInput.value) {
            return searchDateInput.value; // 예: "2026-08-31"
        }

        // 예외 상황 시 오늘 날짜 반환
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    // ==========================================
    // 📝 [Today 메모 2] 해당 날짜/사용자의 메모를 구글 시트에서 불러오기
    // ==========================================
    function loadTodayMemo() {
        const todayMemoArea = document.getElementById('todayMemo');
        if (!todayMemoArea) return;

        const memoKey = getMemoKey();

        // 구글 앱스 스크립트 실행 환경인 경우
        if (typeof google !== 'undefined' && google.script && google.script.run) {
            // 서버 요청 중 placeholder 안내
            todayMemoArea.placeholder = "☁️ 메모를 불러오는 중입니다...";

            google.script.run
                .withSuccessHandler(function (savedMemo) {
                    todayMemoArea.value = savedMemo || '';
                    todayMemoArea.placeholder = "운행 중 특이사항 등을 메모해 보세요 (☁️ 구글 시트 날짜별 자동 저장)";
                })
                .withFailureHandler(function (err) {
                    console.error("메모 불러오기 실패:", err);
                    todayMemoArea.placeholder = "운행 중 특이사항 등을 메모해 보세요 (☁️ 구글 시트 날짜별 자동 저장)";
                })
                .loadKeyFromServer(memoKey); // Code.gs 의 loadKeyFromServer 호출
        } else {
            // [오프라인/로컬 테스트용 백업]
            const savedMemo = localStorage.getItem(memoKey);
            todayMemoArea.value = savedMemo !== null ? savedMemo : '';
        }
    }

    // 예전 코드 함수명 호환용 (loadDailyMemo나 loadTodayMemoForDate 호출 시)
    function loadDailyMemo() { loadTodayMemo(); }
    function loadTodayMemoForDate() { loadTodayMemo(); }

    // ==========================================
    // 📝 [Today 메모 3] 메모 기능 초기화 및 실시간 자동저장(Debounce 1초) 연결
    // ==========================================
    let memoDebounceTimer = null; // 타자 연타 시 서버 과부하 방지 타이머

    function setupTodayMemoAutoSave() {
        const todayMemoArea = document.getElementById('todayMemo');
        const statusText = document.getElementById('todayMemoSaveStatus');
        if (!todayMemoArea) return;

        // 1. 현재 선택된 날짜의 메모 서버에서 먼저 로드
        loadTodayMemo();

        // 2. 입력 시 디바운스(1초) 적용하여 구글 시트에 자동 저장
        todayMemoArea.oninput = function () {
            const memoKey = getMemoKey();
            const memoText = todayMemoArea.value;

            // 네트워크 단절 등을 대비해 로컬 스토리지에도 임시 백업
            localStorage.setItem(memoKey, memoText);

            // 입력 중 알림 ('⏳ 저장 중...')
            if (statusText) {
                statusText.innerText = "⏳ 저장 중...";
                statusText.style.color = "#d97706";
                statusText.style.opacity = '1';
            }

            // 연속 입력 시 이전 타이머 취소 (타자가 멈춘 후 1초 뒤 서버 저장)
            if (memoDebounceTimer) clearTimeout(memoDebounceTimer);

            memoDebounceTimer = setTimeout(function () {
                if (typeof google !== 'undefined' && google.script && google.script.run) {
                    google.script.run
                        .withSuccessHandler(function () {
                            if (statusText) {
                                statusText.innerText = "💾 자동 저장됨";
                                statusText.style.color = "#16a34a";
                                setTimeout(function () { statusText.style.opacity = '0'; }, 1500);
                            }
                        })
                        .withFailureHandler(function (err) {
                            console.error("메모 저장 실패:", err);
                            if (statusText) {
                                statusText.innerText = "❌ 저장 실패";
                                statusText.style.color = "#dc2626";
                            }
                        })
                        .saveToServer(memoKey, memoText); // Code.gs 의 saveToServer 호출
                } else {
                    // 로컬 테스트 환경
                    if (statusText) {
                        statusText.innerText = "💾 로컬 저장됨";
                        statusText.style.color = "#16a34a";
                        setTimeout(function () { statusText.style.opacity = '0'; }, 1500);
                    }
                }
            }, 1000); // 1초 대기
        };
    }

    // 기존 함수명 호환용
    function initTodayMemoWithDate() { setupTodayMemoAutoSave(); }

    // ==========================================
    // 🔄 [날짜 선택기] 날짜 변경 감지 및 연쇄 실행 함수
    // ==========================================
    function onDateInputChange() {
        // 1. 선택된 날짜의 근무 일정 조회 및 카드 UI 갱신
        if (typeof searchSchedule === 'function') {
            searchSchedule();
        }

        // 2. 월간 통계 데이터 재계산 및 2/3번 카드 통계 주입
        if (typeof calculateStats === 'function') {
            calculateStats();
        }

        // 3. 📝 선택된 날짜가 변경되었으므로 해당 날짜의 Today 메모로 즉시 전환
        loadTodayMemo();
    }

    // ==========================================
    // 🔑 [초기 구동] 페이지 시작 시 자동 로그인 및 화면 동기화
    // ==========================================
    window.addEventListener('DOMContentLoaded', function () {
        if (typeof loadAppLogo === 'function') loadAppLogo();
        if (typeof setupTodayMemoAutoSave === 'function') setupTodayMemoAutoSave();

        // 1. 날짜 입력창에 오늘 날짜 우선 강제 주입
        let searchDateEl = document.getElementById('searchDate');
        if (searchDateEl && !searchDateEl.value) {
            let now = new Date();
            let y = now.getFullYear();
            let m = String(now.getMonth() + 1).padStart(2, '0');
            let d = String(now.getDate()).padStart(2, '0');
            searchDateEl.value = `${y}-${m}-${d}`;
        }

        // 주소 뒤에 ?logout=1 을 붙여 열면 로그인 정보를 지우고 대문으로 (가족 사용자 테스트용 강제 로그아웃)
        if (/[?&]logout=1/.test(location.search)) {
            ['autoLoginPin', 'loggedInUser', 'yeongjong_logged_user'].forEach(k => localStorage.removeItem(k));
            try { history.replaceState(null, '', location.pathname); } catch (e) { }
        }

        // 2. 저장된 기사 정보 확인 후 자동 로그인 진행
        const savedUserJson = localStorage.getItem('yeongjong_logged_user');
        const savedUserName = localStorage.getItem('loggedInUser');

        if (savedUserJson) {
            try {
                const userObj = JSON.parse(savedUserJson);
                if (typeof isValidLoginUser === 'function' && !isValidLoginUser(userObj)) throw new Error('예전 4자리 기사 정보: 다시 가입 필요');
                selectDriver(userObj);
                const header = document.querySelector('.header') || document.getElementById('mainAppHeader');
                if (header) header.style.display = 'flex';
                // 💡 [핵심] 로그인 직후 근무표 및 메모 화면 즉각 렌더링
                if (typeof searchSchedule === 'function') searchSchedule();
                if (typeof loadTodayMemo === 'function') setTimeout(loadTodayMemo, 100);
                return;
            } catch (e) {
                console.error("세션 복원 실패:", e);
                ['autoLoginPin', 'loggedInUser', 'yeongjong_logged_user'].forEach(k => localStorage.removeItem(k));
            }
        }

        if (savedUserName) {
            const users = getUsersList();
            const found = users.find(u => u.name === savedUserName);
            if (found && typeof isValidLoginUser === 'function' && !isValidLoginUser(found)) {
                ['autoLoginPin', 'loggedInUser', 'yeongjong_logged_user'].forEach(k => localStorage.removeItem(k));
            } else if (found) {
                selectDriver(found);
                const header = document.querySelector('.header') || document.getElementById('mainAppHeader');
                if (header) header.style.display = 'flex';
                if (typeof searchSchedule === 'function') searchSchedule();
                if (typeof loadTodayMemo === 'function') setTimeout(loadTodayMemo, 100);
                return;
            }
        }
    });

    // ==========================================
    // 💡 [로고 로드 전용 함수]
    // ==========================================
    function loadAppLogo() {
        if (typeof google !== 'undefined' && google.script && google.script.run) {
            google.script.run
                .withSuccessHandler(function (dbData) {
                    if (dbData && dbData.logoUrl) {
                        const logoImg = document.querySelector('.header-logo-icon');
                        if (logoImg) {
                            logoImg.src = dbData.logoUrl;
                            logoImg.style.display = 'inline-block'; // 숨김 해제하여 표시
                        }
                        const gateLogoImg = document.querySelector('.gateway-logo-icon');
                        if (gateLogoImg) {
                            gateLogoImg.src = dbData.logoUrl;
                        }
                    }
                })
                .loadFromServer();
        }
    }

    // ==========================================
    // 2. '다음 단계 ▶' 버튼 클릭 시 실행
    // ==========================================
    function handleGatewayNext(isAutoLogin = false) {
        const pinInput = document.getElementById('gatewayPinInput');
        const inputPin = pinInput ? pinInput.value.trim() : '';

        if (!/^(\d{4}|\d{6})$/.test(inputPin)) {
            if (!isAutoLogin) alert('기사님은 기사번호 6자리, 가족은 비밀번호 4자리를 정확히 입력해주세요.');
            return;
        }

        localStorage.setItem('autoLoginPin', inputPin);

        const userArea = document.getElementById('gatewayUserSelectionArea');
        if (userArea) userArea.style.display = 'block';

        // 서버가 기사번호(비밀번호)를 확인해 일치하는 사용자만 돌려준다 (다른 사람 번호는 오지 않음)
        const listDiv = document.getElementById('userSelectList');
        if (listDiv) listDiv.innerHTML = '<div style="color:#94a3b8; font-weight:bold; padding:12px; text-align:center;">확인하는 중...</div>';

        if (typeof google !== 'undefined' && google.script && google.script.run) {
            google.script.run
                .withSuccessHandler(function (res) {
                    if (res && res.success === false) {
                        if (listDiv) listDiv.innerHTML = '<div style="color:#ef4444; font-weight:bold; padding:12px; text-align:center;">' + (res.message || '확인하지 못했습니다. 다시 시도해 주세요.') + '</div>';
                        return;
                    }
                    renderUserListFromDB(res && res.data, inputPin);
                })
                .withFailureHandler(function (err) {
                    console.warn("loginByPin error:", err);
                    if (listDiv) listDiv.innerHTML = '<div style="color:#ef4444; font-weight:bold; padding:12px; text-align:center;">서버에 연결하지 못했습니다. 인터넷을 확인해 주세요.</div>';
                })
                .loginByPin(inputPin);
        } else {
            renderUserListFromDB(null, inputPin);
        }
    }

    // ==========================================
    // 3. 기사님 / 가족 사용자 목록 화면 생성
    // ==========================================
    function renderUserListFromDB(dbData, inputPin) {
        const listDiv = document.getElementById('userSelectList');
        if (!listDiv) return;

        listDiv.innerHTML = '';
        let matchedNames = [];

        // 서버에서 받은 최신 사용자 목록(없으면 이 기기에 저장된 목록)에서만 찾는다
        let users = typeof getUsersList === 'function' ? getUsersList() : [];
        if (dbData && dbData['yeongjong_users_db']) {
            try {
                let raw = dbData['yeongjong_users_db'];
                let parsed = (typeof raw === 'string') ? JSON.parse(raw) : raw;
                if (Array.isArray(parsed)) users = parsed;
            } catch (e) { }
        }

        // 기사님 = 기사번호 6자리, 가족 = 비밀번호 4자리 (예전 4자리 기사 정보는 로그인 불가 → 다시 가입)
        users.forEach(item => {
            if (!item || String(item.pin).trim() !== inputPin || !item.name) return;
            if (item.userType === 'family') {
                if (inputPin.length === 4) matchedNames.push(item.name);
            } else if (inputPin.length === 6 && /^\d{6}$/.test(String(item.pin).trim())) {
                matchedNames.push(item.name);
            }
        });

        matchedNames = Array.from(new Set(matchedNames));

        if (matchedNames.length === 0) {
            let msg = inputPin.length === 4
                ? '일치하는 가족 사용자가 없습니다.<br><span style="font-size:12px; color:#fbbf24;">기사님은 기사번호 6자리로 로그인합니다. 예전에 등록하셨다면 아래 [기사님 가입]에서 다시 가입해주세요.</span>'
                : '입력하신 기사번호와 일치하는 기사님이 없습니다.<br><span style="font-size:12px; color:#fbbf24;">아직 가입 전이면 아래 [기사님 가입]에서 가입해주세요.</span>';
            listDiv.innerHTML = '<div style="color:#ef4444; font-weight:bold; padding:12px; text-align:center;">' + msg + '</div>';
            return;
        }

        matchedNames.forEach(function (userName) {
            let allUsers = typeof getUsersList === 'function' ? getUsersList() : [];
            let userObj = allUsers.find(u => u && u.name === userName);
            let isFamily = (userName === '위에') || (userObj && userObj.userType === 'family');

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = "width:100%; max-width:240px; height:50px; font-size:18px; font-weight:900; background:#2563eb; color:#ffffff; border:none; border-radius:12px; margin:8px auto 0 auto; display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer; box-shadow:0 4px 12px rgba(37,99,235,0.4);";
            btn.textContent = isFamily ? (userName + '로 시작') : (userName + ' 기사님으로 시작');

            btn.onclick = function () {
                selectUser(userName, false);
            };

            listDiv.appendChild(btn);
        });
    }

    // ==========================================
    // 💡 한국 시간 기준 YYYY-MM-DD 및 요어 구하기
    // ==========================================
    function getTodayString() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const dayName = days[today.getDay()];

        return {
            isoDate: `${year}-${month}-${day}`,               // 예: 2026-08-28
            displayText: `${year}. ${month}. ${day} (${dayName})` // 예: 2026. 08. 28 (금)
        };
    }

    // ==========================================
    // 💡 [날짜 선택기 1] 초기화 함수
    // - 웹 앱 시작 시 오늘 날짜(YYYY-MM-DD)를 입력하고 첫 스케줄 조회를 실행
    // ==========================================
    function initDateNavigator() {
        const todayInfo = getTodayString();
        const searchDateInput = document.getElementById('searchDate');
        const dateDisplayText = document.getElementById('dateDisplayText');

        // 1. 숨겨진 <input type="date">에 오늘 날짜 설정 (YYYY-MM-DD)
        if (searchDateInput) {
            searchDateInput.value = todayInfo.isoDate;
        }

        // 2. 화면에 보이는 날짜 텍스트 변경
        if (dateDisplayText) {
            dateDisplayText.textContent = todayInfo.displayText;
        }

        // 3. 날짜 변경 감지 함수 연쇄 실행
        if (typeof onDateInputChange === 'function') {
            onDateInputChange();
        }
    }

    // ==========================================
    // ◀️▶️ [날짜 선택기 2] 이전 / 다음 버튼 클릭 처리 함수
    // - HTML의 <button onclick="changeDate(-1)">이전</button>
    // - HTML의 <button onclick="changeDate(1)">다음</button> 과 직접 연동
    // ==========================================
    function changeDate(daysToAdd) {
        const dateInput = document.getElementById('searchDate');
        if (!dateInput || !dateInput.value) return;

        // 현재 선택된 날짜에서 daysToAdd 만큼 날짜 이동 (+1일 또는 -1일)
        const currentDate = new Date(dateInput.value);
        currentDate.setDate(currentDate.getDate() + daysToAdd);

        // YYYY-MM-DD 포맷 변환
        const y = currentDate.getFullYear();
        const m = String(currentDate.getMonth() + 1).padStart(2, '0');
        const d = String(currentDate.getDate()).padStart(2, '0');

        dateInput.value = `${y}-${m}-${d}`;

        // 날짜가 변경되었으므로 스케줄 재조회 실행
        onDateInputChange();
    }

    // ==========================================
    // 🔄 [날짜 선택기 3] 날짜 변경 감지 및 연쇄 실행 함수
    // - 달력(<input type="date">)에서 날짜를 직접 선택하거나 버튼을 누르면 호출됨
    // ==========================================
    function onDateInputChange() {
        // 1. 선택된 날짜의 근무 일정 조회 및 카드 UI 갱신
        if (typeof searchSchedule === 'function') {
            searchSchedule();
        }

        // 2. 월간 통계 데이터 재계산 및 2/3번 카드 통계 주입
        if (typeof calculateStats === 'function') {
            calculateStats();
        }
    }

    // ==========================================
    // 메인 진입 및 3초 로딩 배너 처리
    // ==========================================
    function selectUser(userName, isAutoSilent = false) {
        window.currentDriver = userName;
        currentDriver = userName;
        localStorage.setItem('loggedInUser', userName);

        let allUsers = typeof getUsersList === 'function' ? getUsersList() : [];
        let userObj = allUsers.find(u => u && u.name === userName);
        if (!userObj && userName === '위에') {
            userObj = { name: '위에', userType: 'family', targetDriver: '유재필' };
        }
        let isFamily = (userName === '위에') || (userObj && userObj.userType === 'family');
        // 서버 요청에 붙일 로그인 정보 저장 (서버가 이름+번호를 확인함)
        if (userObj && userObj.pin) { try { localStorage.setItem('yeongjong_logged_user', JSON.stringify(userObj)); } catch (e) { } }

        // 1) 로그인 대문 페이지 숨기기
        const gatewayPage = document.getElementById('gatewayPage');
        if (gatewayPage) {
            gatewayPage.style.display = 'none';
            gatewayPage.classList.remove('active');
        }

        // 💡 로그인 성공 시 상단 헤더 표시
        const header = document.querySelector('.header') || document.getElementById('mainAppHeader');
        if (header) header.style.display = 'flex';

        // 2) 탭 메뉴 및 메인 운행정보 페이지 표시
        const navTabs = document.getElementById('appNavTabs');
        if (navTabs) navTabs.style.display = 'flex';

        // 🎙️ 로그인 후 마이크 위젯 노출 (가족 사용자는 숨김)
        const voiceWidget = document.getElementById('floatingVoiceWidget');
        if (voiceWidget) voiceWidget.style.display = isFamily ? 'none' : 'flex';

        let mainPage = document.getElementById('mainPage') || document.getElementById('schedulePage');
        if (mainPage) {
            mainPage.style.display = 'block';
            mainPage.classList.add('active');
        }

        // 3) 상단 사용자 이름 표시 및 메뉴 권한 제어
        const driverDisplay = document.getElementById('currentDriverDisplay');
        const headerTitle = document.getElementById('headerTitleText');
        const tabSettings = document.getElementById('tabSettings');
        const tabRouteConfig = document.getElementById('tabRouteConfig');
        const tabEmergency = document.getElementById('tabEmergency');
        if (tabEmergency) tabEmergency.style.display = isFamily ? 'none' : 'flex';

        if (isFamily) {
            isFamilyUser = true;
            targetDriverName = (userObj && userObj.targetDriver) ? userObj.targetDriver : '유재필';
            if (driverDisplay) driverDisplay.textContent = `${userName} (가족: ${targetDriverName} 기사님)`;
            if (headerTitle) headerTitle.textContent = `${targetDriverName} 기사님 근무표`;
            if (tabSettings) tabSettings.style.display = 'none';
            if (tabRouteConfig) tabRouteConfig.style.display = 'none';
        } else {
            isFamilyUser = false;
            targetDriverName = userName;
            if (driverDisplay) driverDisplay.textContent = userName;
            if (headerTitle) headerTitle.textContent = userName + ' 기사님 근무표';
            if (tabSettings) tabSettings.style.display = 'flex';
            if (tabRouteConfig) {
                tabRouteConfig.style.display = userName.includes('유재필') ? 'flex' : 'none';
            }
        }

        // 💡 화면 꺼짐 방지 및 앱 동기화 가동
        if (typeof requestWakeLock === 'function') requestWakeLock();
        if (typeof startSessionKeepAlive === 'function') startSessionKeepAlive();
        if (typeof loadSharedRouteData === 'function') loadSharedRouteData();
        if (typeof refreshAllUI === 'function') refreshAllUI();
        if (typeof searchSchedule === 'function') searchSchedule();
        if (typeof loadScheduleForEdit === 'function') loadScheduleForEdit();
        if (typeof loadTodayMemo === 'function') setTimeout(loadTodayMemo, 150);

        // 4) 3초 로딩 배너 연출과 함께 날짜 조회 실행
        runAppWith3SecLoader(isFamily ? targetDriverName : userName);
    }

    // ==========================================
    // 💡 3초 로딩 오버레이 & 데이터 연동
    // ==========================================
    function runAppWith3SecLoader(userName) {
        showScheduleLoader(); // 로딩 오버레이 표시
        const startTime = Date.now();

        if (typeof google !== 'undefined' && google.script && google.script.run) {
            google.script.run
                .withSuccessHandler(function (dbData) {
                    // 구글 시트 기본 데이터 전달
                    if (typeof loadMainSchedule === 'function') {
                        loadMainSchedule(userName, dbData);
                    } else if (typeof initApp === 'function') {
                        initApp(userName, dbData);
                    }

                    // 💡 날짜 선택기에 오늘 날짜 세팅 및 onDateInputChange() 호출
                    setTimeout(function () {
                        initDateNavigator();
                    }, 200);

                    // 3초 로딩 시간 유지 후 닫기
                    const elapsedTime = Date.now() - startTime;
                    const remainingTime = Math.max(0, 3000 - elapsedTime);

                    setTimeout(function () {
                        hideScheduleLoader();
                    }, remainingTime);
                })
                .withFailureHandler(function () {
                    initDateNavigator();
                    setTimeout(hideScheduleLoader, 1000);
                })
                .loadFromServer();
        } else {
            initDateNavigator();
            setTimeout(hideScheduleLoader, 3000);
        }
    }

    // ==========================================
    // 로딩 배너 제어
    // ==========================================
    function showScheduleLoader() {
        const overlay = document.getElementById('scheduleLoadingOverlay');
        if (overlay) overlay.style.display = 'flex';
    }

    function hideScheduleLoader() {
        const overlay = document.getElementById('scheduleLoadingOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    // ==========================================
    // 🔌 [로그아웃] 연두색 전원 버튼 클릭 시 실행
    // - 저장된 세션, 화면 꺼짐 방지, 세션 유지 타이머를 모두 안전하게 해제하고 대문으로 복귀합니다.
    // ==========================================
    function logoutDriver() {
        if (confirm("로그아웃 하시겠습니까?\n(자동 로그인 정보가 삭제되고 대문 페이지로 이동합니다.)")) {
            // 1. 브라우저 세션 정보 완전 삭제
            localStorage.removeItem('autoLoginPin');
            localStorage.removeItem('loggedInUser');
            localStorage.removeItem('yeongjong_logged_user');
            window.currentDriver = null;
            currentDriver = null;

            // 2. 백그라운드 기능 정리 (화면꺼짐 방지 해제, 핑 정지)
            releaseWakeLock();
            if (keepAliveTimer) {
                clearInterval(keepAliveTimer);
                keepAliveTimer = null;
            }
            if (window.liveIntervalTimer) {
                clearInterval(window.liveIntervalTimer);
                window.liveIntervalTimer = null;
            }

            // 3. 메인 화면 및 네비게이션 탭 숨기기
            const mainPage = document.getElementById('mainPage') || document.getElementById('schedulePage') || document.getElementById('mainAppContainer');
            if (mainPage) {
                mainPage.style.display = 'none';
                mainPage.classList.remove('active');
            }

            const navTabs = document.getElementById('appNavTabs');
            if (navTabs) navTabs.style.display = 'none';

            // 근무정보·설정 등 열려 있던 모든 페이지를 닫음 (대문 아래에 딸려오지 않도록)
            document.querySelectorAll('.page').forEach(p => { if (p.id !== 'gatewayPage') p.classList.remove('active'); });

            // 4. 대문(게이트웨이) 페이지 활성화
            const gatewayPage = document.getElementById('gatewayPage');
            if (gatewayPage) {
                gatewayPage.style.display = 'block';
                gatewayPage.classList.add('active');
            }

            // 🎙️ 대문화면 복귀(로그아웃) 시 마이크 숨김
            const voiceWidget = document.getElementById('floatingVoiceWidget');
            if (voiceWidget) voiceWidget.style.display = 'none';

            // 💡 로그아웃 시 상단 헤더 숨김
            const header = document.querySelector('.header') || document.getElementById('mainAppHeader');
            if (header) header.style.display = 'none';

            // 5. 헤더 타이틀을 대문 타이틀로 복원
            const headerTitle = document.getElementById('headerTitleText');
            if (headerTitle) headerTitle.textContent = '영종운수 스마트근무표';

            // 6. PIN 입력창 초기화 및 상단 이동
            const pinInput = document.getElementById('gatewayPinInput');
            if (pinInput) pinInput.value = '';
            initGateway();
            window.scrollTo(0, 0);
        }
    }

    // ============================================================================
    // 📅 [공통 유틸] 월 선택 초기화 방어 함수 (initMonthSelect 에러 해결)
    // ============================================================================
    function initMonthSelect() {
        let selectEl = document.getElementById('statMonthSelect');
        if (!selectEl) return;

        // 이미 옵션이 들어있다면 기본값만 설정
        if (selectEl.options && selectEl.options.length > 0) return;

        // 기본 현재 연월(YYYY-MM) 옵션 생성
        let today = new Date();
        let curY = today.getFullYear();
        let curM = String(today.getMonth() + 1).padStart(2, '0');
        let currentYM = `${curY}-${curM}`;

        let option = document.createElement('option');
        option.value = currentYM;
        option.innerText = `${curM}월`;
        option.selected = true;
        selectEl.appendChild(option);
    }
