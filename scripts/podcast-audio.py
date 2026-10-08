"""Make the podcast's MP3s: the spoken opener, then each stitched chapter.

The opener is the owner's text (config/podcast.json, words.spoken_opener),
spoken by the same model, revision and voice as the house narration (Kokoro-82M,
stock voice af_heart), through the same pronunciation step. Each episode is the
opener, a short silence, and the chapter's stitched WAV from scripts/narrate.py,
encoded once with ffmpeg to MP3, mono, 128 kbps constant bitrate, resampled
from the narration's 24 kHz to 44.1 kHz (MPEG-1 Layer III, which every player takes). Nothing is
sent anywhere; scripts/publish-podcast.ts uploads the files.

Writes narration-out/podcast/ (opener.wav, chapter-N.mp3) and one recipe per
file in content/snowmoon/recipes/podcast/ (opener.json, chapter-N.json): the
exact inputs by sha256, the text spoken, the encoder and its full command, and
the output's sha256, size and duration.

  .venv/bin/python scripts/podcast-audio.py              all 32 chapters
  .venv/bin/python scripts/podcast-audio.py --chapter 3  one chapter
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import narrate  # noqa: E402  the house narration's model pin, pronunciation and helpers

ROOT = narrate.ROOT
CONFIG = json.loads((ROOT / "config" / "podcast.json").read_text())
OUT = ROOT / "narration-out" / "podcast"
RECIPES = ROOT / "content" / narrate.WORK / "recipes" / "podcast"
NARRATION_RECIPES = ROOT / "content" / narrate.WORK / "recipes" / "narration"
VOICE = "af_heart"
# The opener's words are the owner's; only the pronunciation list it passes through was model-drafted.
OPENER_ASSIST = {
    "model": "claude-coding-agent",
    "by": "the coding agent and its helper agents",
    "drafted": ["pronunciation entries (content/snowmoon/pronunciation.json) applied to the opener"],
    "instructions": ["docs/prompts/008a-agent-prompts.md#read-aloud-descriptions-and-invented-word-lists"],
    "see": "config/models.json drafting; principle 3",
}


def ffmpeg_version():
    first = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.splitlines()[0]
    return first.split(" Copyright")[0]


def render_opener():
    """Speak the owner's opener with the house model and voice; returns (path, recipe)."""
    text = CONFIG["words"]["spoken_opener"]
    pron = json.loads((narrate.CONTENT / "pronunciation.json").read_text())["entries"]
    spoken = narrate.apply_pronunciation(text, pron)

    from huggingface_hub import hf_hub_download
    from kokoro import KModel, KPipeline
    import torch

    model_path = hf_hub_download(narrate.MODEL_REPO, "kokoro-v1_0.pth", revision=narrate.MODEL_REVISION)
    config_path = hf_hub_download(narrate.MODEL_REPO, "config.json", revision=narrate.MODEL_REVISION)
    voice_path = hf_hub_download(narrate.MODEL_REPO, f"voices/{VOICE}.pt", revision=narrate.MODEL_REVISION)
    model = KModel(repo_id=narrate.MODEL_REPO, config=config_path, model=model_path).to("cpu").eval()
    pipeline = KPipeline(lang_code="a", repo_id=narrate.MODEL_REPO, model=model)
    voice = torch.load(voice_path, weights_only=True)
    chunks = [r.audio.numpy() for r in pipeline(spoken, voice=voice, speed=1.0) if r.audio is not None]
    audio = np.concatenate(chunks).astype(np.float32)

    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "opener.wav"
    sf.write(path, audio, narrate.SAMPLE_RATE, subtype="PCM_16")
    recipe = {
        "work_id": narrate.WORK,
        "what": "The podcast's spoken opener, played at the start of every episode.",
        "text": text,
        "text_by": f"{CONFIG['words']['by']}, {CONFIG['words']['date']} (config/podcast.json)",
        "spoken_text": spoken,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": {
            "name": "Kokoro-82M",
            "repo": narrate.MODEL_REPO,
            "revision": narrate.MODEL_REVISION,
            "weights_sha256": narrate.sha256_file(model_path),
            "license": "apache-2.0",
            "kokoro_version": version("kokoro"),
            "misaki_version": version("misaki"),
        },
        "voice": {"name": VOICE, "file_sha256": narrate.sha256_file(voice_path), "stock": True},
        "settings": {"lang_code": "a", "speed": 1.0, "sample_rate": narrate.SAMPLE_RATE, "device": "cpu"},
        "file": {"name": "opener.wav", "sha256": narrate.sha256_file(path), "duration_ms": round(len(audio) * 1000 / narrate.SAMPLE_RATE)},
        "assist": OPENER_ASSIST,
    }
    RECIPES.mkdir(parents=True, exist_ok=True)
    (RECIPES / "opener.json").write_text(json.dumps(recipe, indent=2, ensure_ascii=False) + "\n")
    return path, recipe


def loudness_pass1(path):
    """ffmpeg loudnorm, first pass: the measured values the second pass needs."""
    t = CONFIG["audio"]["loudness"]
    err = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af",
         f"loudnorm=I={t['integrated_lufs']}:TP={t['true_peak_db']}:LRA={t['lra']}:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True, check=True).stderr
    return json.loads(err[err.rindex("{"):err.rindex("}") + 1])


def measure(path):
    """Integrated loudness (LUFS) and true peak (dBTP) of a finished file, by ebur128."""
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True, check=True).stderr
    summary = err[err.rindex("Summary:"):]
    i = float(summary.split("I:")[1].split("LUFS")[0])
    tp = float(summary.split("Peak:")[1].split("dBFS")[0])
    return {"integrated_lufs": i, "true_peak_dbtp": tp}


def episode(n, opener_path, opener_recipe):
    narration = json.loads((NARRATION_RECIPES / f"chapter-{n}.json").read_text())
    stitched = ROOT / "narration-out" / f"chapter-{n}" / narration["stitched"]["wav"]
    if narrate.sha256_file(stitched) != narration["stitched"]["wav_sha256"]:
        sys.exit(f"chapter {n}: {stitched} does not match its narration recipe")
    opener, sr1 = sf.read(opener_path, dtype="int16")
    chapter, sr2 = sf.read(stitched, dtype="int16")
    if sr1 != sr2 or chapter.ndim != 1:
        sys.exit(f"chapter {n}: expected mono {sr1} Hz, got {sr2} Hz, {chapter.ndim} channel(s)")
    gap = np.zeros(round(CONFIG["audio"]["opener_gap_ms"] * sr1 / 1000), dtype=np.int16)
    joined = OUT / f"chapter-{n}.wav"
    sf.write(joined, np.concatenate([opener, gap, chapter]), sr1, subtype="PCM_16")

    mp3 = OUT / f"chapter-{n}.mp3"
    title = f"Chapter {n}"
    # Two-pass loudness normalisation (owner, 2026-10-08): -16 LUFS, true peak -1 dB.
    t = CONFIG["audio"]["loudness"]
    m = loudness_pass1(joined)
    norm = (f"loudnorm=I={t['integrated_lufs']}:TP={t['true_peak_db']}:LRA={t['lra']}"
            f":measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
            f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(joined),
        "-af", norm,
        "-ac", "1", "-ar", str(CONFIG["audio"]["sample_rate"]), "-c:a", "libmp3lame", "-b:a", CONFIG["audio"]["bitrate"],
        "-id3v2_version", "3", "-write_xing", "1",
        "-metadata", f"title={title}",
        "-metadata", f"album={CONFIG['words']['show_title']}",
        "-metadata", "artist=Snowmoon Party",
        "-metadata", f"track={n}/32",
        "-metadata", "genre=Audiobook",
        "-metadata", "copyright=GPL-3.0. Text: Snowmoon by Vitalik Buterin. Synthetic voice: Kokoro-82M, af_heart.",
        "-metadata", "comment=Independent reading, not affiliated with the author. https://snowmoon.party",
        str(mp3),
    ]
    subprocess.run(cmd, check=True)
    probe = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration,bit_rate:stream=channels,sample_rate", "-of", "json", str(mp3)],
        capture_output=True, text=True, check=True).stdout)
    joined.unlink()
    after = measure(mp3)
    recipe = {
        "work_id": narrate.WORK,
        "chapter": n,
        "what": "A podcast episode: the spoken opener, a short silence, then the chapter's house narration, encoded to MP3.",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "inputs": {
            "opener": {"recipe": "content/snowmoon/recipes/podcast/opener.json", "sha256": opener_recipe["file"]["sha256"]},
            "gap_ms": CONFIG["audio"]["opener_gap_ms"],
            "chapter": {
                "recipe": f"content/snowmoon/recipes/narration/chapter-{n}.json",
                "file": narration["stitched"]["wav"],
                "sha256": narration["stitched"]["wav_sha256"],
                "model": "Kokoro-82M", "voice": "af_heart",
            },
        },
        # The chapter's narration says which of its inputs a model drafted; the opener's words are the owner's.
        "assist": {**narration["assist"], "opener": "the owner's words (config/podcast.json); its pronunciation entries as in opener.json"} if narration.get("assist") else None,
        "loudness": {
            "target": {"integrated_lufs": t["integrated_lufs"], "true_peak_db": t["true_peak_db"], "lra": t["lra"]},
            "method": "ffmpeg loudnorm, two passes; the second uses the first pass's measurements (linear=true)",
            "before": {"integrated_lufs": float(m["input_i"]), "true_peak_dbtp": float(m["input_tp"]), "lra": float(m["input_lra"])},
            "first_pass": m,
            "after_mp3": after,
        },
        "encoder": {"tool": ffmpeg_version(), "codec": "libmp3lame", "bitrate": CONFIG["audio"]["bitrate"], "channels": 1, "sample_rate": CONFIG["audio"]["sample_rate"],
                    "command": " ".join(c if " " not in c else repr(c) for c in cmd[:-1]) + " chapter-N.mp3"},
        "file": {
            "name": f"chapter-{n}.mp3",
            "sha256": narrate.sha256_file(mp3),
            "bytes": mp3.stat().st_size,
            "duration_ms": round(float(probe["format"]["duration"]) * 1000),
            "channels": probe["streams"][0]["channels"],
            "sample_rate": int(probe["streams"][0]["sample_rate"]),
        },
    }
    (RECIPES / f"chapter-{n}.json").write_text(json.dumps(recipe, indent=2, ensure_ascii=False) + "\n")
    print(f"chapter {n}: {recipe['file']['bytes'] / 1e6:.1f} MB, {recipe['file']['duration_ms'] / 60000:.1f} min")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chapter", help="one chapter; all 32 if left out")
    ap.add_argument("--new-opener", action="store_true", help="speak the opener again even if opener.wav matches its recipe")
    args = ap.parse_args()
    opener_path = OUT / "opener.wav"
    opener_recipe = json.loads((RECIPES / "opener.json").read_text()) if (RECIPES / "opener.json").exists() else None
    if args.new_opener or not opener_recipe or not opener_path.exists() or narrate.sha256_file(opener_path) != opener_recipe["file"]["sha256"]:
        opener_path, opener_recipe = render_opener()
    print(f"opener: {opener_recipe['file']['duration_ms'] / 1000:.1f} s")
    for n in [int(args.chapter)] if args.chapter else range(1, 33):
        episode(n, opener_path, opener_recipe)


if __name__ == "__main__":
    main()
