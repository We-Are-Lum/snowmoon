"""
Second pass on the spoiler fix (2026-11-12), run once after spoiler-fix-2026-11-12.py: puts Mu's battle-morning line
in book order inside "later", drops the stray "Then" from Deluin's "later", and removes Gladias's uncited "capital".

  python3 -I scripts/learn-more/spoiler-fix-2-2026-11-12.py <drafts dir>
"""
import json
import os
import sys

D = sys.argv[1]


def load(slug):
    return json.load(open(os.path.join(D, f'{slug}.json')))


def save(d):
    json.dump(d, open(os.path.join(D, f'{d["slug"]}.json'), 'w'), indent=1, ensure_ascii=False)


d = load('mu')
later = d['later']
assert later[-3]['text'].startswith('. On the morning') and later[-1] == {'cite': 'c29-b5'}
moved = [{'text': later[-3]['text'][2:]}, later[-2], later[-1]]
later = later[:-3]
k = next(i for i, s in enumerate(later) if s.get('text') == '. In the war against the ')
later = later[:k] + [{'text': '. '}] + moved + [{'text': '. In the war against the '}] + later[k + 1:]
if later[-1].get('cite'):
    later.append({'text': '.'})
d['later'] = later
save(d)

d = load('deluin')
assert d['later'][0]['text'] == 'Then the '
d['later'][0] = {'text': 'The '}
save(d)

d = load('gladias')
assert d['who'][2]['text'] == ', the capital of '
d['who'][2] = {'text': ', in '}
save(d)
print('second pass done')
