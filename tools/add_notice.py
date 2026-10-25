#!/usr/bin/env python3
"""공고문 추가 도구 (한 공고에 이미지 여러 장 가능).
사용: python3 tools/add_notice.py <날짜 YYYY-MM-DD> "<제목>" <이미지1> [이미지2 ...]
- 이미지를 보여 줄 순서대로 적는다(첫 장이 썸네일). data/notices/img/ 로 복사하고 data/notices/index.json 에 최신 날짜순으로 추가한다.
- 같은 날짜+제목이 이미 있으면 그 공고의 이미지를 새로 적은 것으로 통째로 바꾼다.
"""
import json, os, shutil, sys, re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'notices')
IDX = os.path.join(ROOT, 'index.json')


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    date, title, srcs = sys.argv[1], sys.argv[2].strip(), sys.argv[3:]
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
        sys.exit('날짜는 YYYY-MM-DD 형식이어야 합니다.')
    for s in srcs:
        if not os.path.isfile(s):
            sys.exit('이미지 파일이 없습니다: ' + s)
    data = json.load(open(IDX, encoding='utf-8')) if os.path.exists(IDX) else {'items': []}
    items = data['items']
    old = next((i for i in items if i['date'] == date and i['title'] == title), None)
    if old:
        for p in old.get('images', []):
            f = os.path.join(ROOT, p)
            if os.path.exists(f):
                os.remove(f)
    n = len({i['images'][0] for i in items if i['date'] == date and i is not old and i.get('images')}) + 1
    os.makedirs(os.path.join(ROOT, 'img'), exist_ok=True)
    names = []
    for k, s in enumerate(srcs, 1):
        ext = os.path.splitext(s)[1].lower() or '.jpg'
        name = '%s_%d_%d%s' % (date, n, k, ext)
        shutil.copyfile(s, os.path.join(ROOT, 'img', name))
        names.append('img/' + name)
    if old:
        old['images'] = names
    else:
        items.append({'date': date, 'title': title, 'images': names})
    items.sort(key=lambda i: (i['date'], i['images'][0]), reverse=True)
    json.dump(data, open(IDX, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('추가 완료:', date, title, '%d장' % len(names), '(전체 %d건)' % len(items))


if __name__ == '__main__':
    main()
