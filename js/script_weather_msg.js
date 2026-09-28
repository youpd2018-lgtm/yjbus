// ================================================================
// 📢 [오늘의 한마디] 메시지 포맷터 (로딩 인디케이터 & 기사/가족 색상 분기)
// ================================================================
// ================================================================
// 🔔 맑고 고급스러운 "띵-동" (E5 -> C5) 알림음 (Web Audio API, 0ms 무지연)
// ================================================================
let lastPlayedAlertText = "";
function playChimeDingDong() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;

    // 1st Tone (E5 = 659.25Hz) - "띵"
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.28, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.55);

    // 2nd Tone (C5 = 523.25Hz) - "동" (0.18초 뒤)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(523.25, now + 0.18);
    gain2.gain.setValueAtTime(0.30, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.95);
  } catch(e) {
    console.warn("오디오 알림 재생 생략:", e);
  }
}

// ================================================================
// 📢 [오늘의 한마디 & 돌발 속보] 메시지 포맷터
// - 🚨 돌발속보: 노란색 (#fde047) + 경고 아이콘
// - 💬 기사메시지: 흰색 (#ffffff)
// - 💖 가족메시지: 연한 녹색 (#86efac)
// ================================================================
function formatMessageDisplay(rawText) {
  if (!rawText) return '';
  let text = String(rawText);

  // 🌟 [로딩 인디케이터]
  if (text === '__LOADING_INDICATOR__' || text.includes('오늘의 한마디 로딩 중')) {
    return `
      <span style="display: inline-flex; align-items: center; gap: 6px; color: #94a3b8;">
        <iconify-icon icon="line-md:loading-loop" style="color: #38bdf8; font-size: 18px; flex-shrink: 0;"></iconify-icon>
        <span style="font-size: 14.5px; font-weight: 500; color: #94a3b8;">오늘의 한마디 로딩 중...</span>
      </span>
    `;
  }

  // 🚨 [실시간 돌발 속보]: 노란색 굵은 글씨 + 뱃지
  if (text.startsWith('__INCIDENT__') || text.startsWith('🚨') || text.includes('[돌발]') || text.includes('[사고]') || text.includes('[공사]') || text.includes('[통제]')) {
    let cleanText = text.replace('__INCIDENT__', '').trim();
    return `
      <span style="display: inline-flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">
        <iconify-icon icon="solar:danger-triangle-bold" style="font-size: 18px; color: #facc15 !important; vertical-align: -2px; margin-right: 5px; flex-shrink: 0; filter: drop-shadow(0 0 6px rgba(250,204,21,0.5));"></iconify-icon>
        <span style="color: #facc15 !important; font-weight: 800 !important; font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: -0.2px;">${cleanText}</span>
      </span>
    `;
  }

  // HTML 태그 잔여물 세척
  if (text.includes('<')) {
    let tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    text = tempDiv.textContent || tempDiv.innerText || text;
  }
  text = text.trim();

  let msg = text;
  let sender = "";

  let match = text.match(/^\[(.*?)\]\s*(.*?)(?:\s*🚌)?$/);
  if (match) {
    sender = match[1];
    msg = match[2];
  } else {
    let match2 = text.match(/^(.*?)\s*\[(.*?)\]$/);
    if (match2) {
      msg = match2[1];
      sender = match2[2];
    }
  }

  if (!sender) sender = "동료기사";

  // 가족 여부 판별 (기사: #ffffff 흰색, 가족: #86efac 연한 녹색)
  const isFamily = sender.includes('가족') || msg.includes('가족') || text.includes('가족');
  const themeColor = isFamily ? '#86efac' : '#ffffff';
  
  // 기사와 가족 모두 동일한 기사 이모지 사용
  const iconName = 'solar:user-speak-rounded-bold';

  const iconHtml = `<iconify-icon icon="${iconName}" style="font-size: 19px; color: ${themeColor} !important; vertical-align: -3px; margin-right: 5px; flex-shrink: 0;"></iconify-icon>`;

  return `
    <span style="display: flex; align-items: flex-start; max-width: 100%;">
      ${iconHtml}
      <span style="display: flex; flex-wrap: wrap; align-items: baseline; word-break: keep-all; line-height: 1.4;">
        <span style="color: ${themeColor} !important; font-weight: 600 !important; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; white-space: normal;">${msg}</span>
        <span style="font-size: 13.5px; color: #94a3b8 !important; margin-left: 6px; white-space: nowrap;">[${sender}]</span>
      </span>
    </span>
  `;
}

// ================================================================
// 📢 [스마트 통합 티커] 오늘의 한마디 + 돌발/소통 정보 통합 회전 렌더러
// - 돌발/소통: 최초 수신 시 5초 × 3회 우선 출력 → 이후 순환 합류
// - 돌발/소통: 발생일 기준 24시간 경과 시 자동 만료
// ================================================================
let currentMsgRotationList = [];
let currentMsgRotationIndex = 0;
let msgRotationTimer = null;
window._trafficAlertMeta = window._trafficAlertMeta || []; // {text, receivedAt}
window._priorityQueue   = window._priorityQueue   || []; // 우선 재생 대기 큐

// ── 라벨 동적 업데이트 ──────────────────────────────────────────
function _updateTickerLabel(isAlert) {
  var label = document.getElementById('smartTickerLabel');
  if (!label) return;
  if (isAlert) {
    label.innerHTML = '<iconify-icon icon="solar:danger-triangle-bold" style="font-size:13px;color:#facc15;"></iconify-icon> <span style="color:#facc15;font-weight:800;">교통 속보</span>';
  } else {
    label.innerHTML = '<iconify-icon icon="solar:chat-round-dots-bold" style="font-size:13px;color:#38bdf8;"></iconify-icon> <span style="color:#64748b;">오늘의 한마디</span>';
  }
}

// ── 페이드 전환 출력 ─────────────────────────────────────────────
function _setLiveTicker(html, isAlert) {
  var el = document.getElementById('liveColleagueMessage');
  if (!el) return;
  el.classList.add('fade-out');
  setTimeout(function() {
    el.innerHTML = html;
    _updateTickerLabel(isAlert);
    el.classList.remove('fade-out');
    el.classList.add('fade-in');
    void el.offsetWidth;
    el.classList.remove('fade-in');
  }, 420);
}

// ── 24시간 만료 필터 ─────────────────────────────────────────────
function _cleanExpiredTraffic() {
  var now = Date.now();
  window._trafficAlertMeta = (window._trafficAlertMeta || []).filter(function(m) {
    return (now - m.receivedAt) < 86400000;
  });
  window.liveTrafficAlerts = window._trafficAlertMeta.map(function(m) { return m.text; });
}

// ── 통합 리스트 빌드 (교통 경보 앞에, 한마디 뒤에) ──────────────
function _buildUnifiedList(collegeMsgs) {
  _cleanExpiredTraffic();
  var valid = (collegeMsgs || []).filter(function(m) {
    return m && m.trim() && m !== '__LOADING_INDICATOR__';
  });
  if (valid.length === 0) valid.push('안전운행 하시고 오늘도 좋은 하루 되세요! [영종운수]');
  return (window.liveTrafficAlerts || []).concat(valid);
}

// ── 단일 메시지 즉시 출력 ────────────────────────────────────────
function _showUnifiedMsg(idx) {
  var list = currentMsgRotationList;
  if (!list || list.length === 0) return;
  var msg = list[idx % list.length] || '';
  var isAlert = msg.startsWith('🚨') || msg.includes('[돌발]') || msg.includes('[사고]') || msg.includes('[공사]') || msg.includes('[통제]');
  if (isAlert && msg !== window.lastPlayedAlertText) {
    window.lastPlayedAlertText = msg;
    if (typeof playChimeDingDong === 'function') playChimeDingDong();
  }
  var html = isAlert ? _formatAlert(msg) : formatMessageDisplay(msg);
  _setLiveTicker(html, isAlert);
}

// ── 알림 전용 포맷터 (노란색 굵은 텍스트) ────────────────────────
function _formatAlert(msg) {
  return '<span style="display:flex;align-items:flex-start;max-width:100%;">'
    + '<iconify-icon icon="solar:danger-triangle-bold" style="font-size:19px;color:#facc15!important;vertical-align:-3px;margin-right:5px;flex-shrink:0;"></iconify-icon>'
    + '<span style="color:#facc15!important;font-weight:800!important;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-0.2px;">' + msg + '</span>'
    + '</span>';
}

// ── 우선 큐 처리: 새 알림 5초 × 3회 우선 출력 후 정상 순환 복귀 ─
function _runPriorityQueue(baseMsgs) {
  if (msgRotationTimer) { clearTimeout(msgRotationTimer); clearInterval(msgRotationTimer); msgRotationTimer = null; }
  var queue = (window._priorityQueue || []).slice();
  window._priorityQueue = [];
  var steps = [];
  queue.forEach(function(item) {
    for (var i = 0; i < 3; i++) steps.push(item.text);
  });
  var stepIdx = 0;
  function showNext() {
    if (stepIdx >= steps.length) {
      currentMsgRotationList = _buildUnifiedList(baseMsgs);
      currentMsgRotationIndex = 0;
      _showUnifiedMsg(0);
      msgRotationTimer = setInterval(function() {
        currentMsgRotationIndex = (currentMsgRotationIndex + 1) % currentMsgRotationList.length;
        _showUnifiedMsg(currentMsgRotationIndex);
      }, 5000);
      return;
    }
    var msg = steps[stepIdx++];
    if (msg !== window.lastPlayedAlertText) {
      window.lastPlayedAlertText = msg;
      if (typeof playChimeDingDong === 'function') playChimeDingDong();
    }
    _setLiveTicker(_formatAlert(msg), true);
    msgRotationTimer = setTimeout(showNext, 5000);
  }
  showNext();
}

// ── 메인 렌더러 ──────────────────────────────────────────────────
function renderMessages(msgsArray) {
  if (msgRotationTimer) { clearTimeout(msgRotationTimer); clearInterval(msgRotationTimer); msgRotationTimer = null; }
  var validMsgs = Array.isArray(msgsArray) ? msgsArray.filter(function(m) { return m && String(m).trim(); }) : [];
  if (window._priorityQueue && window._priorityQueue.length > 0) {
    _runPriorityQueue(validMsgs);
    return;
  }
  currentMsgRotationList = _buildUnifiedList(validMsgs);
  currentMsgRotationIndex = 0;
  _showUnifiedMsg(0);
  msgRotationTimer = setInterval(function() {
    currentMsgRotationIndex = (currentMsgRotationIndex + 1) % currentMsgRotationList.length;
    _showUnifiedMsg(currentMsgRotationIndex);
  }, 5000);
}
// ================================================================
// 🚦 [3번째 박스] 실시간 도로 소통 & 3연속 정류장 흐름 UI 제어기
// ================================================================
function updateTrafficStopSequence(stop1, time1, stop2, time2, stop3, time3, flow1, flow2) {
  const name1El = document.getElementById('trafficStopName1');
  const time1El = document.getElementById('trafficStopTime1');
  const line1El = document.getElementById('trafficFlowLine1');

  const name2El = document.getElementById('trafficStopName2');
  const time2El = document.getElementById('trafficStopTime2');
  const line2El = document.getElementById('trafficFlowLine2');

  const name3El = document.getElementById('trafficStopName3');
  const time3El = document.getElementById('trafficStopTime3');

  if (name1El) name1El.innerText = stop1 || '현재 정류장';
  if (time1El) time1El.innerText = (time1 && time1 !== '--:--:--' && time1 !== '-') ? `[${time1}]` : '[--:--:--]';

  if (name2El) name2El.innerText = stop2 || '다음 정류장';
  if (time2El) time2El.innerText = (time2 && time2 !== '--:--:--' && time2 !== '-') ? `[${time2}]` : '[--:--:--]';

  if (name3El) name3El.innerText = stop3 || '다음다음';
  if (time3El) time3El.innerText = (time3 && time3 !== '--:--:--' && time3 !== '-') ? `[${time3}]` : '[--:--:--]';

  // 구간별 소통 라인 색상 (원활: #22c55e, 서행: #eab308, 정체: #ef4444)
  function setLineFlowStyle(lineEl, status) {
    if (!lineEl) return;
    if (status === 'JAM') {
      lineEl.style.background = '#ef4444';
      lineEl.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.8)';
    } else if (status === 'SLOW') {
      lineEl.style.background = '#eab308';
      lineEl.style.boxShadow = '0 0 8px rgba(234, 179, 8, 0.7)';
    } else {
      lineEl.style.background = '#22c55e';
      lineEl.style.boxShadow = '0 0 8px rgba(34, 197, 94, 0.6)';
    }
  }

  const status1 = flow1 || (window.currentFlowStatus && window.currentFlowStatus.seg1) || 'NORMAL';
  const status2 = flow2 || (window.currentFlowStatus && window.currentFlowStatus.seg2) || 'NORMAL';

  setLineFlowStyle(line1El, status1);
  setLineFlowStyle(line2El, status2);
}

// ================================================================
// 🛰️ [국토교통부 ITS] 실시간 돌발상황 및 도로소통 수신 모듈
// ================================================================
window.liveTrafficAlerts = [];
window.currentFlowStatus = { seg1: 'NORMAL', seg2: 'NORMAL' };

// 두 좌표 간 거리 계산 (km)
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c * 10) / 10;
}

// 실시간 돌발상황 및 소통 데이터 로더 (2분 주기 자동 갱신)

// ================================================================
// 🛰️ [국토교통부 ITS] 실시간 돌발상황 수신 모듈
// ================================================================
window.liveTrafficAlerts = [];
window.currentFlowStatus = { seg1: 'NORMAL', seg2: 'NORMAL' };

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon/2) * Math.sin(dLon/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c * 10) / 10;
}

function loadLiveTrafficData() {
  var busLat = window.curBusGpsLat || 37.495;
  var busLon = window.curBusGpsLon || 126.502;
  if (typeof google !== 'undefined' && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(function(res) {
        if (res && res.success && Array.isArray(res.incidents)) {
          processIncidentsList(res.incidents, busLat, busLon);
        }
      })
      .withFailureHandler(function(err) {
        console.warn('GAS 돌발상황 수신 지연:', err);
        fallbackDirectFetch(busLat, busLon);
      })
      .getTrafficIncidentLive();
  } else {
    fallbackDirectFetch(busLat, busLon);
  }
}

function processIncidentsList(incidents, busLat, busLon) {
  if (!Array.isArray(incidents) || incidents.length === 0) return;
  var now = Date.now();
  var existingTexts = {};
  (window._trafficAlertMeta || []).forEach(function(m) { existingTexts[m.text] = true; });
  var newAlerts = [];
  incidents.slice(0, 5).forEach(function(item) {
    var cx = parseFloat(item.coordX);
    var cy = parseFloat(item.coordY);
    var distStr = '';
    if (!isNaN(cx) && !isNaN(cy) && busLat && busLon) {
      var dist = calculateDistanceKm(busLat, busLon, cy, cx);
      if (dist !== null) distStr = ' (' + dist + 'km 전방)';
    }
    var road = String(item.roadName || '주요도로').trim();
    var msg  = String(item.message || item.eventDetailType || '돌발상황 발생').trim();
    var alertText = '🚨 [돌발] ' + road + ' ' + msg + distStr;
    if (!existingTexts[alertText]) {
      newAlerts.push(alertText);
      window._trafficAlertMeta = window._trafficAlertMeta || [];
      window._trafficAlertMeta.push({ text: alertText, receivedAt: now });
    }
  });
  _cleanExpiredTraffic();
  if (newAlerts.length > 0) {
    window._priorityQueue = window._priorityQueue || [];
    newAlerts.forEach(function(t) { window._priorityQueue.push({ text: t }); });
  }
  var baseMsgs = (currentMsgRotationList || []).filter(function(m) {
    return m && !m.startsWith('🚨') && !m.includes('[돌발]');
  });
  renderMessages(baseMsgs.length > 0 ? baseMsgs : []);
}

function fallbackDirectFetch(busLat, busLon) {
  if (!window.GAS_WEB_APP_URL) return;
  fetch(window.GAS_WEB_APP_URL + '?action=get_traffic_incident')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.success && Array.isArray(data.incidents)) {
        processIncidentsList(data.incidents, busLat, busLon);
      }
    })
    .catch(function(err) { console.warn('GAS 프록시 돌발 조회 실패:', err); });
}

// 2분마다 자동 갱신
setInterval(loadLiveTrafficData, 120000);
setTimeout(loadLiveTrafficData, 1500);

function openWriteMessagePrompt() {
  const isFamily = (typeof isFamilyUser !== 'undefined' && isFamilyUser);
  const currentName = (typeof currentDriver !== 'undefined' && currentDriver) 
                        ? currentDriver 
                        : (window.currentDriver || "동료기사");
                        
  // 작성자 자동 매칭 (수정 불필요)
  const autoSender = isFamily 
    ? `${currentName} (가족)` 
    : (currentName === "동료기사" ? "동료기사" : `${currentName} 기사`);
    
  const defaultPlaceholder = isFamily 
    ? "예: 오늘도 안전운행 하시고 조심히 들어오세요~❤️" 
    : "예: 안전운행 하시고 오늘도 다들 화이팅입니다!";

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: isFamily ? '💖 가족 응원의 한마디' : '📢 오늘의 한마디 작성',
      html: `
        <div style="text-align: left; font-size: 13.5px; color: #94a3b8; margin-bottom: 6px; font-weight: 500;">응원 메시지</div>
        <input id="swal-input-msg" class="swal2-input" style="margin: 0; width: 85%; font-size: 15px;" placeholder="${defaultPlaceholder}">
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: '남기기',
      cancelButtonText: '취소',
      confirmButtonColor: isFamily ? '#f59e0b' : '#38bdf8',
      background: '#1e293b',
      color: '#fff',
      didOpen: () => {
        const inputEl = document.getElementById('swal-input-msg');
        if (inputEl) inputEl.focus();
      },
      preConfirm: () => {
        const msgVal = document.getElementById('swal-input-msg').value.trim();
        if (!msgVal) {
          Swal.showValidationMessage('메시지 내용을 입력해주세요!');
          return false;
        }
        return { sender: autoSender, msg: msgVal };
      }
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        processNewMessage(result.value.msg, result.value.sender);
      }
    });
  } else {
    // Swal 부재 시 브라우저 기본 prompt (작성자 질의 생략)
    const msg = prompt("동료 기사님들께 전할 응원의 한마디를 남겨주세요:\n(" + defaultPlaceholder + ")");
    if (msg && msg.trim()) {
      processNewMessage(msg.trim(), autoSender);
    }
  }
}

// ================================================================
// 📢 [메시지 저장 처리] (최대 10개 유지)
// ================================================================
function processNewMessage(cleanMsg, customSender) {
  const sender = customSender || window.currentDriver || "동료기사";
  const newRawText = `${cleanMsg} [${sender}]`;

  let currentMsgs = [];
  const existingData = localStorage.getItem('latest_colleague_msg');
  if (existingData) {
    try {
      const parsed = JSON.parse(existingData);
      if (Array.isArray(parsed)) currentMsgs = parsed;
      else currentMsgs = [existingData];
    } catch (e) {
      currentMsgs = [existingData];
    }
  }

  currentMsgs.unshift(newRawText);
  if (currentMsgs.length > 10) {
    currentMsgs = currentMsgs.slice(0, 10);
  }

  const saveString = JSON.stringify(currentMsgs);
  renderMessages(currentMsgs);
  localStorage.setItem('latest_colleague_msg', saveString);

  if (typeof google !== 'undefined' && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(() => console.log("✅ 오늘의 한마디 구글시트 저장 완료"))
      .withFailureHandler(err => console.warn("한마디 저장 지연:", err))
      .saveToServer('latest_colleague_msg', saveString);
  }
}

// ================================================================
// 📢 [메시지 불러오기] (로컬 즉시 표출 ➔ 서버 동기화 2단계 파이프라인)