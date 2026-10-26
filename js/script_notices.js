// ================================================================
// 📋 [공고문] 근무정보 > 공고문 : data/notices/index.json 의 이미지를 최신 날짜순으로 보여 주고, 누르면 전체 화면
// - 공고 추가는 tools/add_notice.py (회사가 밴드에 올린 공고 이미지를 그대로 올림)
// ================================================================
(function () {
  const BASE = 'data/notices/';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // 전체 화면 보기: 두 손가락으로 확대·축소, 한 손가락으로 이동, 두 번 누르면 확대/원래대로. 닫기 버튼은 맨 아래.
  // 새 공고 표시: 이 폰에서 아직 안 열어 본 공고는 기간과 상관없이 계속 NEW. 한 번 열어 보면 NEW가 사라진다.
  const SEEN_KEY = 'yb_notice_seen_v1';
  function seenList() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; } }
  function markSeen(id) { try { const a = seenList(); if (a.indexOf(id) < 0) { a.push(id); localStorage.setItem(SEEN_KEY, JSON.stringify(a.slice(-200))); } } catch (e) { } }
  function nid(it) { return it.date + '|' + it.title; }
  function isNew(it) { return seenList().indexOf(nid(it)) < 0; }
  const BADGE = '<span style="background:#ef4444; color:#fff; font-size:11px; font-weight:900; padding:2px 7px; border-radius:999px; letter-spacing:.5px;">NEW</span>';
  function normalize(d) {
    return (d && d.items || []).map(it => Object.assign({}, it, { images: it.images || (it.image ? [it.image] : []) }))
      .filter(it => it.images.length).sort((a, b) => (b.date + b.images[0]).localeCompare(a.date + a.images[0]));
  }
  // 근무정보 탭과 [공고문] 버튼에 새 공고 표시
  function paintBadges(items) {
    const n = items.filter(isNew).length;
    const btn = document.querySelector('#btnStatsNotice span');
    const tab = document.querySelector('#tabStats span');
    [[btn, 'ybNoticeBtnNew'], [tab, 'ybNoticeTabNew']].forEach(function (x) {
      if (!x[0]) return;
      let b = document.getElementById(x[1]);
      if (b) b.remove();
      if (n > 0) { b = document.createElement('span'); b.id = x[1]; b.innerHTML = BADGE; b.style.marginLeft = '5px'; x[0].appendChild(b); }
    });
  }
  window.checkNewNotice = function () {
    fetch(BASE + 'index.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(d => { if (d) paintBadges(normalize(d)); }).catch(function () { });
  };
  setTimeout(window.checkNewNotice, 2500);
  setInterval(window.checkNewNotice, 30 * 60 * 1000);

  function openFull(srcs, title) {
    let page = 0;
    let wrap = document.getElementById('ybNoticeFull');
    if (wrap) wrap.remove();
    wrap = document.createElement('div');
    wrap.id = 'ybNoticeFull';
    wrap.style.cssText = 'position:fixed; inset:0; z-index:100001; background:#000; display:flex; flex-direction:column;';
    wrap.innerHTML =
      '<div id="ybNoticeStage" style="flex:1; position:relative; overflow:hidden; touch-action:none;">' +
      '<img id="ybNoticeImg" src="' + esc(srcs[0]) + '" alt="' + esc(title) + '" draggable="false" style="position:absolute; left:0; top:0; transform-origin:0 0; max-width:none; user-select:none; -webkit-user-drag:none;">' +
      '<button type="button" id="ybNoticePrev" aria-label="이전" style="display:' + (srcs.length > 1 ? 'flex' : 'none') + '; position:absolute; left:4px; top:50%; transform:translateY(-50%); width:40px; height:64px; border:none; border-radius:10px; background:rgba(15,23,42,0.28); color:rgba(255,255,255,0.7); font-size:30px; font-weight:900; align-items:center; justify-content:center; padding:0;">‹</button>' +
      '<button type="button" id="ybNoticeNext" aria-label="다음" style="display:' + (srcs.length > 1 ? 'flex' : 'none') + '; position:absolute; right:4px; top:50%; transform:translateY(-50%); width:40px; height:64px; border:none; border-radius:10px; background:rgba(15,23,42,0.28); color:rgba(255,255,255,0.7); font-size:30px; font-weight:900; align-items:center; justify-content:center; padding:0;">›</button>' +
      '<div id="ybNoticePage" style="display:' + (srcs.length > 1 ? 'block' : 'none') + '; position:absolute; top:8px; left:50%; transform:translateX(-50%); padding:3px 10px; border-radius:999px; background:rgba(15,23,42,0.35); color:rgba(255,255,255,0.8); font-size:12px; font-weight:900; pointer-events:none;"></div></div>' +
      '<div style="padding:10px 14px calc(10px + env(safe-area-inset-bottom)); background:#0f172a; display:flex; flex-direction:column; gap:8px;">' +
      '<div style="color:#94a3b8; font-size:12px; font-weight:700; text-align:center;">두 손가락으로 벌리면 확대됩니다</div>' +
      '<button type="button" id="ybNoticeFullClose" style="width:100%; background:#f97316; color:#fff; border:none; border-radius:12px; padding:14px; font-weight:900; font-size:18px;">닫기</button></div>';
    document.body.appendChild(wrap);
    document.getElementById('ybNoticeFullClose').onclick = function () { wrap.remove(); };

    const stage = document.getElementById('ybNoticeStage');
    const img = document.getElementById('ybNoticeImg');
    let scale = 1, tx = 0, ty = 0, fit = 1;
    const pts = new Map();
    let startDist = 0, startScale = 1, lastTap = 0;

    function apply() { img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; }
    function clamp() {
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      const sw = stage.clientWidth, sh = stage.clientHeight;
      tx = w <= sw ? (sw - w) / 2 : Math.min(0, Math.max(sw - w, tx));
      ty = h <= sh ? (sh - h) / 2 : Math.min(0, Math.max(sh - h, ty));
    }
    function reset() {
      fit = Math.min(stage.clientWidth / img.naturalWidth, stage.clientHeight / img.naturalHeight) || 1;
      scale = fit; tx = 0; ty = 0; clamp(); apply(); img.style.visibility = 'visible';
    }
    function zoomAt(cx, cy, ns) {
      ns = Math.max(fit, Math.min(fit * 6, ns));
      tx = cx - (cx - tx) * (ns / scale);
      ty = cy - (cy - ty) * (ns / scale);
      scale = ns; clamp(); apply();
    }
    function center() {
      const r = stage.getBoundingClientRect(), a = Array.from(pts.values());
      return { x: (a[0].x + a[1].x) / 2 - r.left, y: (a[0].y + a[1].y) / 2 - r.top };
    }
    function dist() { const a = Array.from(pts.values()); return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }

    img.onload = reset;
    if (img.complete && img.naturalWidth) reset();
    function show(n) {
      page = (n + srcs.length) % srcs.length;
      img.style.visibility = 'hidden';
      img.src = srcs[page];
      const pg = document.getElementById('ybNoticePage');
      if (pg) pg.textContent = (page + 1) + ' / ' + srcs.length;
    }
    if (srcs.length > 1) {
      show(0);
      ['ybNoticePrev', 'ybNoticeNext'].forEach(function (id, k) {
        const bt = document.getElementById(id);
        bt.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        bt.onclick = function () { show(page + (k ? 1 : -1)); };
      });
    }
    stage.addEventListener('pointerdown', function (e) {
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { startDist = dist(); startScale = scale; }
      if (pts.size === 1) {
        const now = Date.now();
        if (now - lastTap < 300) {
          const r = stage.getBoundingClientRect();
          if (scale > fit * 1.05) { scale = fit; clamp(); apply(); }
          else zoomAt(e.clientX - r.left, e.clientY - r.top, fit * 2.5);
          lastTap = 0;
        } else lastTap = now;
      }
    });
    stage.addEventListener('pointermove', function (e) {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && startDist) {
        const c = center();
        zoomAt(c.x, c.y, startScale * dist() / startDist);
      } else if (pts.size === 1) {
        tx += e.clientX - prev.x; ty += e.clientY - prev.y; clamp(); apply();
      }
    });
    let swipeX0 = null;
    stage.addEventListener('pointerdown', function (e) { swipeX0 = (pts.size === 1 && scale <= fit * 1.05) ? e.clientX : null; });
    function up(e) {
      if (swipeX0 !== null && pts.size === 1 && srcs.length > 1) {
        const dx = e.clientX - swipeX0;
        if (Math.abs(dx) > 60) show(page + (dx < 0 ? 1 : -1));
      }
      swipeX0 = null; pts.delete(e.pointerId); startDist = 0;
    }
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    window.addEventListener('resize', reset);
  }

  window.renderNoticeBoard = function () {
    const box = document.getElementById('noticeBoardList');
    if (!box) return;
    box.innerHTML = '<p style="font-size:13px; color:#94a3b8; text-align:center; margin:12px 0;">불러오는 중...</p>';
    fetch(BASE + 'index.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
      .then(d => {
        const items = normalize(d);
        paintBadges(items);
        if (!items.length) {
          box.innerHTML = '<p style="font-size:13px; color:#94a3b8; text-align:center; margin:12px 0;">등록된 공고문이 없습니다.</p>';
          return;
        }
        box.innerHTML = items.map((it, i) =>
          '<button type="button" class="yb-notice-item" data-i="' + i + '" style="display:flex; align-items:center; gap:12px; width:100%; text-align:left; background:#0f172a; border:1.5px solid #334155; border-radius:12px; padding:8px; margin-bottom:8px; color:#f8fafc; cursor:pointer;">' +
          '<img src="' + esc(BASE + it.images[0]) + '" alt="" loading="lazy" style="width:72px; height:72px; object-fit:cover; border-radius:8px; background:#1e293b; flex-shrink:0;">' +
          '<span style="display:flex; flex-direction:column; gap:4px; min-width:0;">' +
          '<span style="font-size:15px; font-weight:900; line-height:1.3;">' + (isNew(it) ? BADGE + ' ' : '') + esc(it.title) + '</span>' +
          '<span style="font-size:12px; color:#94a3b8; font-weight:700;">' + esc(it.date) + (it.images.length > 1 ? ' · ' + it.images.length + '장' : '') + '</span></span></button>'
        ).join('');
        // 최신 5건 높이만큼만 보이고, 나머지(이전 공고)는 목록 안에서 스크롤해서 본다
        const els = box.querySelectorAll('.yb-notice-item');
        box.style.overflowY = 'auto';
        box.style.webkitOverflowScrolling = 'touch';
        const h5 = els.length > 5 ? Math.round(els[5].getBoundingClientRect().top - box.getBoundingClientRect().top - 4) : 0;
        box.style.maxHeight = els.length > 5 ? (h5 > 0 ? h5 : 480) + 'px' : '';
        box.scrollTop = 0;
                box.querySelectorAll('.yb-notice-item').forEach(b => {
          b.onclick = function () { const it = items[+b.getAttribute('data-i')]; markSeen(nid(it)); paintBadges(items); b.querySelectorAll('span span').forEach(function (e) { if (e.textContent === 'NEW') e.remove(); }); openFull(it.images.map(x => BASE + x), it.title); };
        });
      })
      .catch(() => {
        box.innerHTML = '<p style="font-size:13px; color:#f87171; text-align:center; margin:12px 0;">공고문을 불러오지 못했습니다. 잠시 후 다시 눌러 주세요.</p>';
      });
  };
})();
