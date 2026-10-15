"""Generate an adaptation's shots in the chosen style: one still per shot in shots.json, faces locked.

  python3 scripts/make-shots.py fifteen-days <style-slug> [--only s01 s13] [--jobs-only]

The style is a round-one style (adaptations/<seed>/style-test/jobs.json) until the owner's own
description replaces it. Each shot with a subject becomes a FLUX.2 [klein] job (scripts/illustrate.py,
local, free) with the cast v2 character sheets (images-out/cast/) as references; the place is described
from its design file. Inserts (the book's own pictures and screens) are skipped: they are composited.
Writes adaptations/<seed>/shots-<style>.json (the illustrate.py job file; its recipe goes to
content/snowmoon/recipes/images/) and renders into images-out/shots-<style>/. About 7 minutes a frame
on the 8 GB Mac; waits while the take pipeline or music is running.
"""

import argparse
import json
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMG_PY = "/Users/nathan/snowmoon/.venv-image/bin/python"
NO_TEXT = "No text, no lettering, no signs with words, no logos, no numbers."


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("style")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--jobs-only", action="store_true")
    args = ap.parse_args()
    adir = ROOT / "adaptations" / args.seed
    shots = json.loads((adir / "shots.json").read_text())
    styles = {s["slug"]: s for s in json.loads((adir / "style-test" / "jobs.json").read_text())["styles"]}
    if args.style not in styles:
        raise SystemExit(f"not a round-one style: {args.style}")
    st = styles[args.style]
    D = ROOT / "content" / "snowmoon" / "designs"
    jobs = []
    for i, s in enumerate(shots["shots"], 1):
        if not s.get("subject"):
            continue
        place = f" The place: {json.loads((D / 'locations' / (s['place'] + '.json')).read_text())['descriptor']}." if s.get("place") else ""
        jobs.append({"id": f"{s['id']}-{s['beat']}", "shot": s["id"], "prompt": s["subject"] + place + " " + NO_TEXT,
                     "characters": [f"designs/characters/{c}.json" for c in s["cast"]],
                     "references": [f"cast/{c}-sheet" for c in s["cast"]], "seed": 5000 + i, "width": 1024, "height": 576})
    job_file = adir / f"shots-{args.style}.json"
    job_file.write_text(json.dumps({
        "about": f"Fifteen Days shots in the style '{st['name']}' (round-one prompt, until the owner describes the style in their words). Subjects drafted in shots.json.",
        "style": {"prompt": st["prompt"]}, "jobs": jobs, "assist": shots["assist"]}, indent=2, ensure_ascii=False) + "\n")
    print(f"{job_file.relative_to(ROOT)}: {len(jobs)} shots to draw")
    if args.jobs_only:
        return
    while subprocess.run(["pgrep", "-f", "split-takes.py|convert-voice.py|make-music.py"], capture_output=True).returncode == 0:
        print("waiting: another big model is running", flush=True)
        time.sleep(60)
    cmd = [IMG_PY, "scripts/illustrate.py", str(job_file)]
    if args.only:
        cmd += ["--only"] + [j["id"] for j in jobs if j["shot"] in args.only]
    subprocess.run(cmd, cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
