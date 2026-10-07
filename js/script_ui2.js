// ================================================================
// 🆕 [새 디자인 ui2] script_ui2.js  (메인 화면 리뉴얼 1단계)
// - 설정 > 새 디자인 미리보기 스위치 (localStorage yb_ui2), 또는 주소 끝 ?ui2=1
// - 켜면 <html> 에 'ui2' 클래스가 붙고, 새 날짜 줄·페이지 탭이 보인다
// - 날짜 계산, 시간표 채우기 등 기존 기능은 건드리지 않는다 (id 그대로)
// - 페이지: 'drive'(오늘 운행) / 'table'(시간표) — <html> 에 ui2-drive / ui2-table 클래스
// ================================================================
(function () {
    var LS_KEY = 'yb_ui2';
    var html = document.documentElement;
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }

    window.ui2IsOn = function () { return lsGet(LS_KEY) === '1'; };

    function applyFlag() {
        var on = window.ui2IsOn();
        html.classList.toggle('ui2', on);
        if (on && !html.classList.contains('ui2-drive') && !html.classList.contains('ui2-table')) {
            html.classList.add('ui2-drive');
        }
        if (!on) html.classList.remove('ui2-drive', 'ui2-table');
    }

    window.setUi2Mode = function (on) {
        if (on) lsSet(LS_KEY, '1'); else lsDel(LS_KEY);
        applyFlag();
        window.updateUi2SettingsUI();
        if (on) renderDate();
    };
    window.updateUi2SettingsUI = function () {
        var on = window.ui2IsOn();
        var sw = document.getElementById('ui2Switch');
        if (sw) sw.checked = on;
        var txt = document.getElementById('ui2StateText');
        if (txt) txt.innerText = on ? '켜짐 (메인 화면이 새 모양)' : '꺼짐';
    };

    // ---- 페이지 전환 (오늘 운행 / 시간표) ----
    window.yb2SetPage = function (page) {
        var isTable = (page === 'table');
        html.classList.toggle('ui2-table', isTable);
        html.classList.toggle('ui2-drive', !isTable);
        var a = document.getElementById('yb2TabDrive');
        var b = document.getElementById('yb2TabTable');
        if (a) a.classList.toggle('on', !isTable);
        if (b) b.classList.toggle('on', isTable);
    };

    // ---- 날짜 줄 ----
    var DOW = ['일', '월', '화', '수', '목', '금', '토'];
    function renderDate() {
        var inp = document.getElementById('searchDate');
        var md = document.getElementById('yb2DateMD');
        if (!inp || !inp.value || !md) return;
        var p = inp.value.split('-');
        if (p.length !== 3) return;
        var d = new Date(+p[0], +p[1] - 1, +p[2]);
        md.textContent = (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
        var dow = document.getElementById('yb2DateDow');
        if (dow) dow.textContent = DOW[d.getDay()] + '요일';
        var t = new Date(); t = new Date(t.getFullYear(), t.getMonth(), t.getDate());
        var diff = Math.round((d - t) / 86400000);
        var rel = '';
        if (diff === 0) rel = '오늘';
        else if (diff === 1) rel = '내일';
        else if (diff === -1) rel = '어제';
        else if (diff === 2) rel = '모레';
        else if (diff > 0) rel = diff + '일 후';
        else rel = (-diff) + '일 전';
        var r = document.getElementById('yb2DateRel');
        if (r) r.textContent = rel;
    }

    // 기존 코드가 날짜 글자(#dateDisplayText)를 바꿀 때마다 새 날짜 줄도 같이 갱신
    function watchDate() {
        var el = document.getElementById('dateDisplayText');
        if (el && window.MutationObserver) {
            new MutationObserver(renderDate).observe(el, { childList: true, characterData: true, subtree: true });
        }
        var inp = document.getElementById('searchDate');
        if (inp) inp.addEventListener('change', renderDate);
        renderDate();
    }

    // ---- 좌우 밀기(스와이프): 60px 이상, 가로가 세로보다 클 때만 ----
    function initSwipe() {
        var page = document.getElementById('mainPage');
        if (!page) return;
        var sx = 0, sy = 0, ok = false;
        page.addEventListener('touchstart', function (e) {
            ok = false;
            if (!window.ui2IsOn() || e.touches.length !== 1) return;
            if (e.target.closest && e.target.closest('textarea, input, #resTimetable')) return;
            sx = e.touches[0].clientX; sy = e.touches[0].clientY; ok = true;
        }, { passive: true });
        page.addEventListener('touchend', function (e) {
            if (!ok) return;
            ok = false;
            var t = e.changedTouches[0];
            var dx = t.clientX - sx, dy = t.clientY - sy;
            if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
            window.yb2SetPage(dx < 0 ? 'table' : 'drive');   // 왼쪽으로 밀면 시간표, 오른쪽으로 밀면 오늘 운행
        }, { passive: true });
    }

    function init() {
        applyFlag();
        window.updateUi2SettingsUI();
        watchDate();
        initSwipe();
        if (html.classList.contains('ui2-table')) window.yb2SetPage('table');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
