"""GPT cut (private): cut v6's timeline and mix recipe with only the pictures swapped for the GPT Image draws.
Writes scenes-out/fifteen-days/cuts/coverage-v6-gpt/{timeline.json, recipe.json, gpt-*.png, lettered-*.png} in the scenes
worktree (gitignored). The mix itself is v6's (same file, same sha256): words, voices, sound and timing are identical."""
import hashlib
import importlib.util
import json
import shutil
import sys
from pathlib import Path

SC = Path('/Users/nathan/snowmoon-scenes')
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(SC / 'scripts'))
spec = importlib.util.spec_from_file_location('cutv4', SC / 'scripts' / 'cut-v4.py')
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)

V6 = SC / 'scenes-out/fifteen-days/cuts/coverage-v6'
OUT = SC / 'scenes-out/fifteen-days/cuts/coverage-v6-gpt'
OUT.mkdir(parents=True, exist_ok=True)
plan = {j['id']: j for j in json.loads((HERE / 'plan.json').read_text())}
fc = json.loads((HERE / 'figure-check.json').read_text())
board = json.loads((SC / 'adaptations/fifteen-days/preprod/coverage-board-v6.json').read_text())
LETTER = {}
for it in board['sequence']:
    if it.get('letter'):
        sc, setup = it['scene'], it['setup']
        LETTER[f"cov-{sc}-{setup}" + (f"-{it['v']}" if it.get('v') else '')] = it['letter']
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
rel = lambda p: str(Path(p).relative_to(SC))

gpt = {}
for fid, f in fc.items():
    src = HERE / 'raw' / f"{fid}-{f['tag']}.png"
    dst = OUT / f"gpt-{fid}.png"
    shutil.copyfile(src, dst)
    gpt[fid] = dst
by_lettered = {j['lettered_frame']: j['id'] for j in plan.values() if j.get('lettered_frame')}


def swap(s: dict) -> dict:
    im = s['image']
    name = Path(im).stem
    if '/pass3/' in im:
        new, what = gpt[name], 'GPT Image 2.5 Sunburst (closed model), private comparison'
    elif name.startswith('lettered-'):
        frame = s['frame']
        base = gpt[by_lettered[frame]]
        new = OUT / f"lettered-{frame}.png"
        C.lettered(base, new, LETTER[frame])
        what = 'GPT Image 2.5 Sunburst (closed model), lettered in code as in v6'
    else:
        return s  # screens, the book's menu, black: exactly v6's
    s = dict(s, image=rel(new), picture=what, image_sha256=sha(new))
    if 'image_sha256_now' in s:
        s['image_sha256_now'] = s['image_sha256']
    return s


tl = json.loads((V6 / 'timeline.json').read_text())
tl['shots'] = [swap(s) for s in tl['shots']]
tl['about'] = ('PRIVATE comparison, not for the site (owner, 2026-10-18): cut v6 with every model-drawn picture redrawn by '
               'GPT Image 2.5 Sunburst, a closed model, through the Vercel AI Gateway; words, voices, sound, timing and the '
               'non-model pictures are v6\'s. ' + tl['about'])
(OUT / 'timeline.json').write_text(json.dumps(tl, indent=1, ensure_ascii=False) + '\n')
rec = json.loads((V6 / 'recipe.json').read_text())
rec['timeline'] = rel(OUT / 'timeline.json')
rec['timeline_sha256'] = sha(OUT / 'timeline.json')
rec['resolved']['shots'] = [swap(s) for s in rec['resolved']['shots']]
rec['about'] = 'PRIVATE: v6\'s mix (unchanged file), with the GPT cut\'s timeline. ' + rec.get('about', '')
(OUT / 'recipe.json').write_text(json.dumps(rec, indent=1, ensure_ascii=False) + '\n')
n = sum(1 for s in tl['shots'] if 'GPT' in s['picture'])
print(f'{n} of {len(tl["shots"])} shots swapped; mix {rec["output"]["file"]}')
