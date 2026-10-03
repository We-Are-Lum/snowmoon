"""Render illustrations locally with FLUX.2 [klein] 4B (Apache-2.0) via mflux on Apple Silicon.

Reads a job file from content/snowmoon/illustrations/, composes each prompt from the
style guide, any character profiles, and the scene, and writes PNGs plus a manifest
(the recipe for every image) to a gitignored folder. Nothing is uploaded and nothing
is written to the database. Every image's recipe (model, revision, composed
prompt, seed, settings, output sha256) is also written to content/snowmoon/recipes/images/.

A job with "reference" uses an earlier job's image (e.g. a character sheet) as a
reference image, which is how a character profile keeps a character consistent.

Setup (once):
  uv venv --python 3.12 .venv-image
  uv pip install --python .venv-image -r scripts/illustrate.requirements.txt

Run:
  .venv-image/bin/python scripts/illustrate.py content/snowmoon/illustrations/test-chapter-1.json
"""

import argparse
import hashlib
import json
import platform
import time
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content" / "snowmoon"
RECIPES = CONTENT / "recipes" / "images"

MODEL_REPO = "black-forest-labs/FLUX.2-klein-4B"
MODEL_REVISION = "e7b7dc27f91deacad38e78976d1f2b499d76a294"
STEPS = 4  # the distilled model is made for 4 steps
GUIDANCE = 1.0


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(rel):
    return json.loads((CONTENT / rel).read_text())


def reference_paths(job, out):
    """References are earlier renders: "cast/zei-sheet" is images-out/cast/zei-sheet.png.
    A bare id refers to the same batch."""
    refs = job.get("references") or ([job["reference"]] if job.get("reference") else [])
    return [str((ROOT / "images-out" / r) if "/" in r else (out / r)).removesuffix(".png") + ".png" for r in refs]


def compose_prompt(job, style):
    """Scene first, then who the references show, then props, then style.

    Characters are described, never named: a name in the prompt tends to get
    painted onto the picture as lettering.
    """
    parts = [job["prompt"]]
    for i, c in enumerate(job.get("characters", []), start=1):
        profile = load(c)
        parts.append(f"Reference image {i} shows {profile['descriptor']}; keep the same face, hair, build and clothing.")
    for prop in job.get("props", []):
        parts.append(load(prop)["prompt"])
    parts.append(style["prompt"])
    setting = job.get("setting")
    if setting and setting in style.get("settings", {}):
        parts.append(style["settings"][setting])
    return " ".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jobs")
    ap.add_argument("--quantize", type=int, default=4, help="bits; 4 fits an 8 GB Mac")
    ap.add_argument("--only", nargs="*", help="job ids to render")
    ap.add_argument("--force", action="store_true", help="re-render images that already exist")
    args = ap.parse_args()

    from huggingface_hub import snapshot_download
    from mflux.models.common.config import ModelConfig
    from mflux.models.flux2.variants import Flux2Klein, Flux2KleinEdit
    import gc
    import mlx.core as mx

    job_file = Path(args.jobs).resolve()
    spec = json.loads(job_file.read_text())
    style = json.loads((CONTENT / spec["style"]).read_text())
    out = ROOT / "images-out" / job_file.stem
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / "manifest.json"
    done = {e["id"]: e for e in json.loads(manifest_path.read_text())["images"]} if manifest_path.exists() else {}

    model_path = snapshot_download(MODEL_REPO, revision=MODEL_REVISION)
    loaded = {"kind": None, "model": None}
    load_s = 0.0

    def get_model(kind):
        """One model in memory at a time: plain for text-only jobs, edit for jobs with references."""
        nonlocal load_s
        if loaded["kind"] != kind:
            loaded["model"] = None
            gc.collect()
            mx.clear_cache()
            t0 = time.time()
            cls = Flux2KleinEdit if kind == "edit" else Flux2Klein
            loaded["model"] = cls(quantize=args.quantize, model_path=model_path, model_config=ModelConfig.flux2_klein_4b())
            loaded["kind"] = kind
            load_s += time.time() - t0
        return loaded["model"]

    def write_manifest():
        manifest = {
            "job_file": str(job_file.relative_to(ROOT)),
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "model": {"repo": MODEL_REPO, "revision": MODEL_REVISION, "license": "apache-2.0",
                      "runtime": "mflux", "mflux_version": version("mflux"), "quantize_bits": args.quantize},
            "settings": {"steps": STEPS, "guidance": GUIDANCE},
            "cost_usd": 0,
            "host": {"platform": platform.platform(), "machine": platform.machine()},
            "model_load_seconds": round(load_s, 1),
            "images": list(done.values()),
        }
        text = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
        manifest_path.write_text(text)
        # The recipe is also committed to the repo, so the record outlives the local images.
        RECIPES.mkdir(parents=True, exist_ok=True)
        (RECIPES / f"{job_file.stem}.json").write_text(text)

    for job in spec["jobs"]:
        if args.only and job["id"] not in args.only:
            continue
        if not args.force and job["id"] in done and (out / done[job["id"]]["file"]).exists():
            continue
        prompt = compose_prompt(job, style)
        refs = reference_paths(job, out) or None
        t = time.time()
        kwargs = dict(seed=job["seed"], prompt=prompt, num_inference_steps=STEPS,
                      width=job["width"], height=job["height"], guidance=GUIDANCE)
        if refs:
            image = get_model("edit").generate_image(image_paths=refs, **kwargs)
        else:
            image = get_model("plain").generate_image(**kwargs)
        path = out / f"{job['id']}.png"
        image.save(str(path))
        secs = time.time() - t
        done[job["id"]] = {
            "id": job["id"],
            "chapter": job["chapter"],
            "idx": job["idx"],
            "file": path.name,
            "sha256": sha256_file(path),
            "prompt": prompt,
            "seed": job["seed"],
            "width": job["width"],
            "height": job["height"],
            "references": [{"file": Path(r).name, "sha256": sha256_file(r)} for r in refs or []],
            "generation_seconds": round(secs, 1),
        }
        print(f"  {job['id']}: {secs:.0f}s", flush=True)
        write_manifest()

    write_manifest()


if __name__ == "__main__":
    main()
