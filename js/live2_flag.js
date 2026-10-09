// 🆕 라이브 모달 "콕핏" 디자인 스위치 (head 에서 가장 먼저 읽힘)
// ▶ 모든 기사에게 켜려면 아래 DEFAULT_ON 을 true 로 바꾸고 push 하면 끝.
// ▶ 내 폰에서만 시험: 주소 끝에 ?lv2=1  /  끄기: ?lv2=0  /  기본값 따르기: ?lv2=reset
(function () {
  var DEFAULT_ON = true;
  var on = DEFAULT_ON;
  try {
    var q = new URLSearchParams(location.search).get('lv2');
    if (q === '1') localStorage.setItem('yb_lv2', '1');
    if (q === '0') localStorage.setItem('yb_lv2', '0');
    if (q === 'reset') localStorage.removeItem('yb_lv2');
    var v = localStorage.getItem('yb_lv2');
    if (v === '1') on = true; else if (v === '0') on = false;
  } catch (e) {}
  window.ybLv2On = on;
  if (on) document.documentElement.classList.add('lv2');
})();
