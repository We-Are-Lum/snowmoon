"""Convert a performed line into a character's designed voice, locally, with Chatterbox.

Stage 2, performed lines (docs/adaptation-format.md; consent own-voice-v1): a person's take is
converted on their own machine, so the take never leaves it. Chatterbox speech-to-speech (MIT,
open weights, on the allowlist as chatterbox-vc) runs from the pinned local weights in
.voice-models/chatterbox/<revision>, checked against config/models.json's sha256 before loading.
Every output carries Chatterbox's Perth watermark.

The take is read where it lies and never copied. A take inside this repository is refused, so a
raw recording can't be committed by accident; --stand-in allows a synthetic source made for
testing (never a person's voice). The recipe records the take's sha256, never the take.

  /Users/nathan/snowmoon/.venv-voice/bin/python scripts/convert-voice.py fifteen-days \
      --take ~/Recordings/line-1.m4a --voices zei deluin bai [--name line-1]

Writes scenes-out/<seed>/voice-test/<name>.<voice>.wav (gitignored) and, beside it,
<name>.<voice>.recipe.json: the model, revision, weight hashes, the reference clip and its
recipe, the take's sha256 and duration, the device, the time taken, and the output's sha256.
"""

import argparse
import hashlib
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_ID = "chatterbox-vc"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def duration(path: Path) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                                capture_output=True, text=True, check=True).stdout)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("--take", required=True, type=Path)
    ap.add_argument("--voices", nargs="+", required=True)
    ap.add_argument("--name", default=None)
    ap.add_argument("--stand-in", action="store_true", help="the source is synthetic test audio, not a person's take")
    ap.add_argument("--device", default="cpu", help="cpu (faster on an 8 GB M3 in the 13 October test) or mps")
    args = ap.parse_args()

    take = args.take.expanduser().resolve()
    if not take.exists():
        raise SystemExit(f"no such take: {take}")
    inside = ROOT.resolve() in take.parents or (Path("/Users/nathan/snowmoon").resolve() in take.parents)
    if inside and not args.stand_in:
        raise SystemExit("refused: the take is inside a repository folder; keep raw takes in a private folder outside it")
    model = next(m for m in json.loads((ROOT / "config" / "models.json").read_text())["models"] if m["id"] == MODEL_ID)
    rev = model["revision"]
    wdir = Path("/Users/nathan/snowmoon/.voice-models/chatterbox") / rev
    for fname, want in model["local"]["weights"].items():
        if sha256(wdir / fname) != want:
            raise SystemExit(f"{fname} does not match the pinned sha256 in config/models.json")

    from chatterbox.vc import ChatterboxVC
    import soundfile as sf

    vc = ChatterboxVC.from_local(str(wdir), args.device)
    name = args.name or take.stem
    out = ROOT / "scenes-out" / args.seed / "voice-test"
    out.mkdir(parents=True, exist_ok=True)
    take_sha, take_s = sha256(take), duration(take)
    for vid in args.voices:
        ref = ROOT / "scenes-out" / args.seed / "voices" / f"{vid}.ref.wav"
        ref_rec = ROOT / "adaptations" / args.seed / "voices" / f"{vid}.recipe.json"
        if sha256(ref) != json.loads(ref_rec.read_text())["sha256"]:
            raise SystemExit(f"{vid}: the reference clip does not match its recipe")
        began = time.time()
        wav = vc.generate(str(take), target_voice_path=str(ref)).squeeze(0).numpy()
        took = time.time() - began
        dst = out / f"{name}.{vid}.wav"
        sf.write(dst, wav, vc.sr, subtype="PCM_16")
        rec = {
            "line": name, "voice": vid, "stand_in": args.stand_in,
            "model": MODEL_ID, "weights": model["weights"], "revision": rev, "license": model["license"],
            "weights_sha256": model["local"]["weights"], "runs_on": f"the performer's machine ({args.device})",
            "take": {"sha256": take_sha, "duration_s": round(take_s, 2), "kept": "private, outside the repository; never copied or uploaded"},
            "reference": {"file": str(ref.relative_to(ROOT)), "sha256": sha256(ref), "recipe": str(ref_rec.relative_to(ROOT))},
            "watermark": "Perth (applied by Chatterbox to every output)",
            "seconds_taken": round(took, 1), "sample_rate": vc.sr,
            "file": str(dst.relative_to(ROOT)), "sha256": sha256(dst), "duration_s": round(len(wav) / vc.sr, 2),
            "made_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "cost_usd": 0,
        }
        (out / f"{name}.{vid}.recipe.json").write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")
        print(f"{name} → {vid}: {dst.relative_to(ROOT)} ({rec['duration_s']} s, {took:.0f} s on {args.device})")


if __name__ == "__main__":
    main()
