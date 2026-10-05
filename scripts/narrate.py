"""Narrate one chapter with Kokoro, a local open-weights speech model.

Reads the committed chapter JSON and writes one WAV per readable block, one
stitched file for the whole chapter, and a manifest. Nothing is sent to a
hosted API and nothing is written to the database. Each chapter's recipe (model,
revision, voice, settings, the exact text sent for every block, durations and
sha256 of every file) is also written to content/snowmoon/recipes/narration/.

  screen/figure  spoken from content/snowmoon/read-aloud/chapter-N.json; a block
  and dz-cards   with no override (or whose sha256 changed) is skipped, never
                 read cell by cell
  break          a short silence, no file
  everything     invented words are forced from content/snowmoon/pronunciation.json;
                 Dzegoban is spelled out by one rule (dzegoban_phonemes) so every
                 word in the language sounds consistent. In read-aloud text,
                 Dzegoban is marked with braces: {zui fia kun zun}.

Setup (once):
  uv venv --python 3.12 .venv
  uv pip install --python .venv -r scripts/narrate.requirements.txt
  brew install espeak-ng ffmpeg

Run:
  .venv/bin/python scripts/narrate.py --chapter 1
  .venv/bin/python scripts/narrate.py --chapter 2-32
"""

import argparse
import hashlib
import json
import platform
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
WORK = "snowmoon"
CONTENT = ROOT / "content" / WORK

MODEL_REPO = "hexgrad/Kokoro-82M"
# Pinned so the recipe is reproducible; this is the revision whose cards were checked.
MODEL_REVISION = "f3ff3571791e39611d31c381e3a41a3af07b4987"
SAMPLE_RATE = 24000

# Silence, in ms, placed after a block of each kind in the stitched file.
GAP_AFTER = {"heading": 900, "dateline": 900, "paragraph": 450, "quote": 600, "screen": 600, "figure": 600}
BREAK_MS = 1800
# Before every spoken description (a screen, figure or lyric card read from
# content/snowmoon/read-aloud/), the stitched chapter plays a short tone made in
# code, so a listener can tell the description is not the author's words.
DESCRIPTION_TONE = {"notes_hz": [660, 990], "notes_ms": [110, 140], "between_ms": 40, "after_ms": 220, "amplitude": 0.12, "made_by": "code (numpy sine, linear fades)"}
ACRONYMS = {"AI", "XOR", "GPH", "DU", "API", "UVC", "VNU", "KAG", "PM", "AM", "LLM", "TV", "ID", "OK", "I", "A"}


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# Dzegoban spelling to misaki phonemes. Romanization looks pinyin-like; the book
# gives no pronunciation, so this is a house choice (see pronunciation.json).
DZ_ONSETS = {"dz": "dz", "sh": "ʃ", "ch": "ʧ", "zh": "ʒ", "j": "ʤ", "c": "ts", "g": "ɡ",
             "y": "j", "r": "ɹ", "x": "ʃ"}
DZ_NUCLEI = {"ai": "I", "au": "W", "ei": "A", "ia": "jɑ", "ie": "jɛ", "iu": "ju", "ui": "wi",
             "ua": "wɑ", "uo": "wO", "ou": "O", "a": "ɑ", "e": "ɛ", "i": "i", "o": "O", "u": "u"}
DZ_SYLLABLE = re.compile(r"(dz|sh|ch|zh|[bcdfghjklmnprstvwxyz])?(ai|au|ei|ia|ie|iu|ui|ua|uo|ou|[aeiou])(n(?![aeiou]))?")


def dzegoban_phonemes(word):
    """One Dzegoban word to phonemes, stress on the first syllable."""
    w, out, pos = word.lower(), [], 0
    while pos < len(w):
        m = DZ_SYLLABLE.match(w, pos)
        if not m:
            raise ValueError(f"not Dzegoban: {word!r}")
        onset, nucleus, coda = m.groups()
        v = DZ_NUCLEI[nucleus]
        if coda:
            v = ("ɪ" if v == "i" else v) + "n"
        out.append(DZ_ONSETS.get(onset, onset or "") + v)
        pos = m.end()
    return "ˈ" + "".join(out)


def is_dzegoban(phrase):
    words = re.findall(r"[A-Za-z]+", phrase)
    if not words or re.search(r"[^A-Za-z\s.,!?'’-]", phrase):
        return False
    try:
        for w in words:
            dzegoban_phonemes(w)
    except ValueError:
        return False
    return True


def dz_markup(phrase):
    return " ".join(f"[{w}](/{dzegoban_phonemes(w)}/)" for w in phrase.split())


def sentence_case(line):
    """Lyrics are set in capitals; spoken as capitals, words like OUR get spelled out."""
    letters = [c for c in line if c.isalpha()]
    if letters and all(c.isupper() for c in letters):
        line = line.lower()
        line = line[:1].upper() + line[1:]
    return line


PRONUNCIATION = json.loads((CONTENT / "pronunciation.json").read_text())["entries"]
DZ_SINGLES = {e["word"] for e in PRONUNCIATION if e.get("rule") == "dzegoban" and " " not in e["word"]}
PROPER = {e["word"] for e in PRONUNCIATION if e["word"][:1].isupper()} | {"Lily", "Arctic", "Arctics", "Emerald", "Glad", "Order"}


def normalize(block):
    """Turn a block's Markdown into plain text for speech. Source text is never modified."""
    t = block["content"]
    t = re.sub(r"</?span[^>]*>", "", t)
    if block["kind"] == "heading":
        t = t.lstrip("#").strip() + "."
    elif block["kind"] == "dateline":
        parts = [x.strip().strip("*") for x in t.split("·")]
        spoken = []
        for x in parts:
            m = re.fullmatch(r"(\d{4}) (\w+) (\d+)", x)
            spoken.append(f"{m[1]}, {m[2]} {m[3]}" if m else x)
        t = ". ".join(spoken) + "."
    elif block["kind"] == "quote":
        lines = [re.sub(r"^>\s?", "", l).strip() for l in t.splitlines()]
        lines = [sentence_case(l) for l in lines if l]
        # A quote made only of Dzegoban syllables is read by the rule, line by line.
        if all(is_dzegoban(l) for l in lines):
            lines = ["{" + re.sub(r"[.,!?]", "", l) + "}." for l in lines]
        t = " ".join(l if l[-1] in ".!?:" else l + "." for l in lines)
    t = re.sub(r"CO<sub>2</sub>", "C O two", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"`([^`]+)`", r"\1", t)
    # Italic Dzegoban (e.g. *dzu hu sun du*, or a known single word like *min*) goes through the rule.
    t = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)",
               lambda m: "{" + m[1] + "}" if is_dzegoban(m[1]) and (len(m[1].split()) > 1 or m[1] in DZ_SINGLES) else m[0], t)
    t = re.sub(r"\*\*?([^*]+)\*\*?", r"\1", t)  # emphasis
    t = re.sub(r"(?<!\w)'([a-z]+)'(?!\w)", lambda m: "'{" + m[1] + "}'" if m[1] in DZ_SINGLES else m[0], t)
    t = re.sub(r"\bSt #(\d+)", r"Street number \1", t)
    t = re.sub(r"\bAve #(\d+)", r"Avenue number \1", t)
    t = re.sub(r"#(\d+)", r"number \1", t)
    t = re.sub(r" - ", " — ", t)  # spaced hyphen is the book's dash
    # Runs of capitals: Dzegoban chants are read by the rule; shouted English is read as words,
    # since the model spells capitals out letter by letter. Lone acronyms (AI, GPH) stay as they are.
    def caps_run(m):
        run = m[0]
        words = re.findall(r"[A-Z']+", run)
        if all(w in ACRONYMS for w in words):
            return run
        if is_dzegoban(run.replace("...", " ").replace("…", " ")):
            return "{" + re.sub(r"[^A-Za-z\s]", " ", run).strip() + "}" + ("" if run[-1].isalpha() else run[-1])
        out = re.sub(r"[A-Z']+", lambda w: w[0].capitalize() if w[0].capitalize() in PROPER else w[0].lower(), run)
        before = t[:m.start()].rstrip()
        return out[0].upper() + out[1:] if not before or before[-1] in '".!?“' else out
    t = re.sub(r"\b[A-Z][A-Z']*(?:[\s.,!?…]+[A-Z][A-Z']*)+\b", caps_run, t)
    t = re.sub(r"\b[A-Z]{4,}\b", lambda m: m[0].capitalize(), t)
    return re.sub(r"\s+", " ", t).strip()


def entry_phonemes(e):
    return " ".join(dzegoban_phonemes(w) for w in e["word"].split()) if e.get("rule") == "dzegoban" else e["phonemes"]


def apply_pronunciation(text, entries):
    """Force words with misaki's [word](/phonemes/) syntax, in one pass, longest match first.

    Braced runs in read-aloud text are Dzegoban and go through the rule word by word.
    """
    text = re.sub(r"\{([^}]+)\}", lambda m: "\x00" + m.group(1) + "\x01", text)
    forced = [e for e in entries if e.get("override")]
    forced.sort(key=lambda e: -len(e["word"]))
    lookup = {}
    alts = []
    for e in forced:
        lookup[e["word"] if e.get("match_case", True) else e["word"].lower()] = e
        alts.append(("" if e.get("match_case", True) else "(?i:") + re.escape(e["word"]) + ("" if e.get("match_case", True) else ")"))

    def word_pass(chunk):
        if not alts:
            return chunk
        pattern = re.compile(r"(?<![\w\[])(" + "|".join(alts) + r")(?!\w)")

        def sub(m):
            w = m.group(0)
            e = lookup.get(w) or lookup.get(w.lower())
            words, phons = w.split(), entry_phonemes(e).split()
            return " ".join(f"[{a}](/{b}/)" for a, b in zip(words, phons))
        return pattern.sub(sub, chunk)

    out = []
    for i, part in enumerate(re.split(r"\x00|\x01", text)):
        out.append(dz_markup(part) if i % 2 else word_pass(part))
    return "".join(out)


def description_tone():
    """Two soft notes, rising, then a short pause before the description."""
    t = DESCRIPTION_TONE

    def note(hz, ms):
        x = np.arange(int(SAMPLE_RATE * ms / 1000)) / SAMPLE_RATE
        env = np.minimum(1.0, np.minimum(x / 0.012, (ms / 1000 - x) / 0.04))
        return (t["amplitude"] * np.sin(2 * np.pi * hz * x) * np.clip(env, 0, 1)).astype(np.float32)

    silence = lambda ms: np.zeros(int(SAMPLE_RATE * ms / 1000), dtype=np.float32)
    a, b = t["notes_hz"]
    ma, mb = t["notes_ms"]
    return np.concatenate([note(a, ma), silence(t["between_ms"]), note(b, mb), silence(t["after_ms"])])


def stitch(entries, audio_for):
    """Lay out a chapter: block audio, gaps, break silences, and a tone before each
    description. Sets start_ms (and tone_ms) on each entry; returns (samples, total_ms)."""
    tone = description_tone()
    tone_ms = round(len(tone) * 1000 / SAMPLE_RATE)
    parts, cursor = [], 0
    for e in entries:
        if e["kind"] == "break":
            e.update(start_ms=cursor, duration_ms=BREAK_MS, silence_ms=BREAK_MS)
            parts.append(np.zeros(int(SAMPLE_RATE * BREAK_MS / 1000), dtype=np.float32))
            cursor += BREAK_MS
            continue
        if not e.get("file"):
            continue
        audio = audio_for(e)
        e["start_ms"] = cursor
        if e.get("read_aloud_status"):
            e["tone_ms"] = tone_ms
            parts.append(tone)
            cursor += tone_ms
        else:
            e.pop("tone_ms", None)
        gap = GAP_AFTER[e["kind"]]
        parts += [audio, np.zeros(int(SAMPLE_RATE * gap / 1000), dtype=np.float32)]
        cursor += e["duration_ms"] + gap
    return np.concatenate(parts), cursor


def write_stitched(out, n, samples):
    wav = out / f"chapter-{n}.wav"
    sf.write(wav, samples, SAMPLE_RATE, subtype="PCM_16")
    m4a = out / f"chapter-{n}.m4a"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "aac", "-b:a", "96k",
         "-metadata", f"title=Snowmoon, Chapter {n}",
         "-metadata", "artist=Vitalik Buterin (text); synthetic narration, Kokoro",
         "-metadata", f"track={n}",
         "-metadata", "comment=GPL-3.0. https://github.com/We-Are-Lum/snowmoon", str(m4a)],
        check=True,
    )
    return {
        "wav": wav.name,
        "wav_sha256": sha256_file(wav),
        "m4a": m4a.name,
        "m4a_sha256": sha256_file(m4a),
        "note": "start_ms is the block's offset in the stitched file, gaps included; a description starts with its tone (tone_ms)",
    }


AGENT_PROMPTS = "docs/prompts/008a-agent-prompts.md"


def narration_assist(n):
    """Which inputs a model drafted (studio.recipes.assist; principle 3)."""
    p = CONTENT / "read-aloud" / "exceptions.json"
    entries = json.loads(p.read_text())["entries"] if p.exists() else []
    blocks = [e["idx"] for e in entries if e["chapter"] == n]
    return {
        "model": "claude-coding-agent",
        "by": "the coding agent and its helper agents",
        "drafted": [
            "spoken descriptions of screens, figures and lyric cards (blocks %s)" % (", ".join(map(str, blocks)) or "none"),
            "pronunciation entries (content/snowmoon/pronunciation.json)",
        ],
        "instructions": [AGENT_PROMPTS + "#read-aloud-descriptions-and-invented-word-lists"],
        "see": "config/models.json drafting; principle 3",
    }


def write_recipe(out, n, manifest):
    manifest["assist"] = narration_assist(n)
    text = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    (out / "manifest.json").write_text(text)
    # The recipe is also committed to the repo, so the record outlives the local audio.
    recipes = CONTENT / "recipes" / "narration"
    recipes.mkdir(parents=True, exist_ok=True)
    (recipes / f"chapter-{n}.json").write_text(text)


def restitch(n, out_root):
    """Rebuild a chapter's stitched file from its existing block audio (no speech model)."""
    out = Path(out_root) / f"chapter-{n}"
    manifest = json.loads((out / "manifest.json").read_text())
    samples, total = stitch(manifest["blocks"], lambda e: sf.read(out / e["file"], dtype="float32")[0])
    manifest["stitched"] = write_stitched(out, n, samples)
    manifest["total_duration_ms"] = total
    manifest["settings"]["description_tone"] = DESCRIPTION_TONE
    manifest["restitched_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    write_recipe(out, n, manifest)
    print(f"chapter {n}: {sum(1 for b in manifest['blocks'] if b.get('tone_ms'))} descriptions with a tone, {total/60000:.1f} min")


def sha256_text(s):
    return hashlib.sha256(s.encode()).hexdigest()


_EXCEPTIONS = None


def model_drafted_exceptions():
    global _EXCEPTIONS
    if _EXCEPTIONS is None:
        p = CONTENT / "read-aloud" / "exceptions.json"
        entries = json.loads(p.read_text())["entries"] if p.exists() else []
        _EXCEPTIONS = {(e["chapter"], e["idx"], e["read_aloud_sha256"]) for e in entries}
    return _EXCEPTIONS


def load_chapter(n):
    chapter = json.loads((CONTENT / "text" / f"chapter-{n}.json").read_text())
    ra_path = CONTENT / "read-aloud" / f"chapter-{n}.json"
    overrides = {}
    if ra_path.exists():
        overrides = {o["idx"]: o for o in json.loads(ra_path.read_text())["overrides"]}
    return chapter, ra_path, overrides


def plan_chapter(n, pron):
    """What each block will say. Raises if a block that needs an override has none."""
    chapter, ra_path, overrides = load_chapter(n)
    plan, problems = [], []
    for block in chapter["blocks"]:
        idx, kind = block["idx"], block["kind"]
        if kind == "break":
            plan.append((block, None, None))
            continue
        status = None
        if kind in ("screen", "figure") or "dz-card" in block["content"]:
            o = overrides.get(idx)
            if not o or o["block_sha256"] != block["sha256"]:
                problems.append(f"chapter {n} b{idx}: {kind} has no read_aloud override for this version")
                continue
            spoken, status = o["read_aloud"], o["status"]
            # Principle 2: a spoken description is a person's (written_by) or a
            # listed model-drafted exception (read-aloud/exceptions.json).
            if not o.get("written_by") and (n, idx, sha256_text(spoken)) not in model_drafted_exceptions():
                problems.append(f"chapter {n} b{idx}: description is model-drafted and not in read-aloud/exceptions.json")
                continue
        else:
            spoken = normalize(block)
        try:
            sent = apply_pronunciation(spoken, pron)
        except ValueError as e:
            problems.append(f"chapter {n} b{idx}: {e}")
            continue
        if re.search(r"[<>{}#*`]", re.sub(r"\[[^\]]*\]\(/[^)]*/\)", "", sent)):
            problems.append(f"chapter {n} b{idx}: markup left in spoken text: {sent[:120]}")
        plan.append((block, sent, status))
    return chapter, ra_path, plan, problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chapter", required=True, help="a number or a range like 2-32")
    ap.add_argument("--voice", default="af_heart")
    ap.add_argument("--lang", default="a", help="Kokoro lang_code; a = American English")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--out", default=str(ROOT / "narration-out"))
    ap.add_argument("--check", action="store_true", help="only build and validate the spoken text")
    ap.add_argument("--stitch-only", action="store_true", help="rebuild stitched chapter files from existing block audio")
    args = ap.parse_args()

    lo, _, hi = args.chapter.partition("-")
    chapters = range(int(lo), int(hi or lo) + 1)
    if args.stitch_only:
        for n in chapters:
            restitch(n, args.out)
        return
    pron = json.loads((CONTENT / "pronunciation.json").read_text())["entries"]

    # Validate every chapter before spending any time on audio.
    plans, problems = {}, []
    for n in chapters:
        plans[n] = plan_chapter(n, pron)
        problems += plans[n][3]
    for p in problems:
        print("  " + p, file=sys.stderr)
    if problems:
        sys.exit(f"{len(problems)} problem(s); nothing generated")
    if args.check:
        for n in chapters:
            for block, sent, _ in plans[n][2]:
                if sent:
                    print(f"{n}:{block['idx']}\t{sent}")
        return

    from huggingface_hub import hf_hub_download
    from kokoro import KModel, KPipeline
    import torch

    model_path = hf_hub_download(MODEL_REPO, "kokoro-v1_0.pth", revision=MODEL_REVISION)
    config_path = hf_hub_download(MODEL_REPO, "config.json", revision=MODEL_REVISION)
    voice_path = hf_hub_download(MODEL_REPO, f"voices/{args.voice}.pt", revision=MODEL_REVISION)
    device = "cpu"
    model = KModel(repo_id=MODEL_REPO, config=config_path, model=model_path).to(device).eval()
    pipeline = KPipeline(lang_code=args.lang, repo_id=MODEL_REPO, model=model)
    voice = torch.load(voice_path, weights_only=True)
    recipe = {
        "model": {
            "name": "Kokoro-82M",
            "repo": MODEL_REPO,
            "revision": MODEL_REVISION,
            "weights_file": "kokoro-v1_0.pth",
            "weights_sha256": sha256_file(model_path),
            "license": "apache-2.0",
            "kokoro_version": version("kokoro"),
            "misaki_version": version("misaki"),
            "torch_version": version("torch"),
        },
        "voice": {"name": args.voice, "file_sha256": sha256_file(voice_path), "stock": True},
    }

    for n in chapters:
        chapter, ra_path, plan, _ = plans[n]
        narrate_chapter(n, chapter, ra_path, plan, pipeline, voice, recipe, args, device)


def narrate_chapter(n, chapter, ra_path, plan, pipeline, voice, recipe, args, device):
    out = Path(args.out) / f"chapter-{n}"
    blocks_dir = out / "blocks"
    blocks_dir.mkdir(parents=True, exist_ok=True)
    print(f"Chapter {n}")

    started = time.time()
    entries, audio_by_idx = [], {}
    for block, sent, status in plan:
        idx, kind = block["idx"], block["kind"]
        entry = {"idx": idx, "kind": kind, "block_sha256": block["sha256"]}
        if kind == "break":
            entry.update(file=None)
            entries.append(entry)
            continue

        t0 = time.time()
        chunks = [r.audio.numpy() for r in pipeline(sent, voice=voice, speed=args.speed) if r.audio is not None]
        audio = np.concatenate(chunks).astype(np.float32)
        gen_s = time.time() - t0

        path = blocks_dir / f"c{n}-b{idx:03d}.wav"
        sf.write(path, audio, SAMPLE_RATE, subtype="PCM_16")
        duration_ms = round(len(audio) * 1000 / SAMPLE_RATE)
        entry.update(
            file=str(path.relative_to(out)),
            sha256=sha256_file(path),
            duration_ms=duration_ms,
            text=sent,
            generation_s=round(gen_s, 2),
        )
        if status:
            entry.update(read_aloud_status=status)
        entries.append(entry)
        audio_by_idx[idx] = audio
        print(f"  b{idx:03d} {kind:9s} {duration_ms/1000:6.1f}s audio in {gen_s:5.1f}s")

    elapsed = time.time() - started
    samples, cursor_ms = stitch(entries, lambda e: audio_by_idx[e["idx"]])
    stitched = write_stitched(out, n, samples)

    manifest = {
        "work_id": WORK,
        "chapter": n,
        "source_sha256": chapter["source_sha256"],
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generation_seconds": round(elapsed, 1),
        "total_duration_ms": cursor_ms,
        **recipe,
        "settings": {
            "lang_code": args.lang,
            "speed": args.speed,
            "sample_rate": SAMPLE_RATE,
            "device": device,
            "gap_after_ms": GAP_AFTER,
            "break_ms": BREAK_MS,
            "description_tone": DESCRIPTION_TONE,
            "pronunciation_sha256": sha256_file(CONTENT / "pronunciation.json"),
            "read_aloud_sha256": sha256_file(ra_path) if ra_path.exists() else None,
        },
        "host": {"platform": platform.platform(), "machine": platform.machine(), "python": platform.python_version()},
        "stitched": stitched,
        "blocks": entries,
    }
    write_recipe(out, n, manifest)
    print(f"  {cursor_ms/60000:.1f} min of audio in {elapsed/60:.1f} min -> {out / stitched['m4a']}")


if __name__ == "__main__":
    main()
