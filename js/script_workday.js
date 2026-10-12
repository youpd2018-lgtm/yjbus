// 근무일 기준: 하루의 근무는 새벽 01:00까지다(사용자 지시 2026-10-12). 00:00~01:00에는 아직 전날 근무일이다.
// ybWorkNow() = 지금보다 1시간 전 시각 → 이 값의 년·월·일을 "오늘 근무일"로 쓴다.
(function () {
  window.YB_WORKDAY_SHIFT_MS = 3600000;
  window.ybWorkNow = function () { return new Date(Date.now() - window.YB_WORKDAY_SHIFT_MS); };
  window.ybWorkDateStr = function () {
    var d = window.ybWorkNow(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  // 앱을 켜 둔 채 01:00이 지나 근무일이 바뀌면, 어제 날짜를 보고 있던 화면을 새 근무일로 넘긴다
  var last = window.ybWorkDateStr();
  setInterval(function () {
    var cur = window.ybWorkDateStr();
    if (cur === last) return;
    var inp = document.getElementById('searchDate');
    if (inp && inp.value === last) {
      inp.value = cur;
      try { if (typeof onDateInputChange === 'function') onDateInputChange(); } catch (e) { }
    }
    last = cur;
  }, 30000);
})();
