// ================================================================
// 🎨 [비밀 기능] 노선·순번 운행 난이도 색 버튼 (+ 가족 메시지 노란색)
//  - 메인 카드 우상단의 작은 파스텔 동그라미. 눌러서 빨강/노랑/파랑 선택
//  - 빨강: 이 노선 이 순번 아주 힘듦 / 노랑: 그럭저럭 / 파랑: 아주 편함
//  - 저장: BOARD_DB 시트 (category=DIFFICULTY, targetKey="노선-순번",
//          writer=선택한 기사 이름, content=red|yellow|blue)
//    기존 loadBoardMemo / saveBoardMemo 를 그대로 사용 (백엔드 수정 없음)
//  - 누구나 바꿀 수 있고, 바꾼 사람 이름으로 같은 줄이 갱신됨
// ================================================================
(function () {
  var CATEGORY = 'DIFFICULTY';
  var COLORS = {
    red:    { bg: '#fca5a5', ring: '#f87171' },
    yellow: { bg: '#fde68a', ring: '#fbbf24' },
    blue:   { bg: '#93c5fd', ring: '#60a5fa' }
  };
  var NONE = { bg: '#e2e8f0', ring: '#cbd5e1' };
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
      ';border:2px solid ' + c.ring + ';padding:0;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35);' + (extra || '');
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
    html += '<button type="button" id="ybDiffMain" style="' + dot(current, 22, 'opacity:.9;') + '"></button>';
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
      google.script.run
        .withSuccessHandler(function () {})
        .withFailureHandler(function () {})
        .saveBoardMemo(CATEGORY, currentKey, color, getWriter());
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
      img.style.cssText = 'height:22px;width:22px;object-fit:contain;flex-shrink:0;';
      box.appendChild(img);
      var sp = document.createElement('span');
      sp.id = 'ybHeroTitleText';
      sp.style.cssText = 'font-size:15px;font-weight:900;color:#e2e8f0;letter-spacing:-0.3px;text-shadow:0 1px 6px rgba(0,0,0,.7);';
      box.appendChild(sp);
    }
    var out = document.getElementById('ybHeroTitleText');
    if (out) out.textContent = txt;
  }
  function start() {
    var src = document.getElementById('headerTitleText');
    if (src) new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
