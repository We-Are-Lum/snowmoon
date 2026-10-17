"""Draw a whole printed sheet (pattern and lettering together) in code and lay it onto a surface in a panel.

Lettering pasted flat over a render looks stuck on. This draws the full sheet
as one texture, the colourful squiggle pattern and the word on its white band,
maps it onto the surface in perspective, and blends it so the scene's own
light and line work show through:

  "sheets": [{
    "quad": [[x, y], ...4],          the sheet's corners on the image, TL TR BR BL, in pixels
    "text": "DOG", "lang": "en",     the lettering, from the job's lettering record
    "seed": 1,                       for the squiggle pattern
    "band": [0.36, 0.64],            the white band, as fractions of the sheet's height
    "shade": 0.85,                   how much of the scene's light and shade to carry over
    "light_blur": 18,                how broad that light is, in pixels (only broad light, not the old pattern)
    "lines": 0.8,                    how much of the scene's ink outlines to keep on top
    "clip_to_paint": true,           keep the sheet to the colourful bodywork (false for a sheet on a plain panel)
    "feather": 2.0                   edge softening, in pixels
  }]

Writes images-out/<folder>/<id>.sheets.png next to the untouched render and
records the steps in content/snowmoon/recipes/images/<stem>.sheets.json, with
an OCR read of each sheet (scripts/ocr.swift) that must equal its text.

Run (image environment):
  .venv-image/bin/python scripts/texture-sheets.py content/snowmoon/illustrations/adaptation-dog-dawn.json
"""

import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import PIL
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "node_modules" / "@fontsource" / "dm-mono" / "files" / "dm-mono-latin-500-normal.woff"
PALETTE = [(235, 64, 52), (247, 168, 30), (250, 220, 40), (60, 180, 75), (30, 144, 230), (140, 70, 200), (240, 90, 170), (20, 200, 200)]
TEX_W, TEX_H = 900, 600


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def sheet_texture(text: str, seed: int, band) -> Image.Image:
    """Paper with thick colourful squiggles, a white band, and the word in a giant font."""
    rng = np.random.default_rng(seed)
    tex = Image.new("RGB", (TEX_W, TEX_H), (246, 244, 238))
    d = ImageDraw.Draw(tex)
    # Broad flowing bands, like the swirls the scene already has: the sheet is
    # seen small, so fine strokes would turn to noise.
    for i in range(16):
        y = -60 + i * 46 + rng.uniform(-10, 10)
        amp, freq, phase = rng.uniform(25, 55), rng.uniform(0.008, 0.016), rng.uniform(0, 6.3)
        xs = np.linspace(-40, TEX_W + 40, 80)
        ys = y + amp * np.sin(freq * xs + phase)
        d.line(list(zip(xs, ys)), fill=PALETTE[i % len(PALETTE)], width=int(rng.uniform(34, 48)), joint="curve")
    y0, y1 = band[0] * TEX_H, band[1] * TEX_H
    d.rectangle([0, y0, TEX_W, y1], fill=(250, 249, 245))
    size = int((y1 - y0) * 0.78)
    font = ImageFont.truetype(str(FONT), size)
    tw = d.textlength(text, font=font)
    d.text(((TEX_W - tw) / 2, (y0 + y1) / 2), text, font=font, fill=(20, 18, 16), anchor="lm")
    return tex


def perspective_coeffs(dst, src):
    a = []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    b = np.array([c for p in src for c in p], dtype=float)
    return np.linalg.solve(np.array(a, dtype=float), b).tolist()


def ocr_crop(path: Path, box) -> list[str]:
    W, H = Image.open(path).size
    x0, y0, x1, y1 = box
    args = [str(x0 / W), str(y0 / H), str((x1 - x0) / W), str((y1 - y0) / H)]
    out = subprocess.run(["swift", str(ROOT / "scripts/ocr.swift"), str(path), *args], capture_output=True, text=True, check=True).stdout
    return [json.loads(line)["text"] for line in out.splitlines() if line.strip()]


def apply_sheet(base: np.ndarray, sh: dict) -> np.ndarray:
    H, W = base.shape[:2]
    tex = sheet_texture(sh["text"], sh.get("seed", 1), sh.get("band", [0.36, 0.64]))
    quad = [tuple(p) for p in sh["quad"]]
    # Warp at 3x and scale down, so edges and letters stay smooth.
    S = 3
    coeffs = perspective_coeffs([(x * S, y * S) for x, y in quad], [(0, 0), (TEX_W, 0), (TEX_W, TEX_H), (0, TEX_H)])
    big = tex.convert("RGBA").transform((W * S, H * S), Image.PERSPECTIVE, coeffs, Image.BICUBIC)
    warped = np.asarray(big.resize((W, H), Image.LANCZOS), dtype=float) / 255.0
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon(quad, fill=255)
    m = np.asarray(mask.filter(ImageFilter.GaussianBlur(sh.get("feather", 2.0))), dtype=float)[:, :, None] / 255.0
    m = m * warped[:, :, 3:4]
    # Only on the painted bodywork: pixels that were colourful in the render
    # (the old pattern), closed and softened, so the sheet follows the drone's
    # outline instead of covering its windows, lamps and edges.
    if sh.get("clip_to_paint", True):
        mx, mn = base.max(axis=2), base.min(axis=2)
        sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
        paint = Image.fromarray(((sat > 0.3) & (mx > 0.25)).astype(np.uint8) * 255)
        paint = paint.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.GaussianBlur(1.2))
        m = m * (np.asarray(paint, dtype=float) / 255.0)[:, :, None]
    # The scene's light: luminance under the sheet, smoothed, relative to its mean.
    lum = base.mean(axis=2)
    lum_img = Image.fromarray(np.clip(lum * 255, 0, 255).astype(np.uint8))
    low = np.asarray(lum_img.filter(ImageFilter.GaussianBlur(sh.get("light_blur", 18))), dtype=float) / 255.0
    inside = m[:, :, 0] > 0.5
    mean = low[inside].mean() if inside.any() else 1.0
    shade = 1.0 + sh.get("shade", 0.85) * (low / max(mean, 1e-3) - 1.0)
    # The scene's line work: ink outlines, near black and darker than their
    # surroundings (not the pattern already printed on the surface).
    near = np.asarray(lum_img.filter(ImageFilter.GaussianBlur(3)), dtype=float) / 255.0
    ink = np.clip((0.22 - lum) / 0.1, 0, 1)
    lines = np.clip((near - lum - 0.05) / 0.1, 0, 1) * ink * sh.get("lines", 0.8)
    sheet = warped[:, :, :3] * shade[:, :, None] * (1 - lines[:, :, None])
    return base * (1 - m) + np.clip(sheet, 0, 1) * m


def main() -> None:
    job_file = Path(sys.argv[1]).resolve()
    spec = json.loads(job_file.read_text())
    script = Path(__file__).resolve().relative_to(ROOT)
    folder = job_file.stem
    records = []
    for job in spec["jobs"]:
        sheets = job.get("sheets")
        if not sheets:
            continue
        src = ROOT / "images-out" / folder / f"{job['id']}.png"
        out = src.with_name(f"{job['id']}.sheets.png")
        img = np.asarray(Image.open(src).convert("RGB"), dtype=float) / 255.0
        for sh in sheets:
            img = apply_sheet(img, sh)
        Image.fromarray(np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8)).save(out)
        checks = []
        for sh in sheets:
            xs, ys = [p[0] for p in sh["quad"]], [p[1] for p in sh["quad"]]
            read = ocr_crop(out, (min(xs), min(ys), max(xs), max(ys)))
            checks.append({"text": sh["text"], "ocr": read, "exact": sh["text"] in [re.sub(r"\s+", "", r) for r in read]})
        records.append({
            "id": job["id"],
            "beat": job.get("beat"),
            "sheets": sheets,
            "ocr_checks": checks,
            "input": {"file": f"images-out/{folder}/{src.name}", "sha256": sha256(src), "role": "clean render, the starting point for a remix"},
            "output": {"file": f"images-out/{folder}/{out.name}", "sha256": sha256(out)},
        })
        print(f"{job['id']}: {len(sheets)} sheets -> {out.name} ({sha256(out)[:12]}); OCR: {[c['ocr'] for c in checks]}")
    record = {
        "about": "Printed sheets drawn in code (pattern and lettering together) and laid onto surfaces in perspective, with the scene's light and line work kept. Each entry names input and output by sha256 and records an OCR check per sheet.",
        "script": str(script),
        "script_commit": git("log", "-1", "--format=%H", "--", str(script)),
        "script_uncommitted_changes": bool(git("status", "--porcelain", "--", str(script))),
        "font": {"file": str(FONT.relative_to(ROOT)), "sha256": sha256(FONT)},
        "numpy_version": np.__version__,
        "pillow_version": PIL.__version__,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "images": records,
        "assist": {
            "model": "claude-coding-agent",
            "by": "the coding agent",
            "drafted": ["sheet placement, pattern and blend settings (the word is the book's)"],
            "instructions": ["scripts/texture-sheets.py"],
            "see": "config/models.json drafting; principle 3",
        },
    }
    out_file = ROOT / "content/snowmoon/recipes/images" / f"{job_file.stem}.sheets.json"
    out_file.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
