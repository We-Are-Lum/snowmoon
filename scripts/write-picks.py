"""Turn the owner's picks on the picker page into adaptations/<seed>/picks.json for rough-cut.py.

  .venv-image/bin/python scripts/write-picks.py fifteen-days '{"s28": "s28-o2", "s05": "current"}'

The picks are read from the page's db (picks/<shot>: {"pick": ...}) and passed here as {shot: pick}. "current" keeps
the shot's present frame and is left out. Each option id is found in the night's manifests (local) or the fal recipe,
and a pick that a review failed is refused, so a greyed option can't slip into the cut.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    seed, chosen = sys.argv[1], json.loads(sys.argv[2])
    adir = ROOT / "adaptations" / seed
    files = {}
    for run in ("options-night", "options-night2"):
        m = ROOT / "images-out" / run / "manifest.json"
        if m.exists():
            for e in json.loads(m.read_text())["images"]:
                files[e["id"]] = f"images-out/{run}/{e['file']}"
    f = adir / "options-night-fal.json"
    if f.exists():
        for e in json.loads(f.read_text())["images"]:
            files.setdefault(e["id"], e["file"])
    review_p = adir / "options-night-review.json"
    review = json.loads(review_p.read_text()) if review_p.exists() else {}
    picks = {}
    for shot, oid in sorted(chosen.items()):
        if oid == "current":
            continue
        if oid not in files:
            raise SystemExit(f"{shot}: no file for {oid}")
        if oid in review:
            raise SystemExit(f"{shot}: {oid} failed the review ({review[oid]})")
        picks[shot] = {"option": oid, "file": files[oid]}
    out = adir / "picks.json"
    out.write_text(json.dumps({"about": "The owner's picks on the picker page; 'current' picks are left out.",
                               "read_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "picks": picks},
                              indent=2) + "\n")
    print(f"{out.relative_to(ROOT)}: {len(picks)} new frames, {sum(1 for v in chosen.values() if v == 'current')} kept")


if __name__ == "__main__":
    main()
