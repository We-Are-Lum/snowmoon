"""Draw a batch of pictures on fal.ai with FLUX.2 [klein] 4B (the allowlist's open weights), under a hard cap.

  .venv-image/bin/python scripts/fal-batch.py <jobs.json> [--only id ...] [--redo id ...] [--dry] [--workers 4]

The job file: {"about": ..., "out": "images-out/<dir>", "ledger": "images-out/<dir>/ledger.json",
"cap_usd": 5, "style": "<appended to every prompt>", "jobs": [{"id", "prompt", "refs": [paths], "width", "height",
"seed"}]}. A job with refs goes to fal-ai/flux-2/klein/4b/edit, one without to fal-ai/flux-2/klein/4b. Each call
is costed before it is made (listed price x (output MP, at least 1, + every reference's MP), as fal-shots.py does)
and refused if the ledger would pass the cap; the cap is shared by every job file that names the same ledger.
Each picture's recipe (endpoint, weights, prompt, seed, size, references and their sha256, request id, cost,
output sha256, and the job's layers when it has them) goes to <out>/recipe.json.
A job with "control": <path> goes instead to Z-Image Turbo's ControlNet (fal-ai/z-image/turbo/controlnet; allowlisted as
z-image-turbo, Apache-2.0; control weights alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union, "License: apache-2.0"), the control
image (a depth map or edge lines rendered from the 3D set) as its only picture input; optional "control_scale", "control_end". The key comes from FAL_KEY (environment or .env.local), on stdin only.
"""

import argparse
import base64
import importlib.util
import json
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("fal_shots", ROOT / "scripts" / "fal-shots.py")
fs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fs)
LOCK = threading.Lock()
ZCN = "fal-ai/z-image/turbo/controlnet"
ZPRICE = 0.0065  # USD per megapixel (config/models.json, z-image-turbo, price seen 2026-10-05)
QWEN = "fal-ai/qwen-image-edit-2509"
QPRICE = 0.03  # USD per megapixel (fal pricing API, 2026-10-16); costed as output MP (at least 1) + every reference's MP, to be safe
QMODEL = {"id": "qwen-image-edit-2509", "weights": "https://huggingface.co/Qwen/Qwen-Image-Edit-2509", "license_line": "License: apache-2.0",
          "license_checked": "coding agent, 2026-10-16 (model card); provisional until the owner confirms", "host": "fal.ai", "weights_revision": "not exposed by fal"}
ZMODEL = {"id": "z-image-turbo", "weights": "https://huggingface.co/Tongyi-MAI/Z-Image-Turbo", "license_line": "License: apache-2.0",
          "control_weights": "https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union", "control_license_line": "License: apache-2.0",
          "license_checked": "coding agent, 2026-10-16 (model cards)", "host": "fal.ai", "weights_revision": "not exposed by fal"}


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
        ctrl = ROOT / j["control"] if j.get("control") else None
        endpoint = QWEN if j.get("engine") == "qwen" else ZCN if ctrl else fs.EDIT if refs else fs.PLAIN
        w, h = j.get("width", 1024), j.get("height", 576)
        ref_mp = sum(Image.open(r).size[0] * Image.open(r).size[1] for r in refs) / 1e6
        cost = round((max(w * h / 1e6, 1.0) + ref_mp) * QPRICE, 4) if endpoint == QWEN else round(max(w * h / 1e6, 1.0) * ZPRICE + 0.001, 4) if ctrl else round((max(w * h / 1e6, 1.0) + ref_mp) * fs.PRICE[endpoint], 4)
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
        if endpoint == QWEN:
            body = {"prompt": prompt, "image_urls": ["data:image/png;base64," + base64.b64encode(r.read_bytes()).decode() for r in refs], "image_size": {"width": w, "height": h},
                    "seed": j.get("seed", 1), "num_images": 1, "output_format": "png", "negative_prompt": j.get("negative", " ")}
        elif ctrl:
            body = {"prompt": prompt, "image_url": "data:image/png;base64," + base64.b64encode(ctrl.read_bytes()).decode(), "image_size": {"width": w, "height": h},
                    "seed": j.get("seed", 1), "num_images": 1, "output_format": "png", "control_scale": j.get("control_scale", 0.75),
                    "control_end": j.get("control_end", 0.8), "preprocess": "none", "num_inference_steps": j.get("steps", 8)}
        elif refs:
            body["image_urls"] = ["data:image/png;base64," + base64.b64encode(r.read_bytes()).decode() for r in refs]
        try:
            for tries in range(12):  # fal allows 10 requests at once per account: a refused request is not billed, so wait and retry
                try:
                    res, headers = fs.fal.call(endpoint, body, key)
                    break
                except RuntimeError as e:
                    if "concurrent_requests_limit" not in str(e) or tries == 11:
                        raise
                    time.sleep(15 + 5 * tries)
            img = res["images"][0]
            path = out / f"{j['id']}.png"
            subprocess.run(["curl", "-sS", "--fail", "-o", str(path), img["url"]], check=True, timeout=300)
        except Exception as e:  # one failed call shouldn't end the batch
            if "concurrent_requests_limit" in str(e):  # refused, not billed: give the cost back to the ledger
                with LOCK:
                    ledger["spent_usd"] = round(ledger["spent_usd"] - cost, 4)
                    ledger["calls"].append({"id": j["id"], "refund_usd": cost, "why": "refused by fal (concurrent limit), not billed"})
                    ledger_p.write_text(json.dumps(ledger, indent=2) + "\n")
            print(f"{j['id']}: failed: {str(e)[:200]}", flush=True)
            return
        with LOCK:
            recipe["images"][j["id"]] = {
                "endpoint": endpoint, "request_id": headers.get("x-fal-request-id") or res.get("request_id"),
                "served_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "prompt": prompt,
                "seed": res.get("seed", body["seed"]), "width": img.get("width"), "height": img.get("height"),
                "references": [{"file": str(r.relative_to(ROOT)), "sha256": fs.sha256(r)} for r in refs],
                **({"model": QMODEL} if endpoint == QWEN else {}),
                **({"model": ZMODEL, "control": {"file": str(ctrl.relative_to(ROOT)), "sha256": fs.sha256(ctrl), "kind": j.get("control_kind", "depth"),
                                                 "control_scale": body["control_scale"], "control_end": body["control_end"]}} if ctrl else {}),
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
