"""Narrate an adaptation's script: the lines people wrote (or chose from the book), one file per beat.

Reads adaptations/<seed>/script.md (docs/adaptation-format.md). Only lines with
a human author tag are spoken: `by FID <n> on <date>` or `book c<ch>-b<idx>`.
It refuses a line without one, and a beat whose narration is over 25 words
(principle 2). Dialogue is read by the same narrator in stage 1, without the
speaker's name.

The voice is a stock Kokoro voice other than the house narrator's, from the
same pinned model (Apache-2.0, repository-wide, including the voice files).
Pronunciation, including the Dzegoban rule, comes from
content/snowmoon/pronunciation.json, as in the house narration.

  .venv/bin/python scripts/narrate-adaptation.py dog-dawn --voice am_michael --check   plan only: print what will be said
  .venv/bin/python scripts/narrate-adaptation.py dog-dawn --voice am_michael

Writes images-out/adaptation-<seed>/narration/beat-NN.wav (gitignored) and the
recipe adaptations/<seed>/narration/recipe.json: model and revision, voice and
its file sha256, the licence check, each line with its author tag, the exact
text sent (with pronunciation markup), each file's duration and sha256.
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import narrate as N  # noqa: E402  (pronunciation, model pins, hashing)

ROOT = N.ROOT
BOOK_TAG = re.compile(r"^book (c\d+-b\d+)$")
PERSON_TAG = re.compile(r"^by FID (\d+) on (\d{4}-\d{2}-\d{2})$")
FIELD = re.compile(r"^- \*\*([a-z ]+):\*\*\s*(.*)$")
ITEM = re.compile(r"^\s+- (?:`([^`]+)`\s*)?(.*)$")
NOTE = re.compile(r"\s*\*\([^)]*\)\*\s*$")
EMPTY = "*(empty until a person writes it)*"
MAX_WORDS = 25
GAP_MS = 450  # between lines within a beat


def beats(markdown: str):
    out, beat, field = [], None, ""
    for raw in markdown.split("\n"):
        h = re.match(r"^## Beat (\d+) · (.+)$", raw)
        if h:
            beat = {"n": int(h[1]), "title": h[2], "narration": [], "dialogue": [], "inline": []}
            out.append(beat)
            field = ""
            continue
        if not beat:
            continue
        if re.match(r"^(---|## )", raw):
            field = ""
            continue
        f = FIELD.match(raw)
        if f:
            field = f[1]
            rest = f[2].strip()
            if field in ("narration", "dialogue") and rest and rest != EMPTY:
                beat["inline"].append(rest)
            continue
        it = ITEM.match(raw)
        if it and field in ("narration", "dialogue"):
            beat[field].append({"tag": it[1], "text": NOTE.sub("", it[2]).strip()})
    return out


def plan(seed: str):
    md = (ROOT / "adaptations" / seed / "script.md").read_text()
    problems, planned = [], []
    for b in beats(md):
        for t in b["inline"]:
            problems.append(f"beat {b['n']}: a line written on the field line has no author tag: {t[:50]}")
        lines = []
        for kind in ("narration", "dialogue"):
            for l in b[kind]:
                tag = l["tag"] or ""
                if not (BOOK_TAG.match(tag) or PERSON_TAG.match(tag)):
                    problems.append(f"beat {b['n']}: {kind} line has no human author tag: {l['text'][:50]}")
                    continue
                spoken = re.sub(r"^[^:]{1,40}:\s*", "", l["text"]) if kind == "dialogue" else l["text"]
                lines.append({"kind": kind, "tag": tag, "text": l["text"], "spoken": spoken})
        words = sum(len(l["text"].split()) for l in lines if l["kind"] == "narration")
        if words > MAX_WORDS:
            problems.append(f"beat {b['n']}: narration is {words} words (max {MAX_WORDS})")
        planned.append({"beat": b["n"], "title": b["title"], "lines": lines, "narration_words": words})
    return planned, problems


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("--voice", required=True)
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.voice == "af_heart":
        sys.exit("af_heart is the house narrator; an adaptation uses a different voice")
    planned, problems = plan(args.seed)
    for p in planned:
        for l in p["lines"]:
            l["sent"] = N.apply_pronunciation(l["spoken"], N.PRONUNCIATION)
    if problems:
        sys.exit("refused:\n  " + "\n  ".join(problems))
    for p in planned:
        print(f"beat {p['beat']} ({p['narration_words']} words): " + (" / ".join(f"[{l['tag']}] {l['sent']}" for l in p["lines"]) or "(no lines yet)"))
    if args.check:
        return
    if not any(p["lines"] for p in planned):
        sys.exit("no lines written yet; nothing to narrate")

    from huggingface_hub import hf_hub_download
    from kokoro import KModel, KPipeline
    import torch

    model_path = hf_hub_download(N.MODEL_REPO, "kokoro-v1_0.pth", revision=N.MODEL_REVISION)
    config_path = hf_hub_download(N.MODEL_REPO, "config.json", revision=N.MODEL_REVISION)
    voice_path = hf_hub_download(N.MODEL_REPO, f"voices/{args.voice}.pt", revision=N.MODEL_REVISION)
    model = KModel(repo_id=N.MODEL_REPO, config=config_path, model=model_path).to("cpu").eval()
    pipeline = KPipeline(lang_code=args.voice[0], repo_id=N.MODEL_REPO, model=model)
    voice = torch.load(voice_path, weights_only=True)

    out_dir = ROOT / "images-out" / f"adaptation-{args.seed}" / "narration"
    out_dir.mkdir(parents=True, exist_ok=True)
    gap = np.zeros(int(N.SAMPLE_RATE * GAP_MS / 1000), dtype=np.float32)
    files = []
    for p in planned:
        if not p["lines"]:
            continue
        parts = []
        for i, l in enumerate(p["lines"]):
            chunks = [r.audio.numpy() for r in pipeline(l["sent"], voice=voice, speed=args.speed) if r.audio is not None]
            parts += ([gap] if i else []) + [np.concatenate(chunks).astype(np.float32)]
        audio = np.concatenate(parts)
        path = out_dir / f"beat-{p['beat']:02d}.wav"
        sf.write(path, audio, N.SAMPLE_RATE, subtype="PCM_16")
        files.append({"beat": p["beat"], "file": str(path.relative_to(ROOT)), "sha256": N.sha256_file(path),
                      "duration_ms": round(len(audio) * 1000 / N.SAMPLE_RATE), "lines": p["lines"]})
        print(f"beat {p['beat']}: {files[-1]['duration_ms']} ms -> {path.name}")

    recipe = {
        "about": "Narration of the dog-dawn adaptation: only lines a person wrote or chose from the book, spoken by a stock voice other than the house narrator's.",
        "model": {"name": "Kokoro-82M", "repo": N.MODEL_REPO, "revision": N.MODEL_REVISION, "weights_file": "kokoro-v1_0.pth",
                  "weights_sha256": N.sha256_file(model_path), "license": "apache-2.0",
                  "kokoro_version": version("kokoro"), "misaki_version": version("misaki"), "torch_version": version("torch")},
        "voice": {"name": args.voice, "file_sha256": N.sha256_file(voice_path), "stock": True, "clone_of_a_real_person": False},
        "voice_license_check": {
            "checked_on": datetime.now(timezone.utc).date().isoformat(),
            "license": "Apache-2.0, repository-wide (model card: 'license: apache-2.0'); voice files carry no separate licence",
            "source": f"https://huggingface.co/{N.MODEL_REPO}/blob/{N.MODEL_REVISION}/VOICES.md",
            "note": "VOICES.md marks CC BY attribution only for some Japanese and French voices; English voices have none. Voice provenance is undocumented, as for the house voice.",
        },
        "settings": {"speed": args.speed, "sample_rate": N.SAMPLE_RATE, "gap_between_lines_ms": GAP_MS,
                     "pronunciation_sha256": N.sha256_file(N.CONTENT / "pronunciation.json")},
        "script": f"adaptations/{args.seed}/script.md",
        "script_sha256": N.sha256_file(ROOT / "adaptations" / args.seed / "script.md"),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "cost_usd": 0,
        "beats": files,
        "assist": None,
    }
    rec_dir = ROOT / "adaptations" / args.seed / "narration"
    rec_dir.mkdir(parents=True, exist_ok=True)
    (rec_dir / "recipe.json").write_text(json.dumps(recipe, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
