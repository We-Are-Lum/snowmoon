"""Make short music cues locally with ACE-Step 1.5 (MIT; on the allowlist as ace-step-1.5).

  ~/acestep-1.5/.venv/bin/python scripts/make-music.py adaptations/fifteen-days/music/dreadnaught.json
  .venv-image/bin/python scripts/make-music.py adaptations/fifteen-days/music/dreadnaught.json --fal [--cap 1.0]

--fal is the owner's fallback (2026-10-15): ACE-Step v1 3.5B (Apache-2.0, ace-step-v1-fal on the allowlist)
on fal.ai, under a hard cap; each call is costed before it is made, at $0.0002 a second as listed with
a floor of $0.01 a clip, so the ledger never undercounts. Its versions get "-fal" ids.

A cue file lists versions: {"cue", "about", "assist", "duration", "bpm", "versions": [{"id", "caption",
"lyrics", "seed"}]}. Each version is written to scenes-out/<seed>/music/<id>.wav (gitignored) and its
recipe to <cue folder>/recipe.json: the model, revision, components, the code's commit, every
setting, the device, the time taken and the output's sha256. The weights are checked against the
sha256 recorded in config/models.json (written on the first run). Waits while the take pipeline runs:
one big model at a time on the 8 GB Mac.
"""

import hashlib
import json
import platform
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ACE = Path.home() / "acestep-1.5"
MODEL_ID = "ace-step-1.5"


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


FAL = {"endpoint": "fal-ai/ace-step", "model_id": "ace-step-v1-fal", "price_usd_per_second": 0.0002, "floor_usd": 0.01}


def via_fal(cue_file: Path, spec: dict, seed_name: str, cap: float) -> None:
    sys.path.insert(0, str(ROOT / "scripts"))
    import importlib
    fal = importlib.import_module("fal-render")
    key = fal.fal_key()
    if not key:
        raise SystemExit("FAL_KEY is not set; nothing was called")
    model = next(m for m in json.loads((ROOT / "config/models.json").read_text())["models"] if m["id"] == FAL["model_id"])
    out = ROOT / "scenes-out" / seed_name / "music"
    out.mkdir(parents=True, exist_ok=True)
    rec_path = cue_file.parent / "recipe.json"
    rec = json.loads(rec_path.read_text()) if rec_path.exists() else {"cue": spec["cue"], "about": spec["about"], "assist": spec["assist"], "versions": []}
    rec.setdefault("ledger", {"cap_usd": cap, "spent_usd": 0.0})
    done = {v["id"] for v in rec["versions"]}
    for v in spec["versions"]:
        vid = f"{v['id']}-fal"
        if vid in done:
            continue
        cost = round(max(spec["duration"] * FAL["price_usd_per_second"], FAL["floor_usd"]), 4)
        if rec["ledger"]["spent_usd"] + cost > cap:
            print(f"{vid}: refused, would pass the ${cap} cap")
            continue
        rec["ledger"]["spent_usd"] = round(rec["ledger"]["spent_usd"] + cost, 4)
        rec_path.write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")  # counted before the call
        # v1 takes genre tags and lyrics; "[inst]" marks instrumental sections, so the scream is its own section.
        lyrics = v["lyrics"].replace("[Instrumental]", "[inst]")
        body = {"tags": v["caption"], "lyrics": lyrics, "duration": spec["duration"], "seed": v["seed"], "number_of_steps": 27}
        t = time.time()
        res, headers = fal.call(FAL["endpoint"], body, key)
        dst = out / f"{vid}.wav"
        subprocess.run(["curl", "-sS", "--fail", "-o", str(dst), res["audio"]["url"]], check=True, timeout=300)
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(dst)], capture_output=True, text=True).stdout)
        rec["versions"].append({
            "id": vid, "caption": v["caption"], "lyrics": lyrics, "seed": res.get("seed", v["seed"]), "duration_requested": spec["duration"],
            "settings": {k: body[k] for k in ("number_of_steps",)}, "model": FAL["model_id"], "repo": model["repo"], "license": model["license"],
            "host": "fal.ai", "endpoint": FAL["endpoint"], "weights_revision": "not exposed by the host; the endpoint as served on the date below",
            "request_id": headers.get("x-fal-request-id") or res.get("request_id"), "seconds_taken": round(time.time() - t, 1),
            "file": str(dst.relative_to(ROOT)), "sha256": sha256(dst), "duration_s": round(dur, 2),
            "made_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "cost_usd": cost,
            "cost_basis": "seconds requested times the listed $0.0002, at least $0.01 a clip"})
        rec_path.write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")
        print(f"{vid}: {dst.relative_to(ROOT)} ({dur:.1f} s), ${cost}; total ${rec['ledger']['spent_usd']}", flush=True)


def main() -> None:
    cue_file = Path(sys.argv[1]).resolve()
    spec = json.loads(cue_file.read_text())
    seed_name = cue_file.parts[cue_file.parts.index("adaptations") + 1]
    models = json.loads((ROOT / "config/models.json").read_text())
    model = next(m for m in models["models"] if m["id"] == MODEL_ID)
    if "--fal" in sys.argv:
        cap = float(sys.argv[sys.argv.index("--cap") + 1]) if "--cap" in sys.argv else 1.0
        return via_fal(cue_file, spec, seed_name, cap)

    # Pin the weights: record their sha256 on the first run, check them on every later one.
    ck = ACE / "checkpoints"
    files = sorted(p for d in ("acestep-v15-turbo", "vae", "Qwen3-Embedding-0.6B", "acestep-5Hz-lm-0.6B")
                   for p in (ck / d).rglob("*") if p.is_file() and p.suffix in (".safetensors", ".bin", ".pt", ".pth"))
    hashes = {str(p.relative_to(ck)): sha256(p) for p in files}
    if not model["local"]["weights"]:
        print(f"recording the sha256 of {len(hashes)} weight files in config/models.json")
        text = (ROOT / "config/models.json").read_text()
        data = json.loads(text)
        next(m for m in data["models"] if m["id"] == MODEL_ID)["local"]["weights"] = hashes
        (ROOT / "config/models.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    elif hashes != model["local"]["weights"]:
        raise SystemExit("the ACE-Step weights don't match the sha256 in config/models.json")

    while subprocess.run(["pgrep", "-f", "split-takes.py|convert-voice.py|scripts/illustrate.py"], capture_output=True).returncode == 0:
        print("waiting: another big model is running", flush=True)
        time.sleep(60)

    sys.path.insert(0, str(ACE))
    from acestep.handler import AceStepHandler
    from acestep.llm_inference import LLMHandler
    from acestep.inference import GenerationParams, GenerationConfig, generate_music

    t0 = time.time()
    dit, lm = AceStepHandler(), LLMHandler()
    status = dit.initialize_service(project_root=str(ACE), config_path="acestep-v15-turbo", device="auto")
    print("dit:", str(status)[:200], flush=True)
    lm_status = lm.initialize(checkpoint_dir=str(ck), lm_model_path="acestep-5Hz-lm-0.6B", backend="mlx", device="mps")
    print("lm:", str(lm_status)[:200], flush=True)
    load_s = time.time() - t0

    out = ROOT / "scenes-out" / seed_name / "music"
    out.mkdir(parents=True, exist_ok=True)
    rec_path = cue_file.parent / "recipe.json"
    rec = json.loads(rec_path.read_text()) if rec_path.exists() else {"cue": spec["cue"], "about": spec["about"], "assist": spec["assist"], "versions": []}
    done = {v["id"] for v in rec["versions"]}
    commit = subprocess.run(["git", "-C", str(ACE), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    for v in spec["versions"]:
        if v["id"] in done:
            continue
        params = GenerationParams(caption=v["caption"], lyrics=v["lyrics"], instrumental=False, vocal_language="unknown",
                                  duration=spec["duration"], bpm=spec.get("bpm"), seed=v["seed"], inference_steps=8,
                                  thinking=True, use_cot_caption=False, use_cot_language=False)
        config = GenerationConfig(batch_size=1, use_random_seed=False, seeds=[v["seed"]], audio_format="wav")
        t = time.time()
        res = generate_music(dit, lm, params, config, save_dir=str(out / "raw"))
        secs = time.time() - t
        if not res.success or not res.audios:
            print(f"{v['id']}: failed: {res.error}", flush=True)
            continue
        dst = out / f"{v['id']}.wav"
        shutil.copyfile(res.audios[0]["path"], dst)
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(dst)], capture_output=True, text=True).stdout)
        rec["versions"].append({
            "id": v["id"], "caption": v["caption"], "lyrics": v["lyrics"], "seed": v["seed"], "duration_requested": spec["duration"], "bpm": spec.get("bpm"),
            "settings": {"dit": "acestep-v15-turbo", "inference_steps": 8, "lm": "acestep-5Hz-lm-0.6B", "lm_backend": "mlx", "thinking": True,
                         "use_cot_caption": False, "vocal_language": "unknown"},
            "model": MODEL_ID, "repo": model["repo"], "revision": model["revision"], "license": model["license"], "components": model["components"],
            "code": {"repo": "https://github.com/ace-step/ACE-Step-1.5", "commit": commit},
            "weights_sha256": "config/models.json ace-step-1.5 local.weights",
            "runs_on": f"the maintainer's Mac ({platform.machine()}, {getattr(dit, 'device', '?')})", "model_load_seconds": round(load_s, 1),
            "seconds_taken": round(secs, 1), "file": str(dst.relative_to(ROOT)), "sha256": sha256(dst), "duration_s": round(dur, 2),
            "made_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "cost_usd": 0,
        })
        rec_path.write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")
        print(f"{v['id']}: {dst.relative_to(ROOT)} ({dur:.1f} s, {secs:.0f} s to make)", flush=True)


if __name__ == "__main__":
    main()
