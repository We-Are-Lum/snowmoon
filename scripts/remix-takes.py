#!/usr/bin/env python3
"""
The existing converted takes for each line of a version, for Remix's storyboard (owner, 2026-10-18:
"Audio for now = choosing among the existing converted takes for each line. No new recordings on
the site."). Run on the performer's machine, where the converted lines are (scenes-out is not in git):

    python3 scripts/remix-takes.py --scenes ../snowmoon-scenes/scenes-out/fifteen-days

For every line the version uses (adaptations/fifteen-days/versions/1.json via public/editor data), it
takes each converted line in lines/, lines-v2/ and lines-v3/ that is the performer's own take
converted to a designed voice (stand_in false; never a raw take, never a stand-in voice), encodes it
to AAC (mono, 96 kb/s) under adaptations/fifteen-days/takes/<cue>/<voice>.m4a, copies its recipe
beside it, and writes adaptations/fifteen-days/takes/takes.json: per cue, each take's voice, the
converted file's sha256, the encoded file's sha256, its recipe and the model. Raw takes are named only
by the sha256 their recipes already carry; their audio is never read here.
"""
import argparse, hashlib, json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'adaptations', 'fifteen-days', 'takes')
FOLDERS = ['lines', 'lines-v2', 'lines-v3']
NAME = re.compile(r'^L\d+-([a-z0-9-]+)\.([a-z0-9-]+)\.wav$')


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scenes', required=True, help='scenes-out/fifteen-days on the performer\'s machine')
    a = ap.parse_args()
    data = json.load(open(os.path.join(ROOT, 'public', 'editor', '1', 'v1', 'data.json')))
    cues = {l['cue'] for s in data['shots'] for l in s['lines'] if l.get('voice')}
    out = {'about': 'Existing converted takes per line, for the storyboard (scripts/remix-takes.py). Each is the performer\'s own take converted to a designed voice; raw takes stay private.', 'takes': {}}
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    for folder in FOLDERS:
        d = os.path.join(a.scenes, folder)
        for f in sorted(os.listdir(d)):
            m = NAME.match(f)
            if not m or m.group(1) not in cues:
                continue
            cue, voice = m.group(1), m.group(2)
            rp = os.path.join(d, f[:-4] + '.recipe.json')
            if not os.path.exists(rp):
                continue
            recipe = json.load(open(rp))
            if recipe.get('stand_in') is not False:
                continue
            src = os.path.join(d, f)
            dest_dir = os.path.join(OUT, cue)
            os.makedirs(dest_dir, exist_ok=True)
            take_id = voice if voice not in [t['voice'] for t in out['takes'].get(cue, [])] else f'{voice}-{folder}'
            dest = os.path.join(dest_dir, f'{take_id}.m4a')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-ac', '1', '-c:a', 'aac', '-b:a', '96k', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', dest], check=True)
            shutil.copy(rp, os.path.join(dest_dir, f'{take_id}.recipe.json'))
            out['takes'].setdefault(cue, []).append({
                'id': take_id,
                'voice': voice,
                'file': os.path.relpath(dest, ROOT),
                'sha256': sha(dest),
                'converted': {'file': f'scenes-out/fifteen-days/{folder}/{f}', 'sha256': sha(src)},
                'recipe': os.path.relpath(os.path.join(dest_dir, f'{take_id}.recipe.json'), ROOT),
                'model': recipe.get('model'),
                'licence': recipe.get('license'),
                'take_sha256': (recipe.get('take') or {}).get('sha256'),
            })
    json.dump(out, open(os.path.join(OUT, 'takes.json'), 'w'), indent=1)
    n = sum(len(v) for v in out['takes'].values())
    print(f'{n} takes for {len(out["takes"])} of {len(cues)} lines')


if __name__ == '__main__':
    sys.exit(main())
