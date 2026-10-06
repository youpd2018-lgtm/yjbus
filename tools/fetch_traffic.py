#!/usr/bin/env python3
"""국토교통부 ITS 소통정보·돌발정보를 받아 data/traffic.json 으로 저장한다 (GitHub Actions에서 실행).
키는 환경변수 ITS_API_KEY (GitHub Secret). 영종·인천 일대 범위만 요청한다."""
import json, os, sys, time, urllib.request, urllib.parse

KEY = os.environ.get('ITS_API_KEY', '').strip()
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'traffic.json')
BOX = {'minX': '126.35', 'maxX': '126.85', 'minY': '37.35', 'maxY': '37.65'}


def get(path, extra):
    q = {'apiKey': KEY, 'type': 'all', 'getType': 'json'}
    q.update(extra)
    url = 'https://openapi.its.go.kr:9443/%s?%s' % (path, urllib.parse.urlencode(q))
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.loads(r.read().decode('utf-8', 'replace')), None
    except Exception as e:  # 오류 문구에 키가 섞이지 않게 가린다
        return None, str(e).replace(KEY, '***')


def items_of(j):
    b = (j or {}).get('body') or {}
    it = b.get('items')
    return it if isinstance(it, list) else []


if not KEY:
    print('ITS_API_KEY 가 없습니다'); sys.exit(1)

flow, e1 = get('trafficInfo', BOX)
inc, e2 = get('eventInfo', dict(BOX, eventType='all'))
result = {
    'updated': time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(time.time() + 9 * 3600)),
    'flowError': e1, 'incidentError': e2,
    'flow': items_of(flow), 'incidents': items_of(inc),
}
if e1 and e2:
    print('둘 다 실패:', e1, e2); sys.exit(1)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, separators=(',', ':'))
print('flow', len(result['flow']), 'incidents', len(result['incidents']), e1, e2)
