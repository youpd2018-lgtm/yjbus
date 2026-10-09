// ================================================================
// 🆕 [새 메인 화면 ui3 "버스 콕핏"] script_ui3.js
// - 켜짐/꺼짐: <html> 의 'ui3' 클래스 (index.html head 에서 붙임). 되돌리기 ?ui3=0, 다시 켜기 ?ui3=1
// - 노안모드(html.senior)에서는 CSS 가 적용되지 않아 기존 화면 그대로
// - 값은 script_ui2.js 가 채우는 숨은 박스(#yb2Route 등)를 따라 적는 방식 → 기존 JS 는 그대로 작동
// - 헤드라이트(눈) = 난이도 색 선택 (js/script_difficulty.js 의 window.ybDiffApi 사용, 양쪽 눈 동시에 바뀜)
// ================================================================
(function () {
    var html = document.documentElement;
    function $(id) { return document.getElementById(id); }
    function txt(id) { var e = $(id); return e ? (e.textContent || '').trim() : ''; }
    function setTxt(id, v) { var e = $(id); if (e && e.textContent !== v) e.textContent = v; }
    function watch(id, fn, attrs) {
        var el = $(id);
        if (!el || !window.MutationObserver) return;
        var o = { childList: true, characterData: true, subtree: true };
        if (attrs) { o.attributes = true; o.attributeFilter = attrs; }
        new MutationObserver(fn).observe(el, o);
    }

    // ---- 노선·순번·대수·차량번호 ----
    function renderBus() {
        var bus = $('yb3Bus');
        if (!bus) return;
        var route = txt('yb2Route');
        var working = route !== '' && route !== '-';
        bus.classList.toggle('off', !working);
        if (working) {
            setTxt('yb3Route', route);
        } else {
            // 휴무·미등록 등: 시간 카운트 칸에서 쓰는 안내 글자를 크게 보여 줌
            var msg = txt('yb2CdV');
            if (!msg || /^\d\d:\d\d/.test(msg)) msg = '휴무';
            setTxt('yb3Route', msg);
            bus.classList.toggle('noreset', msg !== '휴무');
        }
        // 평일 16대 / 6순번
        var sub = txt('yb2Sub'), seq = txt('yb2Seq'), lbl = txt('yb2SeqLbl');
        setTxt('yb3Fleet', sub);
        setTxt('yb3Seq', seq && seq !== '-' ? seq + (lbl || '순번') : '');
        // 차량번호: 뒤 네 자리만
        var no = txt('yb2BusNo').replace(/[^\d]/g, '');
        setTxt('yb3Plate', no ? no.slice(-4) : '');
        renderEyes();
        renderArc();
    }

    // ---- 시작 / 종료 / 교대 ----
    function renderTimes() {
        setTxt('yb3Start', txt('yb2Start'));
        setTxt('yb3End', txt('yb2End'));
        setTxt('yb3Hand', txt('yb2Hand'));
        renderArc();
    }

    // ---- 시간 카운트 (두 줄) ----
    function renderCd() {
        var L = $('yb2CdL'), V = $('yb2CdV'), l = $('yb3CdL'), v = $('yb3CdV');
        if (!L || !V || !l || !v) return;
        if (l.innerHTML !== L.innerHTML) l.innerHTML = L.innerHTML;
        if (v.textContent !== V.textContent) v.textContent = V.textContent;
        if (v.style.color !== V.style.color) v.style.color = V.style.color;
        renderBus();   // 휴무 글자 따라가기
    }

    // ---- 하루 진행선: 오늘은 시작~종료 사이 지금 위치, 지난 날은 한 바퀴, 앞날은 0 ----
    function toMin(s) { var m = /(\d{1,2}):(\d\d)/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
    function renderArc() {
        var arc = $('yb3Arc'), bus = $('yb3Bus');
        if (!arc || !bus) return;
        var frac = 0;
        if (!bus.classList.contains('off')) {
            var inp = $('searchDate'), s = toMin(txt('yb2Start')), e = toMin(txt('yb2End'));
            if (inp && inp.value && s !== null && e !== null) {
                var p = inp.value.split('-');
                var d = new Date(+p[0], +p[1] - 1, +p[2]);
                var now = new Date();
                var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                if (d < t0) frac = 1;
                else if (d > t0) frac = 0;
                else {
                    if (e <= s) e += 1440;
                    var cur = now.getHours() * 60 + now.getMinutes();
                    if (cur < s && e > 1440 && cur + 1440 <= e) cur += 1440;   // 자정 넘긴 운행의 새벽 시간
                    frac = Math.max(0, Math.min(1, (cur - s) / (e - s)));
                }
            }
        }
        arc.setAttribute('stroke-dasharray', Math.round(frac * 1000) + ' 1000');
    }

    // ---- 날짜 줄: 오늘이면 html 에 표시, 날짜 입력칸 맞추기 ----
    function renderDateBits() {
        html.classList.toggle('yb3-today', txt('yb2DateRel') === '오늘');
        var s = $('searchDate'), i = $('yb3DateIn');
        if (s && i && i.value !== s.value) i.value = s.value;
        renderArc();
    }
    window.yb3GoToday = function () {
        var s = $('searchDate');
        if (!s) return;
        var t = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
        s.value = t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
        if (typeof onDateInputChange === 'function') onDateInputChange();
    };

    // ---- 헤드라이트(눈) = 난이도 색 ----
    function renderEyes() {
        var api = window.ybDiffApi, bus = $('yb3Bus');
        if (!bus) return;
        var c = api && api.color ? api.color() : '';
        var def = (api && api.colors && api.colors[c]) || null;
        var fill = def ? def.bg : 'rgba(255,255,255,0.92)';
        var ring = def ? def.ring : '#FFFFFF';
        var glow = def ? def.glow : 'rgba(255,255,255,0.35)';
        var eyes = bus.querySelectorAll('.yb3-eye');
        for (var i = 0; i < eyes.length; i++) {
            eyes[i].setAttribute('fill', fill);
            eyes[i].setAttribute('stroke', ring);
            eyes[i].style.filter = 'drop-shadow(0 0 7px ' + glow + ')';
        }
        var btns = document.querySelectorAll('#yb3Lamp button');
        for (var j = 0; j < btns.length; j++) {
            var k = btns[j].getAttribute('data-c'), cd = api && api.colors ? api.colors[k] : null;
            if (cd) { btns[j].style.background = cd.bg; btns[j].style.boxShadow = '0 0 8px ' + cd.glow; }
            btns[j].classList.toggle('sel', k === c);
        }
    }
    function lampBox() { return $('yb3Lamp'); }
    window.yb3Lamp = function () {
        var api = window.ybDiffApi, box = lampBox();
        if (!box || !api || !api.hasKey()) return;   // 노선·순번이 정해진 날에만
        box.hidden = !box.hidden;
        renderEyes();
    };
    function initLamp() {
        var box = lampBox();
        if (!box) return;
        box.addEventListener('click', function (ev) {
            var b = ev.target.closest && ev.target.closest('button[data-c]');
            if (!b) return;
            ev.stopPropagation();
            if (window.ybDiffApi) window.ybDiffApi.set(b.getAttribute('data-c'));   // 양쪽 눈이 같이 바뀜
            box.hidden = true;
            renderEyes();
        });
        document.addEventListener('click', function (ev) {
            if (box.hidden) return;
            if (ev.target.closest && (ev.target.closest('#yb3Lamp') || ev.target.closest('.yb3-hit'))) return;
            box.hidden = true;
        });
        document.addEventListener('yb-diff-change', renderEyes);
    }

    function initDateInput() {
        var i = $('yb3DateIn');
        if (!i) return;
        i.addEventListener('change', function () {
            var s = $('searchDate');
            if (!s || !i.value) return;
            s.value = i.value;
            if (typeof onDateInputChange === 'function') onDateInputChange();
        });
    }

    function init() {
        if (!$('yb3Bus')) return;
        ['yb2Route', 'yb2Seq', 'yb2SeqLbl', 'yb2Sub', 'yb2BusNo'].forEach(function (id) { watch(id, renderBus); });
        ['yb2Start', 'yb2End', 'yb2Hand'].forEach(function (id) { watch(id, renderTimes); });
        watch('yb2CdL', renderCd); watch('yb2CdV', renderCd, ['style']);
        watch('yb2DateRel', renderDateBits);
        var inp = $('searchDate');
        if (inp) inp.addEventListener('change', renderDateBits);
        var dd = $('dateDisplayText');
        if (dd && window.MutationObserver) new MutationObserver(renderDateBits).observe(dd, { childList: true, characterData: true, subtree: true });
        initLamp();
        initDateInput();
        renderBus(); renderTimes(); renderCd(); renderDateBits();
        setInterval(renderArc, 30000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
