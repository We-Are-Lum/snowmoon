"""Narrate the spoken summary (content/snowmoon/recipes/summary/summary-35min.json).

Same model, voice and settings as the chapter narration (scripts/narrate.py, whose
normalize() and apply_pronunciation() are used as they are, with
content/snowmoon/pronunciation.json). Refuses to run while the recipe's checks
leave any unsupported claim. Writes a WAV and an MP3 (mono, 128 kbps, loudness
-16 LUFS like the podcast) to summary-out/, never to the site, the feed or the
media bucket, and adds the narration recipe and the files' sha256 to the
summary's recipe.

  .venv/bin/python scripts/narrate-summary.py
"""

import json
import platform
import subprocess
import sys
import time
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import narrate as N  # noqa: E402

ROOT = N.ROOT
RECIPE = ROOT / "content/snowmoon/recipes/summary/summary-35min.json"
OUT = ROOT / "summary-out"
VOICE, LANG, SPEED = "af_heart", "a", 1.0
GAP_AFTER_OPENING_MS = N.GAP_AFTER["heading"]
GAP_AFTER_PARAGRAPH_MS = N.GAP_AFTER["paragraph"]
LOUDNORM = "loudnorm=I=-16:TP=-1:LRA=11"
# Summary-only pronunciation overrides (owner, 2026-10-10): content/snowmoon/pronunciation.json is
# left alone; these are added on top of it for this narration only, and recorded in its recipe.
SUMMARY_OVERRIDES = [
    {"word": "Vitalik", "respelling": "vi-TAH-lik", "phonemes": "vɪtˈɑlɪk", "override": True, "match_case": True,
     "why": "the author's first name, only in the summary's spoken opening; the default reading was VY-ta-lik"},
]


def main():
    recipe = json.loads(RECIPE.read_text())
    left = recipe["checks"]["unsupported_left"]
    if left != 0:
        sys.exit(f"the checks leave {left} unsupported claim(s); nothing narrated")
    pron = json.loads((N.CONTENT / "pronunciation.json").read_text())["entries"] + SUMMARY_OVERRIDES
    items = [("opening", recipe["script"]["opening"])] + [(f"p{p['n']}", p["text"]) for p in recipe["script"]["paragraphs"]]

    from huggingface_hub import hf_hub_download
    from kokoro import KModel, KPipeline
    import torch

    model_path = hf_hub_download(N.MODEL_REPO, "kokoro-v1_0.pth", revision=N.MODEL_REVISION)
    config_path = hf_hub_download(N.MODEL_REPO, "config.json", revision=N.MODEL_REVISION)
    voice_path = hf_hub_download(N.MODEL_REPO, f"voices/{VOICE}.pt", revision=N.MODEL_REVISION)
    model = KModel(repo_id=N.MODEL_REPO, config=config_path, model=model_path).to("cpu").eval()
    pipeline = KPipeline(lang_code=LANG, repo_id=N.MODEL_REPO, model=model)
    voice = torch.load(voice_path, weights_only=True)

    OUT.mkdir(exist_ok=True)
    started = time.time()
    entries, samples, cursor = [], [], 0
    for i, (key, text) in enumerate(items):
        spoken = N.normalize({"kind": "paragraph", "content": text})
        sent = N.apply_pronunciation(spoken, pron)
        t0 = time.time()
        audio = np.concatenate([r.audio.numpy() for r in pipeline(sent, voice=voice, speed=SPEED) if r.audio is not None]).astype(np.float32)
        gap = GAP_AFTER_OPENING_MS if key == "opening" else GAP_AFTER_PARAGRAPH_MS
        dur = round(len(audio) * 1000 / N.SAMPLE_RATE)
        entries.append({"item": key, "text": text, "sent": sent, "start_ms": cursor, "duration_ms": dur, "gap_after_ms": gap, "generation_s": round(time.time() - t0, 2)})
        samples += [audio, np.zeros(int(N.SAMPLE_RATE * gap / 1000), np.float32)]
        cursor += dur + gap
        print(f"  {key:8s} {dur/1000:6.1f}s audio")
    elapsed = time.time() - started

    wav = OUT / "summary-35min.wav"
    sf.write(wav, np.concatenate(samples), N.SAMPLE_RATE, subtype="PCM_16")
    # Two-pass loudness, as the podcast does: measure, then encode with the measured values.
    probe = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(wav), "-af", LOUDNORM + ":print_format=json", "-f", "null", "-"], capture_output=True, text=True)
    m = json.loads(probe.stderr[probe.stderr.rindex("{"):probe.stderr.rindex("}") + 1])
    af = f"{LOUDNORM}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
    mp3 = OUT / "summary-35min.mp3"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af", af, "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k",
           "-id3v2_version", "3", "-write_xing", "1",
           "-metadata", "title=Snowmoon: a spoken summary (written by an AI model)",
           "-metadata", "artist=Snowmoon Party",
           "-metadata", "comment=Summary written by gpt-oss-120b, not by the author; read by an AI voice (Kokoro-82M, af_heart). Independent; not affiliated with the author.",
           str(mp3)]
    subprocess.run(cmd, check=True)
    mp3_ms = round(float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)], capture_output=True, text=True).stdout) * 1000)

    recipe["narration"] = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generation_seconds": round(elapsed, 1),
        "runs_on": "local-queue (the owner's Mac; config/models.json)",
        "model": {
            "name": "Kokoro-82M", "repo": N.MODEL_REPO, "revision": N.MODEL_REVISION, "weights_file": "kokoro-v1_0.pth",
            "weights_sha256": N.sha256_file(model_path), "license": "apache-2.0",
            "kokoro_version": version("kokoro"), "misaki_version": version("misaki"), "torch_version": version("torch"),
        },
        "voice": {"name": VOICE, "file_sha256": N.sha256_file(voice_path), "stock": True},
        "settings": {
            "lang_code": LANG, "speed": SPEED, "sample_rate": N.SAMPLE_RATE, "device": "cpu",
            "gap_after_ms": {"opening": GAP_AFTER_OPENING_MS, "paragraph": GAP_AFTER_PARAGRAPH_MS},
            "text": "scripts/narrate.py normalize() and apply_pronunciation(), unchanged",
            "pronunciation_sha256": N.sha256_file(N.CONTENT / "pronunciation.json"),
            "summary_pronunciation_overrides": SUMMARY_OVERRIDES,
            "narrate_py_sha256": N.sha256_file(ROOT / "scripts/narrate.py"),
        },
        "host": {"platform": platform.platform(), "machine": platform.machine(), "python": platform.python_version()},
        "paragraphs": entries,
        "encoder": {"tool": subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.split("\n")[0], "codec": "libmp3lame",
                    "bitrate": "128k", "channels": 1, "sample_rate": 44100, "loudness": m, "command": " ".join(cmd)},
        "files": {
            "wav": {"name": wav.name, "sha256": N.sha256_file(wav), "duration_ms": cursor},
            "mp3": {"name": mp3.name, "sha256": N.sha256_file(mp3), "bytes": mp3.stat().st_size, "duration_ms": mp3_ms, "channels": 1, "sample_rate": 44100, "bitrate": "128k"},
            "where": "summary-out/ on the owner's Mac only; not on the site, in the podcast feed or in the media bucket",
        },
    }
    RECIPE.write_text(json.dumps(recipe, indent=2, ensure_ascii=False) + "\n")
    print(f"{mp3_ms/60000:.1f} min -> {mp3}")


if __name__ == "__main__":
    main()
