// ================================================================
// 📞 [긴급전화] script_emergency.js
// - 하단 [긴급전화] 메뉴: 이름과 전화걸기 버튼 목록 (누르면 전화 앱으로 연결)
// - 사람 이름이 붙은 항목은 전화번호 글자를 숨기고 [전화걸기] 단추만 보여 줌
// ================================================================
(function () {
    var EMERGENCY_GROUPS = [
        {
            title: '정비 · 사고', color: '#f97316', items: [
                { name: '타이어 수리', phone: '01023259030' },
                { name: '차량고장 렉카', phone: '01052627512' }
            ]
        },
        {
            title: '회사', color: '#38bdf8', items: [
                { name: '이건호 전무', phone: '01059411358', hidePhone: true },
                { name: '강영걸 부장', phone: '01027924441', hidePhone: true },
                { name: '신용준 공장장', phone: '01023966397', hidePhone: true },
                { name: '공동국 차장', phone: '01052588200', hidePhone: true },
                { name: '최하늘 과장', phone: '01026808152', hidePhone: true },
                { name: '최승규 대리', phone: '01064495313', hidePhone: true }
            ]
        },
        {
            title: '단말기', color: '#a78bfa', items: [
                { name: '티머니 단말기', phone: '0802082992' },
                { name: 'LTE 단말기', phone: '07041264836' }
            ]
        }
    ];

    function fmt(p) {
        p = String(p || '').replace(/[^0-9]/g, '');
        if (p.length === 11) return p.slice(0, 3) + '-' + p.slice(3, 7) + '-' + p.slice(7);
        if (p.length === 10) return p.slice(0, 3) + '-' + p.slice(3, 6) + '-' + p.slice(6);
        return p;
    }

    // 구차장 음성 전화 찾기가 쓰는 연락처 목록 (이름과 번호는 폰 안에서만 사용)
    window.ytEmergencyContacts = function () {
        var list = [];
        EMERGENCY_GROUPS.forEach(function (g) {
            g.items.forEach(function (it) { list.push({ name: it.name, phone: it.phone, group: g.title }); });
        });
        return list;
    };

    window.renderEmergencyPage = function () {
        var box = document.getElementById('emergencyList');
        if (!box) return;
        var html = '';
        EMERGENCY_GROUPS.forEach(function (g) {
            html += '<div style="font-size:13px; font-weight:900; color:' + g.color + '; margin:12px 4px 6px;">' + g.title + '</div>';
            g.items.forEach(function (it) {
                html += '<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; background:#1e293b; border:1px solid #334155; border-radius:12px; padding:10px 12px; margin-bottom:8px;">' +
                    '<div style="min-width:0;">' +
                    '<div style="font-size:16px; font-weight:900; color:#f8fafc;">' + it.name + '</div>' +
                    (it.hidePhone ? '' : '<div style="font-size:12px; color:#94a3b8; margin-top:2px;">' + fmt(it.phone) + '</div>') +
                    '</div>' +
                    '<a href="#" onclick="return window.confirmCall(\'' + it.name + '\', \'' + it.phone + '\', ' + (it.hidePhone ? 'false' : 'true') + ');" style="flex-shrink:0; display:flex; align-items:center; gap:4px; background:#16a34a; color:#fff; text-decoration:none; font-size:14px; font-weight:900; padding:10px 14px; border-radius:10px;">' +
                    '<iconify-icon icon="mdi:phone" style="font-size:18px;"></iconify-icon> 전화걸기</a>' +
                    '</div>';
            });
        });
        box.innerHTML = html;
    };

    // 전화는 한 번 눌러서 바로 걸리지 않고, 한 번 더 확인한 뒤에 건다. (실수로 걸리는 것 방지)
    // 사람 이름 연락처는 확인 창에도 번호를 보이지 않는다 (showNumber=false)
    window.confirmCall = function (name, phone, showNumber) {
        var digits = String(phone || '').replace(/[^0-9]/g, '');
        if (!digits) return false;
        if (typeof Swal === 'undefined') {
            if (confirm(name + '께 전화할까요?')) location.href = 'tel:' + digits;
            return false;
        }
        Swal.fire({
            title: name + '께 전화할까요?',
            text: showNumber ? fmt(digits) : '',
            showCancelButton: true,
            confirmButtonText: '전화걸기',
            cancelButtonText: '취소',
            confirmButtonColor: '#16a34a',
            background: '#1e293b',
            color: '#fff'
        }).then(function (r) { if (r.isConfirmed) location.href = 'tel:' + digits; });
        return false;
    };
})();
