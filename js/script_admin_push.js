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
        if (u) u.style.display = which === 'user' ? 'block' : 'none';
        if (p) p.style.display = which === 'push' ? 'block' : 'none';
        if (which === 'push') renderPickList();
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
        var targets = '*', label = '전체 기사';
        if (pushTarget === 'pick') {
            var names = drivers().filter(function (n) { return picked[n]; });
            if (!names.length) { result.textContent = '받을 기사를 한 명 이상 골라 주세요.'; return; }
            targets = names.join(','); label = names.length + '명(' + names.join(', ') + ')';
        }
        if (!confirm(label + '에게 알림을 보낼까요?\n\n' + title + '\n' + body)) return;
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
            .adminSendPush(title, body, targets);
    };
})();
