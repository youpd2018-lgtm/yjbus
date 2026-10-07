// ================================================================
// 🆕 [새 디자인 ui2] script_ui2.js  (메인 화면 리뉴얼 1단계)
// - 기본으로 켜짐. 되돌리기: 주소 끝 ?ui2=0 (localStorage yb_ui2='0'), 다시 켜기: ?ui2=1
// - 켜면 <html> 에 'ui2' 클래스가 붙고, 새 날짜 줄·페이지 탭이 보인다
// - 날짜 계산, 시간표 채우기 등 기존 기능은 건드리지 않는다 (id 그대로)
// - 새 메인 박스·시간표 카드는 숨겨 둔 기존 요소의 글자를 따라 적는 방식 (기존 JS 그대로 작동)
// - 페이지: 'drive'(오늘 운행) / 'table'(시간표) — <html> 에 ui2-drive / ui2-table 클래스
// ================================================================
(function () {
    var LS_KEY = 'yb_ui2';
    var html = document.documentElement;
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }

    window.ui2IsOn = function () { return lsGet(LS_KEY) !== '0'; };   // 기본 켜짐, '0' 이면 예전 화면

    function applyFlag() {
        var on = window.ui2IsOn();
        html.classList.toggle('ui2', on);
        if (on && !html.classList.contains('ui2-drive') && !html.classList.contains('ui2-table')) {
            html.classList.add('ui2-drive');
        }
        if (!on) html.classList.remove('ui2-drive', 'ui2-table');
    }

    window.setUi2Mode = function (on) {
        if (on) lsDel(LS_KEY); else lsSet(LS_KEY, '0');
        applyFlag();
        window.updateUi2SettingsUI();
        if (on) { renderDate(); syncTab(); }
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
        if (isTable && typeof currentScheduleTab !== 'undefined' && currentScheduleTab !== 'timetable'
            && typeof switchScheduleTab === 'function') {
            switchScheduleTab('timetable');   // 시간표 탭을 누르면 항상 시간표 카드부터
        }
        syncTab();
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


    // ---- 하단 3버튼 (노선정보 / 교대정보 / 메모) ----
    function syncTab() {
        var cur = (typeof currentScheduleTab !== 'undefined') ? currentScheduleTab : 'timetable';
        html.classList.toggle('ui2-tt', cur === 'timetable');
        [['route', 'yb2BtnRoute'], ['shift', 'yb2BtnShift'], ['memo', 'yb2BtnMemo']].forEach(function (a) {
            var b = document.getElementById(a[1]);
            if (b) b.classList.toggle('on', cur === a[0]);
        });
        var sts = document.querySelectorAll('#yb2Subtabs .yb2-st');
        for (var i = 0; i < sts.length; i++) sts[i].classList.toggle('on', sts[i].getAttribute('data-tab') === cur);
    }
    window.yb2Pick = function (name) {   // 노안모드 위쪽 작은 탭: 누른 칸으로 바로 이동
        var cur = (typeof currentScheduleTab !== 'undefined') ? currentScheduleTab : 'timetable';
        if (cur !== name && typeof switchScheduleTab === 'function') switchScheduleTab(name);
        syncTab();
    };
    window.yb2Tab = function (name) {
        if (typeof switchScheduleTab !== 'function') return;
        var cur = (typeof currentScheduleTab !== 'undefined') ? currentScheduleTab : 'timetable';
        switchScheduleTab(cur === name ? 'timetable' : name);   // 같은 버튼을 다시 누르면 시간표로 복귀
        syncTab();
    };

    // ---- 기존(숨겨진) 요소의 글자를 새 요소가 그대로 따라 적기 ----
    function txt(id) { var e = document.getElementById(id); return e ? (e.textContent || '').trim() : ''; }
    function setTxt(id, v) { var e = document.getElementById(id); if (e && e.textContent !== v) e.textContent = v; }
    function mirror(src, dst) {
        var el = document.getElementById(src);
        if (!el) return;
        var run = function () { setTxt(dst, txt(src)); };
        run();
        if (window.MutationObserver) new MutationObserver(run).observe(el, { childList: true, characterData: true, subtree: true });
    }

    // ---- 시간 카운트 박스 (5가지 상태) ----
    var C = 201;   // 둥근 표시 한 바퀴 길이
    function renderCountdown() {
        var label = txt('resStopSignSubLabel');
        var timerTxt = txt('resMainCountdownTimer');
        var wrap = document.getElementById('resMainCountdownTimerWrap');
        var isCount = wrap && wrap.style.display !== 'none' && timerTxt !== '';
        var L = document.getElementById('yb2CdL'), V = document.getElementById('yb2CdV');
        var ring = document.getElementById('yb2Ring'), dot = document.getElementById('yb2Dot');
        if (!L || !V || !ring || !dot) return;
        var lHtml, vTxt, vColor = '#fff', rColor = '#38bdf8', off = 90, dColor = '#ef4444';
        if (isCount) {                       // 교대 전 / 첫 운행 전 대기
            lHtml = label; vTxt = timerTxt;
        } else if (label.indexOf('운행중') >= 0) {   // 운행중
            lHtml = '<b>LIVE</b> 박스를 터치하세요'; vTxt = '운행중'; vColor = '#4ade80'; rColor = '#4ade80'; off = 0;
        } else if (label.indexOf('휴무') >= 0) {     // 휴무
            lHtml = ''; vTxt = '휴무'; vColor = '#cbd5e1'; rColor = '#475569'; off = 0; dColor = '#64748b';
        } else if (label.indexOf('미등록') >= 0) {   // 미등록
            lHtml = ''; vTxt = '미등록'; vColor = '#94a3b8'; rColor = '#475569'; off = 0; dColor = '#64748b';
        } else {                              // 운행종료·운행준비중 등
            lHtml = ''; vTxt = label || '-'; vColor = '#94a3b8'; rColor = '#475569'; off = 0; dColor = '#64748b';
        }
        var cd = document.getElementById('yb2Cd');
        if (cd) cd.classList.toggle('msg', !isCount && label.indexOf('운행중') < 0);   // 휴무·미등록·운행종료 등은 박스 가운데에
        if (L.innerHTML !== lHtml) L.innerHTML = lHtml;
        if (V.textContent !== vTxt) V.textContent = vTxt;
        V.style.color = vColor;
        ring.setAttribute('stroke', rColor);
        ring.setAttribute('stroke-dashoffset', String(off));
        dot.setAttribute('fill', dColor);
    }
    function watchCountdown() {
        if (!window.MutationObserver) return;
        var o = new MutationObserver(renderCountdown);
        ['resStopSignSubLabel', 'resMainCountdownTimer', 'resMainCountdownTimerWrap'].forEach(function (id) {
            var e = document.getElementById(id);
            if (e) o.observe(e, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        });
        renderCountdown();
    }

    // ---- 시간표 카드 (기존 #mainScheduleTable 표를 읽어서 만듦) ----
    var cardsQueued = false;
    function esc(v) { return String(v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function renderCards() {
        cardsQueued = false;
        var box = document.getElementById('yb2Cards');
        var table = document.getElementById('mainScheduleTable');
        if (!box) return;
        if (!table) {
            var msg = txt('resTimetable') || '시간표가 없습니다.';
            box.innerHTML = '<div class="yb2-empty">' + esc(msg) + '</div>';
            return;
        }
        var headers = [], out = '';
        var rows = table.querySelectorAll('tr');
        for (var i = 0; i < rows.length; i++) {
            var tr = rows[i];
            if (tr.hasAttribute('data-rowidx')) {
                var tds = tr.querySelectorAll('td');
                var cls = 'yb2-trip' + (tr.classList.contains('highlight-next-trip') ? ' next' : '') + (tr.classList.contains('past-trip') ? ' past' : '');
                var cells = '';
                for (var j = 1; j < tds.length; j++) {
                    var sp = tds[j].querySelector('span');
                    var t = (tds[j].textContent || '').trim();
                    var yellow = sp && sp.className.indexOf('effect-yellow') >= 0;
                    cells += '<div class="yb2-trip-c"><span class="yb2-trip-t' + (yellow ? ' y' : '') + '">' + esc(t || '-') + '</span>' +
                        '<span class="yb2-trip-p">' + esc(headers[j - 1] || '') + '</span></div>';
                }
                out += '<div class="' + cls + '">' +
                    '<div class="yb2-trip-n">' + esc((tds[0].textContent || '').trim()) + (cls.indexOf(' next') >= 0 ? '<small>다음 출발</small>' : '') + '</div>' + cells + '</div>';
            } else {
                var ths = tr.querySelectorAll('th');
                if (ths.length > 1) {
                    headers = [];
                    for (var k = 1; k < ths.length; k++) headers.push((ths[k].textContent || '').trim().replace(/^-$/, ''));
                }
            }
        }
        box.innerHTML = out || '<div class="yb2-empty">시간표 데이터가 없습니다.</div>';
    }
    function queueCards() {
        if (cardsQueued) return;
        cardsQueued = true;
        (window.requestAnimationFrame || setTimeout)(renderCards);
    }
    function watchTimetable() {
        var el = document.getElementById('resTimetable');
        if (!el || !window.MutationObserver) return;
        new MutationObserver(queueCards).observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        renderCards();
    }

    function initCards() {
        mirror('bliRouteNum', 'yb2Route');
        mirror('bliSeqNum', 'yb2Seq');
        mirror('bliSeqLabel', 'yb2SeqLbl');
        mirror('resRouteSub', 'yb2Sub');
        mirror('bliBusNo', 'yb2BusNo');
        mirror('bliStartTime', 'yb2Start');
        mirror('bliEndTime', 'yb2End');
        mirror('bliHandoverTime', 'yb2Hand');
        // 이름(기사님): 기존 코드가 나중에 채우므로 #ybHeroTitle 안쪽 변화를 계속 지켜봄
        var nm = function () { setTxt('yb2Name', txt('ybHeroTitleText')); };
        var hero = document.getElementById('ybHeroTitle');
        if (hero && window.MutationObserver) new MutationObserver(nm).observe(hero, { childList: true, characterData: true, subtree: true });
        nm();
        // 🎨 난이도 색 선택 원: 새 메인 박스 오른쪽 위로 옮김 (기존 코드는 id 로 찾으므로 그대로 작동)
        var diff = document.getElementById('ybDiffWrap'), band = document.getElementById('yb2Band');
        if (diff && band && diff.parentNode !== band) band.appendChild(diff);
        watchCountdown();
        watchTimetable();
    }

    function init() {
        applyFlag();
        window.updateUi2SettingsUI();
        watchDate();
        initSwipe();
        initCards();
        syncTab();
        if (html.classList.contains('ui2-table')) window.yb2SetPage('table');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
