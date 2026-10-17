"""The picture files a cut's frames were made from, as sent to the model, for committing before "publish".

  python3 scripts/sent-frames.py --root /Users/nathan/snowmoon-scenes [--seed fifteen-days] [--cut coverage] > /tmp/sent-frames.sh

Reads scenes-out/<seed>/cuts/<cut>/timeline.json in --root, takes every shot's picture, and follows each model-made
picture's recipe (images-out/preprod/pass3/recipe.json, written by the frame scripts) back through its references
(stage-one pictures, small plates, small cards, set frames), so the commit holds every picture a model was sent or
returned, exactly as sent: the small plates and cards (images-out/preprod/plates-small, cards-small), never the
full-size originals they were reduced from (plates3, cards2), and never raw recordings (nothing here touches audio).

Prints shell commands (run from --root) that copy each file into adaptations/<seed>/preprod/sent/{frames,plates,cards}/
(the folders the overnight commit used for the plates and cards) and `git add` it, plus the set frames under
adaptations/<seed>/preprod/set-frames/ that are not committed yet or differ from HEAD. Every file is checked against the
sha256 its recipe records; a mismatch stops with an error. Pictures made in code (lettering, device screens, black) are
listed as comments: the cut's scripts make them again from committed files.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shlex
import subprocess
import sys
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--root", required=True)
ap.add_argument("--seed", default="fifteen-days")
ap.add_argument("--cut", default="coverage")
a = ap.parse_args()
ROOT = Path(a.root).resolve()
ADIR = f"adaptations/{a.seed}"
SENT = f"{ADIR}/preprod/sent"

timeline = json.loads((ROOT / f"scenes-out/{a.seed}/cuts/{a.cut}/timeline.json").read_text())
board = json.loads((ROOT / f"{ADIR}/preprod/coverage-board.json").read_text())
recipes = json.loads((ROOT / "images-out/preprod/pass3/recipe.json").read_text())["images"]
picks_file = ROOT / f"{ADIR}/preprod/overnight/coverage-pictures.json"
picks = json.loads(picks_file.read_text()) if picks_file.exists() else {}


def sha(rel: str) -> str:
    return hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()


def git(*args: str) -> str:
    return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True).stdout


DEST = {
    "images-out/preprod/pass3/": f"{SENT}/frames/",
    "images-out/preprod/plates-small/": f"{SENT}/plates/",
    "images-out/preprod/cards-small/": f"{SENT}/cards/",
    "images-out/preprod/edit-src/": f"{SENT}/edit-src/",  # a finished frame resized as sent to an edit (v5, 2026-10-17)
}

copies: dict[str, str] = {}      # source -> destination
in_place: set[str] = set()       # files already under adaptations/ (set frames)
made_in_code: list[str] = []
problems: list[str] = []
seen: set[str] = set()


def want(rel: str, expect: str | None) -> None:
    """Take one file the model was sent or returned, and everything it was made from."""
    if expect and (ROOT / rel).exists() and sha(rel) != expect:
        problems.append(f"{rel}: sha256 differs from its recipe ({expect[:12]}…)")
    if rel in seen:
        return
    seen.add(rel)
    if not (ROOT / rel).exists():
        problems.append(f"{rel}: missing")
        return
    if rel.startswith(f"{ADIR}/"):
        in_place.add(rel)
    else:
        prefix = next((p for p in DEST if rel.startswith(p)), None)
        if prefix is None:
            problems.append(f"{rel}: not a place this script knows (expected one of {', '.join(DEST)})")
            return
        copies[rel] = DEST[prefix] + rel[len(prefix):]
    rid = Path(rel).stem
    if rel.startswith("images-out/preprod/edit-src/"):  # resized from the finished frame of the same name
        want(f"images-out/preprod/pass3/{rid}.png", None)
        return
    r = recipes.get(rid)
    if rel.startswith("images-out/preprod/pass3/"):
        if r is None:
            problems.append(f"{rel}: no recipe in images-out/preprod/pass3/recipe.json")
            return
        if r.get("sha256") and r["sha256"] != sha(rel):
            problems.append(f"{rel}: sha256 differs from its recipe")
        for ref in r.get("references", []):
            want(ref["file"], ref.get("sha256"))


def source_of(fid: str) -> str | None:
    """The picture a lettered shot was lettered over (cut-coverage.py's picture())."""
    if fid in picks and (ROOT / picks[fid]).exists():
        return picks[fid]
    return board["frames"].get(fid, {}).get("reuse")


for s in timeline["shots"]:
    img = s["image"]
    if img.startswith("images-out/"):
        want(img, s.get("image_sha256"))
    elif Path(img).name.startswith("lettered-"):
        src = source_of(s["frame"])
        made_in_code.append(f"{img} (lettering over {src})")
        if src and src.startswith("images-out/"):
            want(src, None)
        elif src and src.startswith(f"{ADIR}/"):
            in_place.add(src)
    else:
        made_in_code.append(f"{img} ({s.get('picture')})")

if problems:
    print("\n".join("ERROR " + p for p in problems), file=sys.stderr)
    sys.exit(1)

status = {line[3:]: line[:2] for line in git("status", "--porcelain", "--untracked-files=all", "--", f"{ADIR}").splitlines()}
to_add_in_place = sorted(p for p in in_place if p in status)

out = [
    f"# Generated by scripts/sent-frames.py from scenes-out/{a.seed}/cuts/{a.cut}/timeline.json",
    f"# {len(copies)} files to copy into {SENT}/, {len(to_add_in_place)} set frames to add in place; run from {ROOT}",
    "set -euo pipefail",
    f"cd {shlex.quote(str(ROOT))}",
    f"mkdir -p {SENT}/frames {SENT}/plates {SENT}/cards {SENT}/edit-src",
]
for src, dst in sorted(copies.items()):
    out.append(f"cp -p {src} {dst}")
out.append("git add \\")
out += [f"  {dst} \\" for dst in sorted(copies.values())]
out += [f"  {p} \\" for p in to_add_in_place]
out[-1] = out[-1].rstrip(" \\")
out.append("# Pictures made in code at cut time (not committed; the cut's scripts make them again):")
out += [f"#   {m}" for m in made_in_code]
print("\n".join(out))
total = sum((ROOT / s).stat().st_size for s in copies) + sum((ROOT / p).stat().st_size for p in to_add_in_place)
biggest = max([(ROOT / s).stat().st_size for s in copies] + [0])
print(f"{len(copies)} to copy, {len(to_add_in_place)} set frames to add, {total / 1e6:.1f} MB in all, largest {biggest / 1e6:.1f} MB", file=sys.stderr)
