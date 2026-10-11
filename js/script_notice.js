// ================================================================
// 📢 [공지사항 팝업] script_notice.js
// - 관리자가 [관리 > 공지 작성]에 쓴 공지를, 사용자가 앱을 열면 알림 설정과 상관없이 팝업으로 보여줌
// - 사용자가 [공지 닫기]를 누르면 그 공지(번호 id)는 이 폰에서 다시 안 뜸. 관리자가 다시 저장하면 새 번호라서 또 뜸
// ================================================================
(function () {
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    var shown = false, lastCheck = 0, timer = null;

    function seenKey() { return 'yb_notice_seen_' + (window.currentDriver || ''); }

    function showNotice(n) {
        if (shown || document.getElementById('ybNoticeModal')) return;
        shown = true;
        var wrap = document.createElement('div');
        wrap.id = 'ybNoticeModal';
        wrap.style.cssText = 'position:fixed; inset:0; z-index:100000; background:rgba(2,6,23,0.78); display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;';
        var box = document.createElement('div');
        box.style.cssText = 'width:100%; max-width:420px; max-height:82vh; display:flex; flex-direction:column; background:#0f172a; border:2px solid #f97316; border-radius:16px; overflow:hidden; box-shadow:0 10px 40px rgba(0,0,0,0.6);';
        var head = document.createElement('div');
        head.style.cssText = 'padding:14px 18px; background:#1e293b; color:#fb923c; font-size:20px; font-weight:900;';
        head.textContent = '📢 ' + (n.title || '공지사항');
        var body = document.createElement('div');
        body.style.cssText = 'padding:16px 18px; color:#f1f5f9; font-size:19px; line-height:1.6; white-space:pre-wrap; word-break:keep-all; overflow-y:auto;';
        body.textContent = n.body || '';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '공지 닫기';
        btn.style.cssText = 'margin:0 18px 16px; padding:14px; border:none; border-radius:12px; background:#f97316; color:#fff; font-size:20px; font-weight:900; cursor:pointer;';
        btn.onclick = function () { lsSet(seenKey(), n.id); wrap.remove(); shown = false; };
        box.appendChild(head); box.appendChild(body); box.appendChild(btn);
        wrap.appendChild(box);
        document.body.appendChild(wrap);
    }

    function check() {
        if (!window.currentDriver || !window.GAS_WEB_APP_URL || shown) return;
        lastCheck = Date.now();
        fetch(window.GAS_WEB_APP_URL + '?action=get_notice')
            .then(function (r) { return r.json(); })
            .then(function (res) {
                var n = res && res.success && res.notice;
                if (n && n.id && lsGet(seenKey()) !== n.id) showNotice(n);
            })
            .catch(function () { });
    }

    // 로그인된 사람이 생기면 한 번 확인, 앱으로 다시 돌아올 때도(10분에 한 번까지) 확인
    timer = setInterval(function () { if (window.currentDriver) { clearInterval(timer); timer = null; check(); } }, 1000);
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && Date.now() - lastCheck > 10 * 60 * 1000) check();
    });

    // ---- 관리자: 공지 작성 화면 ----
    var target = 'all', picked = {}, editingId = null;
    function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function $(id) { return document.getElementById(id); }
    function users() {
        var list = (typeof getUsersList === 'function') ? getUsersList() : [];
        return list.filter(function (u) { return u && u.active !== false; }).map(function (u) { return u.name; });
    }

    window.setNoticeTarget = function (t) {
        target = t;
        document.querySelectorAll('#segNoticeTarget .seg-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.value === t); });
        var box = $('adminNoticePickList');
        if (box) box.style.display = t === 'pick' ? 'flex' : 'none';
        if (t === 'pick') renderPick();
    };
    function renderPick() {
        var box = $('adminNoticePickList');
        if (!box) return;
        box.innerHTML = '';
        users().forEach(function (name) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'seg-btn' + (picked[name] ? ' active' : '');
            b.style.flex = '0 0 auto';
            b.textContent = name;
            b.onclick = function () { picked[name] = !picked[name]; b.classList.toggle('active', !!picked[name]); };
            box.appendChild(b);
        });
    }

    window.openAdminNotice = function () { renderSaved(); loadSent(); if (target === 'pick') renderPick(); };

    window.publishAdminNotice = function () {
        var title = $('adminNoticeTitle').value.trim(), body = $('adminNoticeBody').value.trim();
        var r2 = $('adminNoticeResult'), btn = $('adminNoticePublishBtn');
        if (!title && !body) { r2.textContent = '제목이나 내용을 써 주세요.'; return; }
        var targets = '*', label = '전체 사용자';
        if (target === 'pick') {
            var names = users().filter(function (n) { return picked[n]; });
            if (!names.length) { r2.textContent = '받을 사용자를 한 명 이상 골라 주세요.'; return; }
            targets = names.join(','); label = names.length + '명(' + names.join(', ') + ')';
        }
        if (!confirm(label + '에게 공지를 배포할까요?\n\n' + title + '\n' + body)) return;
        btn.disabled = true; r2.textContent = '배포 중...';
        fetch(window.GAS_WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'admin_publish_notice', title: title, body: body, targets: targets }) })
            .then(function (r) { return r.json(); }).then(function (res) {
                btn.disabled = false;
                if (res && res.success) { r2.textContent = '배포했어요. 사용자가 앱을 열면 팝업으로 보입니다.'; loadSent(); }
                else r2.textContent = '배포하지 못했어요: ' + ((res && res.message) || '알 수 없는 오류');
            }).catch(function () { btn.disabled = false; r2.textContent = '서버에 연결하지 못했어요.'; });
    };

    function loadSent() {
        var box = $('adminNoticeSentList');
        if (!box) return;
        fetch(window.GAS_WEB_APP_URL + '?action=admin_list_notices').then(function (r) { return r.json(); }).then(function (res) {
            if (!res || !res.success) { box.innerHTML = '<div style="font-size:12px;color:#64748b;">목록을 불러오지 못했어요.</div>'; return; }
            var list = res.notices || [];
            if (!list.length) { box.innerHTML = '<div style="font-size:12px;color:#64748b;">아직 보낸 공지가 없어요.</div>'; return; }
            box.innerHTML = '';
            list.forEach(function (n) {
                var who = n.targets === '*' ? '전체 사용자' : (n.targets || []).join(', ');
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:6px;background:#1e293b;border:1px solid ' + (n.live ? '#22c55e' : '#334155') + ';border-radius:8px;padding:8px 10px;';
                row.innerHTML = '<div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:900;color:' + (n.live ? '#22c55e' : '#94a3b8') + ';">' + (n.live ? '● 배포중' : '지난 공지') + ' · ' + esc(n.createdAt || '') + '</div>' +
                    '<div style="font-size:14px;font-weight:900;color:#f8fafc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(n.title) + '</div>' +
                    '<div style="font-size:12px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(n.body) + '</div>' +
                    '<div style="font-size:11px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">받는 사람: ' + esc(who) + '</div></div>';
                var del = document.createElement('button');
                del.type = 'button'; del.textContent = '삭제';
                del.style.cssText = 'flex-shrink:0;padding:6px 10px;border:none;border-radius:8px;background:#ef4444;color:#fff;font-size:12px;font-weight:900;';
                del.onclick = function () {
                    if (!confirm('이 공지를 삭제할까요?' + (n.live ? '\n지금부터 사용자에게 배포되지 않습니다.' : ''))) return;
                    fetch(window.GAS_WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'admin_delete_notice', id: n.id }) })
                        .then(function (r) { return r.json(); }).then(function (x) { if (x && x.success) loadSent(); else alert((x && x.message) || '삭제하지 못했어요.'); })
                        .catch(function () { alert('서버에 연결하지 못했어요.'); });
                };
                row.appendChild(del);
                box.appendChild(row);
            });
        }).catch(function () { box.innerHTML = '<div style="font-size:12px;color:#64748b;">서버에 연결하지 못했어요.</div>'; });
    }

    // ---------- 저장해 둔 문구 (알림과 같은 방식: 관리자 본인 칸에 저장) ----------
    function tplKey() { return typeof getDriverKey === 'function' ? getDriverKey('notice_templates') : 'notice_templates'; }
    function loadTemplates() {
        try { var v = JSON.parse(localStorage.getItem(tplKey()) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    function storeTemplates(list) {
        if (typeof saveToGAS === 'function') saveToGAS('notice_templates', list);
        else localStorage.setItem(tplKey(), JSON.stringify(list));
    }
    function renderSaved() {
        var box = $('adminNoticeSavedList'), btn = $('adminNoticeSaveBtn');
        if (btn) btn.textContent = editingId ? '수정한 내용으로 저장' : '이 공지 문구 저장';
        if (!box) return;
        var list = loadTemplates();
        if (!list.length) { box.innerHTML = '<div style="font-size:12px;color:#64748b;">아직 저장한 문구가 없어요.</div>'; return; }
        box.innerHTML = '';
        list.forEach(function (t) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;background:#1e293b;border:1px solid ' + (t.id === editingId ? '#f97316' : '#334155') + ';border-radius:8px;padding:8px 10px;';
            row.innerHTML = '<div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:900;color:#f8fafc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(t.title) + '</div>' +
                '<div style="font-size:12px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(t.body) + '</div></div>';
            var load = document.createElement('button');
            load.type = 'button'; load.textContent = '불러오기';
            load.style.cssText = 'flex-shrink:0;padding:6px 10px;border:none;border-radius:8px;background:#0ea5e9;color:#fff;font-size:12px;font-weight:900;';
            load.onclick = function () { $('adminNoticeTitle').value = t.title; $('adminNoticeBody').value = t.body; editingId = t.id; renderSaved(); };
            var del = document.createElement('button');
            del.type = 'button'; del.textContent = '삭제';
            del.style.cssText = 'flex-shrink:0;padding:6px 10px;border:none;border-radius:8px;background:#ef4444;color:#fff;font-size:12px;font-weight:900;';
            del.onclick = function () {
                if (!confirm('"' + t.title + '" 문구를 삭제할까요?')) return;
                storeTemplates(loadTemplates().filter(function (x) { return x.id !== t.id; }));
                if (editingId === t.id) editingId = null;
                renderSaved();
            };
            row.appendChild(load); row.appendChild(del);
            box.appendChild(row);
        });
    }
    window.saveAdminNoticeTemplate = function () {
        var title = $('adminNoticeTitle').value.trim(), body = $('adminNoticeBody').value.trim(), r2 = $('adminNoticeResult');
        if (!title || !body) { r2.textContent = '저장하려면 제목과 내용을 써 주세요.'; return; }
        var list = loadTemplates();
        var cur = editingId && list.find(function (x) { return x.id === editingId; });
        if (cur) { cur.title = title; cur.body = body; }
        else { editingId = 'n' + Date.now(); list.push({ id: editingId, title: title, body: body }); }
        storeTemplates(list);
        r2.textContent = cur ? '수정해서 저장했어요.' : '저장했어요. 아래 목록에서 불러올 수 있어요.';
        renderSaved();
    };
})();
