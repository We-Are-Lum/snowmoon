"""Mix a scene from its timeline: measure every stem, resolve the times, mix, and normalise loudness.

docs/adaptation-format.md, Timing: timeline.json holds only edit decisions. Every cue, shot and
lettering record is placed by an anchor, never a fixed start:
  "at":    {"cue": "<id>" | "@start" | "@end", "edge": "start" | "middle" | "end", "offset": seconds}
  "until": the same form; for beds and other cues that run between two points
A negative offset overlaps the anchor (J-cuts and L-cuts). A cue lasts as long as its stem, unless
it has "until" (a bed loops to fill it when "loop" is true). "@end" is the end of the last cue that
is not a bed, plus the timeline's tail_s. A shot runs from its "at" to the next shot's start; the
last runs to "@end". An optional "end_card" ({"file", "seconds"}) follows "@end"; the mix is silent
under it unless a bed's "until" reaches past "@end". A dissolve starts at the incoming shot's start and lasts its seconds.

Levels are the track's level_db plus the cue's own level_db (default 0); fade_in and fade_out are
in seconds. The premix is normalised in two passes with ffmpeg's loudnorm, as the podcast is
(-16 LUFS integrated, -1 dBTP), at 48 kHz stereo.

Outputs:
  scenes-out/<seed>/mix/<seed>-mix.wav       the mixed audio (gitignored)
  the mix recipe, holding the resolved timeline (every time absolute, every stem with its sha256),
  the loudness measured before and after, the commands and the output's sha256:
    adaptations/<seed>/mix/recipe.json, or scenes-out/<seed>/mix/recipe.json for a placeholder timeline
  The renderer reads only the resolved timeline in that recipe.

  /Users/nathan/snowmoon/.venv-voice/bin/python scripts/mix-scene.py dog-dawn
"""

import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
SR = 48000


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: Path) -> np.ndarray:
    """A stem as mono float32 at 48 kHz (resampled linearly if needed)."""
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    x = x.mean(axis=1)
    if sr != SR:
        n = int(round(len(x) * SR / sr))
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)
    return x


def loudnorm_json(stderr: str) -> dict:
    """The JSON block loudnorm prints at the end of ffmpeg's log."""
    return json.loads(re.findall(r"\{[^{}]*\"input_i\"[^{}]*\}", stderr)[-1])


def git_commit() -> str:
    return subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()


class Resolver:
    """Turns anchors into absolute seconds. Cycles and unknown ids are errors."""

    def __init__(self, timeline: dict, durations: dict[str, float]):
        self.cues = {c["id"]: c for c in timeline["cues"]}
        self.dur = durations
        self.tail = float(timeline.get("tail_s", 1.0))
        self.starts: dict[str, float] = {}
        self.ends: dict[str, float] = {}
        self.busy: set[str] = set()
        self._end: float | None = None

    def point(self, a: dict) -> float:
        ref, off = a["cue"], float(a.get("offset", 0.0))
        if ref == "@start":
            return off
        if ref == "@end":
            return self.scene_end() + off
        if ref not in self.cues:
            raise SystemExit(f"unknown cue {ref!r}")
        edge = a.get("edge", "start")
        if edge == "middle":
            return (self.start(ref) + self.end(ref)) / 2 + off
        return (self.end(ref) if edge == "end" else self.start(ref)) + off

    def start(self, cid: str) -> float:
        if cid not in self.starts:
            if cid in self.busy:
                raise SystemExit(f"cue {cid!r} is anchored to itself (a cycle)")
            self.busy.add(cid)
            self.starts[cid] = self.point(self.cues[cid]["at"])
            self.busy.discard(cid)
        return self.starts[cid]

    def end(self, cid: str) -> float:
        if cid not in self.ends:
            c = self.cues[cid]
            self.ends[cid] = self.point(c["until"]) if "until" in c else self.start(cid) + self.dur[cid]
        return self.ends[cid]

    def scene_end(self) -> float:
        if self._end is None:
            self._end = max(self.end(c["id"]) for c in self.cues.values() if c["track"] != "bed") + self.tail
        return self._end


def resolve(timeline: dict, stems: dict[str, Path]) -> dict:
    durations = {cid: sf.info(p).duration for cid, p in stems.items()}
    r = Resolver(timeline, durations)
    end = r.scene_end()
    cues = []
    for c in timeline["cues"]:
        s, e = r.start(c["id"]), r.end(c["id"])
        if e <= s:
            raise SystemExit(f"cue {c['id']} ends before it starts ({s:.2f} → {e:.2f})")
        cues.append({"id": c["id"], "track": c["track"], "stem": c["stem"], "stem_sha256": sha256(stems[c["id"]]),
                     "stem_s": round(durations[c["id"]], 3), "start": round(s, 3), "end": round(e, 3),
                     "level_db": timeline["tracks"][c["track"]].get("level_db", 0) + c.get("level_db", 0),
                     "fade_in": c.get("fade_in", 0), "fade_out": c.get("fade_out", 0), "loop": bool(c.get("loop"))})
    shots = []
    starts = [max(0.0, r.point(s["at"])) for s in timeline["shots"]]
    for i, s in enumerate(timeline["shots"]):
        stop = starts[i + 1] if i + 1 < len(starts) else end
        if i and starts[i] <= starts[i - 1]:
            raise SystemExit(f"shot {s['id']} starts before the shot it follows")
        shots.append({**{k: v for k, v in s.items() if k != "at"}, "start": round(starts[i], 3), "end": round(stop, 3),
                      "image_sha256_now": sha256(ROOT / s["image"])})
    shot_ids = {s["id"] for s in shots}
    lettering = []
    for l in timeline.get("lettering", []):
        if l["shot"] not in shot_ids:
            raise SystemExit(f"lettering {l['id']}: unknown shot {l['shot']!r}")
        lettering.append({**{k: v for k, v in l.items() if k != "at"}, "start": round(r.point(l["at"]), 3)})
    card = None
    if timeline.get("end_card"):
        # The end card follows the last shot: its text comes from its own file (never the timeline), drawn by the renderer.
        ec = timeline["end_card"]
        card = {"file": ec["file"], "file_sha256": sha256(ROOT / ec["file"]), "start": round(end, 3), "end": round(end + ec["seconds"], 3),
                "fade_s": ec.get("fade_s", 0.8)}
        end += ec["seconds"]
    return {"duration_s": round(end, 3), "video": timeline["video"], "cues": cues, "shots": shots, "lettering": lettering, "end_card": card}


def mix(resolved: dict, stems: dict[str, Path]) -> np.ndarray:
    total = int(round(resolved["duration_s"] * SR))
    out = np.zeros(total, np.float32)
    for c in resolved["cues"]:
        x = load(stems[c["id"]])
        n = int(round((c["end"] - c["start"]) * SR))
        if c["loop"] and len(x) < n:
            x = np.tile(x, n // len(x) + 1)
        x = x[:n].copy()
        for key, sl in (("fade_in", slice(None)), ("fade_out", slice(None, None, -1))):
            k = min(int(c[key] * SR), len(x))
            if k:
                x[sl][:k] *= np.linspace(0, 1, k, dtype=np.float32)
        x *= 10 ** (c["level_db"] / 20)
        a = int(round(c["start"] * SR))
        if a < 0:
            x, a = x[-a:], 0
        b = min(total, a + len(x))
        out[a:b] += x[: b - a]
    return out


def main() -> None:
    seed = sys.argv[1]
    base = ROOT / "adaptations" / seed
    tl_path = base / "timeline.json"
    timeline = json.loads(tl_path.read_text())
    stems = {c["id"]: ROOT / c["stem"] for c in timeline["cues"]}
    missing = [cid for cid, p in stems.items() if not p.exists()]
    if missing:
        raise SystemExit("missing stems: " + ", ".join(missing))
    work = ROOT / "scenes-out" / seed / "mix"
    work.mkdir(parents=True, exist_ok=True)

    resolved = resolve(timeline, stems)
    premix = work / f"{seed}-premix.wav"
    sf.write(premix, mix(resolved, stems), SR, subtype="FLOAT")

    L = timeline.get("loudness", {"integrated_lufs": -16, "true_peak_db": -1, "lra": 11})
    norm = f"loudnorm=I={L['integrated_lufs']}:TP={L['true_peak_db']}:LRA={L.get('lra', 11)}"
    probe = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(premix), "-af", norm + ":print_format=json", "-f", "null", "-"],
                           capture_output=True, text=True)
    m = loudnorm_json(probe.stderr)
    af = (f"{norm}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
          f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true:print_format=json")
    out = work / f"{seed}-mix.wav"
    cmd = ["ffmpeg", "-y", "-hide_banner", "-i", str(premix), "-af", af, "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s24le", str(out)]
    run = subprocess.run(cmd, capture_output=True, text=True, check=True)
    after = loudnorm_json(run.stderr)

    rec = {
        "about": f"The mix of {seed}: the timeline resolved against its measured stems, mixed, and normalised in two passes.",
        "placeholder": bool(timeline.get("placeholder")),
        "timeline": str(tl_path.relative_to(ROOT)), "timeline_sha256": sha256(tl_path),
        "script": "scripts/mix-scene.py", "commit": git_commit(),
        "resolved": resolved,
        "loudness": {"target": L, "before": {k: m[k] for k in ("input_i", "input_tp", "input_lra")},
                     "after": {k: after[k] for k in ("output_i", "output_tp", "output_lra")}},
        "ffmpeg": subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.splitlines()[0],
        "command": [c if not c.startswith(str(ROOT)) else str(Path(c).relative_to(ROOT)) for c in cmd],
        "output": {"file": str(out.relative_to(ROOT)), "sha256": sha256(out), "sample_rate": SR, "channels": 2},
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "cost_usd": 0,
    }
    rec_dir = (work if timeline.get("placeholder") else base / "mix")
    rec_dir.mkdir(parents=True, exist_ok=True)
    (rec_dir / "recipe.json").write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")
    premix.unlink()
    print(f"mix {out.relative_to(ROOT)}: {resolved['duration_s']} s, {len(resolved['cues'])} cues, "
          f"{after['output_i']} LUFS, peak {after['output_tp']} dBTP; recipe {(rec_dir / 'recipe.json').relative_to(ROOT)}")


if __name__ == "__main__":
    main()
