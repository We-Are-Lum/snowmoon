"""Build the owner's picker page: for each shot, the current frame and the new options side by side.

  .venv-image/bin/python scripts/options-page.py fifteen-days <out-dir>

Reads the current frames (adaptations/<seed>/shots-<style>/recipe.json), the night's options
(images-out/options-night/ and options-night2/ manifest.json, local, and adaptations/<seed>/options-night-fal.json, fal), and
the coding agent's review of them (adaptations/<seed>/options-night-review.json: {"<option id>": "why it
fails"}); a failed option is shown greyed with the reason and can't be picked. Writes <out-dir>/index.html
and <out-dir>/img/*.jpg. The page keeps each pick in its db (picks/<shot>: {"pick": "current" | "<option id>"}).
"""

import html
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    seed, outdir = sys.argv[1], Path(sys.argv[2])
    adir = ROOT / "adaptations" / seed
    style = json.loads((adir / "style.json").read_text())
    cur = {e["shot"]: e for e in json.loads((adir / f"shots-{style['slug']}" / "recipe.json").read_text())["images"] if not e.get("rejected")}
    opts, tag = {}, {}
    for run in ("options-night", "options-night2"):  # round two: the broadcast, the flat board, the cabled glasses
        m = ROOT / "images-out" / run / "manifest.json"
        if m.exists():
            for e in json.loads(m.read_text())["images"]:
                opts[e["id"]] = ROOT / "images-out" / run / e["file"]
                if run == "options-night2" and e["id"][:3] in ("s01", "s02"):
                    tag[e["id"]] = "broadcast imagined"  # the 3D broadcast is this edition's invention, not the book's
    f = adir / "options-night-fal.json"
    if f.exists():
        for e in json.loads(f.read_text())["images"]:
            opts.setdefault(e["id"], ROOT / e["file"])
    review_p = adir / "options-night-review.json"
    review = json.loads(review_p.read_text()) if review_p.exists() else {}
    shots = [s for s in json.loads((adir / "shots.json").read_text())["shots"] if s.get("subject")]
    (outdir / "img").mkdir(parents=True, exist_ok=True)

    def thumb(src: Path, name: str) -> str:
        Image.open(src).convert("RGB").resize((768, 432), Image.LANCZOS).save(outdir / "img" / f"{name}.jpg", quality=80)
        return f"img/{name}.jpg"

    data, files = [], []
    for s in shots:
        sid = s["id"]
        row = {"id": sid, "beat": s["beat"], "name": s.get("name") or "", "items": []}
        if sid in cur:
            note = "no accepted frame" if sid == "s28" else ""
            row["items"].append({"key": "current", "img": thumb(ROOT / cur[sid]["file"], f"{sid}-current"), "label": "current", "bad": note})
        for oid in sorted(k for k in opts if k.startswith(sid + "-o")):
            row["items"].append({"key": oid, "img": thumb(opts[oid], oid), "label": oid.split("-")[1] + (f" · {tag[oid]}" if oid in tag else ""), "bad": review.get(oid, "")})
        data.append(row)
    files = sorted(p.name for p in (outdir / "img").iterdir())
    n_opts = sum(len(r["items"]) - 1 for r in data)
    n_ok = sum(1 for r in data for i in r["items"] if i["key"] != "current" and not i["bad"])
    page = (ROOT / "scripts" / "options-page.html").read_text()
    page = page.replace("__DATA__", json.dumps(data)).replace("__NOPTS__", str(n_opts)).replace("__NOK__", str(n_ok))
    (outdir / "index.html").write_text(page)
    (outdir / "files.json").write_text(json.dumps({f"img/{n}": f"img/{n}" for n in files}))
    print(f"{outdir / 'index.html'}: {len(data)} shots, {n_opts} options ({n_ok} pass the checks), {len(files)} images")


if __name__ == "__main__":
    main()
