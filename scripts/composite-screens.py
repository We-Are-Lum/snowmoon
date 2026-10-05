"""Put an in-world screen onto a panel's device, in code: perspective, glow, light spill.

A job's `screen` names a capture of the book's own screen block, drawn by the
reader's template (scripts/capture-screen.ts), and where it goes:

  "screen": {                      (or a list of these, each with a "variant" name)
    "block": "c30-b61",
    "capture": "images-out/adaptation-dog-dawn/screen-c30-b61.png",
    "device": [[x, y], ...4],     corners of the whole screen face, TL TR BR BL, in pixels
    "content": [u0, v0, u1, v1],  where the capture sits on that face (0-1, left-top to right-bottom)
    "base": [r, g, b],            the screen's own colour, behind the content
    "glow": {"radius": 14, "strength": 0.55},
    "spill": {"center": [x, y], "radius": 230, "color": [r, g, b], "strength": 0.22}
  }

The whole face is filled with the template's background so it reads as one
lit device; the capture is mapped onto the content area in the face's
perspective; a blurred copy adds glow; a soft light in the screen's colour is
added where it would fall (his face). The clean render is kept. Each composite
is recorded in content/snowmoon/recipes/images/<stem>.screens.json with the
capture's record, the steps, input and output sha256, this script's commit,
and an OCR read of the result's screen area, straightened back to flat
(scripts/ocr.swift), which must contain the block's words.

Run (image environment):
  .venv-image/bin/python scripts/composite-screens.py content/snowmoon/illustrations/adaptation-dog-dawn.json
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
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def face_point(device, u, v):
    tl, tr, br, bl = device
    return lerp(lerp(tl, bl, v), lerp(tr, br, v), u)


def perspective_coeffs(dst, src):
    """Coefficients for Image.transform(PERSPECTIVE), mapping output (dst) points to input (src) points."""
    a = []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    b = np.array([c for p in src for c in p], dtype=float)
    return np.linalg.solve(np.array(a, dtype=float), b).tolist()


def warp(img: Image.Image, quad, size) -> Image.Image:
    w, h = img.size
    coeffs = perspective_coeffs(quad, [(0, 0), (w, 0), (w, h), (0, h)])
    return img.convert("RGBA").transform(size, Image.PERSPECTIVE, coeffs, Image.BICUBIC)


def block_text(block_id: str) -> str:
    ch, idx = map(int, re.match(r"c(\d+)-b(\d+)$", block_id).groups())
    blocks = json.loads((ROOT / f"content/snowmoon/text/chapter-{ch}.json").read_text())["blocks"]
    html = next(b["content"] for b in blocks if b["idx"] == idx)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()


def rectify(img: Image.Image, quad, size) -> Image.Image:
    """The content area of a composite, straightened back to a flat rectangle, for the OCR check."""
    w, h = size
    coeffs = perspective_coeffs([(0, 0), (w, 0), (w, h), (0, h)], quad)
    return img.convert("RGB").transform(size, Image.PERSPECTIVE, coeffs, Image.BICUBIC)


def ocr(path: Path) -> list[str]:
    out = subprocess.run(["swift", str(ROOT / "scripts/ocr.swift"), str(path)], capture_output=True, text=True, check=True).stdout
    return [json.loads(line)["text"] for line in out.splitlines() if line.strip()]


def main() -> None:
    job_file = Path(sys.argv[1]).resolve()
    spec = json.loads(job_file.read_text())
    script = Path(__file__).resolve().relative_to(ROOT)
    script_commit = git("log", "-1", "--format=%H", "--", str(script))
    script_dirty = bool(git("status", "--porcelain", "--", str(script)))
    folder = job_file.stem
    records = []
    variants = [(job, v) for job in spec["jobs"] for v in (job.get("screen") if isinstance(job.get("screen"), list) else [job["screen"]] if job.get("screen") else [])]
    for job, s in variants:
        src = ROOT / "images-out" / folder / f"{job['id']}.png"
        name = f"screen-{s['variant']}" if s.get("variant") else "screen"
        out = src.with_name(f"{job['id']}.{name}.png")
        base = Image.open(src).convert("RGBA")
        size = base.size
        device = [tuple(p) for p in s["device"]]

        # 1. The whole face in the template's background colour.
        face = Image.new("RGBA", size, (0, 0, 0, 0))
        ImageDraw.Draw(face).polygon(device, fill=tuple(s["base"]) + (255,))
        # 2. The capture, in the face's perspective.
        u0, v0, u1, v1 = s["content"]
        quad = [face_point(device, u0, v0), face_point(device, u1, v0), face_point(device, u1, v1), face_point(device, u0, v1)]
        capture = Image.open(ROOT / s["capture"]).convert("RGBA")
        face.alpha_composite(warp(capture, quad, size))
        # Keep it inside the face.
        mask = Image.new("L", size, 0)
        ImageDraw.Draw(mask).polygon(device, fill=255)
        face.putalpha(ImageChops.multiply(face.getchannel("A"), mask))
        out_img = base.copy()
        out_img.alpha_composite(face)
        # 3. Glow: a blurred copy of the face, added.
        g = s["glow"]
        glow = face.filter(ImageFilter.GaussianBlur(g["radius"]))
        glow_rgb = np.asarray(glow, dtype=float)[:, :, :3] * (np.asarray(glow, dtype=float)[:, :, 3:] / 255.0) * g["strength"]
        # 4. Spill: soft light in the screen's colour where it falls.
        sp = s["spill"]
        yy, xx = np.mgrid[0:size[1], 0:size[0]]
        d = np.hypot(xx - sp["center"][0], yy - sp["center"][1]) / sp["radius"]
        spill = (np.clip(1 - d, 0, 1) ** 2)[:, :, None] * np.array(sp["color"], dtype=float)[None, None, :] * sp["strength"]
        rgb = np.asarray(out_img.convert("RGB"), dtype=float)
        rgb = 255 - (255 - rgb) * (1 - np.clip((glow_rgb + spill) / 255.0, 0, 1))  # screen blend
        Image.fromarray(np.clip(rgb + 0.5, 0, 255).astype(np.uint8)).save(out)

        # The words the screen shows: the whole block, or a recorded cut of it.
        words = (s.get("capture_record") or {}).get("text_shown") or block_text(s["block"])
        flat = out.with_name(f"{job['id']}.{name}-check.png")
        rectify(Image.open(out), quad, (capture.size[0] // 2, capture.size[1] // 2)).save(flat)
        read = ocr(flat)
        joined = re.sub(r"\s+", " ", " ".join(read)).lower()
        missing = [w for w in re.findall(r"[a-z]+", words.lower()) if not re.search(rf"\b{w}\b", joined)]
        records.append({
            "id": job["id"],
            "beat": job.get("beat"),
            "screen": s,
            "capture_record": s.get("capture_record"),
            "variant": s.get("variant"),
            "text_shown": words,
            "ocr": read,
            "ocr_missing_words": missing,
            "input": {"file": f"images-out/{folder}/{src.name}", "sha256": sha256(src), "role": "clean render, the starting point for a remix"},
            "output": {"file": f"images-out/{folder}/{out.name}", "sha256": sha256(out)},
        })
        print(f"{job['id']}: {s['block']} -> {out.name} ({sha256(out)[:12]}); OCR missing words: {missing or 'none'}")
    record = {
        "about": "In-world screens composited in code onto panel devices: the book's own screen block as the reader draws it, mapped in perspective, with glow and light spill. Each entry names input and output by sha256 and records an OCR read of the result.",
        "script": str(script),
        "script_commit": script_commit,
        "script_uncommitted_changes": script_dirty,
        "numpy_version": np.__version__,
        "pillow_version": PIL.__version__,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "images": records,
        "assist": {
            "model": "claude-coding-agent",
            "by": "the coding agent",
            "drafted": ["screen placement, glow and spill settings (the words are the book's)"],
            "instructions": ["scripts/composite-screens.py"],
            "see": "config/models.json drafting; principle 3",
        },
    }
    out_file = ROOT / "content/snowmoon/recipes/images" / f"{job_file.stem}.screens.json"
    out_file.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
    if script_dirty:
        print("warning: the script has uncommitted changes; commit it and re-run so the record names the code that ran")


if __name__ == "__main__":
    main()
