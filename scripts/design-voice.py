"""Design a character's voice from a written description, and save its reference clip.

Stage 2 voice sheets (docs/adaptation-format.md): a voice is designed once from a description,
and its ~10 second reference clip is what later lines are converted or cloned into, so the voice
stays the same person. Uses Qwen3-TTS 1.7B VoiceDesign (Apache-2.0, open weights, on the
allowlist as qwen3-tts-1.7b-voicedesign) on fal.ai, under a hard spending cap.

A voice sheet is adaptations/<seed>/voices/<id>.json:
  {"character": "Zei", "description": "...", "description_by": "owner" | "placeholder (model-drafted)",
   "reference_text": "...", "language": "English", "seed_note": "..."}
The description is the owner's words; a placeholder sheet says so and is never published.
No description may name or imitate a real person.

Writes scenes-out/<seed>/voices/<id>.ref.wav (gitignored) and the sheet's recipe at
adaptations/<seed>/voices/<id>.recipe.json: host, endpoint, the exact description and text,
settings, the host's request id, the price as listed, the cost, and the clip's sha256. The ledger
of every call is scenes-out/<seed>/voices/ledger.json.

  /Users/nathan/snowmoon/.venv-voice/bin/python scripts/design-voice.py fifteen-days zei deluin bai [--cap 1]
"""

import argparse
import hashlib
import importlib.util
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_ID = "qwen3-tts-1.7b-voicedesign"
ENDPOINT = "fal-ai/qwen-3-tts/voice-design/1.7b"
SETTINGS = {"temperature": 0.9, "top_p": 1, "top_k": 50, "repetition_penalty": 1.05, "max_new_tokens": 240}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fal():
    spec = importlib.util.spec_from_file_location("fal_render", ROOT / "scripts" / "fal-render.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("voices", nargs="+")
    ap.add_argument("--cap", type=float, default=1.0, help="hard cap in USD across this seed's voice calls")
    args = ap.parse_args()

    model = next(m for m in json.loads((ROOT / "config" / "models.json").read_text())["models"] if m["id"] == MODEL_ID)
    price = model["hosted"]["endpoints"][ENDPOINT]  # USD per 1000 characters
    F = fal()
    key = F.fal_key()
    if not key:
        raise SystemExit("FAL_KEY is not set (environment or .env.local); nothing was called")
    vdir = ROOT / "adaptations" / args.seed / "voices"
    out = ROOT / "scenes-out" / args.seed / "voices"
    out.mkdir(parents=True, exist_ok=True)
    ledger_path = out / "ledger.json"
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {"cap_usd": args.cap, "spent_usd": 0.0, "calls": []}
    ledger["cap_usd"] = args.cap

    for vid in args.voices:
        sheet = json.loads((vdir / f"{vid}.json").read_text())
        text, desc = sheet["reference_text"], sheet["description"]
        # Costed on both texts in case the host counts the description too; rounded up to 1000 characters.
        chars = max(1000, len(text) + len(desc))
        cost = round(chars / 1000 * price, 4)
        if ledger["spent_usd"] + cost > args.cap:
            print(f"{vid}: refused, would pass the ${args.cap} cap (spent ${ledger['spent_usd']:.4f})")
            continue
        ledger["spent_usd"] = round(ledger["spent_usd"] + cost, 4)
        ledger["calls"].append({"voice": vid, "endpoint": ENDPOINT, "cost_usd": cost, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
        ledger_path.write_text(json.dumps(ledger, indent=2) + "\n")
        body = {"text": text, "prompt": desc, "language": sheet.get("language", "English"), **SETTINGS}
        res, headers = F.call(ENDPOINT, body, key)
        raw = out / f"{vid}.ref.download"
        subprocess.run(["curl", "-sS", "--fail", "-o", str(raw), res["audio"]["url"]], check=True, timeout=300)
        wav = out / f"{vid}.ref.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-ac", "1", str(wav)], check=True)
        raw.unlink()
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(wav)],
                                   capture_output=True, text=True, check=True).stdout)
        rec = {
            "voice": vid, "character": sheet["character"], "placeholder": sheet.get("description_by") != "owner",
            "model": MODEL_ID, "weights": model["weights"], "license": model["license"], "host": "fal.ai", "endpoint": ENDPOINT,
            "weights_revision": "not exposed by the host; the endpoint as served on the date below",
            "request_id": headers.get("x-fal-request-id") or res.get("request_id"),
            "served_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "description": desc, "description_by": sheet.get("description_by"), "text": text, "language": body["language"],
            "settings": SETTINGS, "safety_checker": "host default (on)",
            "price_usd_per_1000_chars": price, "price_seen": model["hosted"]["price_seen"], "cost_usd": cost,
            "cost_basis": "description + text characters, at least 1000, times the listed price",
            "file": str(wav.relative_to(ROOT)), "sha256": sha256(wav), "duration_s": round(dur, 2),
        }
        (vdir / f"{vid}.recipe.json").write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")
        print(f"{vid}: {wav.relative_to(ROOT)} ({dur:.1f} s), ${cost}")
    print(f"spent ${ledger['spent_usd']:.4f} of ${args.cap} on {args.seed}'s voices")


if __name__ == "__main__":
    main()
