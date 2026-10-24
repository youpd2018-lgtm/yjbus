#!/usr/bin/env python3
"""새 정류장 순서(data/routemaster/ganseon/<노선>.json)에 맞춰 도로선(data/map/<노선>.json)을 다시 만든다.
다른 노선·자기 옛 도로선(data/map/*.json, 진행 방향 그대로)을 길로 삼아 정류장 i → i+1 사이 가장 짧은 길을 복사해 붙인다.
사용: python3 tools/build_map_from_routes.py <노선> [노선...]
정류장에서 SNAP_M 안에 도로선이 없으면 직선으로 잇고 '직선' 구간으로 알려 준다(map_draw.html 에서 손으로 고칠 곳).
"""
import json, math, os, sys, heapq, time
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SNAP_M = 45
JOIN_M = 25
OWN_BONUS = 0.85   # 자기 옛 선을 조금 더 좋아함
def hav(a, b):
    k = math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot((b[1] - a[1]) * 111320 * k, (b[0] - a[0]) * 110540)

def load_lines():
    L = {}
    d = os.path.join(ROOT, 'data', 'map')
    for f in sorted(os.listdir(d)):
        if f.endswith('.json'):
            j = json.load(open(os.path.join(d, f), encoding='utf-8'))
            pts = []
            for sg in j['segs']:
                for p in sg:
                    if not pts or hav(pts[-1], p) > 0.5: pts.append(p)
            L[f[:-5]] = pts
    return L

def build(route, L):
    rm = json.load(open(os.path.join(ROOT, 'data', 'routemaster', 'ganseon', route + '.json'), encoding='utf-8'))['stops']
    stops = [(s[2], s[3]) for s in rm]
    # 그래프: 노드=(노선,인덱스)
    nodes = []; own = []
    for r, pts in L.items():
        for i, p in enumerate(pts): nodes.append((p, r, i))
    N = len(nodes); adj = [[] for _ in range(N)]
    base = {}; o = 0
    for r, pts in L.items(): base[r] = o; o += len(pts)
    for r, pts in L.items():
        for i in range(1, len(pts)):
            w = hav(pts[i-1], pts[i]) * (OWN_BONUS if r == route else 1.0)
            adj[base[r]+i-1].append((base[r]+i, w))
    # 노선 사이 연결: 6m 안의 다른 노선 점으로 갈아타기 (격자)
    grid = {}
    for n, (p, r, i) in enumerate(nodes):
        grid.setdefault((int(p[0]*4000), int(p[1]*4000)), []).append(n)
    for n, (p, r, i) in enumerate(nodes):
        gx, gy = int(p[0]*4000), int(p[1]*4000)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for m in grid.get((gx+dx, gy+dy), []):
                    if nodes[m][1] != r and hav(p, nodes[m][0]) <= JOIN_M:
                        adj[n].append((m, hav(p, nodes[m][0]) + 20))
    def cands(s, snap=SNAP_M):
        out = []
        for r, pts in L.items():
            best = None
            for i, p in enumerate(pts):
                d = hav(s, p)
                if d <= snap and (best is None or d < best[0]): best = (d, base[r]+i)
            if best: out.append(best)
        return out
    def dijkstra(srcs, targets):
        dist = {}; prev = {}
        h = [(d, n) for d, n in srcs]; heapq.heapify(h)
        for d, n in srcs: dist[n] = d
        tset = {n: d for d, n in targets}; bestT = None
        while h:
            d, n = heapq.heappop(h)
            if d > dist.get(n, 1e18): continue
            if bestT is not None and d >= bestT[0]: break
            if n in tset:
                tot = d + tset[n]
                if bestT is None or tot < bestT[0]: bestT = (tot, n)
            for m, w in adj[n]:
                nd = d + w
                if nd < dist.get(m, 1e18) and nd < 40000:
                    dist[m] = nd; prev[m] = n; heapq.heappush(h, (nd, m))
        if bestT is None: return None
        path = [bestT[1]]
        while path[-1] in prev: path.append(prev[path[-1]])
        return path[::-1]
    segs = []; straight = []; weird = []
    for i in range(len(stops) - 1):
        a, b = stops[i], stops[i+1]
        ca, cb = cands(a) or cands(a, 130), cands(b) or cands(b, 130)
        path = dijkstra(ca, cb) if ca and cb else None
        if path:
            pts = [nodes[n][0] for n in path]
            pts = [list(a)] + pts + [list(b)]
            ln = sum(hav(pts[k], pts[k+1]) for k in range(len(pts)-1))
            if ln > 3 * hav(a, b) + 300: weird.append((i, rm[i][1], rm[i+1][1], round(ln), round(hav(a, b))))
        else:
            pts = [list(a), list(b)]; straight.append((i, rm[i][1], rm[i+1][1], round(hav(a, b))))
        segs.append(pts)
    return rm, stops, segs, straight, weird

def main():
    L = load_lines()
    for route in sys.argv[1:]:
        rm, stops, segs, straight, weird = build(route, L)
        r6 = lambda v: round(v, 6)
        segs = [[[r6(p[0]), r6(p[1])] for p in sg] for sg in segs]
        draw = {'v': 1, 'stops': [[r6(a), r6(b)] for a, b in stops], 'stopk': [{'k': 's', 'r': 12} for _ in stops],
                'nodes': [[{'p': p, 'k': 's', 'r': 12} for p in sg[1:-1]] for sg in segs]}
        out = {'v': 1, 'route': route, 'n': len(stops), 'savedAt': int(time.time()*1000), 'segs': segs, 'draw': draw}
        json.dump(out, open(os.path.join(ROOT, 'data', 'map', route + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print(route, '정류장', len(stops), '구간', len(segs), '직선', len(straight), '이상한 우회', len(weird))
        for s in straight: print('  직선', s)
        for s in weird: print('  우회', s)
main()
