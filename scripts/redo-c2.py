"""The redo after the owner's image review, drawn way (c) v2 (owner, 2026-10-24: "Redos use (c) v2"): Qwen-Image-Edit-2511
on fal, with the front-view crop of each character's sheet (its left third, as scripts/fal-shots.py crops it), the
location plate, and the who-is-who prompt wording. BUILT, NOT RUN.

It reuses the consistency trial (scripts/consistency/trial.py, branch illustration-consistency, PR #48) instead of
copying it: the references, the prompt and the price come from trial.plan(job, "c2", style) and trial.cost_of, the fal
call from the trial's fal-render module. Until PR #48 is merged, point --trial at its worktree's copy.

Which jobs: those with a "redo" not yet done, written into the job files by scripts/illustration-redo.ts from the
owner's decisions. The scene prompt is the job's prompt plus the owner-approved note, credited as the owner approved it
(owner, 2026-10-24): "drafted by the image check, approved by FID 6786", "drafted by the image check, edited and
approved by FID 6786", or "written by FID 6786".

  .venv-image/bin/python scripts/redo-c2.py                          the plan: every prompt, reference and price; calls nothing
  .venv-image/bin/python scripts/redo-c2.py --estimate RUN.json      price redoing every job the check called wrong or doubled
  .venv-image/bin/python scripts/redo-c2.py --run --cap 5            draw them (paid); private: images-out/redo-c2/
  .venv-image/bin/python scripts/redo-c2.py --promote                write the committed recipe and mark each redo done

--promote is the step that makes a redrawn picture publishable, so it refuses unless qwen-image-edit-2511 is on the
allowlist in origin/main's config/models.json (owner, 2026-10-24). Publishing itself stays a separate step.
"""

import argparse
import importlib.util
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content" / "snowmoon"
WAY = "c2"
ALLOWLIST_ID = "qwen-image-edit-2511"
# Per image, counted high, from the (c) v2 trial on fal (owner's figure, 2026-10-24); the Argon re-check per image.
TRIAL_IMAGE_USD = 0.055
RECHECK_USD = 0.027


def load_trial(path: Path):
    if not path.exists():
        sys.exit(f"{path} is missing: it comes with PR #48 (branch illustration-consistency). Until that is merged, pass "
                 "--trial /Users/nathan/snowmoon-illus-consist/scripts/consistency/trial.py")
    spec = importlib.util.spec_from_file_location("consistency_trial", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def on_main_allowlist() -> bool:
    """Whether origin/main's config/models.json allowlists Qwen-Image-Edit-2511 (fetched first)."""
    subprocess.run(["git", "-C", str(ROOT), "fetch", "-q", "origin", "main"], check=False)
    shown = subprocess.run(["git", "-C", str(ROOT), "show", "origin/main:config/models.json"], capture_output=True, text=True)
    if shown.returncode != 0:
        return False
    return any(m.get("id") == ALLOWLIST_ID for m in json.loads(shown.stdout).get("models", []))


def redo_jobs():
    """(job file, spec, job) for every job with a redo not yet done."""
    out = []
    for f in sorted((CONTENT / "illustrations").glob("chapter-*.json"), key=lambda p: int(p.stem.split("-")[1])):
        spec = json.loads(f.read_text())
        for job in spec["jobs"]:
            r = job.get("redo")
            if r and r.get("note") and not r.get("done"):
                out.append((f, spec, job))
    return out


def with_note(job):
    """The job as the redo draws it: the owner-approved note after the scene."""
    j = dict(job)
    j["prompt"] = f"{job['prompt'].rstrip()} {job['redo']['note'].strip()}"
    return j


def owner_note(job):
    r = job["redo"]
    return {"text": r["note"].strip(), "by_fid": r["by_fid"], "at": r["at"],
            "credit": r.get("credit") or f"written by FID {r['by_fid']}",
            "drafted_note": r.get("drafted_note"), "drafted_by": r.get("drafted_by"), "edited": r.get("edited"),
            "where": "appended to the job's prompt, after the scene"}


def estimate(run_file: Path):
    """Every job the check called wrong or reported a double for, priced at the trial's per-image figure."""
    run = json.loads(run_file.read_text())
    picked = [r for r in run["results"] if r.get("answer") and (
        r["answer"]["verdict"] == "wrong" or any(p["type"] == "reference_copy_in_crowd" for p in r["answer"]["problems"]))]
    picked.sort(key=lambda r: (r["answer"]["verdict"] != "wrong", r["chapter"], r["idx"]))
    wrong = sum(1 for r in picked if r["answer"]["verdict"] == "wrong")
    print(f"{len(picked)} jobs ({wrong} wrong, {len(picked) - wrong} partly or matches with a double):")
    for r in picked:
        print(f"  {r['job']}: {r['answer']['verdict']}{' + double' if any(p['type'] == 'reference_copy_in_crowd' for p in r['answer']['problems']) else ''}")
    print(f"redraw, way (c) v2 at ${TRIAL_IMAGE_USD}/image: ${len(picked) * TRIAL_IMAGE_USD:.2f}")
    print(f"re-check with Argon at ${RECHECK_USD}/image: ${len(picked) * RECHECK_USD:.2f}")
    print(f"together: ${len(picked) * (TRIAL_IMAGE_USD + RECHECK_USD):.2f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trial", type=Path, default=ROOT / "scripts" / "consistency" / "trial.py")
    ap.add_argument("--estimate", type=Path, help="an illustration-check run file; prices the redo of wrong-or-doubled jobs")
    ap.add_argument("--run", action="store_true", help="call fal (spends money)")
    ap.add_argument("--promote", action="store_true", help="write the committed recipe; needs the allowlist entry on main")
    ap.add_argument("--cap", type=float, default=2.0, help="USD for this redo run")
    args = ap.parse_args()

    if args.estimate:
        return estimate(args.estimate)

    trial = load_trial(args.trial)
    style = trial.load("designs/styles/techno-vistas.json")
    out_dir = ROOT / "images-out" / "redo-c2"
    ledger_p, recipe_p = out_dir / "ledger.json", out_dir / "recipe.json"
    jobs = redo_jobs()
    if not jobs:
        print("No redo to draw: no job has a redo not yet done (run scripts/illustration-redo.ts --write first).")
        return

    if args.promote:
        if not on_main_allowlist():
            sys.exit(f"Refused: {ALLOWLIST_ID} is not on the allowlist in origin/main's config/models.json. Merge PR #48 first.")
        recipe = json.loads(recipe_p.read_text()) if recipe_p.exists() else None
        if not recipe or not recipe["images"]:
            sys.exit("Nothing drawn yet (run --run first).")
        committed = CONTENT / "recipes" / "images" / "redo-c2.json"
        record = json.loads(committed.read_text()) if committed.exists() else {
            "about": "Redos after the owner's image review, drawn way (c) v2 (owner, 2026-10-24). One entry per redrawn picture.",
            "model": {"allowlist": ALLOWLIST_ID, "endpoint": trial.WAYS[WAY]["endpoint"], "settings": trial.WAYS[WAY]["body"],
                      "host": "fal.ai", "model_record": "endpoint, date and request id"},
            "assist": {"model": "claude-coding-agent", "drafted": ["image prompts", "who-is-who wording"],
                       "note": "the owner's notes are credited per image in owner_note", "see": "principle 3"},
            "images": []}
        done_ids = {e["id"] for e in record["images"]}
        stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
        changed = set()
        for e in recipe["images"]:
            if e["id"] in done_ids:
                continue
            record["images"].append(e)
            for f, spec, job in jobs:
                if job["id"] == e["id"]:
                    job["redo"]["done"] = stamp
                    changed.add(f)
        committed.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
        for f, spec, _ in jobs:
            if f in changed:
                f.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote {committed.relative_to(ROOT)}; {len(record['images'])} redrawn pictures recorded. Publishing them is a separate step.")
        return

    total = 0.0
    key = trial.fal.fal_key() if args.run else None
    if args.run and not key:
        sys.exit("FAL_KEY is not set (environment or .env.local); nothing was called")
    out_dir.mkdir(parents=True, exist_ok=True)
    ledger = json.loads(ledger_p.read_text()) if ledger_p.exists() else {"cap_usd": args.cap, "spent_usd": 0.0, "calls": []}
    ledger["cap_usd"] = args.cap
    recipe = json.loads(recipe_p.read_text()) if recipe_p.exists() else {"images": []}
    for f, spec, job in jobs:
        j = with_note(job)
        refs, prompt, dropped = trial.plan(j, WAY, style)
        cost = trial.cost_of(trial.WAYS[WAY]["price"], job["width"], job["height"], refs)
        total += cost
        note = owner_note(job)
        if not args.run:
            print(f"{job['id']} ({len(refs)} refs: {', '.join(r.name for r in refs)}; ${cost}){' [' + dropped + ']' if dropped else ''}\n"
                  f"  note ({note['credit']}): {note['text']}\n  prompt: {prompt}\n")
            continue
        out_path = out_dir / f"{job['id']}.png"
        if out_path.exists():
            continue
        missing = [r.name for r in refs if not r.exists()]
        if missing:
            print(f"{job['id']}: skipped, missing {', '.join(missing)}")
            continue
        if ledger["spent_usd"] + cost > args.cap:
            print(f"{job['id']}: refused, would pass the ${args.cap} cap (spent ${ledger['spent_usd']:.4f})")
            break
        ledger["spent_usd"] = round(ledger["spent_usd"] + cost, 4)  # counted before the call, in case it bills and then fails
        ledger["calls"].append({"what": job["id"], "endpoint": trial.WAYS[WAY]["endpoint"], "cost_usd": cost, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
        ledger_p.write_text(json.dumps(ledger, indent=2) + "\n")
        body = {"prompt": prompt, "image_size": {"width": job["width"], "height": job["height"]}, "seed": job["seed"], "num_images": 1,
                "output_format": "png", "image_urls": [trial.data_uri(r) for r in refs], **trial.WAYS[WAY]["body"]}
        res, headers = trial.fal.call(trial.WAYS[WAY]["endpoint"], body, key)
        subprocess.run(["curl", "-sS", "--fail", "-o", str(out_path), res["images"][0]["url"]], check=True, timeout=300)
        recipe["images"].append({"id": job["id"], "chapter": job["chapter"], "idx": job["idx"], "way": WAY,
                                 "endpoint": trial.WAYS[WAY]["endpoint"], "settings": trial.WAYS[WAY]["body"], "prompt": prompt,
                                 "seed": job["seed"], "width": job["width"], "height": job["height"], "dropped": dropped,
                                 "owner_note": note, "request_id": headers.get("x-fal-request-id") or res.get("request_id"),
                                 "references": [{"file": r.name, "sha256": trial.sha256(r)} for r in refs],
                                 "cost_usd": cost, "file": out_path.name, "sha256": trial.sha256(out_path)})
        recipe_p.write_text(json.dumps(recipe, indent=2, ensure_ascii=False) + "\n")
        print(f"{job['id']}: ${cost}; total ${ledger['spent_usd']:.4f}", flush=True)
    print(f"redo (c) v2: ${total:.4f} for {len(jobs)} images{'' if args.run else ' (estimate, nothing called)'}")
    print(f"allowlist entry on main: {'yes' if on_main_allowlist() else 'NO (--promote will refuse)'}")


if __name__ == "__main__":
    main()
