// ================================================================
// 🔔 [관리자 알림 보내기] script_admin_push.js
// - 관리자 화면의 [알림 보내기] 메뉴: 제목·내용을 써서 전체 기사 또는 고른 기사에게 푸시 알림을 보냄
// - 서버(PushNotify.js의 pushAdminSend_)가 관리자인지 다시 확인한 뒤 보냄
// ================================================================
(function () {
    var pushTarget = 'all';
    var picked = {};

    window.selectAdminMenu = function (which) {
        document.querySelectorAll('#segAdminMenu .seg-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.value === which); });
        var u = document.getElementById('subPageUser'), p = document.getElementById('subPagePush');
        if (u) u.classList.toggle('active', which === 'user');   // 화면 규칙이 .active 로만 보이게 함
        if (p) p.classList.toggle('active', which === 'push');
        if (which === 'push') { renderPickList(); renderSaved(); }
    };

    window.setPushTarget = function (t) {
        pushTarget = t;
        document.querySelectorAll('#segPushTarget .seg-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.value === t); });
        var box = document.getElementById('adminPushPickList');
        if (box) box.style.display = t === 'pick' ? 'flex' : 'none';
        if (t === 'pick') renderPickList();
    };

    function drivers() {
        var list = (typeof getUsersList === 'function') ? getUsersList() : [];
        return list.filter(function (u) { return u && u.userType !== 'family' && u.active !== false; })
            .map(function (u) { return u.name; });
    }

    function renderPickList() {
        var box = document.getElementById('adminPushPickList');
        if (!box) return;
        box.innerHTML = '';
        drivers().forEach(function (name) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'seg-btn' + (picked[name] ? ' active' : '');
            b.style.flex = '0 0 auto';
            b.textContent = name;
            b.onclick = function () { picked[name] = !picked[name]; b.classList.toggle('active', !!picked[name]); };
            box.appendChild(b);
        });
    }

    window.sendAdminPush = function () {
        var title = (document.getElementById('adminPushTitle').value || '').trim();
        var body = (document.getElementById('adminPushBody').value || '').trim();
        var result = document.getElementById('adminPushResult');
        var btn = document.getElementById('adminPushSendBtn');
        if (!title || !body) { result.textContent = '제목과 내용을 모두 써 주세요.'; return; }
        var sender = (document.getElementById('adminPushSender').value || '').trim();
        var targets = '*', label = '전체 기사';
        if (pushTarget === 'pick') {
            var names = drivers().filter(function (n) { return picked[n]; });
            if (!names.length) { result.textContent = '받을 기사를 한 명 이상 골라 주세요.'; return; }
            targets = names.join(','); label = names.length + '명(' + names.join(', ') + ')';
        }
        if (!confirm(label + '에게 알림을 보낼까요?\n\n' + title + '\n' + body + (sender ? '\n- ' + sender : ''))) return;
        btn.disabled = true; result.textContent = '보내는 중...';
        google.script.run
            .withSuccessHandler(function (res) {
                btn.disabled = false;
                if (!res || !res.success) { result.textContent = '보내지 못했어요: ' + ((res && (res.message || res.error)) || '알 수 없는 오류'); return; }
                var t = res.sent + '명에게 보냈어요.';
                if (res.noToken && res.noToken.length) t += '\n알림을 켜지 않아 못 받은 분: ' + res.noToken.join(', ');
                result.textContent = t;
            })
            .withFailureHandler(function () { btn.disabled = false; result.textContent = '서버에 연결하지 못했어요.'; })
            .adminSendPush(title, body, targets, sender);
    };
    // ---------- 저장한 메시지 (제목·내용·보낸사람) ----------
    // 서버에 관리자 본인 칸으로 저장되어 다른 폰에서도 보임. 불러와서 고친 뒤 [수정한 내용으로 저장]을 누르면 같은 메시지가 수정됨
    var editingId = null;

    function tplKey() { return typeof getDriverKey === 'function' ? getDriverKey('push_templates') : 'push_templates'; }
    function loadTemplates() {
        try { var v = JSON.parse(localStorage.getItem(tplKey()) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    function storeTemplates(list) {
        if (typeof saveToGAS === 'function') saveToGAS('push_templates', list);
        else localStorage.setItem(tplKey(), JSON.stringify(list));
    }
    function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    function renderSaved() {
        var box = document.getElementById('adminPushSavedList');
        var btn = document.getElementById('adminPushSaveBtn');
        if (btn) btn.textContent = editingId ? '수정한 내용으로 저장' : '이 메시지 저장';
        if (!box) return;
        var list = loadTemplates();
        if (!list.length) { box.innerHTML = '<div style="font-size:12px;color:#64748b;">아직 저장한 메시지가 없어요.</div>'; return; }
        box.innerHTML = '';
        list.forEach(function (t) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;background:#1e293b;border:1px solid ' + (t.id === editingId ? '#f97316' : '#334155') + ';border-radius:8px;padding:8px 10px;';
            row.innerHTML = '<div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:900;color:#f8fafc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(t.title) + '</div>' +
                '<div style="font-size:12px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(t.body) + (t.sender ? ' - ' + esc(t.sender) : '') + '</div></div>';
            var load = document.createElement('button');
            load.type = 'button'; load.textContent = '불러오기';
            load.style.cssText = 'flex-shrink:0;padding:6px 10px;border:none;border-radius:8px;background:#0ea5e9;color:#fff;font-size:12px;font-weight:900;';
            load.onclick = function () {
                document.getElementById('adminPushTitle').value = t.title;
                document.getElementById('adminPushBody').value = t.body;
                document.getElementById('adminPushSender').value = t.sender || '';
                editingId = t.id; renderSaved();
            };
            var del = document.createElement('button');
            del.type = 'button'; del.textContent = '삭제';
            del.style.cssText = 'flex-shrink:0;padding:6px 10px;border:none;border-radius:8px;background:#ef4444;color:#fff;font-size:12px;font-weight:900;';
            del.onclick = function () {
                if (!confirm('"' + t.title + '" 메시지를 삭제할까요?')) return;
                storeTemplates(loadTemplates().filter(function (x) { return x.id !== t.id; }));
                if (editingId === t.id) editingId = null;
                renderSaved();
            };
            row.appendChild(load); row.appendChild(del);
            box.appendChild(row);
        });
    }

    window.saveAdminPushTemplate = function () {
        var title = (document.getElementById('adminPushTitle').value || '').trim();
        var body = (document.getElementById('adminPushBody').value || '').trim();
        var sender = (document.getElementById('adminPushSender').value || '').trim();
        var result = document.getElementById('adminPushResult');
        if (!title || !body) { result.textContent = '저장하려면 제목과 내용을 써 주세요.'; return; }
        var list = loadTemplates();
        var cur = editingId && list.find(function (x) { return x.id === editingId; });
        if (cur) { cur.title = title; cur.body = body; cur.sender = sender; }
        else { editingId = 't' + Date.now(); list.push({ id: editingId, title: title, body: body, sender: sender }); }
        storeTemplates(list);
        result.textContent = cur ? '수정해서 저장했어요.' : '저장했어요. 아래 목록에서 불러올 수 있어요.';
        renderSaved();
    };
})();
