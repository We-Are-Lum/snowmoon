"""Draw new options for an adaptation's shots overnight: locally first, on fal if the night run falls behind.

  .venv-image/bin/python scripts/shot-options.py fifteen-days --build        # write the job file, print the order
  nohup caffeinate -dims .venv-image/bin/python scripts/shot-options.py fifteen-days --drive &

Order and counts are the owner's (2026-10-15, night): s28 as a two-shot; the stiff ones (s05, s14, s20,
s26, s27); the opener (s01, s02) with Kau and a crowd; 4 options each; then 2 options for every other
shot, as time allows. Prompts: references only for faces and costumes, framed like a film, people
seated where the script has them seated, small plainly dressed people in the cafe and the hall.

--drive runs scripts/illustrate.py (FLUX.2 [klein] 4B, local, free) on the job file and checks the pace
every five minutes. If the local run dies, or is on pace to finish less than half the list by 07:00,
it stops it and draws the rest on fal (the same open weights, fal-ai/flux-2/klein/4b/edit), in order,
up to $3 (ledger: images-out/<job stem>-fal/ledger.json; recipe: adaptations/<seed>/<job stem>-fal.json).
Progress goes to images-out/<job stem>/drive.log.
"""

import argparse
import base64
import hashlib
import importlib.util
import json
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG_PY = "/Users/nathan/snowmoon/.venv-image/bin/python"
_spec = importlib.util.spec_from_file_location("fal_shots", ROOT / "scripts" / "fal-shots.py")
fs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fs)

PRIORITY = [("s28", 4), ("s05", 4), ("s14", 4), ("s20", 4), ("s26", 4), ("s27", 4), ("s01", 4), ("s02", 4)]
OTHERS_N = 2
FILM = ("Use the reference images only for each person's face, hair and costume: do not copy their standing pose, "
        "their framing or the plain background of the reference. Frame it like a still from a film, the people caught mid-action.")
# New subjects for the priority shots (DRAFTED by the coding agent from the owner's notes, 2026-10-15).
SUBJECTS = {
    "s28": ("courtyard", "distant", ["bai", "zei"],
            "Over-the-shoulder two-shot: in the foreground, seen from behind and a little out of focus, the spiky-haired young man sits at a cafe table; at the next table the young woman sits with big headphones on her ears and glances back over her shoulder at him. Medium shot."),
    "s05": ("waiting", "none", ["bai"],
            "Seated on the low stone bench, the young woman leans sideways mid-motion and spits something into a small bin beside her, nonchalant, her eyes still on the wall screen. Medium shot from a low angle."),
    "s14": ("courtyard", "distant", ["deluin", "bai"],
            "Both seated at a small cafe table: the tall pale young man half turns in his chair, one arm raised mid-wave, calling someone over with a big smile; beside him the young woman is still laughing, a hand over her mouth. Medium two-shot."),
    "s20": ("courtyard", "distant", ["bai"],
            "Seated at a cafe table, the young woman pulls big headphones over her ears with both hands, a small handheld device on the table in front of her, her back half turned to the table behind. Medium shot from the side."),
    "s26": ("courtyard", "distant", ["deluin", "zei"],
            "Over-the-shoulder shot across a small cafe table: the tall pale young man, seated, leans forward on his elbows, eager and inviting; in the foreground the spiky-haired young man, seated, seen from behind his shoulder, listens."),
    "s27": ("courtyard", "distant", ["zei"],
            "Seated at the cafe table, the spiky-haired young man laughs and turns his wrist to glance at the watch on it. Medium close-up."),
    "s01": ("hall", "crowd", ["deluin"],
            "Wide shot of the vast game hall, its dark tiers packed with a crowd of small, plainly dressed spectators. In the middle of the floor two game stations face each other across a glowing board: the tall pale young man sits at one, calm and cool, seen from behind and to one side; across the board, facing him, sits his opponent, a young man in plain dark clothes, sweating. Overhead the enormous display shows a ring of luminous walls holding against streams of small glowing gliders."),
    "s02": ("hall", "crowd", ["deluin"],
            "Medium close-up of the tall pale young man seated at his game station, calm and cool, the board's glow on his face; across the board behind him, out of focus, his opponent in plain dark clothes wipes sweat from his brow; beyond, the crowd in the dark tiers."),
}
OTHERS = {"crowd": "The tiers are full of spectators: many small people in plain dark clothes, none of them looking like the main people.",
          "cafe": "A few other people sit at other tables, small and plainly dressed in dark clothes, none of them looking like the main people."}
DEADLINE = (7, 0)
FAL_CAP = 3.0


def log(path: Path, msg: str) -> None:
    line = f"{datetime.now().strftime('%H:%M:%S')} {msg}"
    print(line, flush=True)
    with path.open("a") as f:
        f.write(line + "\n")


ROLE = {"zei": "the spiky-haired young man", "bai": "the young woman", "deluin": "the tall pale young man"}
WORDS = {1: "one", 2: "two", 3: "three"}


def compose(s: dict, places: dict, style: dict, opponent: bool) -> str:
    """Short on purpose: the local text encoder reads a limited length, and the rules at the end must survive.
    The references carry the faces and costumes; the words carry the action, the framing and the place."""
    n = len(s["cast"]) + (1 if opponent else 0)
    parts = [s["subject"]]
    if s["cast"]:
        who = "; ".join(f"reference image {i} is {ROLE[c]} ({fs.LOOK[c]})" for i, c in enumerate(s["cast"], 1))
        extra = "; his opponent has no reference image and looks nothing like him" if opponent else ""
        parts.append(f"Exactly {WORDS[n]} main {'person' if n == 1 else 'people'}: {who}{extra}. Each appears exactly once; "
                     + " ".join(f"only one person has {fs.LOOK[c]}." for c in s["cast"]))
        parts.append(FILM)
    else:
        parts.append("No people.")
    parts.append({**style["others"], **OTHERS}[s["others"]] if s["cast"] else "")
    parts.append(f"The place: {places[s['setting']]['text']}.")
    parts.append("No letters, words, digits or logos anywhere; signs show at most one simple pictogram. No cartoon murals, nothing resembling a known character.")
    return " ".join(p for p in parts if p)


def build(seed: str) -> tuple[Path, list[dict]]:
    adir = ROOT / "adaptations" / seed
    style = json.loads((adir / "style.json").read_text())
    doc = json.loads((adir / "shots.json").read_text())
    places = doc["places"]
    chars = {c: json.loads((ROOT / "content/snowmoon/designs/characters" / f"{c}.json").read_text())["descriptor"] for c in ("zei", "bai", "deluin")}
    shots = {s["id"]: s for s in doc["shots"] if s.get("subject")}
    order = PRIORITY + [(sid, OTHERS_N) for sid in shots if sid not in dict(PRIORITY)]
    jobs = []
    for sid, n in order:
        s = dict(shots[sid])
        if sid in SUBJECTS:
            s["setting"], s["others"], s["cast"], s["subject"] = SUBJECTS[sid]
            s.pop("described", None)
        if s["setting"] in ("courtyard", "gate") and s["others"] == "none" and "Close" not in s["subject"]:
            s["others"] = "cafe"  # the owner: other people in the cafe, small and plainly dressed
        prompt = compose(s, places, style, sid in ("s01", "s02"))
        for k in range(1, n + 1):
            jobs.append({"id": f"{sid}-o{k}", "shot": sid, "prompt": prompt, "characters": [],
                         "references": [f"cast/front/{c}" for c in s["cast"]], "cast": s["cast"],
                         "seed": 7000 + int(sid[1:]) * 10 + k, "width": 1024, "height": 576})
    job_file = adir / "options-night.json"
    job_file.write_text(json.dumps({
        "about": "Fifteen Days, new shot options (owner's notes, 2026-10-15 night). Prompts DRAFTED by the coding agent from shots.json and the owner's notes; people described, never named.",
        "style": {"prompt": style["prompt"]}, "style_draft": style.get("draft", True), "jobs": jobs,
        "assist": {"model": "claude-coding-agent", "drafted": ["subjects", "framing", "people counts", "place text"]}},
        indent=2, ensure_ascii=False) + "\n")
    return job_file, jobs


def done_ids(out: Path) -> set:
    m = out / "manifest.json"
    return {e["id"] for e in json.loads(m.read_text())["images"]} if m.exists() else set()


def fal_rest(seed: str, job_file: Path, jobs: list[dict], skip: set, lg: Path) -> None:
    out = ROOT / "images-out" / f"{job_file.stem}-fal"
    out.mkdir(parents=True, exist_ok=True)
    ledger_p, recipe_p = out / "ledger.json", ROOT / "adaptations" / seed / f"{job_file.stem}-fal.json"
    ledger = json.loads(ledger_p.read_text()) if ledger_p.exists() else {"cap_usd": FAL_CAP, "spent_usd": 0.0, "calls": []}
    recipe = json.loads(recipe_p.read_text()) if recipe_p.exists() else {"about": "Options drawn on fal after the local run fell behind or died (owner's rule, up to $3).", "images": []}
    style = json.loads(job_file.read_text())["style"]["prompt"]
    key = fs.fal.fal_key()
    have = {e["id"] for e in recipe["images"]}
    for j in jobs:
        if j["id"] in skip or j["id"] in have:
            continue
        refs = [ROOT / "images-out" / f"{r}.png" for r in j["references"]]
        endpoint = fs.EDIT if refs else fs.PLAIN
        ref_mp = sum(Image.open(r).size[0] * Image.open(r).size[1] for r in refs) / 1e6
        cost = round((max(fs.W * fs.H / 1e6, 1.0) + ref_mp) * fs.PRICE[endpoint], 4)
        if ledger["spent_usd"] + cost > FAL_CAP:
            log(lg, f"fal: stopped at the ${FAL_CAP} cap (spent ${ledger['spent_usd']:.4f})")
            break
        prompt = j["prompt"] + " " + style
        body = {"prompt": prompt, "image_size": {"width": fs.W, "height": fs.H}, "seed": j["seed"], "num_images": 1, "output_format": "png"}
        if refs:
            body["image_urls"] = ["data:image/png;base64," + base64.b64encode(r.read_bytes()).decode() for r in refs]
        ledger["spent_usd"] = round(ledger["spent_usd"] + cost, 4)
        ledger["calls"].append({"id": j["id"], "endpoint": endpoint, "cost_usd": cost, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
        ledger_p.write_text(json.dumps(ledger, indent=2) + "\n")
        try:
            res, headers = fs.fal.call(endpoint, body, key)
            img = res["images"][0]
            path = out / f"{j['id']}.png"
            subprocess.run(["curl", "-sS", "--fail", "-o", str(path), img["url"]], check=True, timeout=300)
        except Exception as e:  # keep going: one failed call shouldn't end the night
            log(lg, f"fal: {j['id']} failed: {str(e)[:160]}")
            continue
        recipe["images"].append({"id": j["id"], "shot": j["shot"], "host": "fal.ai", "endpoint": endpoint,
                                 "weights": "black-forest-labs/FLUX.2-klein-4B (revision not exposed by fal)",
                                 "request_id": headers.get("x-fal-request-id") or res.get("request_id"), "prompt": prompt,
                                 "seed": res.get("seed", j["seed"]), "width": img.get("width"), "height": img.get("height"),
                                 "references": [{"file": str(r.relative_to(ROOT)), "sha256": fs.sha256(r)} for r in refs],
                                 "cost_usd": cost, "file": str(path.relative_to(ROOT)), "sha256": fs.sha256(path)})
        recipe["spent_usd"] = ledger["spent_usd"]
        recipe_p.write_text(json.dumps(recipe, indent=2, ensure_ascii=False) + "\n")
        log(lg, f"fal: {j['id']} ${cost}, total ${ledger['spent_usd']:.4f}")


def drive(seed: str) -> None:
    job_file, jobs = build(seed)
    out = ROOT / "images-out" / job_file.stem
    out.mkdir(parents=True, exist_ok=True)
    lg = out / "drive.log"
    now = datetime.now()
    deadline = now.replace(hour=DEADLINE[0], minute=DEADLINE[1], second=0, microsecond=0)
    if deadline <= now:
        deadline += timedelta(days=1)
    n, half = len(jobs), len(jobs) / 2
    start_done = len(done_ids(out))
    log(lg, f"local run: {n} options, deadline {deadline:%H:%M}, half is {half:.0f}; {start_done} already drawn")
    proc = subprocess.Popen([IMG_PY, "scripts/illustrate.py", str(job_file)], cwd=ROOT,
                            stdout=(out / "illustrate.log").open("a"), stderr=subprocess.STDOUT)
    t0 = time.time()
    while True:
        time.sleep(300)
        d = len(done_ids(out))
        made = d - start_done
        alive = proc.poll() is None
        if not alive:
            if d >= n:
                log(lg, f"local run finished: {d} of {n}")
                return
            log(lg, f"local run died (exit {proc.returncode}) at {d} of {n}: switching the rest to fal")
            break
        if made >= 3:
            per = (time.time() - t0) / made
            projected = d + (deadline - datetime.now()).total_seconds() / per
            log(lg, f"{d} of {n} drawn, {per / 60:.1f} min each, projected {projected:.0f} by {deadline:%H:%M}")
            if projected < half:
                log(lg, "on pace for less than half by the deadline: stopping local, the rest on fal")
                proc.terminate()
                proc.wait(timeout=120)
                break
        else:
            log(lg, f"{d} of {n} drawn (warming up)")
        if datetime.now() >= deadline:
            log(lg, f"deadline reached with {d} of {n}; the local run keeps going")
    fal_rest(seed, job_file, jobs, done_ids(out), lg)
    log(lg, "done")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--drive", action="store_true")
    args = ap.parse_args()
    if args.drive:
        drive(args.seed)
    else:
        job_file, jobs = build(args.seed)
        print(f"{job_file.relative_to(ROOT)}: {len(jobs)} options")
        for j in jobs[:3]:
            print(j["id"], j["references"], "\n ", j["prompt"][:1500], "\n")


if __name__ == "__main__":
    main()
