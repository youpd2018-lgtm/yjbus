#!/usr/bin/env python3
"""data/roster/roster.csv -> data/roster/all.json

한 행 = 기사 1명의 하루 근무. 고친 뒤 python3 tools/build_roster.py 를 실행한다.
보관 규칙: roster.csv / all.json 에는 어제·오늘·미래 근무만 둔다. 더 오래된 날짜의 회사 전체 표는 지우고, 앱 사용자(data/roster/app_users.txt)의 근무만 data/roster/history/drivers/<이름>.json 에 2026-10-01부터 계속 쌓는다.
규칙: 근무하는 사람만 적는다. 그 날짜에 이름이 없는 기사는 앱이 자동으로 휴무로 처리한다. (휴무 행은 무시된다)
기사 전체 명단은 data/roster/drivers.txt (한 줄에 한 명). 새 기사가 근무표에 나오면 이 실행에서 자동으로 추가된다.
칸: 근무일자(YYYY-MM-DD), 기사명, 근무형태(정상/대타 등), 노선명, 차량번호, 순번, 근무시간(오전/오후)
all.json 모양: {"rev":..., "drivers":[이름...], "days":{"2026-10-04":{"이승국":{"workType":"정상","busNo":"2514","route":"202휴일(12대)","seq":"1순번","time":"오전"}}}}
(days 안의 값은 앱의 jpil_user_<이름>_sched_<날짜> 값과 같은 모양, 휴무자는 days에 없음)
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
    # 지난 근무 보관: 회사 전체 표는 지우고, '앱 사용자'(data/roster/app_users.txt)의 근무만 history/drivers/<이름>.json 에 2026-10-01부터 계속 쌓는다
    HIST = os.path.join(ROOT, 'history'); DRVDIR = os.path.join(HIST, 'drivers'); os.makedirs(DRVDIR, exist_ok=True)
    HIST_FROM = '2026-10-01'
    users = [l.strip() for l in open(os.path.join(ROOT, 'app_users.txt'), encoding='utf-8') if l.strip() and not l.startswith('#')]
    through = (datetime.datetime.strptime(keep_from, '%Y-%m-%d') - datetime.timedelta(days=1)).strftime('%Y-%m-%d')
    for n in users:
        fp = os.path.join(DRVDIR, n + '.json')
        d = json.load(open(fp, encoding='utf-8'))['days'] if os.path.exists(fp) else {}
        for r in old:
            if r['기사명'].strip() == n and r['근무형태'].strip() != '휴무' and r['근무일자'].strip() >= HIST_FROM:
                d[r['근무일자'].strip()] = {'workType': r['근무형태'], 'busNo': r['차량번호'], 'route': r['노선명'], 'seq': r['순번'], 'time': r['근무시간']}
        open(fp, 'w', encoding='utf-8').write(json.dumps({'name': n, 'from': HIST_FROM, 'through': through, 'days': d}, ensure_ascii=False, sort_keys=True, separators=(',', ':')))
    h = hashlib.md5(b''.join(open(os.path.join(DRVDIR, n + '.json'), 'rb').read() for n in sorted(users))).hexdigest()[:8]
    open(os.path.join(HIST, 'index.json'), 'w', encoding='utf-8').write(json.dumps({'from': HIST_FROM, 'through': through, 'rev': h}, separators=(',', ':')))
    rows = [r for r in rows if r['근무일자'].strip() >= keep_from]
    with open(CSV, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    print(f'{keep_from} 이전 {len(old)}행 삭제 (앱 사용자 {len(users)}명의 근무는 history/drivers/ 에 보관)')
days, bad, seen = {}, [], set()
for i, r in enumerate(rows, 2):
    d, n = r['근무일자'].strip(), r['기사명'].strip()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', d) or not n: bad.append(f'{i}행: 날짜/이름 이상'); continue
    if (d, n) in seen: bad.append(f'{i}행: {d} {n} 중복'); continue
    seen.add((d, n))
    if r['근무형태'].strip() == '휴무': continue  # 휴무는 적지 않는다 (이름이 없으면 휴무)
    days.setdefault(d, {})[n] = {'workType': r['근무형태'], 'busNo': r['차량번호'],
        'route': r['노선명'], 'seq': r['순번'], 'time': r['근무시간']}
if bad: print('\n'.join(bad)); sys.exit(1)
# 검사: 노선 이름의 종류(평일/휴일/방학)와 대수가 그날 실제 운행과 맞아야 한다 (시간표가 이것으로 정해진다)
TT = json.load(open(os.path.join(ROOT, '..', 'timetable', 'all.json'), encoding='utf-8'))['tt']
by = {}
for i, r in enumerate(rows, 2):
    if r['근무형태'].strip() == '휴무': continue
    by.setdefault((r['근무일자'].strip(), r['노선명'].strip()), set()).add(re.sub(r'\D', '', r['순번']))
kinds = {}
for (d, label), seqs in sorted(by.items()):
    m = re.fullmatch(r'(\d+[A-Z]?)(평일|휴일|방학)\((\d+)대\)', label)
    if not m: bad.append(f'{d} 노선 이름 형식 이상: {label}'); continue
    if label not in TT: bad.append(f'{d} {label}: 시간표에 없는 노선(종류/대수 확인)')
    if seqs != {str(k) for k in range(1, int(m.group(3)) + 1)}:
        bad.append(f'{d} {label}: 순번이 1~{m.group(3)}과 다름 ({len(seqs)}개: {sorted(map(int, seqs))})')
    if m.group(1) != '204': kinds.setdefault(d, set()).add(m.group(2))
for d, k in sorted(kinds.items()):
    if len(k) > 1: bad.append(f'{d}: 한 날짜에 평일/휴일/방학이 섞여 있음 {sorted(k)}')
if bad: print('\n'.join(bad)); sys.exit(1)

DRV = os.path.join(ROOT, 'drivers.txt')
drivers = [l.strip() for l in open(DRV, encoding='utf-8') if l.strip()]
new = sorted({n for d in days.values() for n in d} - set(drivers))
if new:
    drivers = sorted(set(drivers) | set(new))
    open(DRV, 'w', encoding='utf-8').write('\n'.join(drivers) + '\n')
    print('새 기사 명단에 추가:', ', '.join(new))
body = json.dumps(days, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
rev = hashlib.md5(body.encode()).hexdigest()[:8]
open(os.path.join(ROOT, 'all.json'), 'w', encoding='utf-8').write('{"rev":"%s","drivers":%s,"days":%s}' % (rev, json.dumps(drivers, ensure_ascii=False, separators=(',', ':')), body))
print('ok', len(days), '일', len(rows), '행', 'rev', rev)

