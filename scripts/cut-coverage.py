"""Cut a scene from its coverage plan (docs/coverage.md; scripts/coverage-plan.py writes coverage-board.json).

  /Users/nathan/snowmoon/.venv-voice/bin/python scripts/cut-coverage.py <seed> [--render]

Writes scenes-out/<seed>/cuts/coverage/timeline.json and, with --render, mixes and renders it to cuts/coverage.mp4.
The edit follows the rules: picture cuts on the dialogue, with the next speaker's voice starting just before the cut when the
speaker changes (a short J-cut); hard cuts within a scene; a fade only into the time jump (the vigil) and at the end; no held
empty frames; wordless shots as long as the plan says (1-1.5 s unless it gives a reason). Every still is static.
Pictures: adaptations/<seed>/preprod/overnight/coverage-pictures.json {frame id: file} (the reviewed picks); a frame not yet
drawn falls back to its layout's A picture, then its layout frame (a placeholder). Sounds, trims and the robot's treatment
are cut-v4.py's (the owner's notes, 2026-10-17).
"""

import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("cutv4", ROOT / "scripts" / "cut-v4.py")
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)

J = 0.12          # the next speaker's voice starts this long before the picture cuts to them
GAP = 0.12        # between one line's end and the next line's start
TAIL = 0.25       # after a line, before a wordless shot
GAP_IN = 0.35     # pauses inside a performance are shortened to this (the words and their order never change)


def frame_id(scene: str, it: dict) -> str:
    sc, setup = (it["setup"].split("/") + [None])[:2] if "/" in it["setup"] else (scene, it["setup"])
    if setup is None:
        sc, setup = scene, it["setup"]
    return f"cov-{sc}-{setup}" + (f"-{it['v']}" if it.get("v") else "")


def main() -> None:
    seed = sys.argv[1]
    adir, sout = ROOT / "adaptations" / seed, ROOT / "scenes-out" / seed
    pre = adir / "preprod"
    board = json.loads((pre / "coverage-board.json").read_text())
    plan = {s["id"]: s for s in json.loads((pre / "coverage.json").read_text())["scenes"]}
    lines = {l["ref"]: l for l in json.loads((adir / "recording-lines.json").read_text())["lines"]}
    sounds = {x["effect"]: x for x in json.loads((adir / "sounds" / "recipe.json").read_text())["sounds"]}
    pk = pre / "overnight" / "coverage-pictures.json"
    picks = json.loads(pk.read_text()) if pk.exists() else {}
    work = sout / "cuts" / "coverage"
    stems = work / "stems"
    stems.mkdir(parents=True, exist_ok=True)

    def picture(fid: str) -> tuple:
        f = board["frames"].get(fid)
        if f is None:
            raise SystemExit(f"no frame {fid} in the board")
        if fid in picks and (ROOT / picks[fid]).exists():
            return picks[fid], "picked"
        if f.get("reuse"):
            if f.get("framed"):
                dst = work / f"framed-{fid}.png"
                C.framed(ROOT / f["reuse"], dst)
                return str(dst.relative_to(ROOT)), "the book's own picture"
            return f["reuse"], "reused (approved earlier)"
        lay = f.get("layout")
        for p, what in ((ROOT / "images-out/preprod/pass3" / f"{lay}-A7.png", "layout drawn, not finished (placeholder)"),
                        (ROOT / "images-out/preprod/set" / f"{lay}.look.png", "layout frame (placeholder)")):
            if p.exists():
                return str(p.relative_to(ROOT)), what
        raise SystemExit(f"{fid}: no picture at all")

    shots, cues, subs, notes = [], [], [], []
    beds = []
    t = 0.0           # where the next picture or voice may start
    prev = None       # the previous item's kind: ("line", speaker) or ("still",)
    scene_id = None

    def add_shot(fid: str, at: float, letter: str | None = None, screen: str | None = None, transition: dict | None = None, label: str = "") -> None:
        if screen:
            dst = work / f"screen-{screen}.png"
            C.device(C.SCREENS[screen], dst)
            img, what = str(dst.relative_to(ROOT)), "the book's words on a device, drawn in code"
        else:
            img, what = picture(fid)
        if letter:
            dst = work / f"lettered-{fid}.png"
            C.lettered(ROOT / img, dst, letter)
            img = str(dst.relative_to(ROOT))
        shots.append({"id": label or fid, "frame": fid, "image": img, "picture": what, "at": {"cue": "@start", "offset": round(at, 3)},
                      "transition": transition or {"type": "cut"},
                      "move": {"kind": "push", "from": {"x": 0.5, "y": 0.5, "zoom": 1.0}, "to": {"x": 0.5, "y": 0.5, "zoom": 1.0}, "ease": "linear"}})

    def fx(items: list, at: float, n0: int) -> None:
        for n, (effect, off, lvl, dur) in enumerate(items):
            if effect not in sounds:
                notes.append(f"{effect}: not in the sounds recipe; left out")
                continue
            dst = stems / f"fx-{n0}-{n}.wav"
            a = C.FX_FROM.get(effect, 0)
            C.ff(ROOT / sounds[effect]["file"], dst, f"atrim={a}:{a + dur},asetpts=PTS-STARTPTS,afade=t=out:st={max(dur - 0.4, 0)}:d=0.4")
            cues.append({"id": f"fx-{n0}-{n}", "track": "foley", "stem": str(dst.relative_to(ROOT)), "at": {"cue": "@start", "offset": round(max(0, at + off), 3)},
                         "level_db": lvl, "fade_in": 0.03, "fade_out": 0.2, "note": f"{effect} (drafted place)", "source": {"effect": effect, "licence": sounds[effect]["source"]["licence"]}})

    def black(at: float, hold: float, fade: float) -> float:
        from PIL import Image
        dst = work / "black.png"
        if not dst.exists():
            Image.new("RGB", (1920, 1080), (0, 0, 0)).save(dst)
        shots.append({"id": "BLACK", "frame": "black", "image": str(dst.relative_to(ROOT)), "picture": "black", "at": {"cue": "@start", "offset": round(at, 3)},
                      "transition": {"type": "dissolve", "seconds": fade},
                      "move": {"kind": "push", "from": {"x": 0.5, "y": 0.5, "zoom": 1.0}, "to": {"x": 0.5, "y": 0.5, "zoom": 1.0}, "ease": "linear"}})
        return at + hold

    for n, it in enumerate(board["sequence"]):
        sc = plan[it["scene"]]
        if it["scene"] != scene_id:  # a new scene: its bed, and the fade into the time jump
            if sc.get("fade_in") and shots:
                t = black(t + TAIL, 1.0, 0.6)
            scene_id = it["scene"]
            first_of_scene = True
            bed = C.BEDS[sc["bed"]]
            if beds and beds[-1][0] == bed[0]:
                pass
            else:
                beds.append([bed[0], t, None, bed[1] + C.FIVE_BED_DB.get(bed[0], 0)])
        else:
            first_of_scene = False
        trans = {"type": "dissolve", "seconds": 0.6} if first_of_scene and sc.get("fade_in") else None
        if it.get("pre"):
            p = it["pre"]
            add_shot(frame_id(it["scene"], p), t, transition=trans, label=f"{n}-pre")
            trans = None
            t += p["s"]
            prev = ("still",)
        if it.get("line"):
            r = it["line"]
            l = lines[r]
            folder, vid = C.VOICE[l["speaker"]]
            src = sout / folder / f"L{l['n']:02d}-{r}.{vid}.wav"
            take = src
            if r in C.TRIM:
                a0, a1 = C.TRIM[r]
                take = stems / f"{r}.trim.wav"
                C.ff(src, take, f"atrim=start={a0 or 0}" + (f":end={a1}" if a1 else "") + ",asetpts=PTS-STARTPTS")
            tight = stems / f"{r}.tight.wav"
            C.tighten(take, tight, GAP_IN)
            dst = stems / f"{r}.wav"
            room = C.ROOMS[sc["room"]]
            C.ff(tight, dst, f"{C.ROBOT_FX},{room}" if l["speaker"] == "Robot" else room)
            tight.unlink()
            if take != src:
                take.unlink()
            d = sf.info(dst).duration
            if prev and prev[0] == "line" and not first_of_scene:
                voice = t + GAP
                cut = voice + (J if prev[1] != l["speaker"] else 0)
            else:
                cut, voice = t, t + 0.1
            add_shot(frame_id(it["scene"], it), cut, transition=trans, label=f"{n}-{r}")
            cues.append({"id": r, "track": "voice", "stem": str(dst.relative_to(ROOT)), "at": {"cue": "@start", "offset": round(voice, 3)},
                         "room": sc["room"], "source": {"converted": str(src.relative_to(ROOT)), "voice": vid}})
            pieces = C.chunks(l["text"])
            total = sum(len(p) for p in pieces)
            acc = 0
            for p in pieces:
                subs.append({"cue": r, "text": p, "from": round(acc / total, 4), "to": round((acc + len(p)) / total, 4)})
                acc += len(p)
            if it.get("cut_at"):  # a cut inside the line (a reaction, an insert), and back to the speaker after `back` s
                ca = it["cut_at"]
                at = voice + ca["after"]
                if at < voice + d - 0.3:
                    add_shot(frame_id(it["scene"], ca), at, label=f"{n}-{r}-cut")
                    if ca.get("back") and at + ca["back"] < voice + d - 0.3:
                        add_shot(frame_id(it["scene"], it), at + ca["back"], label=f"{n}-{r}-back")
            if it.get("laugh") is not None:
                lp = stems / "laugh.wav"
                C.ff(sout / "lines-v2" / "X-laugh-3.deluin-v2.wav", lp, C.ROOMS["courtyard"])
                cues.append({"id": "laugh", "track": "voice", "stem": str(lp.relative_to(ROOT)), "at": {"cue": "@start", "offset": round(max(0, cut + it["laugh"]), 3)},
                             "level_db": -5, "note": "Deluin laughing at the table as Zei arrives"})
            if it.get("music"):  # Dreadnaught from her lifted headphone, after "What", until the line ends (owner)
                music = json.loads((adir / "music" / "recipe.json").read_text())
                v3 = next(v for v in music["versions"] if v["id"] == "dreadnaught-v3-fal")
                a, b = voice + C.WHAT_END, voice + d
                loud = stems / "dreadnaught-loud.wav"
                C.ff(ROOT / v3["file"], loud, f"atrim=0:{b - a + 0.3}")
                cues.append({"id": "dreadnaught", "track": "music", "stem": str(loud.relative_to(ROOT)), "at": {"cue": "@start", "offset": round(a, 3)},
                             "level_db": 0, "fade_in": 0.08, "fade_out": 0.25, "note": "Dreadnaught v3 from her lifted headphone"})
            fx(it.get("fx", []), cut, n)
            t = voice + d
            prev = ("line", l["speaker"])
        else:
            start = t + (TAIL if prev and prev[0] == "line" else 0) - it.get("over", 0)
            code = "/" not in it["setup"] and sc["setups"][it["setup"]]["kind"] == "code"
            add_shot(f"cov-{it['scene']}-{it['setup']}" if code else frame_id(it["scene"], it), start, letter=it.get("letter"),
                     screen=it.get("v") if code else None, transition=trans, label=f"{n}-{it['setup']}")
            fx(it.get("fx", []), start, n)
            if it.get("bye"):
                sid, off, src, a0, a1 = C.FIVE_BYE
                dst = stems / "bye.wav"
                C.ff(sout / src, dst, f"atrim={a0}:{a1},asetpts=PTS-STARTPTS,{C.ROOMS['gate']}")
                cues.append({"id": "bye", "track": "voice", "stem": str(dst.relative_to(ROOT)), "at": {"cue": "@start", "offset": round(start + 0.25, 3)},
                             "note": "Deluin's 'Bye' at the gate: the owner's own word from the end of L12's take (owner, 2026-10-17)"})
                subs.append({"cue": "bye", "text": "Bye!", "from": 0.0, "to": 1.0})
            t = start + it["s"]
            prev = ("still",)
        beds[-1][2] = t
    t = black(t + 0.3, 1.6, 0.8)  # the end: fade to black, then the end card, no overlap
    beds[-1][2] = t
    for s in shots:
        s["image_sha256"] = hashlib.sha256((ROOT / s["image"]).read_bytes()).hexdigest()
    for k, (effect, a, b, lvl) in enumerate(beds):
        src = sounds.get(effect)
        dst = stems / f"bed-{k}.wav"
        C.ff(ROOT / src["file"], dst, "anull")
        cues.append({"id": f"bed-{k}", "track": "bed", "stem": str(dst.relative_to(ROOT)), "loop": True, "loop_xfade_s": 1.5,
                     "at": {"cue": "@start", "offset": round(max(0, a - 0.5), 3)}, "until": {"cue": "@start", "offset": round(b + 0.5, 3)},
                     "level_db": lvl, "fade_in": 1.0, "fade_out": 1.0,
                     "source": {"effect": effect, "url": src["source"].get("url"), "author": src["source"].get("author"), "licence": src["source"]["licence"]}})
    end_card = adir / "end-card.json"
    timeline = {
        "about": "Fifteen Days, the coverage cut (owner's rules, 2026-10-17; docs/coverage.md; scripts/cut-coverage.py from coverage-board.json). "
                 "Setups, variants, cut points and sound places DRAFTED by the coding agent.",
        "seed": seed, "placeholder": True, "placeholder_reason": "frames drawn and self-reviewed, for the owner's final watch",
        "video": {"width": 1920, "height": 1080, "fps": 30}, "loudness": {"integrated_lufs": -16, "true_peak_db": -1, "lra": 11},
        "tail_s": 1.0, "tracks": {"voice": {"level_db": 0}, "bed": {"level_db": -24}, "foley": {"level_db": -10}, "music": {"level_db": -16}},
        "rooms": C.ROOMS, "cues": cues, "shots": shots, "lettering": [], "subtitles": subs,
        "end_card": {"file": str(end_card.relative_to(ROOT)), "seconds": 8, "fade_s": 0.8}, "notes": notes,
    }
    (work / "timeline.json").write_text(json.dumps(timeline, indent=1, ensure_ascii=False) + "\n")
    by = {}
    for s in shots:
        by[s["picture"]] = by.get(s["picture"], 0) + 1
    print(f"coverage: {len(shots)} shots, {sum(1 for c in cues if c['track'] == 'voice' and c['id'] in lines)} lines, about {t + 1 + 8:.0f} s with the end card; pictures {by}")
    for x in notes:
        print("  ", x)
    if "--render" in sys.argv:
        rel = str((work / "timeline.json").relative_to(ROOT))
        py = "/Users/nathan/snowmoon/.venv-voice/bin/python"
        subprocess.run([py, "scripts/mix-scene.py", seed, "--timeline", rel], cwd=ROOT, check=True)
        subprocess.run([py, "scripts/render-scene.py", seed, "--timeline", rel], cwd=ROOT, check=True)
        (work.parent / "coverage.mp4").write_bytes((work / "coverage.mp4").read_bytes())
        print("wrote", (work.parent / "coverage.mp4").relative_to(ROOT))


if __name__ == "__main__":
    main()
