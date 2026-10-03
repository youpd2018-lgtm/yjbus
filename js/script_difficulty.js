// ================================================================
// 🎨 [비밀 기능] 노선·순번 운행 난이도 색 버튼 (+ 가족 메시지 노란색)
//  - 메인 카드 우상단의 작은 파스텔 동그라미. 눌러서 빨강/노랑/파랑 선택
//  - 빨강: 이 노선 이 순번 아주 힘듦 / 노랑: 그럭저럭 / 파랑: 아주 편함
//  - 저장: BOARD_DB 시트 (category=DIFFICULTY, targetKey="노선-순번",
//          writer=선택한 기사 이름, content=red|yellow|blue)
//    + DIFFICULTY_LOG: 날짜|기사|노선-순번|시각 / 색 / 기사 → 바꿀 때마다 새 줄로 누적
//    기존 loadBoardMemo / saveBoardMemo 를 그대로 사용 (백엔드 수정 없음)
//  - 누구나 바꿀 수 있음
// ================================================================
(function () {
  var CATEGORY = 'DIFFICULTY';          // 현재 색 (노선-순번당 1줄)
  var LOG_CATEGORY = 'DIFFICULTY_LOG';  // 누적 기록 (바꿀 때마다 1줄)
  var COLORS = {
    red:    { bg: '#ff2d55', ring: '#ff6b8a', glow: 'rgba(255,45,85,.85)' },
    yellow: { bg: '#ffe600', ring: '#fff27a', glow: 'rgba(255,230,0,.8)' },
    blue:   { bg: '#00c8ff', ring: '#7fe4ff', glow: 'rgba(0,200,255,.85)' }
  };
  var NONE = { bg: '#0f172a', ring: '#38bdf8', glow: 'rgba(56,189,248,.45)' };
  var current = '';      // 현재 노선-순번의 색 (red/yellow/blue/'')
  var currentKey = '';
  var open = false;

  // ── 가족 메시지 글자색을 노란색으로 (기존 연한 녹색 → 노랑) ──
  if (typeof window.formatMessageDisplay === 'function') {
    var origFormat = window.formatMessageDisplay;
    window.formatMessageDisplay = function (raw) {
      return String(origFormat(raw)).split('#86efac').join('#fde047');
    };
  }

  function getKey() {
    var r = (document.getElementById('bliRouteNum') || {}).innerText || '';
    var s = (document.getElementById('bliSeqNum') || {}).innerText || '';
    r = r.trim(); s = s.trim();
    if (!r || r === '-' || !s || s === '-') return '';
    return r + '-' + s;
  }

  function getWriter() {
    if (typeof getLoggedInDriverName === 'function') return getLoggedInDriverName() || '동료기사';
    return window.currentDriver || '동료기사';
  }

  function dot(color, size, extra) {
    var c = COLORS[color] || NONE;
    return 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + c.bg +
      ';border:1.5px solid ' + c.ring + ';padding:0;cursor:pointer;box-shadow:0 0 6px ' + c.glow + ',0 0 14px ' + c.glow + ';' + (extra || '');
  }

  function render() {
    var wrap = document.getElementById('ybDiffWrap');
    if (!wrap) return;
    wrap.style.cssText = 'position:absolute;top:10px;right:12px;z-index:8;display:' + (currentKey ? 'flex' : 'none') +
      ';align-items:center;gap:8px;';
    var html = '';
    if (open) {
      ['red', 'yellow', 'blue'].forEach(function (c) {
        html += '<button type="button" data-c="' + c + '" style="' + dot(c, 24, c === current ? 'outline:2px solid #fff;outline-offset:1px;' : '') + '"></button>';
      });
    }
    html += '<button type="button" id="ybDiffMain" style="' + dot(current, 22, '') + '"></button>';
    wrap.innerHTML = html;
  }

  function load() {
    var key = getKey();
    if (key === currentKey) return;
    currentKey = key;
    open = false;
    var cached = '';
    try { cached = localStorage.getItem('yb_diff_' + key) || ''; } catch (e) {}
    current = COLORS[cached] ? cached : '';
    render();
    if (!key) return;
    if (typeof google === 'undefined' || !google.script || !google.script.run) return;
    google.script.run
      .withSuccessHandler(function (res) {
        if (key !== currentKey) return;   // 그 사이 다른 날짜로 이동했으면 무시
        var v = (res && res.success && res.content) ? String(res.content).trim() : '';
        current = COLORS[v] ? v : '';
        try { localStorage.setItem('yb_diff_' + key, current); } catch (e) {}
        render();
      })
      .withFailureHandler(function () {})
      .loadBoardMemo(CATEGORY, key);
  }

  function save(color) {
    current = color;
    open = false;
    try { localStorage.setItem('yb_diff_' + currentKey, color); } catch (e) {}
    render();
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      var writer = getWriter();
      var d = new Date();
      var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
      var day = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
      var time = p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
      // ① 누적 기록: 매번 새 줄 (targetKey = 날짜|기사|노선-순번|시각, content = 색)
      google.script.run
        .withSuccessHandler(function () {})
        .withFailureHandler(function () {})
        .saveBoardMemo(LOG_CATEGORY, day + '|' + writer + '|' + currentKey + '|' + time, color, writer);
      // ② 현재 색 표시용: 노선-순번마다 한 줄만 유지 (화면에 보여줄 최신 색)
      google.script.run
        .withSuccessHandler(function () {})
        .withFailureHandler(function () {})
        .saveBoardMemo(CATEGORY, currentKey, color, writer);
    }
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var wrap = t.closest('#ybDiffWrap');
    if (!wrap) { if (open) { open = false; render(); } return; }
    ev.stopPropagation();
    var btn = t.closest('button');
    if (!btn) return;
    if (btn.id === 'ybDiffMain') { open = !open; render(); return; }
    if (btn.getAttribute('data-c')) save(btn.getAttribute('data-c'));
  }, true);

  function start() {
    var ids = ['bliRouteNum', 'bliSeqNum'];
    var obs = new MutationObserver(function () { load(); });
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) obs.observe(el, { childList: true, characterData: true, subtree: true });
    });
    load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

// ================================================================
// 🏷️ 메인 카드 빈자리: 로고 + "OOO 기사님 근무표" 타이포그래피
//  - 기존 헤더(숨겨 둠, 나중에 재활용)의 로고·제목을 복제해서 표시
// ================================================================
(function () {
  function sync() {
    var box = document.getElementById('ybHeroTitle');
    var src = document.getElementById('headerTitleText');
    var logo = document.querySelector('#appHeaderTitle img');
    if (!box || !src) return;
    var txt = (src.textContent || '').trim();
    if (!box.firstChild && logo) {
      var img = logo.cloneNode(true);
      img.style.cssText = 'height:19px;width:19px;object-fit:contain;flex-shrink:0;opacity:.7;';
      box.appendChild(img);
      var sp = document.createElement('span');
      sp.id = 'ybHeroTitleText';
      sp.style.cssText = 'font-size:15px;font-weight:700;color:#94a3b8;letter-spacing:-0.3px;text-shadow:0 1px 6px rgba(0,0,0,.7);';
      box.appendChild(sp);
    }
    var out = document.getElementById('ybHeroTitleText');
    if (out) out.textContent = txt.replace(/\s*근무표\s*$/, '');
  }
  function start() {
    var src = document.getElementById('headerTitleText');
    if (src) new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

/* ── 오늘의 한마디: 글이 칸보다 길면 흐르지 않고 '앞부분 3초 → 뒷부분 2초' 순서로 끊어서 보여 줌 ── */
(function () {
  var busy = false;
  function setup() {
    var el = document.getElementById('liveColleagueMessage');
    if (!el || busy) return;
    if (el.firstElementChild && el.firstElementChild.classList.contains('yb-marq')) return;
    busy = true;
    try {
      var inner = document.createElement('div');
      inner.className = 'yb-marq';
      while (el.firstChild) inner.appendChild(el.firstChild);
      el.appendChild(inner);
      var w = el.clientWidth, over = inner.scrollWidth - w;
      if (over > 4 && w > 0) {
        // 보여 줄 위치들: 0, -w, -2w ... 마지막은 글 끝이 딱 맞는 위치
        var pos = [0], x = w;
        while (x < over) { pos.push(x); x += w; }
        pos.push(over);
        var i = 0;
        var step = function () {
          if (!inner.isConnected) return;
          inner.style.transform = 'translateX(-' + pos[i] + 'px)';
          var wait = i === 0 ? 3000 : 2000;
          i = (i + 1) % pos.length;
          setTimeout(step, wait);
        };
        step();
      }
    } catch (e) {}
    busy = false;
  }
  function start() {
    var el = document.getElementById('liveColleagueMessage');
    if (!el) return;
    new MutationObserver(function () { if (!busy) setTimeout(setup, 30); })
      .observe(el, { childList: true });
    setup();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
