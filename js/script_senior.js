// ================================================================
// 👓 [노안모드] script_senior.js
// - 설정 > 노안모드 스위치: 켜면 <html> 에 'senior' 클래스를 붙이고, 화면 전체를 조금 키워서(css/style.css 맨 끝 규칙) 보여줌
// - 기기마다 따로 기억 (localStorage yb_senior_on)
// ================================================================
(function () {
    var LS_ON = 'yb_senior_on';
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

    window.seniorIsOn = function () { return lsGet(LS_ON) === '1'; };
    function apply() { document.documentElement.classList.toggle('senior', window.seniorIsOn()); }
    apply();   // 이 파일이 읽히는 즉시 적용

    window.setSeniorMode = function (on) {
        lsSet(LS_ON, on ? '1' : '0');
        apply();
        window.updateSeniorSettingsUI();
    };
    window.updateSeniorSettingsUI = function () {
        var on = window.seniorIsOn();
        var sw = document.getElementById('seniorSwitch');
        if (sw) sw.checked = on;
        var txt = document.getElementById('seniorStateText');
        if (txt) txt.innerText = on ? '글자와 화면이 크게 보여요' : '꺼짐';
    };
})();
