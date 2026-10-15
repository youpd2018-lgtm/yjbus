#!/usr/bin/env python3
"""road_names.html 이 만든 {"route":"202","roads":[...]} 를 노선 파일에 기록한다.
사용: python3 -I tools/apply_road_names.py '<붙여 넣은 JSON>'"""
import sys, json, os
d = json.loads(sys.argv[1])
p = os.path.join(os.path.dirname(__file__), '..', 'data', 'routemaster', 'ganseon', d['route'] + '.json')
r = json.load(open(p, encoding='utf-8'))
assert len(r['stops']) == len(d['roads']), '정류장 수가 다릅니다'
for s, road in zip(r['stops'], d['roads']): s[6] = road
json.dump(r, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(d['route'], len(d['roads']), '개 기록')
