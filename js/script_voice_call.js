// ================================================================
// 📞 [구차장 음성 전화] "유재필에게 전화해줘" → 비슷한 이름의 연락처를 찾아 [전화걸기] 버튼을 띄운다
// - 서버·제미나이로 아무것도 보내지 않고 폰 안에서만 처리한다 (번호는 화면·음성으로 알려 주지 않음)
// - 음성 인식 결과는 터치가 아니라서 전화가 자동으로 걸리지 않게 하고, 직접 [전화걸기]를 눌러야 한다. 확인은 폰 시스템 확인창이 한다 (운전 중 오발신 방지)
// - 연락처: 긴급전화 목록 + 등록된 기사님(번호가 있고 가족 아님, 내 이름 제외)
// - 이름이 조금 달라도(유재핑→유재필, 공동국 부장→공동국 차장) 자모 단위 유사도로 찾는다
// ================================================================
(function () {
  var TITLES = ['전무', '부장', '차장', '과장', '대리', '공장장', '사장', '대표', '기사님', '기사', '님'];
  var FILLER = /(전화|통화|연락|걸어|걸어줘|걸어 줘|해줘|해 줘|해주세요|해 주세요|해라|좀|바꿔줘|바꿔 줘|연결해줘|연결해 줘|연결|부탁해|부탁|에게|한테|께|로|으로|를|을|이랑|하고|그리고|거는|걸|해)/g;

  // 한글 → 자모 (초성·중성·종성 풀어쓰기)
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  var JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  var JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  function jamo(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xAC00 && c <= 0xD7A3) {
        var n = c - 0xAC00;
        out.push(CHO[Math.floor(n / 588)], JUNG[Math.floor((n % 588) / 28)]);
        var j = JONG[n % 28]; if (j) out.push(j);
      } else if (!/\s/.test(str[i])) out.push(str[i]);
    }
    return out;
  }
  function lev(a, b) {
    var m = a.length, n = b.length, prev = [], cur = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function sim(a, b) { // 0~1
    var ja = jamo(a), jb = jamo(b);
    if (!ja.length || !jb.length) return 0;
    return 1 - lev(ja, jb) / Math.max(ja.length, jb.length);
  }

  // 이름 앞부분(직함 제거): '공동국 차장' → '공동국'
  function baseName(name) {
    var t = String(name || '').trim().split(/\s+/);
    if (t.length > 1 && TITLES.indexOf(t[t.length - 1]) !== -1) t.pop();
    return t.join('');
  }
  function stripTitles(s) {
    var r = s;
    TITLES.slice().sort(function (a, b) { return b.length - a.length; }).forEach(function (w) { r = r.split(w).join(' '); });
    return r;
  }

  function getContacts() {
    var list = [], seen = {};
    function add(name, phone, tag) {
      phone = String(phone || '').replace(/[^0-9]/g, '');
      if (!name || !phone) return;
      var key = name + '|' + phone;
      if (seen[key]) return; seen[key] = 1;
      list.push({ name: name, base: baseName(name), phone: phone, tag: tag });
    }
    try { if (typeof window.ytEmergencyContacts === 'function') window.ytEmergencyContacts().forEach(function (c) { add(c.name, c.phone, c.group); }); } catch (e) { }
    try {
      var me = window.currentDriver || localStorage.getItem('loggedInUser') || '';
      var users = typeof getUsersList === 'function' ? getUsersList() : [];
      users.forEach(function (u) {
        if (!u || u.userType === 'family' || u.active === false || u.name === me) return;
        add(u.name, u.phone, '기사');
      });
    } catch (e) { }
    return list;
  }

  // 말한 문장 → 전화 요청이면 찾을 이름 후보 글자, 아니면 null
  function extractTarget(text) {
    var t = String(text || '').trim();
    if (!/(전화|통화)/.test(t)) return null;
    if (!/(걸|해|연결|바꿔|부탁|통화|하고 싶|하려)/.test(t)) return null;
    var STOP = ['줘', '싶어', '주세요', '요', '좀', '해', '줘요'];
    var cleaned = t.replace(FILLER, ' ').replace(/[.,!?~]/g, ' ').split(/\s+/).filter(function (w) { return w && STOP.indexOf(w) === -1; }).join(' ').trim();
    return cleaned;
  }

  // 후보 찾기: [{c, score}] 점수 높은 순
  function search(cleaned) {
    var contacts = getContacts();
    var words = cleaned.split(' ').filter(Boolean);
    var whole = stripTitles(cleaned).replace(/\s+/g, '');
    var asked = words.join('');
    var res = contacts.map(function (c) {
      var best = 0;
      var cand = [whole];
      words.forEach(function (w) { var s = stripTitles(w).replace(/\s+/g, ''); if (s) cand.push(s); });
      cand.forEach(function (w) {
        if (!w) return;
        var s = Math.max(sim(w, c.base), sim(w, c.name.replace(/\s+/g, '')));
        // 이름만 짧게 말했거나(성+이름 중 이름), 직함만 말한 경우
        if (c.base.length >= 3) s = Math.max(s, sim(w, c.base.slice(1)) * 0.9);
        best = Math.max(best, s);
      });
      // 직함만 말한 경우 ('차장님께 전화해줘'): 직함이 같으면 약한 점수
      var titleOnly = TITLES.some(function (tl) { return asked && stripTitles(asked).replace(/\s+/g, '') === '' && c.name.indexOf(tl) !== -1 && asked.indexOf(tl) !== -1; });
      if (titleOnly) best = Math.max(best, 0.7);
      return { c: c, score: best };
    }).filter(function (x) { return x.score >= 0.6; });
    res.sort(function (a, b) { return b.score - a.score; });
    return res;
  }

  // 이름 버튼을 누르면 곧바로 전화 링크로 넘어가고, 확인은 폰(아이폰·안드로이드)의 시스템 확인창이 한 번 한다 (앱 자체 확인 단계는 없음)
  function showCallCard(items, headline) {
    var el = document.getElementById('voiceCallCard');
    if (!el) {
      el = document.createElement('div');
      el.id = 'voiceCallCard';
      el.style.cssText = 'position:fixed;left:10px;right:10px;bottom:calc(env(safe-area-inset-bottom, 0px) + 90px);z-index:2147483000;' +
        'background:#0f172a;color:#fff;border:2px solid #16a34a;border-radius:16px;padding:14px;box-shadow:0 10px 28px rgba(0,0,0,.5);font-family:inherit;';
      document.body.appendChild(el);
    }
    var close = function () { el.style.display = 'none'; clearTimeout(window._voiceCallTimer); };
    var html = '<div style="font-size:15px;font-weight:900;margin-bottom:10px;">' + headline + '</div>';
    items.forEach(function (it) {
      html += '<a href="tel:' + it.phone + '" class="voiceCallBtn" style="display:flex;align-items:center;justify-content:center;gap:8px;background:#16a34a;color:#fff;text-decoration:none;' +
        'font-size:20px;font-weight:900;padding:16px;border-radius:12px;margin-bottom:8px;">' +
        '<iconify-icon icon="mdi:phone" style="font-size:24px;"></iconify-icon> ' + it.name + ' 전화걸기</a>';
    });
    html += '<button type="button" id="voiceCallClose" style="width:100%;background:#334155;color:#e2e8f0;border:none;border-radius:10px;padding:10px;font-size:14px;font-weight:700;">닫기</button>';
    el.innerHTML = html;
    el.style.display = 'block';
    el.querySelector('#voiceCallClose').addEventListener('click', close);
    Array.prototype.forEach.call(el.querySelectorAll('.voiceCallBtn'), function (a) { a.addEventListener('click', function () { setTimeout(close, 500); }); });
    clearTimeout(window._voiceCallTimer);
    window._voiceCallTimer = setTimeout(close, 40000);
  }

  // 구차장 음성 처리에서 먼저 불러 본다. 전화 요청이면 true (제미나이로 보내지 않음)
  window.ytVoiceCallTry = function (text) {
    var cleaned = extractTarget(text);
    if (cleaned === null) return false;
    if (!cleaned) { speak('누구에게 전화할지 이름을 같이 말씀해 주세요.'); return true; }
    var found = search(cleaned);
    if (!found.length) { speak('연락처에서 비슷한 이름을 찾지 못했어요. 이름을 다시 말씀해 주세요.'); return true; }
    var top = found[0], items = [top.c];
    // 비슷한 점수의 다른 사람이 있으면 최대 3명까지 보여 줌
    for (var i = 1; i < found.length && items.length < 3; i++) if (top.score - found[i].score < 0.1) items.push(found[i].c);
    if (items.length === 1) {
      // 한 명이 확실하면 곧바로 전화 연결 (확인은 폰 시스템 창이 함). 폰이 막아서 화면에 남으면 카드의 버튼으로 걸 수 있음
      showCallCard(items, items[0].name + '님께 전화 연결 중… 연결이 안 되면 아래 버튼을 누르세요.');
      try { window.location.href = 'tel:' + items[0].phone; } catch (e) {}
    } else {
      showCallCard(items, '누구에게 전화할까요?');
      speak('비슷한 이름이 ' + items.length + '명 있어요. 전화할 분의 전화걸기 버튼을 누르세요.');
    }
    return true;
  };
  function speak(t) { if (typeof speakVoiceAnswer === 'function') speakVoiceAnswer(t); }

  window.ytVoiceCallTest = function (text) { // 점검용: 개발자 도구에서 호출
    var c = extractTarget(text); return c === null ? null : { cleaned: c, found: search(c).map(function (x) { return [x.c.name, Math.round(x.score * 100) / 100]; }) };
  };
})();
