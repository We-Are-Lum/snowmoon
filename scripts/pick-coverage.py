"""Merge the reviewer agents' verdicts on the coverage frames, pick each frame's best candidate, and list what to redraw.

  python3 scripts/pick-coverage.py <seed> <verdicts.json ...>

A candidate is <frame id>-K<n> (the klein finish of its layout's A picture) in images-out/preprod/pass3. Best = passing first,
then the reviewer's score, then the later attempt. Writes adaptations/<seed>/preprod/overnight/coverage-review.json (every
verdict, merged) and coverage-pictures.json ({frame id: the best candidate's file}, read by scripts/cut-coverage.py), and
prints the frames with no passing candidate (to redraw).
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PASS3 = ROOT / "images-out" / "preprod" / "pass3"


def main() -> None:
    seed = sys.argv[1]
    odir = ROOT / "adaptations" / seed / "preprod" / "overnight"
    rp = odir / "coverage-review.json"
    merged = json.loads(rp.read_text()) if rp.exists() else {}
    for f in sys.argv[2:]:
        merged.update(json.loads(Path(f).read_text()))
    rp.write_text(json.dumps(merged, indent=1, ensure_ascii=False) + "\n")
    board = json.loads((ROOT / "adaptations" / seed / "preprod" / "coverage-board.json").read_text())
    picks, fails = {}, []
    for fid, f in board["frames"].items():
        if not f.get("layout"):
            continue
        cands = []
        for cid, v in merged.items():
            if cid.rsplit("-", 1)[0] == fid and (PASS3 / f"{cid}.png").exists():
                cands.append((bool(v.get("pass")), v.get("score", 0), int(cid.rsplit("-", 1)[1][1:]), cid))
        if not cands:
            fails.append((fid, "not reviewed"))
            continue
        cands.sort(reverse=True)
        picks[fid] = f"images-out/preprod/pass3/{cands[0][3]}.png"
        if not cands[0][0]:
            fails.append((fid, merged[cands[0][3]].get("note", "")))
    (odir / "coverage-pictures.json").write_text(json.dumps(picks, indent=1) + "\n")
    print(f"{len(picks)} frames picked; {len(picks) - len([x for x in fails if x[1] != 'not reviewed'])} with a passing candidate")
    for fid, why in fails:
        print("REDRAW", fid, "|", why[:160])


if __name__ == "__main__":
    main()
