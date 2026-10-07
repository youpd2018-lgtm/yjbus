#!/usr/bin/env python3
"""노선선(data/route/<노선>.json)을 국토교통부 표준노드링크(MOCT_LINK.shp/.dbf)에 겹쳐
정류장 사이 구간마다 지나는 링크번호(LINK_ID)를 data/route/<노선>_links.json 에 저장한다.
사용: python3 tools/build_route_links.py <노선> [MOCT_LINK 경로(.shp/.dbf 제외), 기본 /mnt/project-files/MOCT_LINK]
필요: pip install pyproj  (좌표계 EPSG:5186 → WGS84)
노선선 둘레(약 1km 여유)에 걸친 링크만 읽는다.
"""
import json, math, struct, sys, collections
from pyproj import Transformer
RADIUS_M = 30
route = sys.argv[1]
base = sys.argv[2] if len(sys.argv) > 2 else '/mnt/project-files/MOCT_LINK'
t = Transformer.from_crs('EPSG:5186', 'EPSG:4326', always_xy=True)
t2 = Transformer.from_crs('EPSG:4326', 'EPSG:5186', always_xy=True)
line = json.load(open('data/route/%s.json' % route))
_p = [q for sg in line['segs'] for q in sg]
_x, _y = t2.transform([q[1] for q in _p], [q[0] for q in _p])
BX0, BX1, BY0, BY1 = min(_x) - 1000, max(_x) + 1000, min(_y) - 1000, max(_y) + 1000
sh = open(base + '.shp', 'rb'); sh.seek(100)
db = open(base + ".dbf", "rb")
h = db.read(32); hl, rl = struct.unpack('<HH', h[8:12]); db.seek(hl)
L = []
while True:
    rh = sh.read(8)
    if len(rh) < 8: break
    _, cl = struct.unpack('>ii', rh); body = sh.read(cl * 2); rec = db.read(rl)
    if len(rec) < rl: break
    lid = rec[1:11].decode()
    if struct.unpack('<i', body[:4])[0] != 3: continue
    x0, y0, x1, y1 = struct.unpack('<4d', body[4:36])
    if x1 < BX0 or x0 > BX1 or y1 < BY0 or y0 > BY1: continue
    npart, npts = struct.unpack('<ii', body[36:44]); off = 44 + 4 * npart
    pts = struct.unpack('<%dd' % (2 * npts), body[off:off + 16 * npts])
    lons, lats = t.transform(pts[0::2], pts[1::2])
    num = lambda a, b: float(rec[a:b].decode().strip() or 0)
    L.append({'id': lid, 'name': rec[52:82].decode('cp949', 'replace').strip(), 'p': list(zip(lats, lons)),
              'spd': int(num(87, 97)), 'len': round(num(121, 139), 1)})
K = 111320 * math.cos(math.radians(37.5)); G = collections.defaultdict(list)
cell = lambda la, lo: (int(la * 1000), int(lo * 1000 / 1.27))
for li, l in enumerate(L):
    p = l['p']
    for i in range(len(p) - 1):
        a, b = p[i], p[i + 1]
        for pt in (a, b, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)): G[cell(*pt)].append((li, a, b))
def dseg(p, a, b):
    px, py, ax, ay, bx, by = p[1] * K, p[0] * 110540, a[1] * K, a[0] * 110540, b[1] * K, b[0] * 110540
    dx, dy = bx - ax, by - ay; ll = dx * dx + dy * dy
    u = 0 if ll == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / ll))
    return math.hypot(px - ax - u * dx, py - ay - u * dy)
def near(p):
    c = cell(*p); best = None
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for li, a, b in G.get((c[0] + dx, c[1] + dy), []):
                d = dseg(p, a, b)
                if d < RADIUS_M and (best is None or d < best[0]): best = (d, li)
    return best
segs = []; miss = tot = 0
for seg in line['segs']:
    pts = []
    for i in range(len(seg) - 1):
        a, b = seg[i], seg[i + 1]; n = max(1, int(math.hypot((a[0] - b[0]) * 110540, (a[1] - b[1]) * K) / 20))
        pts += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(n)]
    pts.append(tuple(seg[-1])); ids = []
    for p in pts:
        tot += 1; r = near(p)
        if r is None: miss += 1; continue
        i = L[r[1]]['id']
        if i not in ids: ids.append(i)
    segs.append(ids)
info = {l['id']: [l['spd'], l['len'], l['name']] for l in L}
json.dump({'v': 2, 'route': route, 'source': 'MOCT_LINK', 'segs': segs, 'links': {i: info[i] for s in segs for i in s}},
          open('data/route/%s_links.json' % route, 'w'), ensure_ascii=False, separators=(',', ':'))
print(route, '구간', len(segs), '링크', sum(map(len, segs)), '못 찾은 점', miss, '/', tot)
