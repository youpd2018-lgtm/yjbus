#!/usr/bin/env python3
"""노선마스터 시트(xlsx 내려받기) → data/routemaster/<노선>.json (한 번 옮길 때 쓰는 도구).
사용: python3 -I tools/import_routemaster.py 노선마스터.xlsx
출력 형식은 Apps Script getRouteStopsForApp(RouteExport.js)의 결과와 같다.
 stops = [정류장ID, 정류장명, 위도, 경도, 누적구간소요시간(초), 제한속도, 도로명]
 anchors = stops 배열 안의 앵커 번호(시트 G열 배경 #ea9999)."""
import sys, os, json, datetime, openpyxl

# 노선별 인가 기준 총 표준시간(분) — Sheet_Master.js ROUTE_TOTAL_MINUTES
INCHEON_MIN = {'202': 288, '203': 145, '204': 225, '205': 144, '206': 155,
               '221': 165, '281': 185, '282': 125, '202A': 55, '203A': 50}
# 앵커 정류장 = 기사들이 부르는 이름 (근무표 장소1~3과 같은 이름)
ANCHOR_NAMES = {
    '202': ['T1장기주차장', '대우하나', 'T1장기주차장'],
    '203': ['차고지', 'T2', '차고지'],
    '204': ['영종아레나', '입구지', '영종아레나'],
    '205': ['영종아레나', 'T2', '영종아레나'],
    '206': ['차고지', 'T1', '차고지'],
    '221': ['차고지', 'T2', '차고지'],
    '281': ['T2', '대우하나', 'T2'],
    '282': ['우미린후문', '석남역', '서희스타힐스'],
    '202A': ['신현여중후문', 'T1-3층(7번)'],
    '203A': ['서희스타옆문', 'T2'],
}

def sec(v):
    if v is None or v == '' or v == '-': return None
    if isinstance(v, datetime.time): return v.hour*3600 + v.minute*60 + v.second
    if isinstance(v, datetime.timedelta): return int(v.total_seconds())
    p = [int(x) for x in str(v).strip().split(':')]
    return p[0]*3600+p[1]*60+(p[2] if len(p) > 2 else 0)

def name_of(v):
    if isinstance(v, float) and v == int(v): v = int(v)
    return str(v).strip()

def main(path):
    ws = openpyxl.load_workbook(path)['노선마스터']
    routes = {}
    for r in range(2, ws.max_row+1):
        n = name_of(ws.cell(r, 2).value)
        if n in ('', 'None'): continue
        routes.setdefault(n, []).append(r)
    out = os.path.join(os.path.dirname(__file__), '..', 'data', 'routemaster')
    os.makedirs(out, exist_ok=True)
    index = {}
    for n, rows in routes.items():
        stops, anchors, cum = [], [], 0
        for r in rows:
            c = lambda k: ws.cell(r, k).value
            cum += sec(c(12)) or 0
            stops.append([str(c(5)).strip(), str(c(7)).strip(), float(c(8)), float(c(9)), cum,
                          float(c(14)) if ws.max_column >= 14 and c(14) else 50,
                          str(c(15) or '').strip() if ws.max_column >= 15 else ''])
            f = ws.cell(r, 7).fill
            if f.fill_type and f.fgColor.rgb == 'FFEA9999': anchors.append(len(stops)-1)
        names = ANCHOR_NAMES[n]
        assert len(anchors) == len(names), (n, anchors)
        data = {'route': n, 'totalSec': cum, 'incheonSec': INCHEON_MIN[n]*60,
                'anchors': anchors, 'anchorNames': names, 'stops': stops}
        with open(os.path.join(out, n + '.json'), 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        index[n] = {'stops': len(stops), 'totalSec': cum, 'incheonSec': INCHEON_MIN[n]*60}
        print(n, len(stops), '정류장', 'L합계', cum, '인가', INCHEON_MIN[n]*60, 'diff', cum-INCHEON_MIN[n]*60, anchors)
    with open(os.path.join(out, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=1)

main(sys.argv[1])
