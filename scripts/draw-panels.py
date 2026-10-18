"""Panels drawn entirely in code, and code overlays on rendered panels. No image model.

Text drawn in code reads well only on flat surfaces that face the viewer, so
that is the only place this draws it. A job file's top-level "drawn" list:

  {"id": "dd-07-sheet", "beat": 7, "kind": "sheet",
   "text": "DOG", "lang": "en", "seed": 30047, "width": 1024, "height": 576}
      one printed sheet, face-on, filling the frame: paper texture,
      colourful squiggles, and the word in a giant font on a white band

  {"id": "dd-08-overlay", "beat": 8, "kind": "overlay", "base": "dd-07-a2",
   "frame": [x0, y0, x1, y1], "label": "DOG", "lang": "en"}
      a rendered panel seen through a drone's targeting display: a tint,
      scan lines, corner brackets around the target, and a flat label

Writes images-out/<folder>/<id>.png and records every panel in
content/snowmoon/recipes/images/<stem>.drawn.json: the settings, the font by
sha256, the base render by sha256 for overlays, the output sha256, this
script's commit, and an OCR read (scripts/ocr.swift) that must be exactly the
text.

Run (image environment):
  .venv-image/bin/python scripts/draw-panels.py content/snowmoon/illustrations/adaptation-dog-dawn.json
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
PALETTE = [(228, 52, 48), (246, 150, 24), (244, 206, 30), (52, 168, 80), (28, 128, 220), (122, 64, 196), (232, 78, 160), (18, 178, 186)]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def ocr(path: Path, box=None) -> list[str]:
    args = []
    if box:
        W, H = Image.open(path).size
        x0, y0, x1, y1 = box
        args = [str(x0 / W), str(y0 / H), str((x1 - x0) / W), str((y1 - y0) / H)]
    out = subprocess.run(["swift", str(ROOT / "scripts/ocr.swift"), str(path), *args], capture_output=True, text=True, check=True).stdout
    return [json.loads(line)["text"] for line in out.splitlines() if line.strip()]


def paper(w: int, h: int, rng) -> np.ndarray:
    """Off-white printer paper: fine grain, faint fibres, a soft fall-off of light."""
    base = np.ones((h, w, 3)) * np.array([0.955, 0.948, 0.925])
    grain = rng.normal(0, 0.006, (h, w, 1))
    fib = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(fib)
    for _ in range(900):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        a, l = rng.uniform(0, np.pi), rng.uniform(4, 14)
        d.line([(x, y), (x + l * np.cos(a), y + l * np.sin(a))], fill=int(rng.uniform(10, 28)), width=1)
    fib = np.asarray(fib.filter(ImageFilter.GaussianBlur(0.6)), dtype=float)[:, :, None] / 255.0
    yy, xx = np.mgrid[0:h, 0:w]
    fall = 1 - 0.07 * (((xx - w * 0.45) / w) ** 2 + ((yy - h * 0.4) / h) ** 2) * 2
    return np.clip((base + grain - fib * 0.25) * fall[:, :, None], 0, 1)


def p_count(w: int, h: int) -> int:
    """Dense enough that the pattern covers the sheet, as on the printed attack patterns."""
    return int(w * h / 1900)


def squiggles(img: Image.Image, rng, band) -> None:
    """Many colourful squiggles: looping, wavy strokes of printer ink, off the white band."""
    w, h = img.size
    d = ImageDraw.Draw(img)
    for _ in range(p_count(w, h)):
        x, y = rng.uniform(-40, w + 40), rng.uniform(-40, h + 40)
        if band[0] * h - 24 < y < band[1] * h + 24:
            continue
        ang, n = rng.uniform(0, 2 * np.pi), int(rng.uniform(22, 55))
        width = int(rng.uniform(10, 20))
        pts = []
        for i in range(n):
            ang += rng.normal(0, 0.35) + 0.12 * np.sin(i / 3)
            x += 6 * np.cos(ang)
            y += 6 * np.sin(ang)
            pts.append((x, y))
        d.line(pts, fill=PALETTE[rng.integers(len(PALETTE))], width=width, joint="curve")


def ink(img: np.ndarray, rng) -> np.ndarray:
    """Printed, not painted: ink sits slightly into the paper, with a little unevenness."""
    mottled = Image.fromarray((rng.uniform(0, 255, (img.shape[0] // 6, img.shape[1] // 6))).astype(np.uint8)).resize((img.shape[1], img.shape[0]), Image.BICUBIC)
    m = (np.asarray(mottled, dtype=float) / 255.0 - 0.5)[:, :, None] * 0.025
    return np.clip(img * (1 + m), 0, 1)


def draw_sheet(p: dict) -> Image.Image:
    rng = np.random.default_rng(p.get("seed", 1))
    w, h = p.get("width", 1024), p.get("height", 576)
    band = p.get("band", [0.3, 0.7])
    S = 2  # draw at 2x, then scale down for clean edges
    W, H = w * S, h * S
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    squiggles(layer, rng, band)
    d = ImageDraw.Draw(layer)
    size = int((band[1] - band[0]) * H * 0.82)
    font = ImageFont.truetype(str(FONT), size)
    d.text((W / 2, (band[0] + band[1]) / 2 * H), p["text"], font=font, fill=(18, 16, 14, 255), anchor="mm", stroke_width=int(size * 0.035), stroke_fill=(18, 16, 14, 255))
    layer = layer.resize((w, h), Image.LANCZOS)
    a = np.asarray(layer, dtype=float) / 255.0
    sheet = paper(w, h, rng)
    out = sheet * (1 - a[:, :, 3:]) + (a[:, :, :3] * sheet) * a[:, :, 3:]  # ink multiplies into the paper
    out = ink(out, rng)
    return Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8))


def draw_overlay(p: dict, folder: str) -> tuple[Image.Image, Path]:
    base_path = ROOT / "images-out" / folder / f"{p['base']}.png"
    img = np.asarray(Image.open(base_path).convert("RGB"), dtype=float) / 255.0
    h, w = img.shape[:2]
    # A machine's view: luminance, tinted pale cyan, with scan lines and a vignette.
    lum = img @ np.array([0.3, 0.59, 0.11])
    tint = lum[:, :, None] * np.array([0.72, 0.95, 1.0])[None, None, :] * 0.9 + 0.04
    tint[::3, :, :] *= 0.86
    yy, xx = np.mgrid[0:h, 0:w]
    vig = 1 - 0.35 * (((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / 2
    out = Image.fromarray(np.clip(tint * vig[:, :, None] * 255, 0, 255).astype(np.uint8)).convert("RGBA")
    S = 2
    hud = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(hud)
    col = tuple(p.get("color", [255, 214, 64])) + (255,)
    x0, y0, x1, y1 = [v * S for v in p["frame"]]
    L, t = (x1 - x0) * 0.22, 3 * S
    for cx, cy, dx, dy in [(x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)]:
        d.line([(cx, cy), (cx + dx * L, cy)], fill=col, width=t)
        d.line([(cx, cy), (cx, cy + dy * L)], fill=col, width=t)
    # Centre mark.
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    d.line([(mx - 10 * S, my), (mx + 10 * S, my)], fill=col, width=S)
    d.line([(mx, my - 10 * S), (mx, my + 10 * S)], fill=col, width=S)
    # The label: a flat tag above the frame, facing the viewer.
    size = int(p.get("label_size", 30) * S)
    font = ImageFont.truetype(str(FONT), size)
    tw = d.textlength(p["label"], font=font)
    pad = 8 * S
    lx, ly = x0, y0 - size - 2 * pad - 4 * S
    d.rectangle([lx, ly, lx + tw + 2 * pad, ly + size + 2 * pad], fill=col)
    d.text((lx + pad, ly + pad + size / 2), p["label"], font=font, fill=(10, 14, 20, 255), anchor="lm")
    hud = hud.resize((w, h), Image.LANCZOS)
    out.alpha_composite(hud)
    p["_label_box"] = [lx / S, ly / S, (lx + tw + 2 * pad) / S, (ly + size + 2 * pad) / S]
    return out.convert("RGB"), base_path


def main() -> None:
    job_file = Path(sys.argv[1]).resolve()
    spec = json.loads(job_file.read_text())
    folder = job_file.stem
    script = Path(__file__).resolve().relative_to(ROOT)
    records = []
    for p in spec.get("drawn", []):
        out = ROOT / "images-out" / folder / f"{p['id']}.png"
        rec = {"id": p["id"], "beat": p.get("beat"), "kind": p["kind"], "settings": {k: v for k, v in p.items() if not k.startswith("_")}}
        if p["kind"] == "sheet":
            draw_sheet(p).save(out)
            read, text = ocr(out), p["text"]
        else:
            img, base = draw_overlay(p, folder)
            img.save(out)
            rec["base"] = {"file": f"images-out/{folder}/{base.name}", "sha256": sha256(base), "role": "clean render under the overlay"}
            read, text = ocr(out, p["_label_box"]), p["label"]
        rec["ocr"] = read
        rec["ocr_exact"] = [re.sub(r"\s+", "", r) for r in read] == [text]
        rec["output"] = {"file": f"images-out/{folder}/{out.name}", "sha256": sha256(out)}
        records.append(rec)
        print(f"{p['id']}: {p['kind']} -> {out.name} ({sha256(out)[:12]}); OCR {read} {'exact' if rec['ocr_exact'] else 'NOT EXACT'}")
    record = {
        "about": "Panels drawn entirely in code, and code overlays on rendered panels. No image model. Each entry has its settings, inputs and output by sha256, and an OCR check that the text is exact.",
        "script": str(script),
        "script_commit": git("log", "-1", "--format=%H", "--", str(script)),
        "script_uncommitted_changes": bool(git("status", "--porcelain", "--", str(script))),
        "font": {"file": str(FONT.relative_to(ROOT)), "sha256": sha256(FONT), "license": "OFL-1.1"},
        "numpy_version": np.__version__,
        "pillow_version": PIL.__version__,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "images": records,
        "assist": {
            "model": "claude-coding-agent",
            "by": "the coding agent",
            "drafted": ["pattern, paper, overlay design and placement (the word is the book's)"],
            "instructions": ["scripts/draw-panels.py"],
            "see": "config/models.json drafting; principle 3",
        },
    }
    out_file = ROOT / "content/snowmoon/recipes/images" / f"{job_file.stem}.drawn.json"
    out_file.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
