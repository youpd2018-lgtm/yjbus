// ================================================================
// 🎙️ [Gemini AI 실시간 핸즈프리 음성 비서]
// - 상시 플로팅 마이크 위젯 제어, 경쾌한 대답 신호음, Web Speech STT, 100% 여성 TTS 음성 발화
// ================================================================
let voiceRecognition = null;
let isVoiceActive = false;
let isVoiceListening = false;
let isVoiceSpeaking = false;
let wasVoiceWidgetDragged = false;
let voiceAudioCtx = null;

// 🎵 [경쾌한 대답 신호음 생성기]
function playVoiceChime(type) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!voiceAudioCtx) voiceAudioCtx = new AudioContext();
    if (voiceAudioCtx.state === 'suspended') {
      voiceAudioCtx.resume();
    }

    const now = voiceAudioCtx.currentTime;

    if (type === 'start') {
      // 🎶 듣기 시작 신호음: 맑고 경쾌한 딩동! (D5 -> A5)
      const osc1 = voiceAudioCtx.createOscillator();
      const gain = voiceAudioCtx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      osc1.connect(gain);
      gain.connect(voiceAudioCtx.destination);

      osc1.start(now);
      osc1.stop(now + 0.32);
    } else if (type === 'finish') {
      // ✨ 질문 접수 완료음: 경쾌한 띠링~ (A5 -> D6)
      const osc = voiceAudioCtx.createOscillator();
      const gain = voiceAudioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.1);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

      osc.connect(gain);
      gain.connect(voiceAudioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.24);
    }
  } catch (err) {
    console.warn("신호음 재생 중 오류:", err);
  }
}

// 🎙️ 모바일 WebKit 호환성을 위한 신선한 SpeechRecognition 생성 헬퍼
function createFreshRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  try {
    const rec = new SpeechRecognition();
    rec.lang = 'ko-KR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = function () {
      isVoiceListening = true;
      updateVoiceWidgetState('listening');
      playVoiceChime('start');
    };

    rec.onend = function () {
      isVoiceListening = false;
      const widget = document.getElementById('floatingVoiceWidget');
      const isBusy = widget && (widget.classList.contains('thinking') || widget.classList.contains('speaking'));

      // 🌟 [대화 지속 유지] 대화 모드가 켜져 있고 AI가 답변 중이 아니라면 끊김 없이 계속 듣기 유지!
      if (isVoiceActive && !isBusy) {
        clearTimeout(window._voiceLoopTimer);
        window._voiceLoopTimer = setTimeout(() => {
          if (isVoiceActive) startVoiceListeningLoop();
        }, 250);
      } else if (!isVoiceActive) {
        updateVoiceWidgetState('idle');
      }
    };

    rec.onerror = function (event) {
      console.warn("음성 인식 이벤트:", event.error);
      isVoiceListening = false;

      if (event.error === 'not-allowed') {
        stopVoiceAssistant();
        updateVoiceWidgetState('idle', '마이크 권한 필요');
        speakVoiceAnswer("마이크 사용 권한을 허용해 주세요.");
        return;
      }

      // no-speech 등 브라우저 일시 중단 시에도 대화 모드 중이면 자동 재청취 지속!
      if (isVoiceActive) {
        const widget = document.getElementById('floatingVoiceWidget');
        const isBusy = widget && (widget.classList.contains('thinking') || widget.classList.contains('speaking'));
        if (!isBusy) {
          clearTimeout(window._voiceLoopTimer);
          window._voiceLoopTimer = setTimeout(() => {
            if (isVoiceActive) startVoiceListeningLoop();
          }, 350);
        }
      } else {
        updateVoiceWidgetState('idle');
      }
    };

    rec.onresult = function (event) {
      isVoiceListening = false;
      try { rec.stop(); } catch (e) {}

      if (!event.results || event.results.length === 0) return;
      const queryText = event.results[0][0].transcript.trim();
      if (!queryText) return;

      playVoiceChime('finish');
      updateVoiceWidgetState('thinking');

      const contextText = buildVoiceAssistantContext(queryText);

      if (typeof google !== 'undefined' && google.script && google.script.run) {
        window.geminiChatHistory = window.geminiChatHistory || [];
        
        google.script.run
          .withSuccessHandler(function (responseAnswer) {
            window.geminiChatHistory.push({ role: 'user', text: queryText });
            window.geminiChatHistory.push({ role: 'model', text: responseAnswer || "말씀하신 내용을 확인하지 못했어요." });
            if (window.geminiChatHistory.length > 6) {
               window.geminiChatHistory = window.geminiChatHistory.slice(window.geminiChatHistory.length - 6);
            }
            speakVoiceAnswer(responseAnswer || "말씀하신 내용을 확인하지 못했어요. 다음 질문이 있으신가요?");
          })
          .withFailureHandler(function (err) {
            console.error("Gemini 호출 실패:", err);
            speakVoiceAnswer("잠시 통신에 문제가 생겼어요. 다시 말씀해 주세요.");
          })
          .askGeminiVoiceAssistant(queryText, contextText, window.geminiChatHistory);
      } else {
        speakVoiceAnswer("서버에 연결할 수 없습니다.");
      }
    };

    return rec;
  } catch (err) {
    console.error("SpeechRecognition 생성 실패:", err);
    return null;
  }
}

// 🎨 위젯 상태 시각화 갱신 함수 (preparing / listening / thinking / speaking / idle)
function updateVoiceWidgetState(state, customText) {
  const widget = document.getElementById('floatingVoiceWidget');
  const icon = document.getElementById('voiceMicIcon');
  const aura = document.getElementById('voiceAuraOverlay');
  const statusText = document.getElementById('voiceStatusText');
  if (!widget) return;

  widget.classList.remove('preparing', 'listening', 'thinking', 'speaking');
  
  if (state === 'preparing') {
    widget.classList.add('preparing');
    if (icon) icon.setAttribute('icon', 'solar:refresh-circle-bold');
    if (aura) aura.classList.add('active');
    if (statusText) statusText.textContent = "마이크 연결 중...";
  } else if (state === 'listening') {
    widget.classList.add('listening');
    if (icon) icon.setAttribute('icon', 'solar:record-circle-bold');
    if (aura) aura.classList.add('active');
    if (statusText) statusText.textContent = "지금 말씀하세요!";
  } else if (state === 'thinking') {
    widget.classList.add('thinking');
    if (icon) icon.setAttribute('icon', 'solar:atom-bold-duotone');
    if (aura) aura.classList.add('active');
    if (statusText) statusText.textContent = "AI 생각 중...";
  } else if (state === 'speaking') {
    widget.classList.add('speaking');
    if (icon) icon.setAttribute('icon', 'solar:volume-loud-bold-duotone');
    if (aura) aura.classList.remove('active');
    if (statusText) statusText.textContent = "안내 중 (터치 시 정지)";
  } else {
    if (icon) icon.setAttribute('icon', 'solar:microphone-bold-duotone');
    if (aura) aura.classList.remove('active');
    if (statusText) statusText.textContent = customText || "말씀하세요...";
  }
}

// 🛡️ 마이크 차단(not-allowed) 발생 시 친절하게 음성 안내
function handleVoiceNotAllowedError() {
  updateVoiceWidgetState('idle', '마이크 권한 필요');
  speakVoiceAnswer("마이크 사용 권한을 허용해 주세요.");
}

// 🎙️ [마이크 버튼 터치 토글 이벤트 핸들러]
function toggleVoiceAssistant(e) {
  if (e) {
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
  }

  // 드래그 직후 발생한 클릭 이벤트는 무시
  if (wasVoiceWidgetDragged) {
    wasVoiceWidgetDragged = false;
    return;
  }

  // 🌟 [핵심] 사용자가 마이크를 다시 누르면 -> 대화 모드 및 녹음 완전 종료!
  if (isVoiceActive) {
    stopVoiceAssistant();
    return;
  }

  // 브라우저 음성인식 지원 여부 검사
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("현재 브라우저는 음성 인식을 지원하지 않습니다.\n기본 브라우저(크롬, 사파리, 삼성인터넷)로 접속해 주세요.");
    return;
  }

  // 오디오 및 TTS 사전 언락
  unlockAudioAndTTS();

  // 🚀 대화 모드 시작!
  isVoiceActive = true;
  startVoiceListeningLoop();
}

// 🎧 [음성 인식 반복 청취 루프 시작]
function startVoiceListeningLoop() {
  if (!isVoiceActive) return;

  const widget = document.getElementById('floatingVoiceWidget');
  if (widget && (widget.classList.contains('thinking') || widget.classList.contains('speaking'))) {
    return;
  }

  updateVoiceWidgetState('preparing');

  if (voiceRecognition) {
    try { voiceRecognition.abort(); } catch (err) {}
  }

  voiceRecognition = createFreshRecognition();
  if (!voiceRecognition) {
    isVoiceActive = false;
    updateVoiceWidgetState('idle');
    handleVoiceNotAllowedError();
    return;
  }

  try {
    voiceRecognition.start();
  } catch (err) {
    console.warn("음성인식 start 오류:", err);
    try {
      voiceRecognition.abort();
      setTimeout(() => {
        if (isVoiceActive) {
          voiceRecognition = createFreshRecognition();
          if (voiceRecognition) voiceRecognition.start();
        }
      }, 150);
    } catch (e2) {
      if (!isVoiceActive) updateVoiceWidgetState('idle');
    }
  }
}

// 🛑 [마이크 재터치 시 대화 및 녹음 완전 종료]
function stopVoiceAssistant() {
  isVoiceActive = false;
  isVoiceListening = false;
  isVoiceSpeaking = false;
  clearTimeout(window._voiceLoopTimer);

  if (voiceRecognition) {
    try { voiceRecognition.abort(); } catch (e) {}
  }
  if (window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }
  const fallbackPlayer = document.getElementById('voiceFallbackAudio');
  if (fallbackPlayer) {
    try { fallbackPlayer.pause(); fallbackPlayer.currentTime = 0; } catch (e) {}
  }

  updateVoiceWidgetState('idle');
  const ansTitle = document.querySelector('.voice-answer-title');
  if (ansTitle) {
    ansTitle.innerHTML = '<iconify-icon icon="solar:check-circle-bold"></iconify-icon> AI 비서 (대화 종료)';
  }
}

// 🔊 [오디오 사전 언락 헬퍼] 모바일 브라우저의 비동기 TTS 자동재생 차단 방지
let isVoiceAudioUnlocked = false;
function unlockAudioAndTTS() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext && !voiceAudioCtx) voiceAudioCtx = new AudioContext();
    if (voiceAudioCtx && voiceAudioCtx.state === 'suspended') voiceAudioCtx.resume();

    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
      const silent = new SpeechSynthesisUtterance(' ');
      silent.volume = 0.01;
      silent.rate = 10;
      window.speechSynthesis.speak(silent);
    }

    const fallbackAudio = document.getElementById('voiceFallbackAudio');
    if (fallbackAudio) {
      fallbackAudio.play().then(() => {
        fallbackAudio.pause();
        fallbackAudio.currentTime = 0;
      }).catch(() => {});
    }

    isVoiceAudioUnlocked = true;
  } catch (e) {
    console.warn("오디오 언락 처리:", e);
  }
}

// 🔄 [음성 발화 완료 후 처리] 대화 모드가 켜져 있으면 자동으로 다음 질문을 계속 듣습니다.
function handleVoiceSpeechComplete() {
  isVoiceSpeaking = false;
  if (isVoiceActive) {
    updateVoiceWidgetState('listening');
    clearTimeout(window._voiceLoopTimer);
    window._voiceLoopTimer = setTimeout(() => {
      if (isVoiceActive) startVoiceListeningLoop();
    }, 350);
  } else {
    updateVoiceWidgetState('idle');
  }
}

// 🔊 [100% 음성 안내] 친절하고 또렷한 한국어 음성(TTS + 오디오 폴백) 발화
function speakVoiceAnswer(text) {
  if (!text) {
    handleVoiceSpeechComplete();
    return;
  }
  text = String(text).replace(/[\*\_#`~\[\]\(\)\{\}<>]/g, "").replace(/\s+/g, " ").trim();
  if (!text) {
    handleVoiceSpeechComplete();
    return;
  }

  // 1️⃣ 즉시 완료 신호음(딩동) 재생
  playVoiceChime('finish');
  updateVoiceWidgetState('speaking');
  isVoiceSpeaking = true;

  let hasSpoken = false;

  // 2️⃣ 브라우저 내장 Web SpeechSynthesis 엔진 시도
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.resume();
      window.speechSynthesis.cancel();

      // 크롬 Issue 637825 데드락 방지용 80ms 지연
      setTimeout(() => {
        try {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'ko-KR';
          utterance.pitch = 1.05;
          utterance.rate = 1.02;
          utterance.volume = 1.0;

          const voices = window.speechSynthesis.getVoices();
          if (voices && voices.length > 0) {
            const femaleVoice = voices.find(v =>
              v.lang.startsWith('ko') && (
                v.name.includes('Yuna') ||
                v.name.includes('Google 한국의') ||
                v.name.includes('Heami') ||
                v.name.includes('Female') ||
                v.name.includes('여성')
              )
            ) || voices.find(v => v.lang.startsWith('ko'));
            if (femaleVoice) utterance.voice = femaleVoice;
          }

          utterance.onstart = function () {
            hasSpoken = true;
            updateVoiceWidgetState('speaking');
            const ansTitle = document.querySelector('.voice-answer-title');
            if (ansTitle) {
              ansTitle.innerHTML = '<iconify-icon icon="solar:volume-loud-bold"></iconify-icon> AI 비서 안내 (음성 출력 중 🔊)';
            }
          };

          utterance.onend = function () {
            handleVoiceSpeechComplete();
          };

          utterance.onerror = function (err) {
            console.warn("SpeechSynthesis 실패, 오디오 스트림 폴백 시도:", err);
            if (!hasSpoken) playTtsAudioFallback(text);
            else handleVoiceSpeechComplete();
          };

          window.speechSynthesis.speak(utterance);

          // 700ms 내에 SpeechSynthesis가 시작되지 않으면 모바일 백그라운드 차단으로 판단하여 오디오 폴백 가동
          setTimeout(() => {
            if (!hasSpoken && (!window.speechSynthesis.speaking || window.speechSynthesis.paused)) {
              console.warn("SpeechSynthesis 반응 없음 -> 오디오 폴백 전환");
              playTtsAudioFallback(text);
            }
          }, 700);

        } catch (innerErr) {
          playTtsAudioFallback(text);
        }
      }, 80);
      return;
    } catch (e) {
      console.warn("speechSynthesis 실행 중 예외:", e);
    }
  }

  // 3️⃣ SpeechSynthesis 미지원 시 오디오 스트림 즉시 재생
  playTtsAudioFallback(text);
}

// 🎵 [오디오 스트림 TTS 폴백] 모바일/iframe 제약 없는 다이렉트 오디오 발화
function playTtsAudioFallback(text) {
  const fallbackPlayer = document.getElementById('voiceFallbackAudio');
  if (!fallbackPlayer || !text) {
    handleVoiceSpeechComplete();
    return;
  }

  try {
    const cleanText = text.slice(0, 180); // 오디오 쿼리 최적화
    const ttsUrl = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ko&q=" + encodeURIComponent(cleanText);
    fallbackPlayer.src = ttsUrl;
    fallbackPlayer.volume = 1.0;

    fallbackPlayer.onplay = function () {
      updateVoiceWidgetState('speaking');
      const ansTitle = document.querySelector('.voice-answer-title');
      if (ansTitle) {
        ansTitle.innerHTML = '<iconify-icon icon="solar:volume-loud-bold"></iconify-icon> AI 비서 안내 (음성 출력 중 🔊)';
      }
    };

    fallbackPlayer.onended = function () {
      handleVoiceSpeechComplete();
    };

    fallbackPlayer.play().catch(e => {
      console.warn("폴백 오디오 재생 오류:", e);
      handleVoiceSpeechComplete();
    });
  } catch (err) {
    console.error("playTtsAudioFallback failed:", err);
    handleVoiceSpeechComplete();
  }
}


// 📋 [Gemini AI 실시간 스마트 지능형 컨텍스트 빌더 엔진]
// - 기사님의 질문(queryText)을 실시간 분석하여 최적의 운행/배차/통계 데이터를 맞춤 추출
// - 1) 향후 14일간 개인 일정 및 '가장 가까운 다음 운행일정' 자동 추적
// - 2) 차량번호 역추적 검색 (예: 2122호 누가 타?)
// - 3) 맞교대 기사님(오전/오후) 자동 식별
// - 4) 앞차/뒷차 순번(N-1, N+1) 및 기점 표준출발시간 대조
// - 5) 이번 주/이번 달 근무 및 휴무 통계 집계
// - 6) 질문에 언급된 특정 날짜(내일, 모레, 특정 요일 등) 맞춤 배차 현황
function buildVoiceAssistantContext(queryText) {
  const query = (queryText || '').trim();
  const today = new Date();
  const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const dayShort = ['일', '월', '화', '수', '목', '금', '토'];

  function formatDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  const todayStr = formatDateStr(today);
  const dayLabel = dayNames[today.getDay()];
  const myName = window.currentDriver || localStorage.getItem('loggedInUser') || '유재필';
  const allUsers = typeof getUsersList === 'function' ? getUsersList().filter(u => u.userType !== 'family') : [];

  // 1. [향후 14일간 내 일정 분석 및 가장 가까운 운행 일정 탐색]
  let myUpcomingList = [];
  let nextWorkShift = null; // 가장 가까운 다음 실제 운행
  let myTodayData = null;

  for (let offset = 0; offset < 14; offset++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + offset);
    const dateStr = formatDateStr(targetDate);
    const dayW = dayShort[targetDate.getDay()];
    const relLabel = offset === 0 ? "오늘" : offset === 1 ? "내일" : offset === 2 ? "모레" : `${offset}일후`;

    const saved = localStorage.getItem(`jpil_user_${myName}_sched_${dateStr}`);
    if (saved) {
      try {
        const d = JSON.parse(saved);
        const workType = d.workType || '근무';
        const isOff = ['휴무', '휴일', '연차', '공가', '병가'].includes(workType) || (!d.route && !d.seq);
        const schedItem = {
          dateStr, dayW, relLabel,
          route: d.route || '-',
          seq: d.seq || '-',
          workType,
          busNo: d.busNo || '미배차',
          time: d.time || '-',
          isOff
        };
        if (offset === 0) myTodayData = schedItem;
        myUpcomingList.push(`${dateStr}(${dayW}/${relLabel}): 형태 ${workType}, 노선 ${schedItem.route}, 순번 ${schedItem.seq}, 차량 ${schedItem.busNo}, 시간 ${schedItem.time}`);

        // 가장 가까운 다음 실제 운행 탐색 (오늘이 근무면 오늘, 오늘이 휴무면 향후 첫 실제 근무일)
        if (!nextWorkShift && !isOff && (schedItem.route !== '-' || schedItem.seq !== '-')) {
          nextWorkShift = schedItem;
        }
      } catch (e) { }
    } else {
      if (offset === 0) {
        myTodayData = { dateStr, dayW, relLabel: "오늘", workType: "미등록", route: "-", seq: "-", busNo: "-", isOff: true };
      }
    }
  }

  // 2. [차량번호 역추적 검색] - 질문에 3~4자리 숫자(차량번호)나 차량 키워드가 있는지 검사
  let vehicleSearchReport = "";
  const busNoMatch = query.match(/\b(\d{3,4})\b/);
  if (busNoMatch || query.includes("차량") || query.includes("호차") || query.includes("누가 타")) {
    const targetBusNo = busNoMatch ? busNoMatch[1] : (myTodayData && myTodayData.busNo && myTodayData.busNo !== '-' && myTodayData.busNo !== '미배차' ? myTodayData.busNo : null);
    if (targetBusNo) {
      let foundDriversToday = [];
      let foundDriversTomorrow = [];

      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const tomorrowStr = formatDateStr(tomorrow);

      allUsers.forEach(u => {
        // 오늘 검색
        const sToday = localStorage.getItem(`jpil_user_${u.name}_sched_${todayStr}`);
        if (sToday) {
          try {
            const dt = JSON.parse(sToday);
            if (String(dt.busNo).includes(targetBusNo)) {
              foundDriversToday.push(`${u.name} 기사님 (노선 ${dt.route || '-'}, 순번 ${dt.seq || '-'}, ${dt.workType || '근무'}, 시간 ${dt.time || '-'})`);
            }
          } catch(e) {}
        }
        // 내일 검색
        const sTom = localStorage.getItem(`jpil_user_${u.name}_sched_${tomorrowStr}`);
        if (sTom) {
          try {
            const dt = JSON.parse(sTom);
            if (String(dt.busNo).includes(targetBusNo)) {
              foundDriversTomorrow.push(`${u.name} 기사님 (노선 ${dt.route || '-'}, 순번 ${dt.seq || '-'}, ${dt.workType || '근무'}, 시간 ${dt.time || '-'})`);
            }
          } catch(e) {}
        }
      });

      vehicleSearchReport = `\n[차량 ${targetBusNo}호 배차 역추적 정보]
- 오늘(${todayStr}): ${foundDriversToday.length > 0 ? foundDriversToday.join(' / ') : '배차된 기사 정보 없음'}
- 내일(${tomorrowStr}): ${foundDriversTomorrow.length > 0 ? foundDriversTomorrow.join(' / ') : '배차된 기사 정보 없음'}`;
    }
  }

  // 3. [교대자 검색 (오전/오후 맞교대 기사님)]
  let shiftPartnerReport = "";
  if (query.includes("교대") || query.includes("맞교대") || query.includes("오전") || query.includes("오후") || query.includes("파트너")) {
    const baseShift = (myTodayData && !myTodayData.isOff) ? myTodayData : nextWorkShift;
    if (baseShift && baseShift.route !== '-' && baseShift.seq !== '-') {
      let partners = [];
      allUsers.forEach(u => {
        if (u.name === myName) return;
        const s = localStorage.getItem(`jpil_user_${u.name}_sched_${baseShift.dateStr}`);
        if (s) {
          try {
            const d = JSON.parse(s);
            // 같은 노선, 같은 순번이거나 같은 차량
            if ((d.route === baseShift.route && d.seq === baseShift.seq) || (baseShift.busNo !== '-' && d.busNo === baseShift.busNo)) {
              partners.push(`${u.name} 기사님 (${d.workType || '근무'}, 차량 ${d.busNo || '-'}, 시간 ${d.time || '-'})`);
            }
          } catch(e) {}
        }
      });
      shiftPartnerReport = `\n[${baseShift.dateStr} 기준 교대자 정보]
- 질문자(${myName}) 배차: ${baseShift.route}번 ${baseShift.seq}순번 (${baseShift.workType}, 차량 ${baseShift.busNo})
- 동일 노선/순번/차량 교대 기사님: ${partners.length > 0 ? partners.join(', ') : '지정된 맞교대자 없음'}`;
    }
  }

  // 4. [앞차 / 뒷차 순번 및 표준시간 대조]
  let sequenceReport = "";
  if (query.includes("앞차") || query.includes("뒷차") || query.includes("앞순번") || query.includes("뒷순번") || query.includes("순번") || query.includes("표준시간") || query.includes("시간표")) {
    const baseShift = (myTodayData && !myTodayData.isOff) ? myTodayData : nextWorkShift;
    if (baseShift && baseShift.route !== '-' && baseShift.seq !== '-') {
      const mySeqNum = parseInt(baseShift.seq, 10);
      let prevSeqDriver = "배차 정보 없음";
      let nextSeqDriver = "배차 정보 없음";

      allUsers.forEach(u => {
        const s = localStorage.getItem(`jpil_user_${u.name}_sched_${baseShift.dateStr}`);
        if (s) {
          try {
            const d = JSON.parse(s);
            if (d.route === baseShift.route) {
              const sNum = parseInt(d.seq, 10);
              if (!isNaN(mySeqNum)) {
                if (sNum === mySeqNum - 1) prevSeqDriver = `${d.seq}순번 ${u.name} 기사님 (차량 ${d.busNo || '-'}, ${d.workType || ''}, 시간 ${d.time || '-'})`;
                if (sNum === mySeqNum + 1) nextSeqDriver = `${d.seq}순번 ${u.name} 기사님 (차량 ${d.busNo || '-'}, ${d.workType || ''}, 시간 ${d.time || '-'})`;
              }
            }
          } catch(e) {}
        }
      });

      let ttSample = "";
      if (typeof customGetItem === 'function') {
        const tt = customGetItem(baseShift.route, baseShift.seq);
        if (tt && tt.length > 0) {
          const rounds = tt.slice(0, 3).map((r, i) => `${i + 1}회차: 출발 ${r.time1 || '-'} / 회차 ${r.time2 || '-'} / 도착 ${r.time3 || '-'}`).join(', ');
          ttSample = `\n- ${baseShift.route}번 ${baseShift.seq}순번 표준 운행 시간표: ${rounds}`;
        }
      }

      sequenceReport = `\n[앞순번 / 뒷순번 운행 정보 (${baseShift.route}번 ${baseShift.dateStr} 기준)]
- 내 순번: ${baseShift.seq}순번 (${myName} 기사님, 차량 ${baseShift.busNo})
- 앞순번(앞차): ${prevSeqDriver}
- 뒷순번(뒷차): ${nextSeqDriver}${ttSample}`;
    }
  }

  // 5. [근무 통계 집계 (이번 주 및 이번 달)]
  let statsReport = "";
  if (query.includes("통계") || query.includes("근무일") || query.includes("휴무") || query.includes("쉬는 날") || query.includes("몇 번") || query.includes("이번주") || query.includes("이번달")) {
    const curYear = today.getFullYear();
    const curMonth = today.getMonth() + 1;
    let workDaysCount = 0;
    let offDaysCount = 0;
    let offDates = [];

    const lastDay = new Date(curYear, curMonth, 0).getDate();
    for (let day = 1; day <= lastDay; day++) {
      const dStr = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const saved = localStorage.getItem(`jpil_user_${myName}_sched_${dStr}`);
      if (saved) {
        try {
          const d = JSON.parse(saved);
          const wt = d.workType || '';
          if (['휴무', '휴일', '연차', '공가', '병가'].includes(wt)) {
            offDaysCount++;
            if (day >= today.getDate()) offDates.push(`${day}일`);
          } else if (wt) {
            workDaysCount++;
          }
        } catch(e) {}
      }
    }

    statsReport = `\n[${myName} 기사님 이번 달(${curMonth}월) 근무 통계]
- 총 근무일수: ${workDaysCount}일
- 총 휴무일수: ${offDaysCount}일
- 향후 남은 예정 휴무일: ${offDates.length > 0 ? offDates.join(', ') : '없음'}`;
  }

  // 6. [전체 기사 당일 배차 요약]
  let userSchedList = [];
  allUsers.forEach(u => {
    const saved = localStorage.getItem(`jpil_user_${u.name}_sched_${todayStr}`);
    if (saved) {
      try {
        const d = JSON.parse(saved);
        userSchedList.push(`- ${u.name}: 노선 ${d.route || '-'}, 순번 ${d.seq || '-'}, 차량 ${d.busNo || '-'}, 형태 ${d.workType || '근무'}, 시간 ${d.time || '-'}`);
      } catch (e) { }
    }
  });

  // 7. [실시간 GPS 및 국토교통부 교통/돌발 정보]
  let liveGpsTrafficReport = "\n[실시간 위치 및 교통/돌발 정보]";
  
  const liveGpsStatus = document.getElementById('liveCardStatus')?.innerText || '';
  const liveGpsTimeLeft = document.getElementById('liveCardTimeLeft')?.innerText || '';
  const liveGpsTimeSub = document.getElementById('liveCardTimeSub')?.innerText || '';
  
  if (liveGpsStatus && liveGpsStatus !== '-') {
    liveGpsTrafficReport += `\n- 현재 내 위치/상태: ${liveGpsStatus} (도착예정시간: ${liveGpsTimeLeft}, 다음: ${liveGpsTimeSub})`;
  } else {
    liveGpsTrafficReport += `\n- 현재 내 위치/상태: GPS 정보 없음 또는 운행 중 아님`;
  }

  if (window.liveTrafficAlerts && window.liveTrafficAlerts.length > 0) {
    liveGpsTrafficReport += `\n- 주변 돌발/교통 정보: ${window.liveTrafficAlerts.join(' / ')}`;
  } else {
    liveGpsTrafficReport += `\n- 주변 돌발/교통 정보: 특이사항 없음`;
  }

  return `[영종운수 실시간 스마트 운행 관제 데이터]
- 기준 일시: ${todayStr} (${dayLabel})
- 질문 기사님: ${myName}
- ${myName} 기사님의 가장 가까운 다음 실제 운행 일정:
  ${nextWorkShift ? `👉 ${nextWorkShift.dateStr} (${nextWorkShift.dayW}요일, ${nextWorkShift.relLabel}): 노선 ${nextWorkShift.route}번, 순번 ${nextWorkShift.seq}, 차량번호 ${nextWorkShift.busNo}, 근무형태 ${nextWorkShift.workType}, 출근/출발시간 ${nextWorkShift.time}` : '향후 14일간 등록된 근무 일정이 없습니다.'}
- ${myName} 기사님 오늘(${todayStr}) 상태: ${myTodayData ? `형태 ${myTodayData.workType}, 노선 ${myTodayData.route}, 차량 ${myTodayData.busNo}` : '미등록'}
- ${myName} 기사님 향후 7일 일정 요약:
  ${myUpcomingList.slice(0, 7).join('\n  ')}
${vehicleSearchReport}
${shiftPartnerReport}
${sequenceReport}
${statsReport}
${liveGpsTrafficReport}
- 오늘 전체 기사 배차 요약 (일부):
${userSchedList.slice(0, 25).join('\n')}`;
}

// 🖐️ 플로팅 마이크 위젯 드래그 지원 (터치 탭 오작동 방지 최적화)
function initVoiceWidgetDrag() {
  const widget = document.getElementById('floatingVoiceWidget');
  if (!widget) return;

  let startX = 0, startY = 0;
  let initialX = 0, initialY = 0;
  let hasMovedFar = false;

  function onTouchStart(e) {
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    const rect = widget.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;
    hasMovedFar = false;
    wasVoiceWidgetDragged = false;
  }

  function onTouchMove(e) {
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    // 모바일 엄지 터치 시 자연스러운 미세 흔들림(25px 이하)은 탭으로 판정
    if (Math.hypot(dx, dy) > 25) {
      hasMovedFar = true;
      wasVoiceWidgetDragged = true;
      widget.style.left = `${initialX + dx}px`;
      widget.style.top = `${initialY + dy}px`;
      widget.style.right = 'auto';
      widget.style.bottom = 'auto';
    }
  }

  function onTouchEnd() {
    if (hasMovedFar) {
      setTimeout(() => {
        wasVoiceWidgetDragged = false;
      }, 250);
    }
  }

  // 모바일 터치 이벤트 연결
  widget.addEventListener('touchstart', onTouchStart, { passive: true });
  widget.addEventListener('touchmove', onTouchMove, { passive: true });
  widget.addEventListener('touchend', onTouchEnd, { passive: true });
}

// 🔊 [음성(TTS) 읽기 즉시 중지]
function stopVoiceTTS() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  const fallbackPlayer = document.getElementById('voiceFallbackAudio');
  if (fallbackPlayer) {
    fallbackPlayer.pause();
    fallbackPlayer.currentTime = 0;
  }
  updateVoiceWidgetState('idle');
  const answerTitle = document.querySelector('.voice-answer-title');
  if (answerTitle) {
    answerTitle.innerHTML = '<iconify-icon icon="solar:volume-cross-bold"></iconify-icon> AI 비서 안내 (음성 중지됨)';
  }
}



// DOM 준비 시 드래그 초기화 및 게이트웨이 이벤트 연결
window.addEventListener('DOMContentLoaded', function () {
  setTimeout(() => {
    initVoiceWidgetDrag();
  }, 400);

  // 게이트웨이 화면: PIN 입력 후 엔터 / 다음 단계 버튼 클릭
  const gatewayPinInput = document.getElementById('gatewayPinInput');
  const gatewayNextBtn = document.getElementById('gatewayNextBtn');
  if (gatewayPinInput) {
    gatewayPinInput.addEventListener('keypress', function(event) {
      if (event.key === 'Enter') handleGatewayNext();
    });
  }
  if (gatewayNextBtn) {
    gatewayNextBtn.addEventListener('click', function() {
      handleGatewayNext();
    });
  }
});

window.handleGatewayNext = handleGatewayNext;
