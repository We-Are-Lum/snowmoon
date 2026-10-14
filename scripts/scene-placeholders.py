"""Placeholder stems for testing a scene's timeline, mixer and render before real audio exists.

Nothing made here is ever published. Voice lines are Kokoro (on the allowlist, local) reading
placeholder text that says it is a placeholder, never a script line. Ambience beds and Foley cues
are synthesised in code (filtered noise, tones, clicks): no recordings, no downloads, no cost.

Reads adaptations/<seed>/timeline.json and makes one stem for every cue whose `placeholder` field
describes it:
  {"kind": "voice", "text": "...", "voice": "am_michael", "speed": 1.0}
  {"kind": "bed", "sound": "hum" | "wind" | "room", "seconds": 40}
  {"kind": "foley", "sound": "click" | "whoosh" | "chime" | "thud"}
Writes scenes-out/<seed>/stems/<cue id>.wav (gitignored), mono, 24 kHz, 16-bit.

  /Users/nathan/snowmoon-summary/.venv/bin/python scripts/scene-placeholders.py dog-dawn
  (any environment with kokoro, numpy and soundfile)
"""

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
SR = 24000
rng = np.random.default_rng(7)


def narrate_module():
    spec = importlib.util.spec_from_file_location("narrate", ROOT / "scripts" / "narrate.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def fade(x: np.ndarray, s: float = 0.02) -> np.ndarray:
    n = min(int(s * SR), len(x) // 2)
    if n:
        ramp = np.linspace(0, 1, n, dtype=np.float32)
        x[:n] *= ramp
        x[-n:] *= ramp[::-1]
    return x


def lowpass(x: np.ndarray, a: float) -> np.ndarray:
    """One-pole low-pass; a near 1 is darker."""
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = a * acc + (1 - a) * v
        y[i] = acc
    return y


def bed(sound: str, seconds: float) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n).astype(np.float32)
    if sound == "hum":  # a cold room: mains-like hum, faint air
        x = 0.25 * np.sin(2 * np.pi * 55 * t) + 0.12 * np.sin(2 * np.pi * 110 * t) + 0.15 * lowpass(noise, 0.97)
    elif sound == "wind":  # wind in trees: dark noise with slow swells
        x = lowpass(noise, 0.985) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.11 * t) * np.sin(2 * np.pi * 0.037 * t + 1))
        x *= 4
    else:  # room tone
        x = 0.5 * lowpass(noise, 0.99)
    return fade((x / (np.abs(x).max() + 1e-9) * 0.5).astype(np.float32), 0.5)


def foley(sound: str) -> np.ndarray:
    if sound == "click":
        n = int(0.06 * SR)
        x = rng.standard_normal(n) * np.exp(-np.arange(n) / (0.006 * SR))
    elif sound == "whoosh":
        n = int(1.2 * SR)
        env = np.sin(np.linspace(0, np.pi, n)) ** 2
        x = lowpass(rng.standard_normal(n).astype(np.float32), 0.9) * env * 6
    elif sound == "chime":
        n = int(1.5 * SR)
        t = np.arange(n) / SR
        x = (np.sin(2 * np.pi * 880 * t) + 0.5 * np.sin(2 * np.pi * 1320 * t)) * np.exp(-t * 3)
    else:  # thud
        n = int(0.5 * SR)
        t = np.arange(n) / SR
        x = np.sin(2 * np.pi * 70 * t * (1 - t)) * np.exp(-t * 12)
    x = np.asarray(x, dtype=np.float32)
    return fade(x / (np.abs(x).max() + 1e-9) * 0.8, 0.005)


def main() -> None:
    seed = sys.argv[1]
    timeline = json.loads((ROOT / "adaptations" / seed / "timeline.json").read_text())
    out = ROOT / "scenes-out" / seed / "stems"
    out.mkdir(parents=True, exist_ok=True)
    cues = [c for c in timeline["cues"] if c.get("placeholder")]

    voices = [c for c in cues if c["placeholder"]["kind"] == "voice"]
    if voices:
        N = narrate_module()
        from huggingface_hub import hf_hub_download
        from kokoro import KModel, KPipeline
        import torch

        model_path = hf_hub_download(N.MODEL_REPO, "kokoro-v1_0.pth", revision=N.MODEL_REVISION)
        config_path = hf_hub_download(N.MODEL_REPO, "config.json", revision=N.MODEL_REVISION)
        model = KModel(repo_id=N.MODEL_REPO, config=config_path, model=model_path).to("cpu").eval()
        pipelines, packs = {}, {}
        for c in voices:
            p = c["placeholder"]
            v = p.get("voice", "am_michael")
            if v not in packs:
                packs[v] = torch.load(hf_hub_download(N.MODEL_REPO, f"voices/{v}.pt", revision=N.MODEL_REVISION), weights_only=True)
                pipelines.setdefault(v[0], KPipeline(lang_code=v[0], repo_id=N.MODEL_REPO, model=model))
            chunks = [r.audio.numpy() for r in pipelines[v[0]](p["text"], voice=packs[v], speed=p.get("speed", 1.0)) if r.audio is not None]
            sf.write(out / f"{c['id']}.wav", np.concatenate(chunks).astype(np.float32), SR, subtype="PCM_16")
            print(f"voice {c['id']}: {p['text']}")

    for c in cues:
        p = c["placeholder"]
        if p["kind"] == "bed":
            sf.write(out / f"{c['id']}.wav", bed(p["sound"], p.get("seconds", 30)), SR, subtype="PCM_16")
        elif p["kind"] == "foley":
            sf.write(out / f"{c['id']}.wav", foley(p["sound"]), SR, subtype="PCM_16")
        else:
            continue
        print(f"{p['kind']} {c['id']}: {p['sound']}")
    print(f"{len(cues)} placeholder stems in {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
