// ================================================================
// 🧭 [간단 길안내] script_nav.js
// - 라이브 모달 가운데(신호등 자리)에 "화살표 + 남은 거리 + 회전 안내"를 보여 주고, 선택하면 음성으로도 안내
// - 길안내 / 음성 안내는 각각 켜고 끌 수 있음 (기본 꺼짐, 기기에 기억)
// - 정류장 → 다음 정류장 사이 길은 OSRM(무료 길찾기)으로 한 번만 받아 기기에 저장해 두고 다음부터는 저장된 것을 씀
// - 버스 전용 길이 아닌 승용차 기준 길이라 실제와 다를 수 있음 (참고용)
// ================================================================
(function () {
    var LS_ON = 'yb_nav_on';
    var LS_VOICE = 'yb_nav_voice';
    var LEG_CACHE_PREFIX = 'yb_navleg_v1_';
    var OSRM_URL = 'https://router.project-osrm.org/route/v1/driving/';

    var st = { from: -1, steps: [], idx: 0, spoken: {}, loading: false, loadedKey: '', failedAt: 0 };

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

    window.navIsOn = function () { return lsGet(LS_ON) === '1'; };
    window.navVoiceIsOn = function () { return lsGet(LS_VOICE) === '1'; };

    // ---------- 거리 계산 ----------
    function hav(lat1, lon1, lat2, lon2) {
        var R = 6371000, d2r = Math.PI / 180;
        var dLat = (lat2 - lat1) * d2r, dLon = (lon2 - lon1) * d2r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * d2r) * Math.cos(lat2 * d2r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    // 점 P가 선분 AB에서 떨어진 거리(m). 짧은 거리라 평면 근사 사용
    function distToSegment(pLat, pLon, aLat, aLon, bLat, bLon) {
        var kx = Math.cos(pLat * Math.PI / 180) * 111320, ky = 110540;
        var ax = (aLon - pLon) * kx, ay = (aLat - pLat) * ky;
        var bx = (bLon - pLon) * kx, by = (bLat - pLat) * ky;
        var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        var t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
        var cx = ax + t * dx, cy = ay + t * dy;
        return Math.sqrt(cx * cx + cy * cy);
    }

    // ---------- 정류장 좌표 ----------
    function stopLL(row) {
        if (!row) return null;
        var lat = parseFloat(row.lat !== undefined ? row.lat : (Array.isArray(row) ? row[8] : null));
        var lng = parseFloat(row.lng !== undefined ? row.lng : (Array.isArray(row) ? row[9] : null));
        return (lat && lng) ? { lat: lat, lng: lng } : null;
    }

    // ---------- OSRM 단계 → 안내 문구 ----------
    function describe(step) {
        var t = step.type, m = step.mod || '';
        if (m === 'uturn') return { key: 'uturn', text: '유턴', voice: '유턴' };
        if (t === 'roundabout' || t === 'rotary' || t === 'roundabout turn') {
            var n = step.exit ? step.exit + '번째 출구' : '출구';
            return { key: 'round', text: '회전교차로 ' + n, voice: '회전교차로 ' + n };
        }
        var side = { 'left': '좌회전', 'right': '우회전', 'slight left': '왼쪽 방향', 'slight right': '오른쪽 방향', 'sharp left': '좌회전', 'sharp right': '우회전', 'straight': '직진' }[m];
        if (t === 'off ramp') return { key: m.indexOf('left') >= 0 ? 'slightleft' : 'slightright', text: (m.indexOf('left') >= 0 ? '좌측' : '우측') + ' 진출로', voice: (m.indexOf('left') >= 0 ? '좌측' : '우측') + ' 진출로' };
        if (t === 'on ramp') return { key: m.indexOf('left') >= 0 ? 'slightleft' : 'slightright', text: (m.indexOf('left') >= 0 ? '좌측' : '우측') + ' 진입로', voice: (m.indexOf('left') >= 0 ? '좌측' : '우측') + ' 진입로' };
        if (!side) return null;
        var key = { 'left': 'left', 'right': 'right', 'slight left': 'slightleft', 'slight right': 'slightright', 'sharp left': 'left', 'sharp right': 'right', 'straight': 'straight' }[m];
        return { key: key, text: side, voice: side };
    }

    // 안내할 만한 단계만 골라 필요한 값만 남김
    function normalizeSteps(osrmSteps) {
        var out = [];
        (osrmSteps || []).forEach(function (s) {
            var mv = s.maneuver || {};
            if (mv.type === 'depart' || mv.type === 'arrive' || mv.type === 'new name' || mv.type === 'exit roundabout' || mv.type === 'exit rotary') return;
            if (mv.type === 'continue' && mv.modifier !== 'uturn') return;
            if (!mv.location) return;
            var d = describe({ type: mv.type, mod: mv.modifier, exit: mv.exit });
            if (!d) return;
            out.push({ lng: mv.location[0], lat: mv.location[1], key: d.key, text: d.text, voice: d.voice, road: s.name || '' });
        });
        return out;
    }

    // ---------- 구간(정류장 A → B) 길 받기 (기기에 저장) ----------
    function legKey(a, b) { return LEG_CACHE_PREFIX + [a.lat, a.lng, b.lat, b.lng].map(function (v) { return v.toFixed(5); }).join('_'); }

    function getLeg(a, b) {
        var key = legKey(a, b);
        var cached = lsGet(key);
        if (cached) { try { return Promise.resolve(JSON.parse(cached)); } catch (e) { } }
        var url = OSRM_URL + a.lng + ',' + a.lat + ';' + b.lng + ',' + b.lat + '?steps=true&overview=false';
        return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
            if (!j || j.code !== 'Ok' || !j.routes || !j.routes[0]) throw new Error('route fail');
            var steps = normalizeSteps(j.routes[0].legs[0].steps);
            lsSet(key, JSON.stringify(steps));
            return steps;
        });
    }

    // ---------- 현재 구간 판단 ----------
    function findFromIndex(rows, lat, lon) {
        if (window.lastPassedStopIndex !== null && window.lastPassedStopIndex !== undefined && window.lastPassedStopIndex >= 0) {
            return Math.min(window.lastPassedStopIndex, rows.length - 1);
        }
        var best = -1, bestD = Infinity;   // 아직 통과한 정류장이 없으면 가장 가까운 정류장 사이 구간
        for (var i = 0; i < rows.length - 1; i++) {
            var a = stopLL(rows[i]), b = stopLL(rows[i + 1]);
            if (!a || !b) continue;
            var d = distToSegment(lat, lon, a.lat, a.lng, b.lat, b.lng);
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
    }

    function loadLegs(rows, from) {
        var a = stopLL(rows[from]), b = stopLL(rows[from + 1]), c = stopLL(rows[from + 2]);
        if (!a || !b) return;
        var key = from + '|' + rows.length;
        if (st.loading || st.loadedKey === key) return;
        if (Date.now() - st.failedAt < 30000) return;   // 실패하면 30초 뒤 다시 시도
        st.loading = true;
        var jobs = [getLeg(a, b)];
        if (c) jobs.push(getLeg(b, c).catch(function () { return []; }));
        Promise.all(jobs).then(function (res) {
            st.steps = res[0].concat(res[1] || []);
            st.from = from;
            st.idx = -1;   // 아래 update에서 현재 위치에 맞게 다시 잡음
            st.spoken = {};
            st.loadedKey = key;
            st.minIdx = -2;
            st.loading = false;
        }).catch(function (e) {
            console.warn('길안내 경로 수신 실패:', e);
            st.loading = false;
            st.failedAt = Date.now();
        });
    }

    // ---------- 화면 ----------
    function fmtDist(m) {
        if (m >= 1000) return (m / 1000).toFixed(1) + 'km';
        if (m >= 100) return Math.round(m / 10) * 10 + 'm';
        return Math.max(10, Math.round(m / 10) * 10) + 'm';
    }
    // 화살표 아이콘: Phosphor Icons(MIT 무료 오픈소스, iconify.design) 굵은 채움형을 그대로 넣어 둠
    var ICON_ARROW = "<path fill=\"currentColor\" d=\"M231.39 123.06A8 8 0 0 1 224 128h-40v80a16 16 0 0 1-16 16H88a16 16 0 0 1-16-16v-80H32a8 8 0 0 1-5.66-13.66l96-96a8 8 0 0 1 11.32 0l96 96a8 8 0 0 1 1.73 8.72\"/>";
    var ICON_UTURN = "<path fill=\"currentColor\" d=\"M232 144a64.07 64.07 0 0 1-64 64H80a8 8 0 0 1 0-16h88a48 48 0 0 0 0-96H88v40a8 8 0 0 1-13.66 5.66l-48-48a8 8 0 0 1 0-11.32l48-48A8 8 0 0 1 88 40v40h80a64.07 64.07 0 0 1 64 64\"/>";
    var ICON_ROUND = "<path fill=\"currentColor\" d=\"M228 48v48a12 12 0 0 1-12 12h-48a12 12 0 0 1 0-24h19l-7.8-7.8a75.55 75.55 0 0 0-53.32-22.26h-.43a75.5 75.5 0 0 0-53.06 21.63a12 12 0 1 1-16.78-17.16a99.38 99.38 0 0 1 69.87-28.47h.52a99.42 99.42 0 0 1 70.2 29.29L204 67V48a12 12 0 0 1 24 0m-44.39 132.43a75.5 75.5 0 0 1-53.09 21.63h-.43a75.55 75.55 0 0 1-53.32-22.26L69 172h19a12 12 0 0 0 0-24H40a12 12 0 0 0-12 12v48a12 12 0 0 0 24 0v-19l7.8 7.8a99.42 99.42 0 0 0 70.2 29.26h.56a99.38 99.38 0 0 0 69.87-28.47a12 12 0 0 0-16.78-17.16Z\"/>";
    var ARROW_ROT = { straight: 0, left: -90, right: 90, slightleft: -45, slightright: 45 };
    function arrowSvg(key) {
        var body = ICON_ARROW, rot = ARROW_ROT[key] || 0;
        if (key === 'uturn') { body = ICON_UTURN; rot = 0; }
        else if (key === 'round') { body = ICON_ROUND; rot = 0; }
        return '<svg viewBox="0 0 256 256" width="46" height="46" style="transform: rotate(' + rot + 'deg)">' + body + '</svg>';
    }

    function setNavView(view) {   // view: null(숨김) 또는 {key, dist, text}
        var card = document.getElementById('liveTrafficStopBox');
        var box = document.getElementById('tfNav');
        if (!card || !box) return;
        if (!view) { card.classList.remove('tf-navmode'); box.hidden = true; return; }
        card.classList.add('tf-navmode');
        box.hidden = false;
        var sig = view.key + '|' + view.text;
        if (box.getAttribute('data-sig') !== sig) {
            box.setAttribute('data-sig', sig);
            document.getElementById('tfNavArrow').innerHTML = arrowSvg(view.key);
            document.getElementById('tfNavText').textContent = view.text;
        }
        document.getElementById('tfNavDist').textContent = view.dist;
    }

    // ---------- 음성 ----------
    function speak(text) {
        if (!window.navVoiceIsOn() || !('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel();
            var u = new SpeechSynthesisUtterance(text);
            u.lang = 'ko-KR'; u.rate = 1.05;
            window.speechSynthesis.speak(u);
        } catch (e) { }
    }

    // ---------- GPS 위치가 들어올 때마다 호출 ----------
    window.navOnGps = function (lat, lon) {
        if (!window.navIsOn()) return;
        if (window.simState && window.simState.active) return;
        var rows = window.standardMasterCache || window.currentTripMasterCache || [];
        if (rows.length < 2) return setNavView(null);

        var from = findFromIndex(rows, lat, lon);
        if (from < 0 || from >= rows.length - 1) return setNavView(null);
        loadLegs(rows, from);
        if (st.from !== from) return setNavView(null);   // 이 구간의 길을 아직 못 받음

        var a = stopLL(rows[from]);
        // 처음 한 번: 지금 위치에서 가장 가까운 길 조각의 '앞쪽' 안내점부터 시작
        if (st.idx < 0) {
            var best = 0, bestD = Infinity, prev = a;
            for (var i = 0; i < st.steps.length; i++) {
                var d = distToSegment(lat, lon, prev.lat, prev.lng, st.steps[i].lat, st.steps[i].lng);
                if (d < bestD) { bestD = d; best = i; }
                prev = st.steps[i];
            }
            st.idx = best;
        }
        // 안내점을 지나면 다음 안내점으로: 20m 안에 들어왔거나, 60m 안까지 다가왔다가 다시 멀어지기 시작하면 '지나간 것'으로 봄
        while (st.idx < st.steps.length) {
            var dd = hav(lat, lon, st.steps[st.idx].lat, st.steps[st.idx].lng);
            if (st.minIdx !== st.idx) { st.minIdx = st.idx; st.minD = Infinity; }
            if (dd < st.minD) st.minD = dd;
            if (dd < 20 || (st.minD < 60 && dd > st.minD + 20)) { st.idx++; continue; }
            break;
        }

        var b = stopLL(rows[from + 1]);
        var step = st.steps[st.idx];
        if (!step) {   // 남은 회전이 없으면 다음 정류장까지 직진
            return setNavView({ key: 'straight', dist: fmtDist(hav(lat, lon, b.lat, b.lng)), text: '직진' });
        }
        var dist = hav(lat, lon, step.lat, step.lng);
        setNavView({ key: step.key, dist: fmtDist(dist), text: step.text });

        // 음성: 약 300m 전, 약 80m 전 (직진은 안내 안 함)
        if (step.key !== 'straight') {
            var k300 = st.idx + '_300', k80 = st.idx + '_80';
            if (dist <= 80 && !st.spoken[k80]) { st.spoken[k80] = st.spoken[k300] = true; speak(step.voice); }
            else if (dist <= 350 && dist > 120 && !st.spoken[k300]) { st.spoken[k300] = true; speak(Math.round(dist / 50) * 50 + '미터 앞 ' + step.voice); }
        }
    };

    // ---------- 켜기 / 끄기 버튼 ----------
    function refreshButtons() {
        var on = window.navIsOn(), v = window.navVoiceIsOn();
        var nb = document.getElementById('navToggleBtn'), vb = document.getElementById('navVoiceBtn');
        if (nb) { nb.classList.toggle('on', on); nb.querySelector('.lbl').textContent = on ? '길안내 켬' : '길안내 끔'; }
        if (vb) { vb.classList.toggle('on', v); vb.querySelector('.lbl').textContent = v ? '음성 켬' : '음성 끔'; vb.hidden = !on; }
    }
    window.toggleNav = function () {
        var on = !window.navIsOn();
        lsSet(LS_ON, on ? '1' : '0');
        if (!on) { setNavView(null); try { window.speechSynthesis.cancel(); } catch (e) { } }
        else if (window.lastGpsPosition) window.navOnGps(window.lastGpsPosition.lat, window.lastGpsPosition.lon);
        refreshButtons();
    };
    window.toggleNavVoice = function () {
        var v = !window.navVoiceIsOn();
        lsSet(LS_VOICE, v ? '1' : '0');
        refreshButtons();
        if (v) speak('음성 안내를 켰습니다');   // 버튼을 누를 때 한 번 말해야 폰에서 음성이 허용됨
        else { try { window.speechSynthesis.cancel(); } catch (e) { } }
    };
    window.navReset = function () { st = { from: -1, steps: [], idx: 0, spoken: {}, loading: false, loadedKey: '', failedAt: 0 }; setNavView(null); };
    document.addEventListener('DOMContentLoaded', refreshButtons);
    window.addEventListener('load', refreshButtons);
})();
