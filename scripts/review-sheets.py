"""Review sheets for the reviewer agent (one that did not make the pictures), and the checklist it judges against.

  .venv-image/bin/python scripts/review-sheets.py fifteen-days plates <out-dir>            one sheet per plate: every option, labelled
  .venv-image/bin/python scripts/review-sheets.py fifteen-days frames <out-dir> [id ...]   one sheet per frame: the frame, its cards, its layout
  .venv-image/bin/python scripts/review-sheets.py fifteen-days coverage <out-dir> [id ...] the same for the coverage frames (coverage-board.json)

Writes <out-dir>/<id>.jpg and <out-dir>/manifest.json (per sheet: what the picture must show). The checklist is the owner's
(2026-10-16 night).
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PRE = ROOT / "images-out" / "preprod"
CHECKLIST = [
    "the right people, and the right number of them",
    "faces match the cards, with no doubles (nobody appears twice; no extra look-alike of a main person)",
    "nobody floating or sitting/standing on tables; chairs under people who sit",
    "believable scale and perspective (people the right size for the furniture and the place)",
    "screen direction kept (each person on the side of frame and facing the way the layout shows)",
    "a long rectangular table wherever the shared table shows (never round)",
    "the megastructure skyline wherever sky shows",
    "no letters, words or numbers anywhere",
    "closed-mouth smiles (no open grins, no teeth)",
]
PLATE_CHECKS = ["no people at all (not even far background figures)", "believable scale and perspective; matches the 3D layout's camera",
                "a long rectangular table where the shared table shows (courtyard)", "the megastructure skyline wherever sky shows",
                "no letters, words or numbers; no pictograms in the hall or corridor",
                "hall only: the play space all glowing holograms, any towers light and mobile, the walkway clearly passing over the top, the pit view a live game"]
NAMES = {"Z": "Zei (orange cropped jacket, spiky black hair with one blue streak)", "B": "Bai (magenta ponytail, shaved sides, lime-green vest)",
         "D": "Deluin (wavy light-brown hair, long cream knit tunic)", "K": "Kau (shaved head, charcoal tunic)", "R": "the serving robot (white, no legs)"}
CARD = {"Z": "cards2/zei.png", "B": "cards2/bai.png", "D": "cards2/deluin.png", "K": "cards2/kau.png"}


def font(n):
    try:
        return ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", n)
    except OSError:
        return ImageFont.load_default()


def fit(p: Path, w: int, h: int) -> Image.Image:
    im = Image.open(p).convert("RGB")
    im.thumbnail((w, h))
    return im


def main() -> None:
    seed, mode, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    only = set(sys.argv[4:])
    out.mkdir(parents=True, exist_ok=True)
    adir = ROOT / "adaptations" / seed / "preprod"
    man = {"checklist": PLATE_CHECKS if mode == "plates" else CHECKLIST, "sheets": {}}
    if mode == "plates":
        jobs = json.loads((adir / "plate3-jobs.json").read_text())["jobs"]
        sets = {n: json.loads((adir / "sets" / f"{n}.json").read_text()) for n in ("courtyard", "hall", "corridor", "lobby")}
        by = {}
        for j in jobs:
            by.setdefault(j["plate"], []).append(j["option"])
        for pid, opts in by.items():
            opts = [o for o in dict.fromkeys(opts) if (PRE / "plates3" / f"{pid}-{o}.png").exists()]
            cells = [("3D layout", PRE / "set" / f"{pid}.look.empty.png")] + [(o, PRE / "plates3" / f"{pid}-{o}.png") for o in opts]
            W, H, cols = 760, 428, 2
            rows = (len(cells) + cols - 1) // cols
            sheet = Image.new("RGB", (cols * W, rows * (H + 40)), "white")
            d = ImageDraw.Draw(sheet)
            for k, (lab, p) in enumerate(cells):
                x, y = (k % cols) * W, (k // cols) * (H + 40)
                sheet.paste(fit(p, W - 8, H), (x + 4, y + 36))
                d.text((x + 8, y + 4), lab, fill="black", font=font(28))
            sheet.save(out / f"{pid}.jpg", quality=82)
            sname, k = pid.split("-")[1], pid.split("-", 2)[2]
            man["sheets"][pid] = {"sheet": str(out / f"{pid}.jpg"), "options": opts, "view": sets[sname]["setups"][k]["what"], "set": sname}
    else:
        if mode == "coverage":  # the coverage frames (scripts/coverage-plan.py): each frame's own action, its layout's frame
            cb = json.loads((adir / "coverage-board.json").read_text())
            board = {fid: {"id": fid, "layout": f["layout"], "who": f["who"], "size": f["size"], "action": f["action"], "set": f["set"]}
                     for fid, f in cb["frames"].items() if f.get("layout")}
        else:
            board = {s["id"]: s for s in json.loads((adir / "storyboard4.json").read_text())["shots"]}
        seen = {n: json.loads((adir / "sets" / f"{n}.seen.json").read_text()) for n in ("courtyard", "hall", "corridor", "lobby")}
        for f in sorted((PRE / "pass3").glob("*.png")):
            fid = f.stem
            sid = fid.rsplit("-", 1)[0]
            if (only and fid not in only and sid not in only) or sid not in board:
                continue
            s = board[sid]
            W = 1400
            sheet = Image.new("RGB", (W, 640), "white")
            d = ImageDraw.Draw(sheet)
            sheet.paste(fit(f, 1000, 563), (0, 40))
            d.text((8, 4), f"{fid}  (frame)", fill="black", font=font(26))
            y = 40
            lay = PRE / "set" / f"{s.get('layout', sid)}.look.png"
            if lay.exists():
                d.text((1010, 4), "layout", fill="black", font=font(22))
                im = fit(lay, 390, 220)
                sheet.paste(im, (1006, y))
                y += im.size[1] + 6
            ppl = [w for w in s["who"] if w != "R"]
            for w in ppl:
                im = fit(PRE / CARD[w], 390, 120 if len(ppl) > 2 else 160)
                sheet.paste(im, (1006, y))
                d.text((1010, y + 2), "card " + w, fill="white", font=font(18))
                y += im.size[1] + 4
            sheet.save(out / f"{fid}.jpg", quality=82)
            sn = seen[s["set"]].get(s.get("layout", sid), {}).get("people", {})
            man["sheets"][fid] = {"sheet": str(out / f"{fid}.jpg"), "shot": sid, "size": s["size"], "action": s["action"], "set": s["set"],
                                  "who": [NAMES[w] for w in s["who"]], "main_people_count": len(ppl),
                                  "placement": {w: f"{p['side']} of frame, {p['facing']}" for w, p in sn.items() if p.get("visible")},
                                  "cards_on_sheet": ppl}
    (out / "manifest.json").write_text(json.dumps(man, indent=1, ensure_ascii=False))
    print(len(man["sheets"]), "sheets")


if __name__ == "__main__":
    main()
