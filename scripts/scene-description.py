"""Write a scene's video description from its end card, so the two always say the same thing.

  python3 scripts/scene-description.py fifteen-days  →  scenes-out/<seed>/video/description.txt
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    seed = sys.argv[1]
    card = json.loads((ROOT / "adaptations" / seed / "end-card.json").read_text())
    lines = [card["title"], ""]
    for s in card["sections"]:
        lines += [f"{s['label']}: {s['text']}", ""]
    lines += [f"{l['label']}: {l['url']}" for l in card["links"]]
    out = ROOT / "scenes-out" / seed / "video"
    out.mkdir(parents=True, exist_ok=True)
    (out / "description.txt").write_text("\n".join(lines) + "\n")
    print(("DRAFT " if card.get("draft") else "") + f"description: {(out / 'description.txt').relative_to(ROOT)}")


if __name__ == "__main__":
    main()
