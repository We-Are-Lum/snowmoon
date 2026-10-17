"""Draw a batch of pictures on fal.ai with FLUX.2 [klein] 4B (the allowlist's open weights), under a hard cap.

  .venv-image/bin/python scripts/fal-batch.py <jobs.json> [--only id ...] [--redo id ...] [--dry] [--workers 4]

The job file: {"about": ..., "out": "images-out/<dir>", "ledger": "images-out/<dir>/ledger.json",
"cap_usd": 5, "style": "<appended to every prompt>", "jobs": [{"id", "prompt", "refs": [paths], "width", "height",
"seed"}]}. A job with refs goes to fal-ai/flux-2/klein/4b/edit, one without to fal-ai/flux-2/klein/4b. Each call
is costed before it is made (listed price x (output MP, at least 1, + every reference's MP), as fal-shots.py does)
and refused if the ledger would pass the cap; the cap is shared by every job file that names the same ledger.
Each picture's recipe (endpoint, weights, prompt, seed, size, references and their sha256, request id, cost,
output sha256, and the job's layers when it has them) goes to <out>/recipe.json. The key comes from FAL_KEY (environment or .env.local), on stdin only.
"""

import argparse
import base64
import importlib.util
import json
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("fal_shots", ROOT / "scripts" / "fal-shots.py")
fs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fs)
LOCK = threading.Lock()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("jobs")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--redo", nargs="*", default=[])
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    spec = json.loads(Path(args.jobs).read_text())
    out = ROOT / spec["out"]
    out.mkdir(parents=True, exist_ok=True)
    ledger_p, recipe_p = ROOT / spec["ledger"], out / "recipe.json"
    ledger_p.parent.mkdir(parents=True, exist_ok=True)
    ledger = json.loads(ledger_p.read_text()) if ledger_p.exists() else {"cap_usd": spec["cap_usd"], "spent_usd": 0.0, "calls": []}
    allow = next(m for m in json.loads((ROOT / "config" / "models.json").read_text())["models"] if m["id"] == "flux2-klein-4b")
    recipe = json.loads(recipe_p.read_text()) if recipe_p.exists() else {
        "about": spec["about"], "model": {"id": allow["id"], "weights": allow["weights"], "revision_checked": allow["revision"],
                                          "license": allow["license"], "host": "fal.ai",
                                          "weights_revision": "not exposed by fal; the revision above was checked on 2026-10-15"},
        "images": {}}
    key = None if args.dry else fs.fal.fal_key()
    if not args.dry and not key:
        raise SystemExit("FAL_KEY is not set; nothing was called")
    todo = [j for j in spec["jobs"] if (not args.only or j["id"] in args.only) and (j["id"] not in recipe["images"] or j["id"] in args.redo)]

    def run(j: dict) -> None:
        refs = [ROOT / r for r in j.get("refs", [])]
        endpoint = fs.EDIT if refs else fs.PLAIN
        w, h = j.get("width", 1024), j.get("height", 576)
        ref_mp = sum(Image.open(r).size[0] * Image.open(r).size[1] for r in refs) / 1e6
        cost = round((max(w * h / 1e6, 1.0) + ref_mp) * fs.PRICE[endpoint], 4)
        prompt = j["prompt"] + (" " + spec["style"] if spec.get("style") and not j.get("no_style") else "")
        if args.dry:
            print(f"{j['id']} ({len(refs)} refs, ${cost}): {prompt[:300]}")
            return
        with LOCK:
            if ledger["spent_usd"] + cost > ledger["cap_usd"]:
                print(f"{j['id']}: refused, would pass the ${ledger['cap_usd']} cap (spent ${ledger['spent_usd']:.4f})", flush=True)
                return
            ledger["spent_usd"] = round(ledger["spent_usd"] + cost, 4)
            ledger["calls"].append({"id": j["id"], "endpoint": endpoint, "cost_usd": cost, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
            ledger_p.write_text(json.dumps(ledger, indent=2) + "\n")
        body = {"prompt": prompt, "image_size": {"width": w, "height": h}, "seed": j.get("seed", 1), "num_images": 1, "output_format": "png"}
        if refs:
            body["image_urls"] = ["data:image/png;base64," + base64.b64encode(r.read_bytes()).decode() for r in refs]
        try:
            res, headers = fs.fal.call(endpoint, body, key)
            img = res["images"][0]
            path = out / f"{j['id']}.png"
            subprocess.run(["curl", "-sS", "--fail", "-o", str(path), img["url"]], check=True, timeout=300)
        except Exception as e:  # one failed call shouldn't end the batch
            print(f"{j['id']}: failed: {str(e)[:200]}", flush=True)
            return
        with LOCK:
            recipe["images"][j["id"]] = {
                "endpoint": endpoint, "request_id": headers.get("x-fal-request-id") or res.get("request_id"),
                "served_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "prompt": prompt,
                "seed": res.get("seed", body["seed"]), "width": img.get("width"), "height": img.get("height"),
                "references": [{"file": str(r.relative_to(ROOT)), "sha256": fs.sha256(r)} for r in refs],
                "cost_usd": cost, "file": str(path.relative_to(ROOT)), "sha256": fs.sha256(path), **({"note": j["note"]} if j.get("note") else {}),
                **({"layers": j["layers"]} if j.get("layers") else {})}
            recipe["spent_usd_ledger"] = ledger["spent_usd"]
            recipe_p.write_text(json.dumps(recipe, indent=2, ensure_ascii=False) + "\n")
            print(f"{j['id']}: ${cost}, ledger ${ledger['spent_usd']:.4f}", flush=True)

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        list(ex.map(run, todo))
    print(f"done: {len(todo)} jobs; ledger ${ledger['spent_usd']:.4f} of ${ledger['cap_usd']}")


if __name__ == "__main__":
    main()
