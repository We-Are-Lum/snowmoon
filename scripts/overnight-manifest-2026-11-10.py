"""
Overnight pages, 2026-11-10 (owner's tasks A, B, C): resolves every picture shown on the three pages to its ledger row
(path and index in `calls`), sha256, model, character, change and style or setting, and writes the manifest the page
builder reads (scripts/overnight-pages-2026-11-10.ts). No pictures are made here. The marks are the coding agent's
reading of each picture (Claude, a closed model by Anthropic). DRAFT.

  python3 -I scripts/overnight-manifest-2026-11-10.py <scratchpad>
"""
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = sys.argv[1]
D = os.path.join(ROOT, 'docs', 'starting-sheet-drafts')
OUT = os.path.join(D, 'overnight-2026-11-10')
os.makedirs(OUT, exist_ok=True)

MAKER = {
    'flux': ('FLUX.2 [klein] 4B', 'open weights, by Black Forest Labs'),
    'qwen': ('Qwen-Image-Edit 2509', 'open weights, by Alibaba’s Qwen team'),
    'gpt': ('GPT Image 2.5', 'a closed model by OpenAI'),
    'gemini': ('Gemini 3.1 Flash Image', 'a closed model by Google'),
}
NAME = {'zei': 'Zei', 'gladias': 'Gladias', 'bai': 'Bai', 'seila': 'Seila', 'deluin': 'Deluin', 'mu': 'Mu'}
LEDGERS = {
    'style-test': 'style-test-2026-11-08/ledger.json',
    'real-prompts': 'real-prompts-2026-11-09/ledger.json',
    'retest': 'retest-2026-11-09/ledger.json',
    'world-line': 'world-line-2026-11-09/ledger.json',
    'book-world': 'book-world-2026-11-09/ledger.json',
    'near-future': 'near-future-2026-11-09/ledger.json',
    'gemini-settings': 'gemini-settings-2026-11-09/ledger.json',
    'bases-pick-2': 'bases-pick-2-2026-11-10/ledger.json',
}
FULL = {
    'style-test': 'style-test/full', 'real-prompts': 'real-prompts/full', 'retest': 'three-tests/full', 'world-line': 'world-line/full',
    'book-world': 'book-world/full', 'near-future': 'near-future/full', 'gemini-settings': 'gemini-settings/full', 'bases-pick-2': 'bases-pick-2/full',
}
STYLE_TEST_LABEL = {'comic-book': 'Comic book', 'comic-3d-mix': 'Comic 3D mix'}
cache = {}


def ledger(name):
    if name not in cache:
        cache[name] = json.load(open(os.path.join(D, LEDGERS[name])))
    return cache[name]


def row(name, file):
    calls = ledger(name)['calls']
    hits = [(i, c) for i, c in enumerate(calls) if c.get('kind') == 'picture' and c.get('file') == file and c.get('status') == 'ok' and not c.get('superseded')]
    if not hits:
        raise SystemExit(f'no ok row for {file} in {name}')
    i, c = hits[-1]
    path = os.path.join(S, FULL[name], file)
    digest = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    if c.get('sha256') and c['sha256'] != digest:
        raise SystemExit(f'sha256 differs for {file}')
    return i, c, digest


def item(name, file, **extra):
    i, c, digest = row(name, file)
    model = c['model']
    ch = c.get('character')
    if name == 'style-test':
        change = '(empty change box: the style test)'
        style = STYLE_TEST_LABEL.get(c['style'], c['style'])
    else:
        change = c.get('words', '')
        style = extra.pop('style', None)
    return {
        'src': os.path.join(FULL[name], file), 'file': file, 'ledger': os.path.join('docs/starting-sheet-drafts', LEDGERS[name]), 'row': i,
        'sha256': digest, 'model': model, 'model_name': MAKER[model][0], 'maker': MAKER[model][1], 'character': NAME.get(ch, ch), 'change': change,
        'style': style, **extra,
    }


# A. Style samples: pictures that already exist, with full recipes.
A = {
    'Animated series': [
        item('real-prompts', 'rp-02-zei-flux.jpg', style='Animated series', strong='yes', note='clean outlines, flat colour, lively face; one figure'),
        item('real-prompts', 'rp-08-seila-gpt.jpg', style='Animated series', strong='yes', note='crisp cel look, Seila clear in a spacesuit; one figure'),
        item('real-prompts', 'rp-11-mu-gemini.jpg', style='Animated series', strong='yes', note='bold outlines, flat night colours; Mu clear; one figure'),
        item('real-prompts', 'rp-06-bai-gpt.jpg', style='Random (drew Animated series)', strong='yes', note='flat cel colour, expressive face, a dragon; one figure'),
        item('world-line', 'wl-03-gladias-gpt-with.jpg', style='Random (drew Animated series)', strong='partly', note='the look holds but the detailed city background is busier than the style asks'),
        item('world-line', 'wl-09-deluin-gpt-with.jpg', style='Random (drew Animated series)', strong='partly', note='clean figure; a detailed painted background'),
    ],
    'Comic book': [
        item('book-world', 'bw-01-zei-gpt.jpg', style='Comic book', strong='yes', note='dramatic angle, bold ink, bright flat colour; Zei clear'),
        item('style-test', 'comic-book-mu-flux.jpg', strong='yes', note='heavy black outlines, flat bright colour, dot shading; plain white ground'),
        item('style-test', 'comic-book-gladias-gpt.jpg', strong='yes', note='low dramatic angle, dot-pattern sky, bold outlines'),
        item('style-test', 'comic-book-seila-gemini.jpg', strong='yes', note='extreme low angle, inked lines, flat colour'),
        item('book-world', 'bw-05-bai-gpt.jpg', style='Comic book', strong='partly', note='dramatic angle and inks; the dot shading is faint'),
        item('book-world', 'bw-10-deluin-gpt.jpg', style='Comic book', strong='partly', note='bold inks and colour; reads more cel than printed comic'),
    ],
    'Comic 3D mix': [
        item('style-test', 'comic-3d-mix-mu-gpt.jpg', strong='yes', note='3D-shaded figure with inked lines, halftone sunburst, offset colour'),
        item('style-test', 'comic-3d-mix-bai-gpt.jpg', strong='yes', note='rounded shading with ink lines, graphic colour, halftone sky'),
        item('style-test', 'comic-3d-mix-zei-flux.jpg', strong='partly', note='hatching and offset colour on a plain ground; little 3D form'),
        item('book-world', 'bw-07-seila-gpt.jpg', style='Comic 3D mix', strong='partly', note='a strong picture; the 3D-and-halftone look is light'),
        item('book-world', 'bw-12-mu-gpt.jpg', style='Comic 3D mix', strong='partly', note='a strong picture; mostly cel, light hatching'),
        item('book-world', 'bw-04-gladias-gpt.jpg', style='Comic 3D mix', strong='partly', note='a strong picture; mostly cel, light hatching'),
    ],
}

# B. Bases pick: base now, looks a/b on Gemini (5 Nov drafts), and tonight's GPT and FLUX recasts.
DIRS = 'docs/starting-sheet-drafts/directions/ledger.json (origin/challenge-styles)'
dir_ledger = None


def dir_item(ch, look):
    global dir_ledger
    path = os.path.join(S, 'bases-pick-2/src', f'{ch}-look-{look}-gemini.jpg')
    digest = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    return {'src': os.path.relpath(path, S), 'file': f'{ch}-look-{look}-gemini.jpg', 'ledger': DIRS, 'row': f'file directions/{ch}-look-{look}-gemini.jpg', 'sha256': digest,
            'model': 'gemini', 'model_name': MAKER['gemini'][0], 'maker': MAKER['gemini'][1], 'character': NAME[ch], 'change': f'look {look} (three-looks proposal)', 'style': 'Animated series'}


refs = json.load(open(os.path.join(S, 'style-test/refs/refs.json')))
BJ = {  # (look matched, still them = signature details, usable base front, shareable, reading)
    ('zei', 'a', 'gpt'): ('yes', 'yes', 'yes', 'yes', 'deep brown skin, black twists with the blue streak'),
    ('zei', 'b', 'gpt'): ('yes', 'yes', 'yes', 'yes', 'fair skin, spiky ash-brown hair with the streak'),
    ('zei', 'a', 'flux'): ('yes', 'yes', 'yes', 'yes', 'deep brown skin, twists, the streak kept'),
    ('zei', 'b', 'flux'): ('partly', 'yes', 'yes', 'yes', 'fair skin; hair stays dark, not ash-brown'),
    ('bai', 'a', 'gpt'): ('partly', 'yes', 'yes', 'yes', 'straight black ponytail with magenta ends; skin warm tan, not light olive'),
    ('bai', 'b', 'gpt'): ('partly', 'yes', 'yes', 'yes', 'auburn curls with magenta ends, freckles; skin medium brown, not fair'),
    ('bai', 'a', 'flux'): ('partly', 'yes', 'yes', 'yes', 'long black-and-magenta ponytail; skin unchanged'),
    ('bai', 'b', 'flux'): ('partly', 'yes', 'yes', 'yes', 'auburn-brown ponytail; skin unchanged'),
    ('seila', 'a', 'gpt'): ('yes', 'yes', 'yes', 'yes', 'light tan skin, wavy black hair, glasses kept'),
    ('seila', 'b', 'gpt'): ('yes', 'yes', 'yes', 'yes', 'fair skin, auburn braid, green eyes, glasses kept'),
    ('seila', 'a', 'flux'): ('partly', 'yes', 'yes', 'yes', 'wavy black hair and glasses; skin unchanged'),
    ('seila', 'b', 'flux'): (None, None, 'no', 'no', 'blocked by fal’s safety checker (a black picture)'),
    ('mu', 'a', 'gpt'): ('yes', 'yes', 'yes', 'yes', 'pale skin, silver asymmetric cut, red glasses'),
    ('mu', 'b', 'gpt'): ('yes', 'yes', 'yes', 'yes', 'deep brown skin, silver coils, red glasses'),
    ('mu', 'a', 'flux'): ('partly', 'yes', 'yes', 'yes', 'silver hair and red glasses; skin medium brown, not pale'),
    ('mu', 'b', 'flux'): ('yes', 'yes', 'yes', 'yes', 'deep brown skin, short silver hair, glasses'),
}
B = []
bp = ledger('bases-pick-2')
for ch, (la, lb) in {'zei': ('a', 'b'), 'bai': ('a2', 'b2'), 'seila': ('a', 'b'), 'mu': ('a', 'b')}.items():
    base = {'src': f'style-test/refs/{ch}.jpg', 'file': f'{ch}.jpg', 'ledger': 'published base (CHALLENGE.defaultLooks)', 'row': refs[ch]['version'], 'sha256': refs[ch]['sha256'],
            'model': None, 'model_name': 'published base', 'maker': '', 'character': NAME[ch], 'change': 'base now', 'style': 'Animated series'}
    items = [dict(base, kind='base'), dict(dir_item(ch, la), kind='gemini', marks=('yes', 'yes', 'yes', 'yes', 'the 5 Nov draft front')),
             dict(dir_item(ch, lb), kind='gemini', marks=('yes', 'yes', 'yes', 'yes', 'the 5 Nov draft front'))]
    for model in ('gpt', 'flux'):
        for look in ('a', 'b'):
            m = BJ[(ch, look, model)]
            file = f'bp2-{ch}-{look}-{model}.jpg'
            ok = any(c.get('file') == file and c.get('status') == 'ok' for c in bp['calls'])
            if ok:
                it = item('bases-pick-2', file, style='Same as this picture')
            else:
                i = [k for k, c in enumerate(bp['calls']) if c.get('file') == file][-1]
                it = {'src': None, 'file': file, 'ledger': os.path.join('docs/starting-sheet-drafts', LEDGERS['bases-pick-2']), 'row': i, 'sha256': None, 'model': model,
                      'model_name': MAKER[model][0], 'maker': MAKER[model][1], 'character': NAME[ch], 'change': bp['calls'][i].get('words', ''), 'style': 'Same as this picture'}
            it.update(kind=model, look=look, marks=m)
            items.append(it)
    B.append({'character': NAME[ch], 'slug': ch, 'looks': bp['looks'][ch], 'items': items})

# C. Promo: starred pictures, best first.
C = [
    item('gemini-settings', 'gs-07-seila-A.jpg', style='Same as this picture', setting='near future, setting A'),
    item('near-future', 'nf-04-gladias-E.jpg', style='Mood', setting='near future, setting E'),
    item('book-world', 'bw-05-bai-gpt.jpg', style='Comic book', setting='book-based world line'),
    item('near-future', 'nf-07-seila-E.jpg', style='Mood', setting='near future, setting E'),
    item('gemini-settings', 'gs-01-zei-D.jpg', style='Same as this picture', setting='near future, setting D'),
    item('book-world', 'bw-01-zei-gpt.jpg', style='Comic book', setting='book-based world line'),
    item('near-future', 'nf-12-mu-E.jpg', style='Mood', setting='near future, setting E'),
    item('near-future', 'nf-05-bai-E.jpg', style='Same as this picture', setting='near future, setting E'),
    item('gemini-settings', 'gs-04-gladias-E.jpg', style='Same as this picture', setting='near future, setting E'),
    item('book-world', 'bw-07-seila-gpt.jpg', style='Comic 3D mix', setting='book-based world line'),
    item('near-future', 'nf-01-zei-D.jpg', style='Same as this picture', setting='near future, setting D'),
    item('near-future', 'nf-05-bai-C.jpg', style='Same as this picture', setting='near future, setting C'),
    item('near-future', 'nf-07-seila-A.jpg', style='Mood', setting='near future, setting A'),
    item('book-world', 'bw-12-mu-gpt.jpg', style='Comic 3D mix', setting='book-based world line'),
    item('book-world', 'bw-04-gladias-gpt.jpg', style='Comic 3D mix', setting='book-based world line'),
    item('gemini-settings', 'gs-05-bai-C.jpg', style='Same as this picture', setting='near future, setting C'),
    item('real-prompts', 'rp-06-bai-gpt.jpg', style='Random (drew Animated series)', setting='none (shipping prompt)'),
    item('real-prompts', 'rp-07-seila-gemini.jpg', style='Same as this picture', setting='none (shipping prompt)'),
    item('retest', 'retest-c08-bai-gpt.jpg', style='Same as this picture', setting='none (re-test prompt)'),
]

POSTS = [
    'The Snowmoon remix challenge opens Thursday 12 Nov. Pick Zei, Bai, Seila, Gladias, Deluin or Mu, say what should change, and make your own picture of them. Free to enter until Sun 29 Nov, 23:59 PT. https://snowmoon.party/challenge',
    'Send Mu on vacation. Put Deluin at a concert. Make Bai the villain. The Snowmoon remix challenge runs Thu 12 Nov to Sun 29 Nov (PT), and entering is free. https://snowmoon.party/challenge',
    'A remix challenge on snowmoon.party, an independent adaptation of Snowmoon by Vitalik Buterin (not affiliated with him). Remix the cast, share your take. Free to enter, 12 to 29 Nov (PT). https://snowmoon.party/challenge',
]
for p in POSTS:
    assert len(p) < 280, (len(p), p)
    for banned in ('OpenAI', 'Google', 'Black Forest', 'GPT', 'Gemini', 'FLUX', 'Qwen', 'Alibaba'):
        assert banned not in p

json.dump({'A': A, 'B': B, 'C': C, 'posts': [{'text': p, 'chars': len(p)} for p in POSTS]}, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
print('manifest written', len(A['Animated series']) + len(A['Comic book']) + len(A['Comic 3D mix']), sum(len(b['items']) for b in B), len(C), [len(p) for p in POSTS])
