#!/usr/bin/env python3
"""무인교통단속카메라(공공데이터포털 표준데이터) → 우리 노선 주변 카메라만 추려 data/camera/cameras.json 생성.
사용: python3 tools/build_cameras.py <전체자료.json> [노선에서 떨어진 한계 m, 기본 30]
(전체자료.json = API 'tn_pubr_public_unmanned_traffic_camera_api' 결과 item 목록. 인증키는 파일에 저장하지 않는다.)
"""
import json, math, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KX, KY = 88000.0, 111000.0  # 위도 37.5° 부근 1도당 m
TYPE = {'1': 'signal', '01': 'signal', '2': 'speed', '02': 'speed', '01+02': 'both', '1+2': 'both', '99': 'other'}


def load_routes():
    out = {}
    d = os.path.join(ROOT, 'data', 'map')
    for f in sorted(os.listdir(d)):
        if f.endswith('.json'):
            j = json.load(open(os.path.join(d, f)))
            out[f[:-5]] = [seg for seg in j['segs'] if len(seg) > 1]
    return out


def seg_dist(c, a, b):
    px, py = (c[1] - a[1]) * KX, (c[0] - a[0]) * KY
    bx, by = (b[1] - a[1]) * KX, (b[0] - a[0]) * KY
    L = bx * bx + by * by
    t = 0 if L == 0 else max(0, min(1, (px * bx + py * by) / L))
    return math.hypot(px - bx * t, py - by * t)


def near(c, segs):
    best = 1e9
    for s in segs:
        for i in range(len(s) - 1):
            if min(s[i][0], s[i + 1][0]) - c[0] > 0.003 or c[0] - max(s[i][0], s[i + 1][0]) > 0.003:
                continue
            best = min(best, seg_dist(c, s[i], s[i + 1]))
    return best


def main():
    src = sys.argv[1]
    lim = float(sys.argv[2]) if len(sys.argv) > 2 else 30.0
    data = json.load(open(src))
    routes = load_routes()
    # 구간단속: 같은 이름·방향의 시점(1)·종점(2)을 짝지어 sections.json 으로 만든다 (시점·종점 점은 일반 카메라 목록에서 뺀다)
    SEC_NEAR = 150.0
    grp = {}
    for x in data:
        t = (x['itlpc'] or '') + ' ' + (x['roadRouteNm'] or '')
        m = re.search(r'^(.*?)\s*(시점|종점)\b.*?(\(.*→.*\))?\s*$', (x['itlpc'] or '').strip())
        if x['regltSe'] != '99' or not m or not x['latitude']:
            continue
        which = m.group(2)
        pm = re.search(r'\(([^()]*→[^()]*)\)', x['itlpc'])
        key = (x['roadRouteNm'], pm.group(1).strip() if pm else '')
        grp.setdefault(key, {'시점': {}, '종점': {}, 'limit': int(x['lmttVe'] or 0)})[which][(round(float(x['latitude']), 5), round(float(x['longitude']), 5))] = 1
    secs, secpts = [], set()
    for (road, dr), g in grp.items():
        if not g['시점'] or not g['종점']:
            continue
        a = list(g['시점'])[0]; b = list(g['종점'])[0]
        rs = [k for k, sg in routes.items() if near(a, sg) <= SEC_NEAR and near(b, sg) <= SEC_NEAR]   # 시점·종점을 모두 지나는 노선만
        if not rs or not (37.3 < a[0] < 37.7 and 126.3 < a[1] < 126.8):
            continue
        secpts |= set(g['시점']) | set(g['종점'])
        secs.append({'name': (road + ' (' + dr + ')').strip(), 'limit': g['limit'], 'routes': rs,
                     'start': {'lat': a[0], 'lng': a[1]}, 'end': {'lat': b[0], 'lng': b[1]}})
    os.makedirs(os.path.join(ROOT, 'data', 'camera'), exist_ok=True)
    json.dump({'v': 1, 'count': len(secs), 'sections': secs}, open(os.path.join(ROOT, 'data', 'camera', 'sections.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('구간단속', len(secs), '곳')
    for sc in secs:
        print(' ', sc['name'], sc['limit'], sc['routes'])
    seen, out = set(), []
    for x in data:
        try:
            c = (float(x['latitude']), float(x['longitude']))
        except (KeyError, ValueError):
            continue
        if not (37.3 < c[0] < 37.7 and 126.3 < c[1] < 126.8):
            continue
        t = TYPE.get(x['regltSe'])
        if t not in ('speed', 'signal', 'both', 'other'):
            continue
        key = (round(c[0], 5), round(c[1], 5), t)
        if (key[0], key[1]) in secpts:
            continue
        if key in seen:
            continue
        rs = [k for k, s in routes.items() if near(c, s) <= lim]
        if not rs:
            continue
        seen.add(key)
        out.append({'lat': round(c[0], 6), 'lng': round(c[1], 6), 'type': t,
                    'limit': int(x['lmttVe'] or 0), 'name': (x['itlpc'] or x['roadRouteNm'] or '').strip(),
                    'road': x['roadRouteNm'], 'routes': rs})
    out.sort(key=lambda r: (r['lat'], r['lng']))
    os.makedirs(os.path.join(ROOT, 'data', 'camera'), exist_ok=True)
    json.dump({'v': 1, 'source': '공공데이터포털 전국무인교통단속카메라표준데이터', 'count': len(out), 'cameras': out},
              open(os.path.join(ROOT, 'data', 'camera', 'cameras.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print(len(out), '개 저장')
    import collections
    print(collections.Counter(r['type'] for r in out))
    print(collections.Counter(k for r in out for k in r['routes']))


main()
