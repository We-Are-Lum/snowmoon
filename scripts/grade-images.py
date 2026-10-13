"""Grade rendered images in code: time of day and simple fills, from each job's `grade`.

The image style keeps skies bright, so a night or pre-dawn panel can come out
as dusk. Rather than re-rendering, a job can list grade steps, applied in
order to the clean render:

  {"op": "night", "dark": 0.32, "blue": [0.55, 0.68, 1.0], "sky": 0.45, "keep": 0.95, "light_sat": 0.45}
      darken and cool the whole image, the top `sky` fraction more than the
      rest; bright saturated light (fire, screens, a thread of light) is kept
      by blending it back in with weight `keep`
  {"op": "predawn", ...}  the same with lighter defaults: deep blue, not black
  {"op": "fill_above", "y": 0.35, "feather": 0.03, "top": [r, g, b], "bottom": [r, g, b]}
      replace everything above height fraction `y` with a vertical gradient,
      feathered into the image below

It writes images-out/<folder>/<id>.graded.png next to the untouched render,
which stays the clean starting point for a remix, and records each graded
image in content/snowmoon/recipes/images/<stem>.grade.json: the steps, the
clean input and graded output by sha256, this script and the commit it ran
from, and the numpy and Pillow versions. scripts/letter-images.py letters the
graded file when a job has a grade.

Run (image environment):
  .venv-image/bin/python scripts/grade-images.py content/snowmoon/illustrations/adaptation-dog-dawn.json
"""

import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import PIL
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

DEFAULTS = {
    "night": {"dark": 0.32, "blue": [0.55, 0.68, 1.0], "sky": 0.45, "keep": 0.95, "light_sat": 0.45},
    "predawn": {"dark": 0.55, "blue": [0.62, 0.74, 1.0], "sky": 0.4, "keep": 0.9, "light_sat": 0.45},
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def time_of_day(img: np.ndarray, step: dict) -> np.ndarray:
    p = {**DEFAULTS[step["op"]], **step}
    h = img.shape[0]
    # Darker toward the top: the sky gets the full grade plus a little more.
    y = np.linspace(0.0, 1.0, h)[:, None, None]
    extra = np.clip(1.0 - y / max(p["sky"], 1e-3), 0.0, 1.0) * 0.35
    factor = p["dark"] * (1.0 - extra)
    graded = img * factor * np.array(p["blue"])[None, None, :]
    # Keep bright saturated light: fire, glowing screens, the thread of light.
    mx, mn = img.max(axis=2), img.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    light = np.clip((sat - p["light_sat"]) / 0.25, 0, 1) * np.clip((mx - 0.5) / 0.25, 0, 1)
    # Bright warm light (a fire's pale core, lamps) is kept too; white snow is not warm.
    warm = np.clip((img[:, :, 0] - img[:, :, 2] - 0.08) / 0.2, 0, 1) * np.clip((mx - 0.6) / 0.2, 0, 1)
    # `warm_below`: keep warm light only below this height fraction (to leave a warm sky graded).
    below = (np.arange(img.shape[0]) >= p.get("warm_below", 0.0) * img.shape[0])[:, None]
    light = np.maximum(light, warm * below)
    w = (light * p["keep"])[:, :, None]
    return graded * (1 - w) + img * w


def fill_above(img: np.ndarray, step: dict) -> np.ndarray:
    h = img.shape[0]
    cut, feather = step["y"] * h, max(1.0, step.get("feather", 0.03) * h)
    top, bottom = np.array(step["top"]) / 255.0, np.array(step["bottom"]) / 255.0
    y = np.arange(h, dtype=float)[:, None, None]
    t = np.clip(y / max(cut, 1.0), 0, 1)
    fill = top * (1 - t) + bottom * t
    # 1 above the cut, fading to 0 across the feather below it.
    m = np.clip((cut + feather - y) / feather, 0, 1)
    return fill * m + img * (1 - m)


OPS = {"night": time_of_day, "predawn": time_of_day, "fill_above": fill_above}


def main() -> None:
    job_file = Path(sys.argv[1]).resolve()
    spec = json.loads(job_file.read_text())
    script = Path(__file__).resolve().relative_to(ROOT)
    script_commit = git("log", "-1", "--format=%H", "--", str(script))
    script_dirty = bool(git("status", "--porcelain", "--", str(script)))
    job_rel = str(job_file.relative_to(ROOT))
    folder = job_file.stem
    records = []
    for job in spec["jobs"]:
        steps = job.get("grade")
        if not steps:
            continue
        src = ROOT / "images-out" / folder / f"{job['id']}.png"
        out = src.with_name(f"{job['id']}.graded.png")
        img = np.asarray(Image.open(src).convert("RGB"), dtype=float) / 255.0
        for step in steps:
            img = OPS[step["op"]](img, step)
        Image.fromarray(np.clip(img * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(out)
        records.append({
            "id": job["id"],
            "beat": job.get("beat"),
            "job_file": job_rel,
            "grade": steps,
            "input": {"file": f"images-out/{folder}/{src.name}", "sha256": sha256(src), "role": "clean render, the starting point for a remix"},
            "output": {"file": f"images-out/{folder}/{out.name}", "sha256": sha256(out)},
        })
        print(f"{job['id']}: {', '.join(s['op'] for s in steps)} -> {out.name} ({sha256(out)[:12]})")
    record = {
        "about": "Grades applied in code to clean renders (time of day, fills). Each entry names the clean input and the graded output by sha256.",
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
            "drafted": ["grade steps and their settings"],
            "instructions": ["scripts/grade-images.py"],
            "see": "config/models.json drafting; principle 3",
        },
    }
    out_file = ROOT / "content/snowmoon/recipes/images" / f"{job_file.stem}.grade.json"
    out_file.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
    if script_dirty:
        print("warning: the script has uncommitted changes; commit it and re-run so the record names the code that ran")
    print(f"{len(records)} graded images; record -> {out_file.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
