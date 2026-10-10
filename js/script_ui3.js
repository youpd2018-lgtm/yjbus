// ================================================================
// 🆕 [새 메인 화면 ui3 "버스 콕핏"] script_ui3.js
// - 켜짐/꺼짐: <html> 의 'ui3' 클래스 (index.html head 에서 붙임). 되돌리기 ?ui3=0, 다시 켜기 ?ui3=1
// - 노안모드(html.senior)에서는 CSS 가 적용되지 않아 기존 화면 그대로
// - 값은 script_ui2.js 가 채우는 숨은 박스(#yb2Route 등)를 따라 적는 방식 → 기존 JS 는 그대로 작동
// - 박스 안 버스 아이콘 = 난이도 색 선택 (녹색 쉬움 / 파랑 기본 / 노랑 약간 힘듦 / 빨강 하드)
//   js/script_difficulty.js 의 window.ybDiffApi 로 저장·불러오기 (색을 안 골랐으면 파랑으로 보임)
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

    // ---- 기사 이름 (박스 바깥 왼쪽 위) ----
    function renderName() {
        var n = '';
        try { n = (typeof getLoggedInDriverName === 'function' ? getLoggedInDriverName() : '') || window.currentDriver || ''; } catch (e) {}
        n = String(n || '').trim();
        setTxt('yb4Name', n ? n + ' 기사님' : '');
    }

    // ---- 노선·순번·대수·차량번호 ----
    function renderBus() {
        var bus = $('yb4Bus');
        if (!bus) return;
        var route = txt('yb2Route');
        var working = route !== '' && route !== '-';
        bus.classList.toggle('off', !working);   // 휴무·미등록 등: 박스 안은 비워 둠
        setTxt('yb4Route', working ? route : '');
        // 평일 16대 / 6순번
        var sub = txt('yb2Sub'), seq = txt('yb2Seq'), lbl = txt('yb2SeqLbl');
        var seqTxt = seq && seq !== '-' ? seq + (lbl || '순번') : '';
        setTxt('yb4Fleet', sub);
        setTxt('yb4Seq', seqTxt);
        // 가운데 줄이 길어지면 글자를 조금 줄임 (10자까지 44, 그 이상은 비율로 줄여 최소 26)
        var fs = $('yb4Fs');
        if (fs) {
            var len = (sub + ' ' + seqTxt).length;
            var size = Math.max(26, Math.min(44, Math.floor(44 * 10 / Math.max(len, 10))));
            var v = 'calc(var(--u) * ' + size + ')';
            if (fs.style.fontSize !== v) fs.style.fontSize = v;
        }
        // 차량번호: 뒤 네 자리만
        var no = txt('yb2BusNo').replace(/[^\d]/g, '');
        setTxt('yb4Plate', no ? no.slice(-4) : '');
        renderName();
        renderEyes();
        renderArc();
    }

    // ---- 시작 / 종료 / 교대 ----
    function renderTimes() {
        setTxt('yb4Start', txt('yb2Start'));
        setTxt('yb4End', txt('yb2End'));
        // 시간표에서 빨강인 시작·종료 시간은 빨강 글자로 (교대는 항상 노란색)
        // (노안모드가 쓰는 옛 칸 yb2Start/yb2End 에도 같은 규칙 적용)
        [['yb4Start', 'bliStartTime'], ['yb4End', 'bliEndTime'], ['yb2Start', 'bliStartTime'], ['yb2End', 'bliEndTime']].forEach(function (p) {
            var t = $(p[0]), src = $(p[1]);
            if (t) t.classList.toggle('red', !!src && src.getAttribute('data-c') === 'red');
        });
        setTxt('yb4Hand', txt('yb2Hand'));
        renderArc();
        renderStops();
    }

    // ---- 교대 시간이 지나면: 시작·종료·교대 자리에 '다음 정류장 3개'를 밀어내듯 보여 줌 (라이브 모달 거점과 같은 방식) ----
    //      [다음 정류장, 그 다음, 그 다음다음] → 정류장을 지나면 한 칸씩 앞으로 밀림. 정류장이 다 끝나면 마지막 정류장까지 마지막 칸에 그대로 둠(원래대로 돌아가지 않음, 날짜가 오늘이 아니거나 교대 전이면 원래 시작·종료·교대).
    var SEQ_COLOR = { yellow: '#fbbf24', red: '#ef4444', important: '#ef4444', blue: '#38bdf8' };
    var lastFirstKey = '';
    function todayStops() {
        var inp = $('searchDate');
        if (!inp || !inp.value) return null;
        if (typeof getDriverKey !== 'function' || typeof customGetItem !== 'function' || typeof getHeaderArray !== 'function' || typeof parseTimeToDate !== 'function') return null;
        var saved = localStorage.getItem(getDriverKey('sched_' + inp.value));
        if (!saved) return null;
        var sched; try { sched = JSON.parse(saved); } catch (e) { return null; }
        if (!sched || !sched.route || !sched.seq) return null;
        var list = customGetItem(sched.route, sched.seq), heads = getHeaderArray(sched.route, sched.seq);
        var cols = heads ? heads.length : 0;
        if (!list || !list.length || !cols) return null;
        var yellow = -1;
        for (var i = 0; i < list.length && yellow < 0; i++)
            for (var c = 1; c <= cols; c++) if (list[i]['c' + c] === 'yellow') { yellow = i; break; }
        var from = 0, to = list.length - 1;
        if (sched.time === '오전') { to = yellow >= 0 ? yellow : Math.min(2, list.length - 1); }
        else if (sched.time === '오후') { from = yellow >= 0 ? yellow + 1 : Math.min(3, list.length - 1); }
        var out = [], prev = null;
        for (var t = from; t <= to; t++) {
            var trip = list[t], h = heads;
            if (t === 0 && typeof getFirstTripHeaderArray === 'function') {
                var fh = getFirstTripHeaderArray(sched.route, sched.seq);
                if (fh && fh.enabled && Array.isArray(fh.headers) && fh.headers.length) h = fh.headers;
            }
            for (var k = 1; k <= cols; k++) {
                var ts = trip['time' + k];
                if (!ts || String(ts).trim() === '' || String(ts).trim() === '-') continue;
                var d = parseTimeToDate(ts, inp.value);
                if (!d) continue;
                if (prev && d.getTime() < prev.getTime() - 2 * 3600 * 1000) d.setDate(d.getDate() + 1);
                prev = new Date(d);
                out.push({ key: t + '-' + k, name: h[k - 1] || ('정류장' + k), time: String(ts).length >= 8 ? String(ts).substring(0, 5) : String(ts), date: d, color: trip['c' + k] || '' });
            }
        }
        return out;
    }
    function renderStops() {
        var box = document.querySelector('.yb4-stats');
        if (!box) return;
        var cells = box.querySelectorAll('.yb4-st');
        var picked = null;
        try {
            var now = new Date(), inp = $('searchDate'), hm = toMin(txt('yb2Hand'));
            var isToday = false;
            if (inp && inp.value) { var p = inp.value.split('-'); isToday = +p[0] === now.getFullYear() && +p[1] === now.getMonth() + 1 && +p[2] === now.getDate(); }
            if (isToday && hm !== null && now.getHours() * 60 + now.getMinutes() >= hm) {
                var stops = todayStops();
                if (stops && stops.length) {
                    var ni = -1;
                    for (var i = 0; i < stops.length; i++) if (stops[i].date > now) { ni = i; break; }
                    if (ni < 0) ni = stops.length - 1;   // 정류장이 다 끝나면 마지막 정류장까지 마지막 칸에 그대로 보여 줌
                    var st0 = Math.max(0, Math.min(ni, stops.length - 3));
                    picked = stops.slice(st0, st0 + 3);
                }
            }
        } catch (e) { picked = null; }
        var on = !!picked && picked.length > 0;
        var was = box.classList.contains('stops');
        box.classList.toggle('stops', on);
        var labels = ['시작', '종료', '교대'];
        for (var j = 0; j < 3; j++) {
            var cell = cells[j]; if (!cell) continue;
            var l = cell.children[0], v = cell.children[1];
            if (on) {
                var it = picked[j];
                cell.style.visibility = it ? '' : 'hidden';
                if (it) {
                    if (l.textContent !== it.name) l.textContent = it.name;
                    if (v.textContent !== it.time) v.textContent = it.time;
                    v.style.color = SEQ_COLOR[it.color] || '';
                    v.classList.remove('red');
                }
            } else {
                cell.style.visibility = '';
                if (l.textContent !== labels[j]) l.textContent = labels[j];
                v.style.color = '';
            }
        }
        if (on) {
            if (lastFirstKey && lastFirstKey !== picked[0].key) { box.classList.remove('slide'); void box.offsetWidth; box.classList.add('slide'); }
            lastFirstKey = picked[0].key;
        } else lastFirstKey = '';
        if (was && !on) renderTimes();   // 원래 시작·종료·교대(빨강 표시 포함)로 되돌림
    }

    // ---- 시간 카운트 (두 줄) ----
    function renderCd() {
        var L = $('yb2CdL'), V = $('yb2CdV'), l = $('yb4CdL'), v = $('yb4CdV');
        if (!L || !V || !l || !v) return;
        var lh = L.innerHTML;
        if (lh.indexOf('LIVE') >= 0) lh = '여기를 터치하면 라이브 모드로 들어갑니다';   // 운행중 안내 문구
        if (l.innerHTML !== lh) l.innerHTML = lh;
        if (v.textContent !== V.textContent) v.textContent = V.textContent;
        if (v.style.color !== V.style.color) v.style.color = V.style.color;
        renderBus();   // 휴무 글자 따라가기
    }

    // ---- 하루 진행선: 처음엔 선이 꽉 차 있고, 시간이 지날수록 색이 빠짐 ----
    //      (12시 위치에서 시계 방향으로 지나간 만큼 색이 사라져 마지막엔 비게 됨)
    //      오늘은 시작~종료 사이 지금 위치, 지난 날은 모두 빠진 상태, 앞날은 꽉 찬 상태
    function toMin(s) { var m = /(\d{1,2}):(\d\d)/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
    function renderArc() {
        var arc = $('yb4Arc'), bus = $('yb4Bus');
        if (!arc || !bus) return;
        var off = bus.classList.contains('off');
        var frac = 0;   // 지나간 비율 (0 = 아직 안 시작, 1 = 끝남)
        if (!off) {
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
        var gone = Math.round(frac * 1000);
        arc.setAttribute('stroke-dasharray', (1000 - gone) + ' 1000');
        arc.setAttribute('stroke-dashoffset', -gone);
        arc.style.opacity = (off || frac >= 1) ? '0' : '1';   // 다 빠졌거나 근무 없는 날은 색선 없음
    }

    // ---- 날짜 줄: 오늘이면 html 에 표시, 날짜 입력칸 맞추기 ----
    function renderDateBits() {
        html.classList.toggle('yb4-today', txt('yb2DateRel') === '오늘');
        var s = $('searchDate'), i = $('yb4DateIn');
        if (s && i && i.value !== s.value) i.value = s.value;
        renderArc();
    }
    window.yb4GoToday = function () {
        var s = $('searchDate');
        if (!s) return;
        var t = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
        s.value = t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
        if (typeof onDateInputChange === 'function') onDateInputChange();
    };

    // ---- 버스 아이콘 = 난이도 색 ----
    var LEVELS = { green: '#4ADE80', blue: '#60A5FA', yellow: '#FCD34D', red: '#F87171' };
    function shownColor() {
        var api = window.ybDiffApi, c = api && api.color ? api.color() : '';
        return LEVELS[c] ? c : 'blue';   // 아직 아무도 안 골랐으면 기본(파랑·무난)
    }
    function renderEyes() {
        var icon = $('yb4BusIcon'), c = shownColor();
        if (icon) icon.setAttribute('fill', LEVELS[c]);
        var btns = document.querySelectorAll('#yb4Lamp button');
        for (var j = 0; j < btns.length; j++) btns[j].classList.toggle('sel', btns[j].getAttribute('data-c') === c);
    }
    function lampBox() { return $('yb4Lamp'); }
    window.yb4Lamp = function () {
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
            if (b) {
                if (window.ybDiffApi) window.ybDiffApi.set(b.getAttribute('data-c'));   // 서버 '색선택' 시트에 기록됨
                box.hidden = true;
                renderEyes();
                return;
            }
            box.hidden = true;   // 빈 곳을 누르면 그냥 닫음
        });
        document.addEventListener('yb-diff-change', renderEyes);
    }

    function initDateInput() {
        var i = $('yb4DateIn');
        if (!i) return;
        i.addEventListener('change', function () {
            var s = $('searchDate');
            if (!s || !i.value) return;
            s.value = i.value;
            if (typeof onDateInputChange === 'function') onDateInputChange();
        });
    }

    function init() {
        if (!$('yb4Bus')) return;
        ['yb2Route', 'yb2Seq', 'yb2SeqLbl', 'yb2Sub', 'yb2BusNo'].forEach(function (id) { watch(id, renderBus); });
        ['yb2Start', 'yb2End', 'yb2Hand'].forEach(function (id) { watch(id, renderTimes); });
        ['bliStartTime', 'bliEndTime'].forEach(function (id) { watch(id, renderTimes, ['data-c']); });
        watch('yb2CdL', renderCd); watch('yb2CdV', renderCd, ['style']);
        watch('yb2DateRel', renderDateBits);
        var inp = $('searchDate');
        if (inp) inp.addEventListener('change', renderDateBits);
        var dd = $('dateDisplayText');
        if (dd && window.MutationObserver) new MutationObserver(renderDateBits).observe(dd, { childList: true, characterData: true, subtree: true });
        initLamp();
        initDateInput();
        renderBus(); renderTimes(); renderCd(); renderDateBits();
        setInterval(function () { renderArc(); renderName(); }, 30000);
        setInterval(renderStops, 5000);
        setTimeout(renderName, 1500); setTimeout(renderName, 5000);   // 로그인 직후 이름 늦게 채워질 때 대비
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
