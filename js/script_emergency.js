// ================================================================
// 📞 [긴급전화] script_emergency.js
// - 하단 [긴급전화] 메뉴: 이름과 전화걸기 버튼 목록 (누르면 전화 앱으로 연결)
// - 모든사용자 화면에서 기사님 이름을 누르면 그 기사님께 전화 연결 (window.callUserByName)
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
                { name: '이건호 전무', phone: '01059411358' },
                { name: '강영걸 부장', phone: '01027924441' },
                { name: '신용준 공장장', phone: '01023966397' },
                { name: '공동국 차장', phone: '01052588200' },
                { name: '최하늘 과장', phone: '01026808152' },
                { name: '최승규 대리', phone: '01064495313' }
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
                    '<div style="font-size:12px; color:#94a3b8; margin-top:2px;">' + fmt(it.phone) + '</div>' +
                    '</div>' +
                    '<a href="tel:' + it.phone + '" style="flex-shrink:0; display:flex; align-items:center; gap:4px; background:#16a34a; color:#fff; text-decoration:none; font-size:14px; font-weight:900; padding:10px 14px; border-radius:10px;">' +
                    '<iconify-icon icon="mdi:phone" style="font-size:18px;"></iconify-icon> 전화걸기</a>' +
                    '</div>';
            });
        });
        box.innerHTML = html;
    };

    // 모든사용자 화면: 기사님 이름 칸을 누르면 전화 연결
    window.callUserByName = function (name) {
        var users = (typeof getUsersList === 'function') ? getUsersList() : [];
        var u = users.find(function (x) { return x && x.name === name; });
        var phone = u && u.phone ? String(u.phone).replace(/[^0-9]/g, '') : '';
        if (!phone) {
            if (typeof Swal !== 'undefined') Swal.fire({ toast: true, position: 'top', timer: 2200, showConfirmButton: false, icon: 'info', title: name + ' 기사님은 연락처가 아직 없어요', background: '#1e293b', color: '#fff' });
            else alert(name + ' 기사님은 연락처가 아직 등록되지 않았어요.');
            return;
        }
        if (name === window.currentDriver) return;   // 내 이름은 전화하지 않음
        if (typeof Swal === 'undefined') { location.href = 'tel:' + phone; return; }
        Swal.fire({
            title: name + ' 기사님께 전화할까요?',
            text: fmt(phone),
            showCancelButton: true,
            confirmButtonText: '전화걸기',
            cancelButtonText: '취소',
            confirmButtonColor: '#16a34a',
            background: '#1e293b',
            color: '#fff'
        }).then(function (r) { if (r.isConfirmed) location.href = 'tel:' + phone; });
    };
})();
