#!/usr/bin/env python3
"""camera_edit.html 의 [복사]로 나온 글(JSON)을 data/camera/cameras.json 에 반영한다.
사용: python3 tools/apply_camera_edits.py '<붙여 넣은 JSON>'   또는   python3 tools/apply_camera_edits.py 파일.json
 - deletes: 그 노선에서 카메라를 뺀다(다른 노선 칸은 그대로, 노선이 하나도 안 남으면 카메라 삭제)
 - flips: 그 노선의 진행 방향(dirs)을 바꾼다(dir 이 null 이면 양방향)
 - adds: 새 카메라를 넣는다(routes 에 적힌 노선마다 같은 방향 dir 적용)
"""
import json, math, os, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PATH = os.path.join(ROOT, 'data', 'camera', 'cameras.json')

def dist(a, b, c, d):
    k = math.cos(math.radians((a + c) / 2))
    return math.hypot((d - b) * 111320 * k, (c - a) * 110540)

def find(cams, lat, lng):
    best, bd = None, 5.0   # 5m 안의 가장 가까운 카메라
    for c in cams:
        d = dist(lat, lng, c['lat'], c['lng'])
        if d < bd: best, bd = c, d
    return best

def main():
    arg = sys.argv[1]
    txt = open(arg, encoding='utf-8').read() if os.path.exists(arg) else arg
    e = json.loads(txt)
    route = e['route']
    j = json.load(open(PATH, encoding='utf-8')); cams = j['cameras']
    nd = nf = na = 0
    for x in e.get('deletes', []):
        c = find(cams, x['lat'], x['lng'])
        if not c or route not in c['routes']: print('삭제 대상을 못 찾음', x); continue
        c['routes'].remove(route); (c.get('dirs') or {}).pop(route, None); nd += 1
        if not c['routes']: cams.remove(c)
    for x in e.get('flips', []):
        c = find(cams, x['lat'], x['lng'])
        if not c or route not in c['routes']: print('방향 대상을 못 찾음', x); continue
        d = c.setdefault('dirs', {})
        if x['dir'] is None: d.pop(route, None)
        else: d[route] = int(x['dir'])
        if not d: c.pop('dirs')
        nf += 1
    for a in e.get('adds', []):
        c = {'lat': round(a['lat'], 6), 'lng': round(a['lng'], 6), 'type': a['type'], 'limit': a.get('limit') or 0,
             'name': a.get('name') or '', 'road': '', 'routes': a['routes']}
        if a.get('wetLimit'): c['wetLimit'] = int(a['wetLimit'])
        if a.get('dir') is not None: c['dirs'] = {r: int(a['dir']) for r in a['routes']}
        cams.append(c); na += 1
    j['count'] = len(cams)
    json.dump(j, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('삭제', nd, '방향', nf, '설치', na, '/ 카메라 총', len(cams))

if __name__ == '__main__': main()
