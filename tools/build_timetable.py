#!/usr/bin/env python3
"""data/timetable/timetable.csv -> data/timetable/tt/*.json, index.json, all.json

CSV(한 행 = 한 회차)를 고친 뒤 이 파일을 실행하면 앱이 읽는 JSON 파일이 다시 만들어진다.
  python3 tools/build_timetable.py
칸: 노선이름, 대수, 순번, 회차, 장소1~3, time1~3, 거리, 색1~3 (색: red / yellow / blue, 빈칸 = 검정)
"""
import csv, hashlib, json, os, sys, collections

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'timetable')
CSV_PATH = os.path.join(ROOT, 'timetable.csv')
TT_DIR = os.path.join(ROOT, 'tt')
COLORS = {'', 'red', 'yellow', 'blue'}


def main():
    with open(CSV_PATH, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    seqs = collections.OrderedDict()
    for r in rows:
        label = f"{r['노선이름']}({int(r['대수'])}대)"
        seqs.setdefault((label, int(r['순번'])), []).append(r)

    problems = []
    if os.path.isdir(TT_DIR):
        for name in os.listdir(TT_DIR):
            if name.endswith('.json'):
                os.remove(os.path.join(TT_DIR, name))
    os.makedirs(TT_DIR, exist_ok=True)

    index = collections.OrderedDict()
    allmap = collections.OrderedDict()
    for (label, seq), rs in seqs.items():
        rs.sort(key=lambda r: int(r['회차']))
        rounds = []
        for i, r in enumerate(rs, 1):
            if int(r['회차']) != i:
                problems.append(f'{label} {seq}순번: 회차 번호가 {i}부터 이어지지 않음')
            times = [r['time1'], r['time2'], r['time3']]
            for t in times:
                if t and not (len(t) == 5 and t[2] == ':'):
                    problems.append(f'{label} {seq}순번 {i}회차: 시간 형식 오류 {t!r}')
            for c in (r['색1'], r['색2'], r['색3']):
                if c not in COLORS:
                    problems.append(f'{label} {seq}순번 {i}회차: 모르는 색 {c!r}')
            rounds.append({
                'round': i,
                'places': [r['장소1'], r['장소2'], r['장소3']],
                'time1': times[0], 'time2': times[1], 'time3': times[2],
                'c1': r['색1'] or 'black', 'c2': r['색2'] or 'black', 'c3': r['색3'] or 'black',
                'dist': int(r['거리']),
            })
        with open(os.path.join(TT_DIR, f'{label}_{seq}순번.json'), 'w', encoding='utf-8') as f:
            json.dump({'route': label, 'seq': f'{seq}순번', 'rounds': rounds}, f, ensure_ascii=False, indent=1)
        index.setdefault(label, []).append(seq)
        allmap.setdefault(label, collections.OrderedDict())[str(seq)] = rounds

    with open(os.path.join(ROOT, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'routes': [{'route': k, 'seqs': v} for k, v in index.items()]}, f, ensure_ascii=False, indent=1)

    # 앱이 한 번에 받는 묶음 파일 (가볍게 한 번만 내려받음)
    with open(os.path.join(ROOT, 'all.json'), 'w', encoding='utf-8') as f:
        json.dump({'rev': hashlib.md5(json.dumps(allmap, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()[:12],
                   'tt': allmap}, f, ensure_ascii=False, separators=(',', ':'))

    print(f'노선 {len(index)}개, 순번 {len(seqs)}개, 회차 {len(rows)}개')
    if problems:
        print('확인 필요:')
        for p in problems:
            print(' -', p)
        sys.exit(1)


if __name__ == '__main__':
    main()
