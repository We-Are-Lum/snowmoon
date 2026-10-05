"""Draw lettering over rendered images, in code, from each job's structured `lettering`.

Image models garble text, so prompts keep images free of writing (brief Milestone
5), and any writing the scene needs (DOG on the attack sheets, DU's motto on the
banner) is listed in the job as lettering items: text, kind, language, gloss,
and position (x, y, w as fractions of the image; optional size as a fraction of
the width, optional rotation in degrees). This script draws them with the
reader's fonts and writes images-out/chapter-N/<id>.lettered.png, which
scripts/publish-images.ts publishes in place of the bare render.

Run (image environment):
  .venv-image/bin/python scripts/letter-images.py
"""

import glob
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "node_modules" / "@fontsource"
# Signs print in DM Mono (heavier weight); Dzegoban and captions in Crimson Pro italic.
FACES = {
    "en": FONTS / "dm-mono" / "files" / "dm-mono-latin-500-normal.woff",
    "dz": FONTS / "crimson-pro" / "files" / "crimson-pro-latin-500-italic.woff",
}
INK = (24, 22, 20, 255)
PAPER = (244, 242, 237, 255)


def draw_item(base: Image.Image, item: dict) -> None:
    W, H = base.size
    size = max(8, round((item.get("size") or item["w"] / max(3, len(item["text"]) * 0.6)) * W))
    font = ImageFont.truetype(str(FACES.get(item["lang"], FACES["en"])), size)
    lines = item["text"].split("\n")
    box_w = round(item["w"] * W)
    line_h = round(size * 1.15)
    layer = Image.new("RGBA", (box_w + size // 2, line_h * len(lines) + size // 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i, line in enumerate(lines):
        if not line.strip():
            continue
        tw = d.textlength(line, font=font)
        # Printed signs get a thin paper-coloured edge so the word reads on any background.
        edge = max(1, round(size * 0.07)) if item["kind"] == "sign" and item["lang"] == "en" else 0
        d.text(((box_w - tw) / 2, i * line_h), line, font=font, fill=INK, stroke_width=edge, stroke_fill=PAPER)
    if item.get("rotate"):
        # Clockwise for positive degrees, like CSS.
        layer = layer.rotate(-item["rotate"], resample=Image.BICUBIC, expand=True)
    base.alpha_composite(layer, (round(item["x"] * W), round(item["y"] * H)))


def main() -> None:
    done = 0
    for job_file in sorted(glob.glob(str(ROOT / "content/snowmoon/illustrations/chapter-*.json"))):
        spec = json.loads(Path(job_file).read_text())
        for job in spec["jobs"]:
            if not job.get("lettering"):
                continue
            src = ROOT / "images-out" / f"chapter-{job['chapter']}" / f"{job['id']}.png"
            out = src.with_name(f"{job['id']}.lettered.png")
            base = Image.open(src).convert("RGBA")
            for item in job["lettering"]:
                draw_item(base, item)
            base.convert("RGB").save(out)
            print(f"{job['id']}: {len(job['lettering'])} items -> {out.name} ({hashlib.sha256(out.read_bytes()).hexdigest()[:12]})")
            done += 1
    print(f"{done} lettered images")


if __name__ == "__main__":
    main()
