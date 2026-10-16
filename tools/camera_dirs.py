#!/usr/bin/env python3
"""단속카메라마다 노선별 진행 방향(dirs)을 data/map/<노선>.json 도로선에서 계산해 cameras.json 에 적는다.
카메라에서 가장 가까운 도로선의 진행 방향이 그 카메라가 걸리는 방향이다. 상·하행 선이 겹쳐 방향을 못 정하면(양쪽이 거의 같은 거리) 적지 않는다(양방향 울림).
사용: python3 tools/camera_dirs.py            (dirs 가 없는 카메라만 채움)
      python3 tools/camera_dirs.py --all      (전부 다시 계산)
"""
import json, math, re, sys, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MAX_ROAD_M = 60      # 도로선에서 이보다 멀면 방향을 정하지 않음
AMBIG_M = 3          # 가장 가까운 선과 이 거리 안에 반대 방향 선이 또 있으면 방향 없음 (상·하행 선은 보통 10~25m 떨어져 있고 카메라는 자기 방향 선에 가까움)

def load_pts(route):
    p = os.path.join(ROOT, 'data', 'map', route + '.json')
    if not os.path.exists(p): return None
    d = json.load(open(p, encoding='utf-8'))
    out = []
    for sg in d['segs']:
        out.extend(sg)
    return out

def nearest_dirs(lat, lng, pts):
    k = math.cos(math.radians(lat)); X = 111320.0 * k; Y = 110540.0
    res = []
    for i in range(1, len(pts)):
        ax = (pts[i-1][1]-lng)*X; ay = (pts[i-1][0]-lat)*Y; bx = (pts[i][1]-lng)*X; by = (pts[i][0]-lat)*Y
        dx = bx-ax; dy = by-ay; l2 = dx*dx+dy*dy
        if l2 < 1e-6: continue
        t = max(0.0, min(1.0, -(ax*dx+ay*dy)/l2))
        d = math.hypot(ax+t*dx, ay+t*dy)
        brg = (math.degrees(math.atan2(dx, dy))+360) % 360
        res.append((d, brg))
    return res

def decide(lat, lng, pts):
    res = nearest_dirs(lat, lng, pts)
    if not res: return None
    best = min(res)[0]
    if best > MAX_ROAD_M: return None
    near = [b for d, b in res if d <= best + AMBIG_M]
    b0 = min(res)[1]
    for b in near:
        if abs(((b - b0 + 540) % 360) - 180) > 120:   # b0 와 거의 반대 방향
            return None
    return round(b0)

def hav(a, b, c, d):
    k = math.cos(math.radians((a + c) / 2))
    return math.hypot((d - b) * 111320 * k, (c - a) * 110540)

def pref(lat, lng, pts):
    """(가장 가까운 선 방향, 그 방향 선까지 거리, 반대 방향 선까지 거리)"""
    res = nearest_dirs(lat, lng, pts)
    if not res: return None
    d0, b0 = min(res)
    if d0 > MAX_ROAD_M: return None
    opp = [d for d, b in res if abs(((b - b0 + 540) % 360) - 180) > 120]
    return b0, d0, (min(opp) if opp else 1e9)

PAIR = re.compile(r'\(([^()]*?)\s*→\s*([^()]*?)\)\s*$')
def ends(name):
    m = PAIR.search(name or '')
    return (m.group(1).strip(), m.group(2).strip()) if m else None

def main():
    allc = '--all' in sys.argv
    path = os.path.join(ROOT, 'data', 'camera', 'cameras.json')
    j = json.load(open(path, encoding='utf-8'))
    cams = j['cameras']; cache = {}; n = 0; amb = 0; fixed = 0
    prefs = {}   # (카메라 번호, 노선) -> pref
    for i, c in enumerate(cams):
        for r in c['routes']:
            if r not in cache: cache[r] = load_pts(r)
            if cache[r]: prefs[(i, r)] = pref(c['lat'], c['lng'], cache[r])
    # 이름이 (A → B) 와 (B → A) 로 짝인 카메라 두 대가 같은 방향 선을 고르면, 반대편 선에 덜 확실하게 붙은 쪽을 뒤집는다
    flip = set()
    for i, a in enumerate(cams):
        ea = ends(a['name'])
        if not ea: continue
        for k in range(i + 1, len(cams)):
            b = cams[k]; eb = ends(b['name'])
            if not eb or eb != (ea[1], ea[0]) or hav(a['lat'], a['lng'], b['lat'], b['lng']) > 60: continue
            for r in set(a['routes']) & set(b['routes']):
                pa, pb = prefs.get((i, r)), prefs.get((k, r))
                if not pa or not pb or abs(((pa[0] - pb[0] + 540) % 360) - 180) > 120: continue   # 이미 서로 반대로 나옴
                # 같은 방향을 골랐음: 확실함(반대선과의 차이가 큰 쪽)은 두고 덜 확실한 쪽을 뒤집음
                ma, mb = pa[2] - pa[1], pb[2] - pb[1]
                flip.add((i, r) if ma < mb else (k, r)); fixed += 1
    for i, c in enumerate(cams):
        if c.get('dirs') and not allc: continue
        dirs = {}
        for r in c['routes']:
            pr = prefs.get((i, r))
            if not pr: continue
            near_amb = pr[2] <= pr[1] + AMBIG_M
            if near_amb and (i, r) not in flip: amb += 1; continue
            b = (pr[0] + 180) % 360 if (i, r) in flip else pr[0]
            dirs[r] = int(round(b))
        if dirs: c['dirs'] = dirs; n += 1
        elif 'dirs' in c: del c['dirs']
    json.dump(j, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('방향을 넣은 카메라', n, '/ 방향 없음(양방향) 노선칸', amb, '/ 짝 보정', fixed)

if __name__ == '__main__': main()
