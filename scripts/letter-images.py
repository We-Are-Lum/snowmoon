"""Draw lettering over rendered images, in code, from each job's structured `lettering`.

Image models garble text, so prompts keep images free of writing (brief Milestone
5), and any writing the scene needs (DOG on the attack sheets, DU's motto on the
banner) is listed in the job as lettering items: text, kind, language, gloss,
and position (x, y, w as fractions of the image; optional size as a fraction of
the width, optional rotation in degrees). This script draws them with the
reader's fonts and writes images-out/chapter-N/<id>.lettered.png next to the
untouched render, which stays the clean starting point for a remix.

It also writes content/snowmoon/recipes/images/lettering.json: for each
lettered image, the clean input and lettered output with their sha256, the
lettering items, this script's path and the commit it ran from (flagged if the
script had uncommitted changes), the fonts with their sha256, and the Pillow
version. scripts/publish-images.ts publishes both files and links this record.

Run (image environment):
  .venv-image/bin/python scripts/letter-images.py
"""

import glob
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import PIL
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


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def main() -> None:
    script = Path(__file__).resolve().relative_to(ROOT)
    script_commit = git("log", "-1", "--format=%H", "--", str(script))
    script_dirty = bool(git("status", "--porcelain", "--", str(script)))
    records = []
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
            job_rel = str(Path(job_file).relative_to(ROOT))
            records.append({
                "id": job["id"],
                "chapter": job["chapter"],
                "idx": job["idx"],
                "job_file": job_rel,
                "job_file_commit": git("log", "-1", "--format=%H", "--", job_rel),
                "lettering": job["lettering"],
                "input": {"file": f"images-out/chapter-{job['chapter']}/{src.name}", "sha256": sha256(src), "role": "clean render, the starting point for a remix"},
                "output": {"file": f"images-out/chapter-{job['chapter']}/{out.name}", "sha256": sha256(out)},
            })
            print(f"{job['id']}: {len(job['lettering'])} items -> {out.name} ({sha256(out)[:12]})")
            done += 1
    record = {
        "about": "Lettering drawn in code over clean renders. Each entry names the clean input and the lettered output by sha256; both are published (content/snowmoon/illustrations/published.json).",
        "script": str(script),
        "script_commit": script_commit,
        "script_uncommitted_changes": script_dirty,
        "pillow_version": PIL.__version__,
        "fonts": {lang: {"file": str(path.relative_to(ROOT)), "sha256": sha256(path)} for lang, path in FACES.items()},
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "images": records,
    }
    out_file = ROOT / "content/snowmoon/recipes/images/lettering.json"
    out_file.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
    if script_dirty:
        print("warning: the script has uncommitted changes; commit it and re-run so the record names the code that ran")
    print(f"{done} lettered images; record -> {out_file.relative_to(ROOT)} (script commit {script_commit[:7]})")


if __name__ == "__main__":
    main()
