#!/usr/bin/env python3
"""data/roster/roster.csv -> data/roster/all.json

한 행 = 기사 1명의 하루 근무. 고친 뒤 python3 tools/build_roster.py 를 실행한다.
보관 규칙: 어제·오늘·미래 근무만 보관(더 오래된 날짜는 실행할 때 지워짐).
칸: 근무일자(YYYY-MM-DD), 기사명, 근무형태(정상/휴무/대타 등), 노선명, 차량번호, 순번, 근무시간(오전/오후/-)
all.json 모양: {"rev":..., "days":{"2026-10-04":{"이승국":{"workType":"정상","busNo":"2514","route":"202휴일(12대)","seq":"1순번","time":"오전"}}}}
(앱의 jpil_user_<이름>_sched_<날짜> 값과 같은 모양)
"""
import csv, hashlib, json, os, sys, re, datetime

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'roster')
CSV = os.path.join(ROOT, 'roster.csv')
rows = list(csv.DictReader(open(CSV, encoding='utf-8-sig', newline='')))
# 보관 규칙: 어제, 오늘, 미래에 등록된 근무는 전부 보관하고 그보다 오래된 날짜는 지운다 (한국 시간 기준)
kst = datetime.datetime.utcnow() + datetime.timedelta(hours=9)
keep_from = (kst - datetime.timedelta(days=1)).strftime('%Y-%m-%d')
old = [r for r in rows if r['근무일자'].strip() < keep_from]
if old:
    rows = [r for r in rows if r['근무일자'].strip() >= keep_from]
    with open(CSV, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    print(f'{keep_from} 이전 {len(old)}행 삭제')
days, bad, seen = {}, [], set()
for i, r in enumerate(rows, 2):
    d, n = r['근무일자'].strip(), r['기사명'].strip()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', d) or not n: bad.append(f'{i}행: 날짜/이름 이상'); continue
    if (d, n) in seen: bad.append(f'{i}행: {d} {n} 중복'); continue
    seen.add((d, n))
    off = r['근무형태'] == '휴무'
    days.setdefault(d, {})[n] = {'workType': r['근무형태'], 'busNo': '' if off else r['차량번호'],
        'route': '' if off else r['노선명'], 'seq': '' if off else r['순번'], 'time': '' if off else r['근무시간']}
if bad: print('\n'.join(bad)); sys.exit(1)
body = json.dumps(days, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
rev = hashlib.md5(body.encode()).hexdigest()[:8]
open(os.path.join(ROOT, 'all.json'), 'w', encoding='utf-8').write('{"rev":"%s","days":%s}' % (rev, body))
print('ok', len(days), '일', len(rows), '행', 'rev', rev)
