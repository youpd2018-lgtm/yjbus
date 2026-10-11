// ================================================================
// 📢 [공지사항 팝업] script_notice.js
// - 관리자가 [관리 > 공지 작성]에 쓴 공지를, 사용자가 앱을 열면 알림 설정과 상관없이 팝업으로 보여줌
// - 사용자가 [확인]을 누르면 그 공지(번호 id)는 이 폰에서 다시 안 뜸. 관리자가 다시 저장하면 새 번호라서 또 뜸
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
        btn.textContent = '확인';
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
    window.loadAdminNotice = function () {
        fetch(window.GAS_WEB_APP_URL + '?action=admin_get_notice').then(function (r) { return r.json(); }).then(function (res) {
            var n = res && res.success && res.notice;
            if (!n) return;
            document.getElementById('adminNoticeTitle').value = n.title || '';
            document.getElementById('adminNoticeBody').value = n.body || '';
            document.getElementById('adminNoticeOn').checked = !!n.on;
            var r2 = document.getElementById('adminNoticeResult');
            if (r2) r2.textContent = '마지막 저장: ' + (n.updatedAt || '-') + (n.on ? ' (켜짐)' : ' (꺼짐)');
        }).catch(function () { });
    };
    window.saveAdminNotice = function () {
        var title = document.getElementById('adminNoticeTitle').value.trim();
        var body = document.getElementById('adminNoticeBody').value.trim();
        var on = document.getElementById('adminNoticeOn').checked;
        var r2 = document.getElementById('adminNoticeResult');
        if (on && !title && !body) { if (r2) r2.textContent = '제목이나 내용을 써 주세요.'; return; }
        if (r2) r2.textContent = '저장 중...';
        fetch(window.GAS_WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'admin_set_notice', on: on ? '1' : '0', title: title, body: body }) })
            .then(function (r) { return r.json(); }).then(function (res) {
            if (r2) r2.textContent = (res && res.success) ? ('저장했어요. ' + (on ? '이제 사용자가 앱을 열면 팝업으로 보입니다.' : '꺼 두었어요(아무에게도 안 뜸).')) : ((res && res.message) || '저장하지 못했습니다.');
        }).catch(function () { if (r2) r2.textContent = '서버에 연결하지 못했습니다.'; });
    };
})();
