"""GPT cut (owner, 2026-10-18, private): one GPT Image job per model-drawn picture in cut v6, from the same inputs.

For each picture in v6's timeline (and the three lettered pictures' bases), walk its recipe chain in
frames-recipe.json down to its first drawing: the A stage (Qwen from the depth frame and cast cards), or an older
klein draw from the set's look frame. The prompt is that first drawing's prompt, with the shot's action taken from its
finish (K) recipe, as in the model test; the plate goes in as the last picture with one sentence; every later edit
(E/Q steps: a door removed, Bai added, the robot with menus...) is appended as a change the picture must already show.
Writes plan.json beside this file. No model is called here.
"""
import json
import re
from pathlib import Path

SC = Path('/Users/nathan/snowmoon-scenes')
HERE = Path(__file__).resolve().parent
R = json.loads((SC / 'adaptations/fifteen-days/preprod/overnight/frames-recipe.json').read_text())['images']
TL = json.loads((SC / 'scenes-out/fifteen-days/cuts/coverage-v6/timeline.json').read_text())
board = json.loads((SC / 'adaptations/fifteen-days/preprod/coverage-board-v6.json').read_text())
picks = json.loads((SC / 'adaptations/fifteen-days/preprod/overnight/coverage-pictures.json').read_text())
picks.update(json.loads((SC / 'adaptations/fifteen-days/preprod/overnight/coverage-pictures-v6.json').read_text()))

PLATE_SENT = 'Picture {n} shows how the place looks: take its colours, materials and night light; it has nobody in it.'
TAIL = ' The picture is 16:9, landscape.'
# A close-up made by cropping and redrawing the master: draw it from its own close-up layout instead.
OVERRIDE = {'cov-overlook-CU-Z-look-E40': {'a': 'cov-overlook-CU-Z-A8', 'k': 'cov-overlook-CU-Z-admire-K10'}}


def rid(f: str) -> str:
    return Path(f).stem


def refs(r: dict) -> list:
    return [x['file'] for x in r.get('references', [])]


def chain(fid: str) -> list:
    out, seen = [], set()
    while fid in R and fid not in seen:
        seen.add(fid)
        out.append(fid)
        rf = refs(R[fid])
        if not rf:
            break
        nxt = rid(rf[0]).removesuffix('-crop')
        if '/set-frames/' in rf[0]:
            break
        fid = nxt
    return out


def strip_keep(p: str) -> str:
    s = re.split(r'(?<=[.!?])\s+', p.strip())
    return ' '.join(x for x in s if not x.startswith('Keep '))


def action(prompt: str, end_marks: tuple) -> tuple:
    for m in end_marks:
        i = prompt.find(m)
        if i > 0:
            return prompt[:i].strip(), i
    return None, -1


def job(fid: str) -> dict:
    ov = OVERRIDE.get(fid)
    c = chain(fid)
    a = k = base_klein = None
    edits = []
    for x in c:
        r = R[x]
        ep = r['endpoint']
        rf = refs(r)
        if ep.startswith('local'):
            continue
        if 'klein' in ep:
            if rf and '/set-frames/' in rf[0]:
                base_klein = x
            elif k is None:
                k = x
        elif 'qwen' in ep:
            if rf and '/set-frames/' in rf[0]:
                a = x
            else:
                edits.append(x)
    if ov:
        a, k = ov['a'], ov['k']
    edits.reverse()  # bottom first
    if a:
        A = R[a]
        prompt = A['prompt']
        if k:
            ka, _ = action(R[k]['prompt'], (" Keep reference image 1",))
            head = 'not a photograph. '
            i = prompt.find(head)
            j = prompt.find(' Faces stay soft', i)
            if j < 0:
                j = prompt.find(' Picture 1 is', i)
            if ka and i > 0 and j > i:
                prompt = prompt[:i + len(head)] + ka + prompt[j:]
        files = list(refs(A))
        plate = next((f for f in refs(R[k])[1:] if 'plate' in f), None) if k else None
        if plate:
            files.append(plate)
            prompt += ' ' + PLATE_SENT.format(n=len(files))
        base = a
    elif base_klein:
        B = R[base_klein]
        prompt, files, base = B['prompt'], list(refs(B)), base_klein
    else:
        raise SystemExit(f'{fid}: no first drawing found in {c}')
    if edits:
        prompt += ' Changes made to this shot after it was first drawn, which this picture must already show: ' + ' '.join(strip_keep(R[e]['prompt']) for e in edits)
    prompt += TAIL
    return {'id': fid, 'chain': c, 'base': base, 'finish': k, 'edits': edits, 'refs': files, 'prompt': prompt}


images = []
for s in TL['shots']:
    im = s['image']
    if '/pass3/' in im:
        images.append((rid(im), im, None))
    elif Path(im).name.startswith('lettered-'):
        f = s['frame']
        b = board['frames'][f]
        src = b.get('reuse') or picks.get(f)
        images.append((rid(src), src, f))
seen, jobs = set(), []
for fid, src, lettered in images:
    if fid in seen:
        continue
    seen.add(fid)
    j = job(fid)
    j['v6_image'] = src
    j['lettered_frame'] = lettered
    jobs.append(j)
(HERE / 'plan.json').write_text(json.dumps(jobs, indent=1, ensure_ascii=False) + '\n')
print(len(jobs), 'jobs')
for j in jobs:
    print(f"{j['id']:38s} base={j['base']:30s} finish={str(j['finish']):34s} edits={j['edits']} refs={len(j['refs'])}")
