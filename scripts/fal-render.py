"""Render test images on a hosted open-weight model (fal.ai), under a hard spending cap.

For model trials only (the pipeline's own model stays in scripts/illustrate.py).
Reads a job file such as adaptations/dog-dawn/ab-test/jobs.json:

  "cap_usd": 1.0,
  "models": {"z": {"endpoint": "fal-ai/z-image/turbo", "weights": "...", "license": "Apache-2.0",
                   "price_usd_per_megapixel": 0.005, "price_seen": "...", "steps": 8}},
  "jobs": [{"id": "...", "model": "z", "prompt": "...", "seed": 1, "width": 1024, "height": 576,
            "control": {"image": "images-out/...png", "preprocess": "canny", "control_scale": 0.7}}]   (control: ControlNet only)

The key comes from FAL_KEY in the environment or in .env.local (gitignored).
It is never printed, logged or written anywhere; it reaches curl on stdin, not
on the command line.

Before every call the script adds the call's cost to a ledger and refuses if
the total would pass the cap. Each call is costed as the larger of its real
megapixels and one megapixel, in case the host rounds up, so the ledger never
undercounts.

Each image is saved to images-out/<folder>/<id>.<ext>, and its recipe is
written to <job folder>/recipe.json: host, endpoint, the weights it serves,
licence, the exact prompt, seed, steps, size, prompt expansion off, the
host's request id and timings, the price as listed and where, the cost, and
the output's sha256. The host does not expose a weights revision, so the
recipe says so.

  .venv-image/bin/python scripts/fal-render.py adaptations/dog-dawn/ab-test/jobs.json [--only id ...]
"""

import base64
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fal_key() -> str | None:
    if os.environ.get("FAL_KEY"):
        return os.environ["FAL_KEY"]
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("FAL_KEY="):
                return line.split("=", 1)[1].strip().strip('"')
    return None


def call(endpoint: str, body: dict, key: str) -> tuple[dict, dict]:
    # The key goes to curl through a config on stdin, so it never appears in a process list.
    cfg = f'header = "Authorization: Key {key}"\nheader = "Content-Type: application/json"\n'
    # The body goes through a temporary file: a control image as a data URI is too long for a command line.
    import tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=True) as f:
        json.dump(body, f)
        f.flush()
        r = subprocess.run(
            ["curl", "-sS", "--fail-with-body", "-K", "-", "-D", "/dev/stderr", "-X", "POST", f"https://fal.run/{endpoint}", "--data-binary", f"@{f.name}"],
            input=cfg, capture_output=True, text=True, timeout=600,
        )
    headers = {}
    for line in r.stderr.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()
    if r.returncode != 0:
        raise RuntimeError(f"fal call failed ({r.returncode}): {r.stdout[:300]}")
    return json.loads(r.stdout), headers


def main() -> None:
    job_file = Path(sys.argv[1]).resolve()
    only = set(sys.argv[sys.argv.index("--only") + 1:]) if "--only" in sys.argv else None
    spec = json.loads(job_file.read_text())
    key = fal_key()
    if not key:
        sys.exit("FAL_KEY is not set (environment or .env.local); nothing was called")
    out_dir = ROOT / "images-out" / job_file.parent.name
    out_dir.mkdir(parents=True, exist_ok=True)
    ledger_path = out_dir / "ledger.json"
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {"cap_usd": spec["cap_usd"], "spent_usd": 0.0, "calls": []}
    recipe_path = job_file.parent / "recipe.json"
    recipe = json.loads(recipe_path.read_text()) if recipe_path.exists() else {"about": spec["about"], "models": spec["models"], "images": []}
    done = {e["id"] for e in recipe["images"]}
    for job in spec["jobs"]:
        if job["id"] in done or (only and job["id"] not in only):
            continue
        m = spec["models"][job["model"]]
        mp = job["width"] * job["height"] / 1e6
        cost = round(max(mp, 1.0) * m["price_usd_per_megapixel"], 4)
        if ledger["spent_usd"] + cost > spec["cap_usd"]:
            print(f"{job['id']}: refused, would pass the ${spec['cap_usd']} cap (spent ${ledger['spent_usd']:.4f})")
            continue
        body = {"prompt": job["prompt"], "image_size": {"width": job["width"], "height": job["height"]}, "seed": job["seed"],
                "num_inference_steps": m["steps"], "num_images": 1, "enable_prompt_expansion": False, "output_format": "png"}
        control = job.get("control")
        if control:
            # ControlNet: the control image travels as a data URI (nothing is uploaded to our own storage).
            cpath = ROOT / control["image"]
            body["image_url"] = "data:image/png;base64," + base64.b64encode(cpath.read_bytes()).decode()
            body.update({k: control[k] for k in ("preprocess", "control_scale", "control_start", "control_end") if k in control})
        ledger["spent_usd"] = round(ledger["spent_usd"] + cost, 4)  # counted before the call, in case it bills and then fails
        ledger["calls"].append({"id": job["id"], "endpoint": m["endpoint"], "cost_usd": cost, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
        ledger_path.write_text(json.dumps(ledger, indent=2) + "\n")
        res, headers = call(m["endpoint"], body, key)
        img = res["images"][0]
        # Re-cost from the size the host actually returned (it may ignore the requested size).
        real = round(max(img.get("width", job["width"]) * img.get("height", job["height"]) / 1e6, 1.0) * m["price_usd_per_megapixel"], 4)
        if real != cost:
            ledger["spent_usd"] = round(ledger["spent_usd"] - cost + real, 4)
            ledger["calls"][-1].update(cost_usd=real, recosted_from=cost)
            ledger_path.write_text(json.dumps(ledger, indent=2) + "\n")
            cost = real
        ext = "png" if "png" in img.get("content_type", "png") else "jpg"
        path = out_dir / f"{job['id']}.{ext}"
        subprocess.run(["curl", "-sS", "--fail", "-o", str(path), img["url"]], check=True, timeout=300)
        entry = {
            "id": job["id"], "beat": job["beat"], "attempt": job["attempt"], "compare_with": job.get("compare_with"),
            "host": "fal.ai", "endpoint": m["endpoint"], "model": m["name"], "weights": m["weights"], "license": m["license"],
            "weights_revision": "not exposed by the host; the endpoint as served on the date below",
            "request_id": headers.get("x-fal-request-id") or res.get("request_id"),
            "served_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "prompt": job["prompt"], "seed": res.get("seed", job["seed"]), "steps": m["steps"],
            "width": img.get("width"), "height": img.get("height"),
            "enable_prompt_expansion": False, "safety_checker": "host default (on)",
            **({"control": {**{k: v for k, v in control.items() if k != "image"}, "image": control["image"],
                            "image_sha256": sha256(ROOT / control["image"])}} if control else {}),
            "has_nsfw_concepts": res.get("has_nsfw_concepts"), "timings": res.get("timings"),
            "price_usd_per_megapixel": m["price_usd_per_megapixel"], "price_seen": m["price_seen"],
            "cost_usd": cost, "cost_basis": "the larger of real megapixels and 1 MP, times the listed price",
            "file": f"images-out/{out_dir.name}/{path.name}", "sha256": sha256(path),
        }
        recipe["images"].append(entry)
        recipe["spent_usd"] = ledger["spent_usd"]
        recipe["generated_at"] = entry["served_at"]
        recipe_path.write_text(json.dumps(recipe, indent=2, ensure_ascii=False) + "\n")
        print(f"{job['id']}: {m['name']} -> {path.name} ({entry['sha256'][:12]}), ${cost}; total ${ledger['spent_usd']:.4f}")
    print(f"spent ${ledger['spent_usd']:.4f} of ${spec['cap_usd']}")


if __name__ == "__main__":
    main()
