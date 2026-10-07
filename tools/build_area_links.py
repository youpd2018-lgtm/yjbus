#!/usr/bin/env python3
"""모든 노선선 둘레 250m 안을 지나는 국토부 링크의 좌표를 data/route/area_links.json 에 저장한다.
링크별 값: [제한속도, 길이m, 도로명, 좌표목록, 도로종류(000 일반, 001 교량, 002 터널, 003 고가, 004 지하차도)]
링크 수정 화면(link_edit.html)이 지도에 주변 도로를 그릴 때만 받아 쓴다.
사용: python3 tools/build_area_links.py [MOCT_LINK 경로(.shp/.dbf 제외)]   필요: pip install pyproj
"""
import json, math, struct, sys, glob, collections
from pyproj import Transformer
base = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/MOCT_LINK'
t = Transformer.from_crs('EPSG:5186', 'EPSG:4326', always_xy=True)
t2 = Transformer.from_crs('EPSG:4326', 'EPSG:5186', always_xy=True)
K = 111320 * math.cos(math.radians(37.5)); R = 250
pts = []
for f in glob.glob('data/route/*.json'):
    if f.endswith('_links.json') or f.endswith('_roads.json') or f.endswith('area_links.json'): continue
    d = json.load(open(f))
    for sg in d.get('segs', []):
        for i in range(len(sg) - 1):
            a, b = sg[i], sg[i + 1]; n = max(1, int(math.hypot((a[0] - b[0]) * 110540, (a[1] - b[1]) * K) / 50))
            pts += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(n)]
G = collections.defaultdict(list)
cell = lambda la, lo: (int(la * 1000), int(lo * 1000 / 1.27))
for p in pts: G[cell(*p)].append(p)
xs, ys = t2.transform([p[1] for p in pts], [p[0] for p in pts])
BX0, BX1, BY0, BY1 = min(xs) - 600, max(xs) + 600, min(ys) - 600, max(ys) + 600
def near(p):
    c = cell(*p)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for q in G.get((c[0] + dx, c[1] + dy), []):
                if math.hypot((p[0] - q[0]) * 110540, (p[1] - q[1]) * K) < R: return True
    return False
sh = open(base + '.shp', 'rb'); sh.seek(100)
db = open(base + '.dbf', 'rb'); h = db.read(32); hl, rl = struct.unpack('<HH', h[8:12]); db.seek(hl)
out = {}
while True:
    rh = sh.read(8)
    if len(rh) < 8: break
    _, cl = struct.unpack('>ii', rh); body = sh.read(cl * 2); rec = db.read(rl)
    if len(rec) < rl: break
    if struct.unpack('<i', body[:4])[0] != 3: continue
    x0, y0, x1, y1 = struct.unpack('<4d', body[4:36])
    if x1 < BX0 or x0 > BX1 or y1 < BY0 or y0 > BY1: continue
    npart, npts = struct.unpack('<ii', body[36:44]); off = 44 + 4 * npart
    pp = struct.unpack('<%dd' % (2 * npts), body[off:off + 16 * npts])
    lons, lats = t.transform(pp[0::2], pp[1::2])
    ll = list(zip(lats, lons))
    if not any(near(p) for p in ll): continue
    num = lambda a, b: float(rec[a:b].decode().strip() or 0)
    out[rec[1:11].decode()] = [int(num(87, 97)), round(num(121, 139), 1), rec[52:82].decode('cp949', 'replace').strip(),
                               [[round(a, 5), round(b, 5)] for a, b in ll], rec[44:47].decode().strip()]
json.dump({'v': 1, 'links': out}, open('data/route/area_links.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('링크', len(out))
