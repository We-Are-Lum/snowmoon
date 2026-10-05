"""Repaint code-drawn lettering in the scene's style: a low-strength image-model pass, checked.

Starts from the code-drawn version (scripts/texture-sheets.py, <id>.sheets.png),
runs FLUX.2 [klein] 4B image-to-image over the whole picture at a high
image_strength (most of the input kept), and takes the result back only inside
the lettered areas (each sheet's quad, widened and feathered). Everything
outside stays exactly as it was.

Then the check: an OCR read of each sheet (scripts/ocr.swift) must be exactly
its lettering text. A pass that fails is rejected and recorded, never used.

  "harmonise": {"strengths": [0.75, 0.85], "seed": 70701, "grow": 6, "feather": 3}

Each strength is tried in order; the first that passes is kept as
<id>.harmonised.png. The record, content/snowmoon/recipes/images/<stem>.harmonise.json,
holds the model and revision, the prompt, seed, steps, each strength tried with
its output sha256 and OCR result, the mask, and the input's sha256.

Run (image environment):
  .venv-image/bin/python scripts/harmonise.py content/snowmoon/illustrations/adaptation-dog-dawn.json
"""

import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
MODEL_REPO = "black-forest-labs/FLUX.2-klein-4B"
MODEL_REVISION = "e7b7dc27f91deacad38e78976d1f2b499d76a294"
STEPS = 4
GUIDANCE = 1.0


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def ocr_crop(path: Path, box) -> list[str]:
    W, H = Image.open(path).size
    x0, y0, x1, y1 = box
    args = [str(x0 / W), str(y0 / H), str((x1 - x0) / W), str((y1 - y0) / H)]
    out = subprocess.run(["swift", str(ROOT / "scripts/ocr.swift"), str(path), *args], capture_output=True, text=True, check=True).stdout
    return [json.loads(line)["text"] for line in out.splitlines() if line.strip()]


def main() -> None:
    from huggingface_hub import snapshot_download
    from mflux.models.common.config import ModelConfig
    from mflux.models.flux2.variants import Flux2Klein

    job_file = Path(sys.argv[1]).resolve()
    spec = json.loads(job_file.read_text())
    folder = job_file.stem
    script = Path(__file__).resolve().relative_to(ROOT)
    model = None
    records = []
    for job in spec["jobs"]:
        h = job.get("harmonise")
        if not h:
            continue
        if model is None:
            model_path = snapshot_download(MODEL_REPO, revision=MODEL_REVISION)
            model = Flux2Klein(quantize=4, model_path=model_path, model_config=ModelConfig.flux2_klein_4b())
        src = ROOT / "images-out" / folder / f"{job['id']}.sheets.png"
        base = Image.open(src).convert("RGB")
        W, H = base.size
        mask = Image.new("L", (W, H), 0)
        for sh in job["sheets"]:
            ImageDraw.Draw(mask).polygon([tuple(p) for p in sh["quad"]], fill=255)
        mask = mask.filter(ImageFilter.MaxFilter(2 * h.get("grow", 6) + 1)).filter(ImageFilter.GaussianBlur(h.get("feather", 3)))
        m = np.asarray(mask, dtype=float)[:, :, None] / 255.0
        tries, kept = [], None
        for s in h["strengths"]:
            raw = src.with_name(f"{job['id']}.harmonise-raw-{s}.png")
            img = model.generate_image(seed=h["seed"], prompt=job["prompt"], num_inference_steps=STEPS, width=W, height=H,
                                       guidance=GUIDANCE, image_path=str(src), image_strength=s)
            img.save(str(raw))
            rep = np.asarray(Image.open(raw).convert("RGB"), dtype=float)
            out_arr = np.asarray(base, dtype=float) * (1 - m) + rep * m
            out = src.with_name(f"{job['id']}.harmonised-{s}.png")
            Image.fromarray(np.clip(out_arr + 0.5, 0, 255).astype(np.uint8)).save(out)
            checks = []
            for sh in job["sheets"]:
                xs, ys = [p[0] for p in sh["quad"]], [p[1] for p in sh["quad"]]
                read = ocr_crop(out, (min(xs), min(ys), max(xs), max(ys)))
                checks.append({"text": sh["text"], "ocr": read, "exact": [re.sub(r"\s+", "", r) for r in read] == [sh["text"]]})
            ok = all(c["exact"] for c in checks)
            tries.append({"image_strength": s, "raw": {"file": f"images-out/{folder}/{raw.name}", "sha256": sha256(raw)},
                          "output": {"file": f"images-out/{folder}/{out.name}", "sha256": sha256(out)},
                          "ocr_checks": checks, "accepted": ok and kept is None})
            print(f"{job['id']}: strength {s}: OCR {[c['ocr'] for c in checks]} -> {'accepted' if ok else 'rejected'}")
            if ok and kept is None:
                kept = out
        if kept:
            final = src.with_name(f"{job['id']}.harmonised.png")
            final.write_bytes(kept.read_bytes())
        records.append({
            "id": job["id"],
            "beat": job.get("beat"),
            "input": {"file": f"images-out/{folder}/{src.name}", "sha256": sha256(src), "role": "code-drawn version (scripts/texture-sheets.py)"},
            "prompt": job["prompt"],
            "seed": h["seed"],
            "mask": {"from": "sheet quads", "grow": h.get("grow", 6), "feather": h.get("feather", 3)},
            "tries": tries,
            "kept": None if not kept else {"file": f"images-out/{folder}/{job['id']}.harmonised.png", "sha256": sha256(kept)},
        })
    record = {
        "about": "Low-strength image-model passes over code-drawn lettering, taken back only inside the lettered areas, each checked by OCR against the lettering record; failures are rejected.",
        "script": str(script),
        "script_commit": git("log", "-1", "--format=%H", "--", str(script)),
        "script_uncommitted_changes": bool(git("status", "--porcelain", "--", str(script))),
        "model": {"repo": MODEL_REPO, "revision": MODEL_REVISION, "license": "apache-2.0", "runtime": "mflux",
                  "mflux_version": version("mflux"), "quantize_bits": 4},
        "settings": {"steps": STEPS, "guidance": GUIDANCE, "image_strength_meaning": "share of the input kept (mflux); higher is a lighter repaint"},
        "cost_usd": 0,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "images": records,
        "assist": {
            "model": "claude-coding-agent",
            "by": "the coding agent",
            "drafted": ["strengths, mask settings (the prompt is the job's; the word is the book's)"],
            "instructions": ["scripts/harmonise.py"],
            "see": "config/models.json drafting; principle 3",
        },
    }
    out_file = ROOT / "content/snowmoon/recipes/images" / f"{job_file.stem}.harmonise.json"
    out_file.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
