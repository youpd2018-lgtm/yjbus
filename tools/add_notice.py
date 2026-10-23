#!/usr/bin/env python3
"""공고문 추가 도구.
사용: python3 tools/add_notice.py <이미지파일> <날짜 YYYY-MM-DD> "<제목>"
- 이미지를 data/notices/img/ 로 복사하고 data/notices/index.json 맨 앞(최신순)에 한 줄 추가한다.
- 같은 날짜+제목이 이미 있으면 그 줄의 이미지를 바꾼다.
"""
import json, os, shutil, sys, re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'notices')
IDX = os.path.join(ROOT, 'index.json')


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    src, date, title = sys.argv[1], sys.argv[2], sys.argv[3].strip()
    if not os.path.isfile(src):
        sys.exit('이미지 파일이 없습니다: ' + src)
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
        sys.exit('날짜는 YYYY-MM-DD 형식이어야 합니다.')
    ext = os.path.splitext(src)[1].lower() or '.jpg'
    data = json.load(open(IDX, encoding='utf-8')) if os.path.exists(IDX) else {'items': []}
    items = data['items']
    n = sum(1 for i in items if i['date'] == date) + 1
    name = '%s_%d%s' % (date, n, ext)
    old = next((i for i in items if i['date'] == date and i['title'] == title), None)
    if old:
        name = old['image'].split('/')[-1]
    os.makedirs(os.path.join(ROOT, 'img'), exist_ok=True)
    shutil.copyfile(src, os.path.join(ROOT, 'img', name))
    if old:
        old['image'] = 'img/' + name
    else:
        items.append({'date': date, 'title': title, 'image': 'img/' + name})
    items.sort(key=lambda i: (i['date'], i['image']), reverse=True)
    json.dump(data, open(IDX, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('추가 완료:', date, title, '→', name, '(전체 %d건)' % len(items))


if __name__ == '__main__':
    main()
