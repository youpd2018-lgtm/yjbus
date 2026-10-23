// ================================================================
// 📋 [공고문] 근무정보 > 공고문 : data/notices/index.json 의 이미지를 최신 날짜순으로 보여 주고, 누르면 전체 화면
// - 공고 추가는 tools/add_notice.py (회사가 밴드에 올린 공고 이미지를 그대로 올림)
// ================================================================
(function () {
  const BASE = 'data/notices/';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function openFull(src, title) {
    let wrap = document.getElementById('ybNoticeFull');
    if (wrap) wrap.remove();
    wrap = document.createElement('div');
    wrap.id = 'ybNoticeFull';
    wrap.style.cssText = 'position:fixed; inset:0; z-index:100001; background:#000; display:flex; flex-direction:column;';
    wrap.innerHTML =
      '<div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#0f172a; color:#f8fafc; font-weight:900; font-size:15px;">' +
      '<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(title) + '</span>' +
      '<button type="button" id="ybNoticeFullClose" style="background:#334155; color:#fff; border:none; border-radius:8px; padding:8px 14px; font-weight:900; font-size:14px;">닫기</button></div>' +
      '<div style="flex:1; overflow:auto; -webkit-overflow-scrolling:touch; text-align:center;"><img src="' + esc(src) + '" alt="' + esc(title) + '" style="max-width:100%; height:auto;"></div>';
    document.body.appendChild(wrap);
    document.getElementById('ybNoticeFullClose').onclick = function () { wrap.remove(); };
  }

  window.renderNoticeBoard = function () {
    const box = document.getElementById('noticeBoardList');
    if (!box) return;
    box.innerHTML = '<p style="font-size:13px; color:#94a3b8; text-align:center; margin:12px 0;">불러오는 중...</p>';
    fetch(BASE + 'index.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
      .then(d => {
        const items = (d && d.items || []).slice().sort((a, b) => (b.date + b.image).localeCompare(a.date + a.image));
        if (!items.length) {
          box.innerHTML = '<p style="font-size:13px; color:#94a3b8; text-align:center; margin:12px 0;">등록된 공고문이 없습니다.</p>';
          return;
        }
        box.innerHTML = items.map((it, i) =>
          '<button type="button" class="yb-notice-item" data-i="' + i + '" style="display:flex; align-items:center; gap:12px; width:100%; text-align:left; background:#0f172a; border:1.5px solid #334155; border-radius:12px; padding:8px; margin-bottom:8px; color:#f8fafc; cursor:pointer;">' +
          '<img src="' + esc(BASE + it.image) + '" alt="" loading="lazy" style="width:72px; height:72px; object-fit:cover; border-radius:8px; background:#1e293b; flex-shrink:0;">' +
          '<span style="display:flex; flex-direction:column; gap:4px; min-width:0;">' +
          '<span style="font-size:15px; font-weight:900; line-height:1.3;">' + esc(it.title) + '</span>' +
          '<span style="font-size:12px; color:#94a3b8; font-weight:700;">' + esc(it.date) + '</span></span></button>'
        ).join('');
        box.querySelectorAll('.yb-notice-item').forEach(b => {
          b.onclick = function () { const it = items[+b.getAttribute('data-i')]; openFull(BASE + it.image, it.title); };
        });
      })
      .catch(() => {
        box.innerHTML = '<p style="font-size:13px; color:#f87171; text-align:center; margin:12px 0;">공고문을 불러오지 못했습니다. 잠시 후 다시 눌러 주세요.</p>';
      });
  };
})();
