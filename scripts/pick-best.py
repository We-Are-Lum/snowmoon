"""Merge the reviewer agents' verdicts on storyboard frames, keep the best two of each shot, and list what to redraw.

  .venv-image/bin/python scripts/pick-best.py fifteen-days <verdicts.json ...>

A candidate is <shot>-K<n> (approach A: depth-guided, then restyled) or <shot>-B<n> (approach B: readable render).
Best = passing first, then the reviewer's score, then the later attempt. A shot is redrawn (up to three redraw rounds, the
owner's rule; rounds two and three each draw two attempts) while it has fewer than two passing candidates; the approach that scored better on that shot is redrawn,
or both when they tie. Writes adaptations/<seed>/preprod/overnight/frames-review.json (every verdict, merged) and
frames-picks.json ({shot: [best, second]}), and prints the redraw lists per approach.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PASS3 = ROOT / "images-out" / "preprod" / "pass3"


def main() -> None:
    seed = sys.argv[1]
    odir = ROOT / "adaptations" / seed / "preprod" / "overnight"
    merged = json.loads((odir / "frames-review.json").read_text()) if (odir / "frames-review.json").exists() else {}
    for f in sys.argv[2:]:
        merged.update(json.loads(Path(f).read_text()))
    (odir / "frames-review.json").write_text(json.dumps(merged, indent=1, ensure_ascii=False) + "\n")
    shots = {}
    for cid, v in merged.items():
        if not (PASS3 / f"{cid}.png").exists():
            continue
        sid, tag = cid.rsplit("-", 1)
        shots.setdefault(sid, []).append((bool(v.get("pass")), v.get("score", 0), int(tag[1:]), cid, tag[0]))
    picks, redo = {}, {"K": [], "B": []}
    for sid, cands in sorted(shots.items()):
        cands.sort(reverse=True)
        picks[sid] = [c[3] for c in cands[:2]]
        passing = sum(1 for c in cands if c[0])
        attempts = max(c[2] for c in cands)
        if passing < 2 and attempts < 6:
            best = {a: max((c[1] + 10 * c[0] for c in cands if c[4] == a), default=-1) for a in "KB"}
            for a in "KB":
                if best[a] >= best["B" if a == "K" else "K"] - 1 and best[a] >= 0:
                    redo[a].append(sid)
    (odir / "frames-picks.json").write_text(json.dumps(picks, indent=1) + "\n")
    npass = sum(1 for s in shots.values() if any(c[0] for c in s))
    print(f"{len(shots)} shots reviewed; {npass} with at least one passing frame")
    for a in "KB":
        print(a, len(redo[a]), " ".join(redo[a]))


if __name__ == "__main__":
    main()
