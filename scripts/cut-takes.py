"""Cut performed takes from a hand-checked assignment, when the automatic slate reader can't follow a session.

  /Users/nathan/snowmoon/.venv-voice/bin/python scripts/cut-takes.py fifteen-days [--dir ~/snowmoon-takes/full]

scripts/split-takes.py finds the utterances (pauses) and transcribes each one locally. Here the takes are
matched to lines from <dir>/takes/assign.json instead of from the spoken slates: for each line, the
chosen take and the alternates are lists of utterance numbers in takes/work/beat-N, and each take is
cut as one span of the beat's recording, from the first utterance to the last (pauses inside kept).
"after": "<word>" starts the cut just after that word, for a slate said in the same breath as the
line. Extras (e.g. laughs) are cut and converted in a named voice.

Writes, outside the repository: takes/L<nn>-b<beat>-<k>.t<i>.wav (every take; the chosen one is t1),
takes/manifest.json (each take's transcript and which was chosen, plus every flag) and takes/jobs.json
for scripts/convert-voice.py --batch. The transcripts are working data, never script text.
"""

import argparse
import json
import re
from pathlib import Path

import importlib.util
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("split_takes", ROOT / "scripts" / "split-takes.py")
st = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(st)
PAD = 0.1


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("--dir", type=Path, default=Path("~/snowmoon-takes/full"))
    args = ap.parse_args()
    src = args.dir.expanduser().resolve()
    if ROOT.resolve() in src.parents or Path("/Users/nathan/snowmoon").resolve() in src.parents:
        raise SystemExit("refused: recordings must stay in a private folder outside the repository")
    outdir = src / "takes"
    assign = json.loads((outdir / "assign.json").read_text())
    lines = {l["n"]: l for l in json.loads((ROOT / "adaptations" / args.seed / "recording-lines.json").read_text())["lines"]}

    beats = {}
    def beat(b: int):
        if b not in beats:
            work = outdir / "work" / f"beat-{b}"
            audio, sr = sf.read(work / "full.wav", dtype="float32")
            beats[b] = (work, audio, sr, st.utterances(st.silences(audio, sr)))
        return beats[b]

    def words(work: Path, u: int) -> list[tuple[str, float, float]]:
        out = []
        for seg in json.loads((work / f"u{u:04d}.16k.wav.json").read_text())["transcription"]:
            for tok in seg.get("tokens", []):
                if not tok["text"].startswith("["):
                    out.append((tok["text"], tok["offsets"]["from"] / 1000, tok["offsets"]["to"] / 1000))
        return out

    def heard(work: Path, us: list[int]) -> str:
        return " ".join(" ".join(s["text"].strip() for s in json.loads((work / f"u{u:04d}.16k.wav.json").read_text())["transcription"])
                        for u in range(us[0], us[-1] + 1)).replace("[BLANK_AUDIO]", "").strip()

    def cut(b: int, us: list[int], dst: Path, after: str | None = None) -> float:
        work, audio, sr, utts = beat(b)
        t0, t1 = utts[us[0]][0] - PAD, utts[us[-1]][1] + PAD
        if after:
            toks = words(work, us[0])
            k = next(i for i, (w, _, _) in enumerate(toks) if after in w)
            t0 = utts[us[0]][0] - PAD + toks[k][2] + 0.05
        seg = audio[max(0, int(t0 * sr)): int(t1 * sr)]
        sf.write(dst, seg, sr, subtype="FLOAT")
        return round(len(seg) / sr, 2)

    old = sorted(outdir.glob("L*.wav"))
    if old:
        keep = outdir / "superseded"
        keep.mkdir(exist_ok=True)
        for p in old:
            p.rename(keep / p.name)

    results, flags, jobs = [], [], []
    for n_s, a in sorted(assign["lines"].items(), key=lambda kv: int(kv[0])):
        n, b = int(n_s), a["beat"]
        line = lines[n]
        work = beat(b)[0]
        takes = []
        for i, us in enumerate([a["chosen"]] + a.get("alts", []), 1):
            dst = outdir / f"L{n:02d}-{line['ref']}.t{i}.wav"
            dur = cut(b, us, dst, a.get("after") if i == 1 else None)
            said = heard(work, us)
            takes.append({"take": i, "utterances": us, "file": str(dst), "duration_s": dur, "heard": said,
                          "match": round(st.similarity(said.split(), line["text"]), 2), "chosen": i == 1})
        if a.get("flag"):
            flags.append(f"line {n} ({line['speaker']}): {a['flag']}")
        results.append({"n": n, "ref": line["ref"], "speaker": line["speaker"], "text": line["text"], "chosen": 1, "takes": takes})
        voice = line["speaker"].lower()
        if (ROOT / "adaptations" / args.seed / "voices" / f"{voice}.json").exists():
            jobs.append({"take": takes[0]["file"], "voice": voice, "name": f"L{n:02d}-{line['ref']}",
                         "line": {"n": n, "ref": line["ref"], "take": 1, "of": len(takes)}})
        else:
            flags.append(f"line {n}: {line['speaker']} has no voice sheet, so it is cut but not converted")
    for name, x in assign.get("extras", {}).items():
        for i, us in enumerate(x["takes"], 1):
            dst = outdir / f"X-{name}.t{i}.wav"
            cut(x["beat"], us, dst)
            jobs.append({"take": str(dst), "voice": x["voice"], "name": f"X-{name}-{i}"})
    missing = sorted(set(lines) - {r["n"] for r in results})
    flags += [f"line {n} ({lines[n]['speaker']}): no take" for n in missing]
    manifest = {"seed": args.seed, "matched_by": assign["about"], "lines": results, "flags": flags,
                "note": "Working data, outside the repository. Transcripts are never published or used as script text."}
    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    (outdir / "jobs.json").write_text(json.dumps({"out": "lines", "jobs": jobs}, indent=2) + "\n")
    print(f"{len(results)} of {len(lines)} lines cut, {sum(len(r['takes']) for r in results)} takes; {len(jobs)} to convert")
    for f in flags:
        print("FLAG", f)


if __name__ == "__main__":
    main()
