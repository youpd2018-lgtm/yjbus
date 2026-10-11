// 노선 그리기 수정용 도형 계산 (map_draw.html). 브라우저와 node 양쪽에서 쓸 수 있다.
// 점 하나의 종류: 's' 직선(꺾임 그대로), 'c' 굽기(반지름 r m로 둥글게), 'm' 곡선(양옆 가운데를 잇는 부드러운 곡선)
(function (root) {
  var D2R = Math.PI / 180;

  function Proj(lat0, lon0) {
    var ky = 110540, kx = 111320 * Math.cos(lat0 * D2R);
    this.xy = function (p) { return [(p[1] - lon0) * kx, (p[0] - lat0) * ky]; };
    this.ll = function (q) { return [lat0 + q[1] / ky, lon0 + q[0] / kx]; };
  }
  function len(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }

  // 꼭짓점 p (앞 a, 뒤 b)를 종류 k 로 부드럽게 만든 점 목록(xy). 직선이면 [p]
  function corner(a, p, b, k, rr) {
    var ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1];
    var lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy), out = [];
    if (k === 's' || lu < 0.5 || lv < 0.5) return [p];
    if (k === 'm') {
      var t1 = [p[0] - ux * 0.5, p[1] - uy * 0.5], t2 = [p[0] + vx * 0.5, p[1] + vy * 0.5], N = 8;
      for (var s = 0; s <= N; s++) {
        var t = s / N, w0 = (1 - t) * (1 - t), w1 = 2 * (1 - t) * t, w2 = t * t;
        out.push([w0 * t1[0] + w1 * p[0] + w2 * t2[0], w0 * t1[1] + w1 * p[1] + w2 * t2[1]]);
      }
      return out;
    }
    var uh = [ux / lu, uy / lu], vh = [vx / lv, vy / lv];
    var dot = Math.max(-1, Math.min(1, uh[0] * vh[0] + uh[1] * vh[1]));
    var th = Math.acos(dot);
    if (th < 2 * D2R) return [p];
    th = Math.min(th, 178 * D2R);
    var r = Math.max(1, +rr || 12);
    var tg = r * Math.tan(th / 2), tmax = 0.5 * Math.min(lu, lv);
    if (tg > tmax) { tg = tmax; r = tg / Math.tan(th / 2); }
    var T1 = [p[0] - uh[0] * tg, p[1] - uh[1] * tg];
    var cross = uh[0] * vh[1] - uh[1] * vh[0], left = cross > 0;
    var nrm = left ? [-uh[1], uh[0]] : [uh[1], -uh[0]];
    var C = [T1[0] + nrm[0] * r, T1[1] + nrm[1] * r];
    var a0 = Math.atan2(T1[1] - C[1], T1[0] - C[0]);
    var steps = Math.max(4, Math.ceil(th / (10 * D2R)));
    if (steps % 2) steps++;
    for (var s2 = 0; s2 <= steps; s2++) {
      var ang = a0 + (left ? 1 : -1) * th * s2 / steps;
      out.push([C[0] + r * Math.cos(ang), C[1] + r * Math.sin(ang)]);
    }
    return out;
  }

  // 정류장 점에서 선이 꺾이는 곳을 부드럽게: 앞 구간은 {before}(…→M), 뒤 구간은 {after}(M→…) 로 이어 붙는다.
  // prev/next 는 이 점 앞뒤의 점([lat,lon]). 직선이면 null.
  function joint(prev, P, next, k, r) {
    if (!k || k === 's' || !prev || !next) return null;
    var pr = new Proj(P[0], P[1]), arc = corner(pr.xy(prev), [0, 0], pr.xy(next), k, r);
    if (arc.length < 3) return null;
    var m = arc.length >> 1;
    return { before: arc.slice(0, m + 1).map(pr.ll), after: arc.slice(m).map(pr.ll) };
  }

  // 정류장 A → (사이 점들) → 정류장 B 를 실제로 그릴 점 목록([lat,lon])으로 바꾼다.
  // opt.a / opt.b : joint() 결과(없으면 A·B 그대로 끝점)
  function resolve(A, nodes, B, opt) {
    opt = opt || {};
    var pr = new Proj(A[0], A[1]);
    var P = [pr.xy(A)], K = [''];
    nodes.forEach(function (n) { P.push(pr.xy(n.p)); K.push(n.k || 's'); });
    P.push(pr.xy(B)); K.push('');
    var out = opt.a ? opt.a.after.map(pr.xy) : [P[0]];
    for (var i = 1; i < P.length - 1; i++) {
      var arc = corner(P[i - 1], P[i], P[i + 1], K[i], nodes[i - 1] && nodes[i - 1].r);
      for (var j = 0; j < arc.length; j++) out.push(arc[j]);
    }
    if (opt.b) opt.b.before.map(pr.xy).forEach(function (q) { out.push(q); }); else out.push(P[P.length - 1]);
    var res = [];
    out.forEach(function (q) { if (!res.length || len(res[res.length - 1], q) > 0.3) res.push(q); });
    var ll = res.map(pr.ll);
    if (!opt.a) ll[0] = A.slice();
    if (!opt.b) ll[ll.length - 1] = B.slice();
    return ll;
  }
  function n_r(n) { return n && n.r; }

  // 점이 많은 선을 오차 tol(m) 안에서 줄인다 → 안쪽 점들만 [lat,lon] 목록으로
  function simplify(pts, tol) {
    if (pts.length < 3) return [];
    var pr = new Proj(pts[0][0], pts[0][1]), P = pts.map(pr.xy), keep = new Array(P.length).fill(false);
    keep[0] = keep[P.length - 1] = true;
    (function rec(lo, hi) {
      var best = -1, bd = tol, a = P[lo], b = P[hi], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9;
      for (var i = lo + 1; i < hi; i++) {
        var d = Math.abs((P[i][0] - a[0]) * dy - (P[i][1] - a[1]) * dx) / L;
        if (d > bd) { bd = d; best = i; }
      }
      if (best >= 0) { keep[best] = true; rec(lo, best); rec(best, hi); }
    })(0, P.length - 1);
    var out = [];
    for (var i = 1; i < P.length - 1; i++) if (keep[i]) out.push(pts[i]);
    return out;
  }

  // 점 q 에서 제어선(A,점들,B)까지 가장 가까운 변: {edge: 변 번호(0..n), d: 거리 m, t: 0..1}
  function nearestEdge(A, nodes, B, q) {
    var pr = new Proj(A[0], A[1]), P = [pr.xy(A)].concat(nodes.map(function (n) { return pr.xy(n.p); }), [pr.xy(B)]), Q = pr.xy(q);
    var best = { edge: 0, d: 1e18, t: 0 };
    for (var i = 0; i < P.length - 1; i++) {
      var a = P[i], b = P[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
      var t = Math.max(0, Math.min(1, ((Q[0] - a[0]) * dx + (Q[1] - a[1]) * dy) / L2));
      var d = Math.hypot(Q[0] - (a[0] + t * dx), Q[1] - (a[1] + t * dy));
      if (d < best.d) best = { edge: i, d: d, t: t };
    }
    return best;
  }
  // 변 방향 단위벡터와 왼쪽 단위벡터(동쪽 x, 북쪽 y)
  function edgeDir(A, nodes, B, edge) {
    var pr = new Proj(A[0], A[1]), P = [pr.xy(A)].concat(nodes.map(function (n) { return pr.xy(n.p); }), [pr.xy(B)]);
    var a = P[edge], b = P[edge + 1], L = len(a, b) || 1;
    var d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    return { fwd: d, left: [-d[1], d[0]], pr: pr };
  }
  function polyLen(pts) { var s = 0; for (var i = 1; i < pts.length; i++) { var pr = new Proj(pts[i - 1][0], pts[i - 1][1]); s += len(pr.xy(pts[i - 1]), pr.xy(pts[i])); } return s; }

  var api = { resolve: resolve, joint: joint, simplify: simplify, nearestEdge: nearestEdge, edgeDir: edgeDir, polyLen: polyLen, Proj: Proj };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DrawGeom = api;
})(typeof window !== 'undefined' ? window : this);
