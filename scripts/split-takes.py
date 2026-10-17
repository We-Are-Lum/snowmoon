"""Split a performer's beat recordings into lines, choose the take for each, and queue the conversion.

  python3 scripts/split-takes.py fifteen-days [--dir ~/snowmoon-takes/full] [--stand-in]

The performer records one file per beat (beat-<n>.<any audio>) in a private folder outside the
repository. Before each line they say its number ("line twelve"), then do as many takes as they
like, and say "keep" after a take they like; with no "keep", the last take is used
(adaptations/<seed>/recording-sheet.md).

Whisper small.en (whisper.cpp, MIT, on the allowlist as whisper-small-en) transcribes each file
locally with word times. The slates and "keep" are found in the transcript and cut out. A new take
starts after a "keep", or where the line's first words begin again after a pause. Cuts are placed in
the quietest part of each pause, from the audio's own energy, since Whisper's word ends run into
silences.

Writes, all outside the repository, beside the recordings:
  takes/L<nn>-b<beat>-<k>.t<i>.wav   every take of every line (the chosen one is in the manifest)
  takes/manifest.json                lines, takes, the chosen take, transcripts and flags
  takes/jobs.json                    the conversion batch for scripts/convert-voice.py --batch
and prints the flags: a line with no slate, a slate the script doesn't have, a take whose words
don't match the script, a speaker with no voice sheet. The transcripts are working data only: never
published, never used as script text.
"""

import argparse
import difflib
import json
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from snowmoon_paths import MAIN, VOICE_MODELS  # the shared tools, for a fork or a worktree

ROOT = Path(__file__).resolve().parent.parent
MODEL_ID = "whisper-small-en"
NUM = {w: i for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split())}
NUM.update({w: 10 * i for i, w in enumerate("_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()) if w != "_"})
NUM.update({"for": 4, "to": 2, "too": 2, "won": 1, "ate": 8, "tree": 3})  # common mishearings after "line"
SLATE_WORDS = {"line", "lines", "lion", "lyne"}
MATCH = 0.6  # word similarity a chosen take needs to pass without a flag


SOUNDS_LIKE = {"bye": "bai", "by": "bai", "buy": "bai", "zay": "zei", "zane": "zei", "zee": "zei", "too": "to", "two": "to"}


def norm(w: str) -> str:
    return re.sub(r"[^a-z0-9'-]", "", w.lower())


WORD_OF = {v: k for k, v in NUM.items() if k not in ("for", "to", "too", "won", "ate", "tree")}


def same(w: str) -> str:
    """For comparing what was heard with the script: names, homophones and digits Whisper writes."""
    w = norm(w).strip("-'")
    if w.isdigit() and int(w) < 100:
        n = int(w)
        w = WORD_OF[n] if n in WORD_OF else f"{WORD_OF[n - n % 10]}-{WORD_OF[n % 10]}"
    return SOUNDS_LIKE.get(w, w)


def group_takes(region: list[dict], text: str) -> tuple[list[list[dict]], list[int]]:
    """Takes of one line: a new take after each "keep", or where speech starts again with the line's
    first words. Returns the takes and the indexes of those followed by "keep"."""
    first = [same(w) for w in text.split()[:3] if same(w)]
    takes, cur, kept = [], [], []
    for e in region:
        if e["kind"] == "keep":
            if cur:
                takes.append(cur)
                cur = []
            if takes:
                kept.append(len(takes) - 1)
            continue
        opening = [same(w["w"]) for w in e["words"][: len(first)]]
        restart = first and opening and opening[0] == first[0] and difflib.SequenceMatcher(None, opening, first).ratio() >= 0.66
        if cur and restart:
            takes.append(cur)
            cur = []
        cur.append(e)
    if cur:
        takes.append(cur)
    return takes, kept


def sha256(path: Path) -> str:
    import hashlib
    return hashlib.sha256(path.read_bytes()).hexdigest()


def silences(audio: np.ndarray, sr: int) -> np.ndarray:
    """Per 10 ms frame: True where quiet (well under the file's speech level)."""
    hop = sr // 100
    frames = audio[: len(audio) // hop * hop].reshape(-1, hop)
    db = 10 * np.log10((frames ** 2).mean(axis=1) + 1e-12)
    floor, speech = np.percentile(db, 5), np.percentile(db, 90)
    return db < max(floor + 8, speech - 30)


def utterances(quiet: np.ndarray, gap: float = 0.35, shortest: float = 0.12) -> list[tuple[float, float]]:
    """Stretches of sound separated by at least `gap` seconds of quiet, as (start, end) in seconds."""
    runs, start, last_loud = [], None, None
    for f, q in enumerate(list(quiet) + [True] * int(gap * 100 + 1)):
        if not q:
            if start is None:
                start = f
            last_loud = f
        elif start is not None and f - last_loud >= gap * 100:
            if (last_loud + 1 - start) >= shortest * 100:
                runs.append((start / 100, (last_loud + 1) / 100))
            start = None
    return runs


def transcribe_clips(clips: list[Path], model: Path) -> list[list[dict]]:
    """Each clip's words with token times [{raw, w, t0, t1}], in one whisper.cpp run (one model load).

    Clips are transcribed one by one because Whisper, given a whole file, skipped a repeated take
    and its "keep" in the 14 October test; a decoding prompt kept them but shifted the times."""
    args = ["whisper-cli", "-m", str(model), "-ojf", "-np", "-nf"]
    for c in clips:
        args += ["-f", str(c)]
    subprocess.run(args, check=True, capture_output=True)
    out = []
    for c in clips:
        words = []
        for seg in json.loads(Path(f"{c}.json").read_text())["transcription"]:
            for tok in seg.get("tokens", []):
                text, t0, t1 = tok["text"], tok["offsets"]["from"] / 1000, tok["offsets"]["to"] / 1000
                if text.startswith("[") or not text.strip():
                    continue
                if text.startswith(" ") or not words:  # a token starting with a space starts a word
                    words.append({"raw": text.strip(), "t0": t0, "t1": t1})
                else:
                    words[-1]["raw"] += text
                    if norm(text):
                        words[-1]["t1"] = t1
        for w in words:
            w["w"] = norm(w["raw"])
        out.append([w for w in words if w["w"]])
    return out


def parse_number(words: list[dict], i: int) -> tuple[int | None, int]:
    """A number starting at words[i] ("twelve", "twenty-one", "twenty one", "21"); returns (n, words used)."""
    w = words[i]["w"] if i < len(words) else ""
    if w.isdigit():
        return int(w), 1
    parts = [p for p in w.split("-") if p]
    if parts and all(p in NUM for p in parts):
        n = sum(NUM[p] for p in parts)
        if len(parts) == 1 and NUM[w] >= 20 and i + 1 < len(words) and words[i + 1]["w"] in NUM and NUM[words[i + 1]["w"]] < 10:
            return n + NUM[words[i + 1]["w"]], 2
        return n, 1
    return None, 0


def similarity(said: list[str], line: str) -> float:
    want = [same(w) for w in line.split() if same(w)]
    return difflib.SequenceMatcher(None, [same(w) for w in said], want).ratio()


def events(utts: list[tuple[float, float]], words: list[list[dict]], pad: float) -> list[dict]:
    """The recording as a sequence: slates, "keep"s, and stretches of speech with their times."""
    ev = []
    for (u0, u1), ws in zip(utts, words):
        base = u0 - pad  # clip time 0 in file time
        i = 0
        while i < len(ws):
            w = ws[i]
            if w["w"] in SLATE_WORDS:
                n, used = parse_number(ws, i + 1)
                if n is not None:
                    ev.append({"kind": "slate", "n": n, "at": base + w["t0"]})
                    i += 1 + used
                    continue
            if w["w"] == "keep":
                ev.append({"kind": "keep", "at": base + w["t0"]})
                i += 1
                continue
            j = i
            while j < len(ws) and ws[j]["w"] != "keep" and not (ws[j]["w"] in SLATE_WORDS and parse_number(ws, j + 1)[0] is not None):
                j += 1
            chunk = ws[i:j]
            # The speech's own edges: the utterance's, unless a slate or "keep" shares it.
            t0 = u0 if i == 0 else base + chunk[0]["t0"] - 0.05
            t1 = u1 if j == len(ws) else base + ws[j]["t0"] - 0.05
            ev.append({"kind": "speech", "t0": t0, "t1": t1, "words": chunk})
            i = j
    return ev


def split_beat(path: Path, lines: list[dict], model: Path, outdir: Path) -> tuple[list[dict], list[str]]:
    flags = []
    stem = path.name.split(".")[0]
    work = outdir / "work" / stem
    work.mkdir(parents=True, exist_ok=True)
    full = work / "full.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(path), "-ac", "1", str(full)], check=True)
    audio, sr = sf.read(full, dtype="float32")
    utts = utterances(silences(audio, sr))
    pad = 0.1
    clips = []
    for k, (u0, u1) in enumerate(utts):
        c = work / f"u{k:04d}.wav"
        seg = audio[max(0, int((u0 - pad) * sr)): int((u1 + pad) * sr)]
        sf.write(c, seg, sr)
        c16 = work / f"u{k:04d}.16k.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(c), "-ar", "16000", str(c16)], check=True)
        clips.append(c16)
    ev = events(utts, transcribe_clips(clips, model), pad)

    by_n = {l["n"]: l for l in lines}
    expected = {l["n"] for l in lines if f"beat-{l['beat']}" == stem}
    found: dict[int, list[dict]] = {}
    slates = [k for k, e in enumerate(ev) if e["kind"] == "slate"]
    before_first = [e for e in ev[: slates[0] if slates else len(ev)] if e["kind"] == "speech"]
    if before_first:
        flags.append(f"{path.name}: {len(before_first)} stretch(es) of speech before the first slate, not used")
    for k, si in enumerate(slates):
        n = ev[si]["n"]
        region = ev[si + 1: slates[k + 1] if k + 1 < len(slates) else len(ev)]
        if not any(e["kind"] == "speech" for e in region):
            flags.append(f"{path.name}: slate \"line {n}\" at {ev[si]['at']:.1f} s has no speech after it")
            continue
        takes, kept = group_takes(region, by_n[n]["text"] if n in by_n else "")
        # A slate whose words plainly belong to another line of this beat: match by the words, and say so.
        heard = [w["w"] for e in takes[-1] for w in e["words"]]
        if n not in by_n or similarity(heard, by_n[n]["text"]) < 0.5:
            best = max(expected, key=lambda m: similarity(heard, by_n[m]["text"]), default=None)
            if best is not None and best != n and similarity(heard, by_n[best]["text"]) >= 0.75:
                flags.append(f"{path.name}: slated \"line {n}\" at {ev[si]['at']:.1f} s, but the words are line {best}'s; matched to line {best}")
                n = best
                takes, kept = group_takes(region, by_n[n]["text"])
        if n not in by_n:
            flags.append(f"{path.name}: slate \"line {n}\" at {ev[si]['at']:.1f} s: the script has no line {n}, and the words match none; not used")
            continue
        if n not in expected:
            flags.append(f"{path.name}: line {n} is in beat {by_n[n]['beat']}, recorded in this file; used")
        line = by_n[n]
        if not takes:
            flags.append(f"{path.name}: line {n} has a slate but no take")
            continue

        earlier = found.get(n, [])
        if earlier:
            flags.append(f"{path.name}: line {n} slated twice; the later takes count, the earlier are kept as alternates")
        cut = list(earlier)
        for t, es in enumerate(takes):
            num = len(earlier) + t + 1
            a, b = es[0]["t0"], es[-1]["t1"]
            dst = outdir / f"L{n:02d}-{line['ref']}.t{num}.wav"
            sf.write(dst, audio[int(max(0, a) * sr): int(b * sr)], sr, subtype="FLOAT")
            said = [w["w"] for e in es for w in e["words"]]
            cut.append({"take": num, "file": str(dst), "from_s": round(a, 2), "to_s": round(b, 2),
                        "heard": " ".join(w["raw"] for e in es for w in e["words"]),
                        "match": round(similarity(said, line["text"]), 2), "kept": t in kept})
        found[n] = cut
        # the last take followed by "keep"; with no "keep", the last take
        chosen = ([c for c in cut[len(earlier):] if c["kept"]] or [cut[-1]])[-1]
        for c in cut:
            c["chosen"] = c is chosen
        if chosen["match"] < MATCH:
            flags.append(f"{path.name}: line {n} take {chosen['take']} heard as \"{chosen['heard'][:60]}\" ({chosen['match']:.0%} like the script); check it")
    for n in sorted(expected - set(found)):
        flags.append(f"{path.name}: no take for line {n} ({by_n[n]['speaker']}: \"{by_n[n]['text'][:40]}\")")
    out = [{"n": n, "ref": by_n[n]["ref"], "speaker": by_n[n]["speaker"], "text": by_n[n]["text"],
            "source": path.name, "takes": found[n], "chosen": next(c["take"] for c in found[n] if c["chosen"])}
           for n in sorted(found)]
    return out, flags


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("--dir", type=Path, default=Path("~/snowmoon-takes/full"))
    ap.add_argument("--stand-in", action="store_true", help="test recordings made with synthetic voices")
    args = ap.parse_args()
    src = args.dir.expanduser().resolve()
    if (ROOT.resolve() in src.parents or MAIN in src.parents) and not args.stand_in:
        raise SystemExit("refused: recordings must stay in a private folder outside the repository")
    model_rec = next(m for m in json.loads((ROOT / "config" / "models.json").read_text())["models"] if m["id"] == MODEL_ID)
    model = VOICE_MODELS / "whisper" / "ggml-small.en.bin"
    if sha256(model) != model_rec["local"]["weights"]["ggml-small.en.bin"]:
        raise SystemExit("the Whisper weights don't match the pinned sha256 in config/models.json")
    lines = json.loads((ROOT / "adaptations" / args.seed / "recording-lines.json").read_text())["lines"]
    outdir = src / "takes"
    outdir.mkdir(exist_ok=True)

    results, flags = [], []
    files = sorted(p for p in src.iterdir() if p.is_file() and re.match(r"beat-\d+\.", p.name))
    if not files:
        raise SystemExit(f"no beat-<n> recordings in {src}")
    for f in files:
        r, fl = split_beat(f, lines, model, outdir)
        results += r
        flags += fl
    recorded_beats = {int(re.match(r"beat-(\d+)", f.name)[1]) for f in files}
    for b in sorted({l["beat"] for l in lines} - recorded_beats):
        flags.append(f"no recording for beat {b} yet (beat-{b}.*)")

    jobs = []
    for r in results:
        voice = r["speaker"].lower()
        if not (ROOT / "adaptations" / args.seed / "voices" / f"{voice}.json").exists():
            flags.append(f"line {r['n']}: {r['speaker']} has no voice sheet, so it is split but not converted")
            continue
        take = next(t for t in r["takes"] if t["take"] == r["chosen"])
        jobs.append({"take": take["file"], "voice": voice, "name": f"L{r['n']:02d}-{r['ref']}",
                     "line": {"n": r["n"], "ref": r["ref"], "take": r["chosen"], "of": len(r["takes"])}})
    manifest = {"seed": args.seed, "transcriber": {"model": MODEL_ID, "revision": model_rec["revision"]},
                "note": "Working data, outside the repository. Transcripts are never published or used as script text.",
                "lines": results, "flags": flags}
    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    (outdir / "jobs.json").write_text(json.dumps({"out": "lines", "jobs": jobs}, indent=2) + "\n")
    print(f"{len(results)} of {len(lines)} lines matched, {sum(len(r['takes']) for r in results)} takes; {len(jobs)} to convert")
    for f in flags:
        print("FLAG", f)


if __name__ == "__main__":
    main()
