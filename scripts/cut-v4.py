"""Build the Fifteen Days cuts from storyboard v4: Full (every shot), Tight (about 3:00-3:30, close-up-heavy) and Five
(about five minutes, from the owner's notes in the clip viewer, 2026-10-17: no camera moves, tighter gaps, trims, sounds).

  /Users/nathan/snowmoon/.venv-voice/bin/python scripts/cut-v4.py fifteen-days [full|tight|both|five] [--render]

Per cut, writes scenes-out/<seed>/cuts/<cut>/timeline.json (every time absolute, from @start), its stems,
and, with --render, runs scripts/mix-scene.py and scripts/render-scene.py on it: <cut>.mp4 beside it,
then copies it to scenes-out/<seed>/cuts/<cut>.mp4.

Pictures, per shot, the first that exists:
  adaptations/<seed>/preprod/overnight/cut-pictures.json {"<shot>": "<file>"} (the picked frame),
  images-out/preprod/pass/<shot>.png (the full pass), images-out/preprod/test3/T3-<shot>.png (the café test),
  images-out/preprod/thumbs/thumb-<shot>.png (the shot list's sketches), images-out/preprod/set/<shot>.png (the set frame).
The book's own pictures stand in for the composite inserts (the menu, the messages, the console board).

Sound: the converted lines (Zei and Bai from lines-v3, the provisional new voices; Deluin and the robot
from lines-v2), each scene's acoustics, the CC0 beds, the live game in the hall, Dreadnaught v3 at Bai's
headphones, the laugh, and the synthesized device sounds. Subtitles: the script's words, as recorded.
Line gaps, holds, device-sound places and the tight cut's choices are DRAFTED by the coding agent.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
PRE = ROOT / "images-out" / "preprod"
ROOMS = {
    "hall": "highpass=f=90,aecho=0.8:0.6:60|110:0.18|0.12",          # the overlook, high in the big hall
    "corridor": "highpass=f=80,aecho=0.85:0.7:37|71|113:0.26|0.17|0.10",
    "courtyard": "highpass=f=70,aecho=0.9:0.6:14:0.06",
    "gate": "highpass=f=70,aecho=0.9:0.6:55:0.08",
    "lobby": "highpass=f=80,aecho=0.85:0.55:18|31:0.14|0.09",
}
SCENE_ROOM = {"hall": "hall", "gallery": "hall", "corridor": "corridor", "courtyard": "courtyard", "gate": "gate", "lobby": "lobby"}
BEDS = {"hall": ("bed: match hall", 2), "gallery": ("bed: match hall", -1), "corridor": ("bed: corridor", -2),
        "courtyard": ("bed: courtyard café", 0), "gate": ("bed: gate at dusk", -2), "lobby": ("bed: lobby restaurant", -2)}
VOICE = {"Zei": ("lines-v3", "zei-v4b"), "Bai": ("lines-v3", "bai-v3b"), "Deluin": ("lines-v2", "deluin-v2"), "Robot": ("lines-v2", "robot")}
INSERT = {"F12": "scenes-out/{seed}/inserts/c14-b108.png", "L03": "scenes-out/{seed}/inserts/c15-b50.png",
          "L07": "scenes-out/{seed}/inserts/c15-b53.png", "L09": "scenes-out/{seed}/inserts/c15-b55.png",
          "H04": "images-out/preprod/refs/board-console-fog.png"}
# Device sounds and the hall's game, placed on shots: (shot, effect, offset into the shot, level dB, length s). Drafted.
FX = [("H01", "hall: crowd swell", 0.3, -10, 6.0), ("H02", "hall: drone", 0.2, -16, 3.5), ("G08", "hall: gasp", 0.8, -12, 2.5),
      ("G11", "hall: alarm", 1.5, -14, 1.0), ("H07", "hall: crowd swell", 0.0, -6, 5.0),
      ("F08", "device: robot-glide", 0.0, -8, 2.5), ("F09", "device: robot-greet", 0.1, -10, 1.2),
      ("F11", "device: menu-appears", 0.0, -10, 1.5), ("F13", "device: menu-tap-1", 1.2, -14, 0.5),
      ("F17", "device: menu-tap-2", 1.8, -14, 0.5), ("F18", "device: menu-tap-3", 1.0, -14, 0.5),
      ("F25", "device: robot-acknowledge", 0.2, -10, 1.2), ("S01", "device: robot-glide", 0.0, -12, 2.0),
      ("D08", "device: message-sent", 1.6, -8, 1.2),
      ("L02", "device: menu-tap-1", 0.8, -14, 0.5), ("L02", "device: menu-tap-2", 1.6, -14, 0.5),
      ("L03", "device: message-sent", 1.2, -9, 1.2), ("L04", "device: robot-glide", 0.0, -14, 2.0),
      ("L07", "device: message-received-a", 0.2, -8, 1.5), ("L09", "device: message-received-b", 0.2, -8, 1.5)]
# The tight cut: every shot that carries a line (its close shots first), and only these wordless beats.
TIGHT_SILENT = {"H01", "G02", "H08", "C01", "F06", "F07", "F12", "S02", "S09", "S12", "S12b", "D03", "D04", "D08", "D09",
                "L01b", "L02", "L03", "L05", "L06", "L07", "L08", "L09", "L10", "L11"}
CLOSE = ("CU", "ECU", "MCU", "INSERT", "OTS", "POV")
# gap: a pause inside a performance longer than this is shortened to it (the words and their order never change).
SPEC = {"full": dict(lead=0.45, tail=0.65, within=0.35, floor=True, silent_max=99, silent_min=0, min_shot=1.2, gap=None),
        "tight": dict(lead=0.1, tail=0.25, within=0.1, floor=False, silent_max=1.4, silent_min=1.2, min_shot=1.0, gap=0.3),
        "five": dict(lead=0.1, tail=0.25, within=0.12, floor=False, silent_max=1.5, silent_min=1.0, min_shot=1.0, gap=0.35)}

# The five-minute cut (the owner's notes in the clip viewer, 2026-10-17, and the Claude notes the owner kept). One cut in
# the full cut's order: no camera moves, tighter gaps, these shots out, these holds, these sounds. Places DRAFTED by the coding agent.
FIVE_DROP = {"H06", "G04", "F25", "S09"}            # H06 "leave it out"; G04 no close-up; F25 the shot and its sound; S09 moves to S12b
FIVE_PICTURE = {"S12b": "S09"}                       # "this image is later, after the flick": the sugar wall stands in for S12b
FIVE_HOLD = {"H01": 2.2, "C02": 1.2, "D09": 4.0, "L01": 2.5, "L03": 2.5, "L07": 3.5, "L09": 2.5, "L11": 2.5}
FIVE_PAUSE = {"b1-4": 2.5}                           # "a pause before 'such patience'": the game holds first
FIVE_OVERLAP = {"C06": 1.5}                          # "this shot while he's still talking": starts before the line ends
FIVE_ANCHOR = {"C09": ("b2-6", 2.2)}                 # no shot with Bai until "Bai, you're welcome"
# A fixed framing (x, y, zoom) in place of a move: Zei alone where Bai stood beside him (Claude notes, kept by the owner).
FIVE_FRAME = {"S04": (0.33, 0.4, 1.7), "S10": (0.44, 0.42, 1.7), "R02": (0.35, 0.33, 1.7)}
# The owner's notes on the takes: (start, end) seconds kept from each converted line (script.md has the same words, "performed").
TRIM = {"b2-10": (1.28, None),                       # the vocalization before "Was"
        "b2-11": (1.25, None),                       # "Cut out the line 'Deluin?'"
        "b2-6": (None, 6.75),                        # "this is Bye, not Bai, and we can cut it"
        "b3-2": (2.40, None)}                        # the robot: only the last of the two readings
ROBOT_FX = "tremolo=f=55:d=0.35,aecho=0.6:0.5:7:0.4"   # "you can also create robot synthesized voice here" (drafted)
FX_FROM = {"hall: crowd swell": 2.5}                 # skip the announcer's "number 11" at the start of the swell
FIVE_FX = [("H01", "game: flyby", 0.4, -14, 2.6), ("H02", "game: blast", 0.3, -12, 1.6), ("H02", "game: flyby", 1.0, -16, 2.6),
           ("H03", "game: blast", 0.6, -15, 1.6), ("H05", "game: crash", 0.3, -13, 2.4), ("G02", "game: blast", 0.6, -22, 1.6),
           ("G05", "game: flyby", 0.5, -24, 2.6), ("G08", "game: crash", 0.6, -18, 2.4), ("G08", "game: blast", 1.8, -20, 1.6),
           ("G10", "game: blast", 0.4, -22, 1.6), ("G11", "game: wall", 0.5, -18, 3.2), ("H07", "game: wall", 0.0, -12, 3.2),
           ("H07", "game: crash", 0.6, -12, 2.4), ("C02", "device: elevator-arrive", 0.0, -8, 2.2)]
FIVE_BED_DB = {"bed: courtyard café": 5}             # "need ambient café sounds"
LETTERS = {"H01": "Sadzu Du, Dzego · 3724 Firemoon 10",  # script beat 1 (book c14-b1)
           "L01": "Pafogai Du, Dzego · 3724 Firemoon 17",  # book c15-b48 (place) and c15-b1 (the chapter's date; owner, 2026-10-17)
           "D09": "That day was his last Minpentai game- the last day when his life was somewhat normal."}  # beat 6, on screen


def lettered(src: Path, dst: Path, text: str) -> None:
    """On-screen words baked into a still (the cut has no camera moves, so they stay put): lower left, white, soft shadow."""
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    img = Image.open(src).convert("RGB").resize((1920, 1080), Image.LANCZOS)
    font = ImageFont.truetype(str(ROOT / "node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-600-normal.woff"), 46)
    rows = [""]
    for w in text.split():
        if rows[-1] and len(rows[-1]) + 1 + len(w) > 52:
            rows.append(w)
        else:
            rows[-1] = (rows[-1] + " " + w).strip()
    y0 = 1080 - 110 - 60 * (len(rows) - 1)
    shade = Image.new("L", img.size, 0)
    ds = ImageDraw.Draw(shade)
    for i, r in enumerate(rows):
        ds.text((96, y0 + 60 * i), r, font=font, fill=200)
    img.paste((0, 0, 0), (0, 0), shade.filter(ImageFilter.GaussianBlur(6)))
    d = ImageDraw.Draw(img)
    for i, r in enumerate(rows):
        d.text((96, y0 + 60 * i), r, font=font, fill=(244, 240, 230))
    img.save(dst)


def first_sentence(src: Path, dst: Path) -> None:
    """c15-b55's screen block cut to its first sentence (Claude note, kept): the rows above "Some Arctic soldier" and the
    block's bottom edge, with the sender and number cells moved up into the shorter row."""
    from PIL import Image
    im = Image.open(src).convert("RGB")
    top, bottom = im.crop((0, 0, im.width, 340)), im.crop((0, im.height - 52, im.width, im.height))
    out = Image.new("RGB", (im.width, 340 + 52))
    out.paste(top, (0, 0))
    out.paste(bottom, (0, 340))
    for box in ((52, 770, 418, 850), (424, 790, 506, 840), (1349, 770, 1532, 850)):  # Deluin, the arrow, 84714
        cell = im.crop(box)
        out.paste(cell, (box[0], 258 - (box[3] - box[1]) // 2))
    out.save(dst)


def tighten(src: Path, dst: Path, gap: float | None) -> None:
    """Trim the take's silence at either end to 50 ms and, with gap, shorten each pause inside it to gap seconds
    (the pause's own room tone, split around the cut). The words and their order never change."""
    import librosa
    import numpy as np
    y, sr = sf.read(src, dtype="float32")
    y = y if y.ndim == 1 else y.mean(1)
    iv = librosa.effects.split(y, top_db=38, frame_length=1024, hop_length=256)
    if not len(iv):
        sf.write(dst, y, sr, subtype="FLOAT")
        return
    pad = int(0.05 * sr)
    a0, b0 = max(0, iv[0][0] - pad), min(len(y), iv[-1][1] + pad)
    if gap is None:
        sf.write(dst, y[a0:b0], sr, subtype="FLOAT")
        return
    keep, out, cur = int(gap * sr), [], a0
    for (pa, pb), (na, nb) in zip(iv[:-1], iv[1:]):
        if na - pb > keep:  # a long pause: keep its first and last halves of `gap`, joined with a 10 ms crossfade
            h, x = keep // 2, int(0.01 * sr)
            head, tail = y[cur:pb + h].copy(), y[na - h:na].copy()
            ramp = np.linspace(0, 1, x, dtype=np.float32)
            head[-x:] = head[-x:] * (1 - ramp) + tail[:x] * ramp
            out += [head, tail[x:]]
            cur = na
    out.append(y[cur:b0])
    sf.write(dst, np.concatenate(out), sr, subtype="FLOAT")


def ff(src: Path, dst: Path, af: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", af, "-ar", "48000", "-ac", "1", "-c:a", "pcm_f32le", str(dst)], check=True)


def picture(seed: str, s: dict, picks: dict) -> tuple[str, str]:
    sid = s["id"]
    if sid in picks and (ROOT / picks[sid]).exists():
        return picks[sid], "picked"
    if sid in INSERT and (ROOT / INSERT[sid].format(seed=seed)).exists():
        return INSERT[sid].format(seed=seed), "the book's own picture"
    for p, what in ((PRE / "pass" / f"{sid}.png", "full pass"), (PRE / "test3" / f"T3-{sid}.png", "café test"),
                    (PRE / "thumbs" / f"thumb-{sid}.png", "shot-list sketch (placeholder)"), (PRE / "set" / f"{sid}.png", "set frame (placeholder)")):
        if p.exists():
            return str(p.relative_to(ROOT)), what
    return "", "none"


def framed(src: Path, dst: Path) -> None:
    """A book insert on a night-dark 16:9 frame (as rough-cut.py does)."""
    from PIL import Image, ImageDraw
    img = Image.open(src).convert("RGB")
    W, H = 1920, 1080
    k = min(W * 0.8 / img.width, H * 0.8 / img.height)
    img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    frame = Image.new("RGB", (W, H), (12, 14, 28))
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=round(min(img.size) * 0.05), fill=255)
    frame.paste(img, ((W - img.width) // 2, (H - img.height) // 2), mask)
    frame.save(dst)


def chunks(text: str, n: int = 80) -> list[str]:
    """The line's own words in subtitle-sized pieces, split at sentence ends, then commas, never mid-word."""
    parts = re.split(r"(?<=[.!?…])\s+", text.strip())
    out = []
    for p in parts:
        while len(p) > n:
            cut = p.rfind(", ", 0, n)
            cut = cut + 1 if cut > n // 3 else p.rfind(" ", 0, n)
            out.append(p[:cut].strip())
            p = p[cut:].strip()
        if out and len(out[-1]) + len(p) + 1 <= n:
            out[-1] = out[-1] + " " + p
        else:
            out.append(p)
    return out


def build(seed: str, cut: str) -> Path:
    P = SPEC[cut]
    adir, sout = ROOT / "adaptations" / seed, ROOT / "scenes-out" / seed
    work = sout / "cuts" / cut
    stems = work / "stems"
    stems.mkdir(parents=True, exist_ok=True)
    board = json.loads((adir / "preprod" / "storyboard-v4.json").read_text())["shots"]
    lines = {l["ref"]: l for l in json.loads((adir / "recording-lines.json").read_text())["lines"]}
    sounds = {x["effect"]: x for x in json.loads((adir / "sounds" / "recipe.json").read_text())["sounds"]}
    pk = adir / "preprod" / "overnight" / "cut-pictures.json"
    picks = json.loads(pk.read_text()) if pk.exists() else {}

    # Which shots carry which lines: a line spans from the first shot that names it to the last.
    refs_of = [re.findall(r"\bb\d-\d+\b", s.get("line") or "") for s in board]
    span = {}
    for i, rs in enumerate(refs_of):
        for r in rs:
            span.setdefault(r, [i, i])[1] = i
    missing = set(lines) - set(span)
    if missing:
        raise SystemExit(f"lines on no shot: {sorted(missing)}")
    # Units: runs of shots joined by the lines they carry; a shot with no line is a unit of its own.
    owner = {}
    for r, (a, b) in sorted(span.items(), key=lambda kv: kv[1]):
        for i in range(a, b + 1):
            owner.setdefault(i, set()).add(r)
    units, i = [], 0
    while i < len(board):
        if i not in owner:
            units.append({"shots": [i], "lines": []})
            i += 1
            continue
        j, rs = i, set(owner[i])
        while j + 1 < len(board) and (j + 1 in owner and owner[j + 1] & rs or any(span[r][1] > j for r in rs)):
            j += 1
            rs |= owner.get(j, set())
        order = sorted(rs, key=lambda r: lines[r]["n"])
        units.append({"shots": list(range(i, j + 1)), "lines": order})
        i = j + 1

    # approach C (owner, 2026-10-16 night): the tight cut leans on frames that passed review; a wordless beat whose best frame
    # failed is left out, and a line's span prefers its close shots that passed
    od = ROOT / "adaptations" / seed / "preprod" / "overnight"
    rv = json.loads((od / "frames-review.json").read_text()) if (od / "frames-review.json").exists() else {}
    fpk = json.loads((od / "frames-picks.json").read_text()) if (od / "frames-picks.json").exists() else {}
    passing = {k for k, v in fpk.items() if v and rv.get(v[0], {}).get("pass")}

    def keep(s: dict) -> bool:
        if s.get("optional"):
            return False
        if cut == "five":
            return s["id"] not in FIVE_DROP
        if cut == "full":
            return True
        return s["id"] in TIGHT_SILENT and (s["id"] in passing or s["id"] not in fpk)

    cues, shots, subs, notes = [], [], [], []
    t = 0.0
    beds = []  # (scene, start, end)
    first_at = {}
    for u in units:
        ss = [board[k] for k in u["shots"]]
        kept = [s for s in ss if keep(s) or (u["lines"] and cut != "five")]
        if u["lines"] and cut == "tight":  # a line's span keeps its close shots, and its wide only if there is nothing else
            close = [s for s in ss if any(re.search(rf"\b{c}\b", s["size"].upper()) for c in CLOSE)]
            kept = [s for s in close if s["id"] in passing] or close or ss[:1]
        if not kept:
            continue
        scene = ss[0]["scene"]
        voice_t = 0.0
        placed = []
        for r in u["lines"]:
            l = lines[r]
            folder, vid = VOICE[l["speaker"]]
            src = sout / folder / f"L{l['n']:02d}-{r}.{vid}.wav"
            if not src.exists():
                raise SystemExit(f"no converted line {src.relative_to(ROOT)}")
            dst = stems / f"{r}.wav"
            tight = stems / f"{r}.tight.wav"
            take = src
            if cut == "five" and r in TRIM:  # the owner's trims, before the pauses are tightened
                a, b = TRIM[r]
                take = stems / f"{r}.trim.wav"
                ff(src, take, f"atrim=start={a or 0}" + (f":end={b}" if b else "") + ",asetpts=PTS-STARTPTS")
            tighten(take, tight, P["gap"])
            room = ROOMS[SCENE_ROOM[scene]]
            ff(tight, dst, f"{ROBOT_FX},{room}" if cut == "five" and l["speaker"] == "Robot" else room)
            tight.unlink()
            if take != src:
                take.unlink()
            d = sf.info(dst).duration
            if cut == "five":
                voice_t += FIVE_PAUSE.get(r, 0)
            placed.append((r, l, src, dst, voice_t, d))
            voice_t += d + P["within"]
        voice_t -= P["within"] if placed else 0
        weights = [s["dur_s"] for s in kept]
        if u["lines"]:
            length = P["lead"] + voice_t + P["tail"]
            if P["floor"]:
                length = max(length, sum(weights))
            length = max(length, P["min_shot"] * len(kept))
        else:
            length = min(max(weights[0], P["silent_min"]), P["silent_max"])
            if cut == "five":
                length = FIVE_HOLD.get(kept[0]["id"], length)
                back = FIVE_OVERLAP.get(kept[0]["id"], 0)
                t -= back
                length += back
        for r, l, src, dst, off, d in placed:
            cues.append({"id": r, "track": "voice", "stem": str(dst.relative_to(ROOT)), "at": {"cue": "@start", "offset": round(t + P["lead"] + off, 3)},
                         "room": SCENE_ROOM[scene], "source": {"converted": str(src.relative_to(ROOT)), "voice": VOICE[l["speaker"]][1]}})
            pieces = chunks(l["text"])
            total = sum(len(p) for p in pieces)
            acc = 0
            for p in pieces:
                subs.append({"cue": r, "text": p, "from": round(acc / total, 4), "to": round((acc + len(p)) / total, 4)})
                acc += len(p)
        acc = t
        unit_shots = []
        for s, w in zip(kept, weights):
            img, what = picture(seed, {**s, "id": FIVE_PICTURE[s["id"]]} if cut == "five" and s["id"] in FIVE_PICTURE else s, picks)
            if not img:
                notes.append(f"{s['id']}: no picture; dropped")
                continue
            if s["id"] in INSERT and what == "the book's own picture" and s["id"] != "H04":
                dst = work / f"insert-{s['id']}.png"
                framed(ROOT / img, dst)
                img = str(dst.relative_to(ROOT))
            if cut == "five" and s["id"] == "L09":
                dst = work / "insert-L09-first.png"
                first_sentence(ROOT / INSERT["L09"].format(seed=seed), dst)
                framed(dst, dst)
                img = str(dst.relative_to(ROOT))
            if cut == "five" and s["id"] in LETTERS:
                dst = work / f"lettered-{s['id']}.png"
                lettered(ROOT / img, dst, LETTERS[s["id"]])
                img = str(dst.relative_to(ROOT))
            push = 0.06 if what != "the book's own picture" else 0.03
            move = {"kind": "push", "from": {"x": 0.5, "y": 0.5, "zoom": 1.0}, "to": {"x": 0.5, "y": 0.47, "zoom": 1.0 + push}, "ease": "inout"}
            if cut == "five":  # "no panning or zooming on any of the stills"
                x, y, z = FIVE_FRAME.get(s["id"], (0.5, 0.5, 1.0))
                move = {"kind": "push", "from": {"x": x, "y": y, "zoom": z}, "to": {"x": x, "y": y, "zoom": z}, "ease": "linear"}
            shots.append({"id": s["id"], "image": img, "picture": what, "at": {"cue": "@start", "offset": round(acc, 3)},
                          "transition": {"type": "cut"}, "move": move})
            unit_shots.append(shots[-1])
            first_at.setdefault(s["id"], acc)
            acc += length * w / sum(weights)
        if cut == "five":
            for sh in unit_shots:
                if sh["id"] in FIVE_ANCHOR:
                    ref, off = FIVE_ANCHOR[sh["id"]]
                    at = next((c["at"]["offset"] for c in cues if c["id"] == ref), None)
                    if at is not None:
                        sh["at"]["offset"] = round(at + off, 3)
        for s in ss:  # a shot the cut leaves out still places its sounds, at its unit's start
            first_at.setdefault(s["id"], t)
        if beds and beds[-1][0] == BEDS[scene][0]:
            beds[-1][2] = t + length
        else:
            beds.append([BEDS[scene][0], t, t + length, BEDS[scene][1] + (FIVE_BED_DB.get(BEDS[scene][0], 0) if cut == "five" else 0)])
        t += length

    import hashlib
    for s in shots:
        s["image_sha256"] = hashlib.sha256((ROOT / s["image"]).read_bytes()).hexdigest()
    # Beds: each place's bed from its first shot to the next place's, crossfaded over 1.5 s.
    for k, (effect, a, b, lvl) in enumerate(beds):
        src = sounds.get(effect)
        if not src:
            notes.append(f"bed {effect}: not downloaded; left out")
            continue
        cid = f"bed-{k}"
        dst = stems / f"{cid}.wav"
        ff(ROOT / src["file"], dst, "lowpass=f=2200,volume=0.9" if effect == "bed: match hall" and k and beds[k - 1][0] != effect else "anull")
        cues.append({"id": cid, "track": "bed", "stem": str(dst.relative_to(ROOT)), "loop": True, "loop_xfade_s": 1.5,
                     "at": {"cue": "@start", "offset": round(max(0, a - 0.75), 3)}, "until": {"cue": "@start", "offset": round(b + 0.75, 3)},
                     "level_db": lvl, "fade_in": 1.5, "fade_out": 1.5,
                     "source": {"effect": effect, "url": src["source"].get("url"), "author": src["source"].get("author"), "licence": src["source"]["licence"]}})
    for n, (sid, effect, off, lvl, dur) in enumerate(FX + (FIVE_FX if cut == "five" else [])):
        if sid not in first_at or effect not in sounds or (cut == "five" and sid in FIVE_DROP):
            continue
        dst = stems / f"fx-{n}.wav"
        a = FX_FROM.get(effect, 0) if cut == "five" else 0
        ff(ROOT / sounds[effect]["file"], dst, f"atrim={a}:{a + dur},asetpts=PTS-STARTPTS,afade=t=out:st={max(dur - 0.4, 0)}:d=0.4")
        cues.append({"id": f"fx-{n}", "track": "foley", "stem": str(dst.relative_to(ROOT)), "at": {"cue": "@start", "offset": round(first_at[sid] + off, 3)},
                     "level_db": lvl, "fade_in": 0.03, "fade_out": 0.2, "note": f"{effect} on {sid} (drafted place)",
                     "source": {"effect": effect, "licence": sounds[effect]["source"]["licence"]}})
    # The laugh: Deluin and Bai laughing at the table as Zei comes in (the agent's pick of four takes).
    laugh_at = first_at["F03"] - 0.3 if "F03" in first_at else next(c["at"]["offset"] for c in cues if c["id"] == "b3-1") - 2.6
    if True:
        dst = stems / "laugh.wav"
        ff(sout / "lines-v2" / "X-laugh-3.deluin-v2.wav", dst, ROOMS["courtyard"])
        cues.append({"id": "laugh", "track": "voice", "stem": str(dst.relative_to(ROOT)), "at": {"cue": "@start", "offset": round(max(0, laugh_at), 3)},
                     "level_db": -5, "note": "Deluin laughing at the table as Zei arrives"})
    # Dreadnaught v3 blares as Bai pulls her headphones off (R08), then leaks from them once they're back on (R09).
    music = json.loads((adir / "music" / "recipe.json").read_text())
    v3 = next(v for v in music["versions"] if v["id"] == "dreadnaught-v3-fal")
    if "R08" in first_at:
        a = first_at["R08"] - 0.1
        b = first_at.get("R09", a + 2.0) + 1.3
        loud = stems / "dreadnaught-loud.wav"
        ff(ROOT / v3["file"], loud, f"atrim=0:{b - a + 0.3}")
        cues.append({"id": "dreadnaught", "track": "music", "stem": str(loud.relative_to(ROOT)), "at": {"cue": "@start", "offset": round(a, 3)},
                     "level_db": 4, "fade_in": 0.08, "fade_out": 0.3, "note": "Dreadnaught v3 (owner's pick), blaring from the pulled-off headphone"})
        leak = stems / "dreadnaught-leak.wav"
        ff(ROOT / v3["file"], leak, f"atrim={b - a}:12,asetpts=PTS-STARTPTS,lowpass=f=1400,highpass=f=300")
        cues.append({"id": "dreadnaught-leak", "track": "music", "stem": str(leak.relative_to(ROOT)), "at": {"cue": "@start", "offset": round(b, 3)},
                     "level_db": -12, "fade_in": 0.2, "fade_out": 1.5, "note": "the same, leaking thin from her headphones once they're back on"})
    if cut == "five":  # "fade to black and the end card, with no overlap"
        from PIL import Image
        black = work / "black.png"
        Image.new("RGB", (1920, 1080), (0, 0, 0)).save(black)
        shots.append({"id": "BLACK", "image": str(black.relative_to(ROOT)), "picture": "black", "at": {"cue": "@start", "offset": round(t, 3)},
                      "transition": {"type": "dissolve", "seconds": 0.8}, "image_sha256": hashlib.sha256(black.read_bytes()).hexdigest(),
                      "move": {"kind": "push", "from": {"x": 0.5, "y": 0.5, "zoom": 1.0}, "to": {"x": 0.5, "y": 0.5, "zoom": 1.0}, "ease": "linear"}})
        t += 1.6
    end_card = adir / "end-card.json"
    timeline = {
        "about": f"Fifteen Days, {cut} cut (overnight 2026-10-16/17, scripts/cut-v4.py): storyboard v4's shots, the converted lines, beds, the game, "
                 "Dreadnaught v3, device sounds, subtitles from the script, end card B. Gaps, holds, sound places and the tight cut's choices DRAFTED by the coding agent.",
        "seed": seed, "placeholder": True,
        "placeholder_reason": "frames still being drawn and picked; voices for Zei and Bai provisional (zei-v4b, bai-v3b) until the owner confirms",
        "video": {"width": 1920, "height": 1080, "fps": 30}, "loudness": {"integrated_lufs": -16, "true_peak_db": -1, "lra": 11},
        "tail_s": 1.5, "tracks": {"voice": {"level_db": 0}, "bed": {"level_db": -24}, "foley": {"level_db": -10}, "music": {"level_db": -16}},
        "rooms": ROOMS, "cues": cues, "shots": shots, "lettering": [], "subtitles": subs,
        "end_card": {"file": str(end_card.relative_to(ROOT)), "seconds": 8, "fade_s": 0.8},
        "notes": notes,
    }
    (work / "timeline.json").write_text(json.dumps(timeline, indent=1, ensure_ascii=False) + "\n")
    by = {}
    for s in shots:
        by[s["picture"]] = by.get(s["picture"], 0) + 1
    print(f"{cut}: {len(shots)} shots, {sum(1 for c in cues if c['track'] == 'voice' and c['id'] != 'laugh')} lines, about {t + 1.5 + 8:.0f} s with the end card; pictures {by}")
    for n in notes:
        print("  ", n)
    return work / "timeline.json"


def main() -> None:
    seed = sys.argv[1]
    which = next((a for a in sys.argv[2:] if a in ("full", "tight", "both")), "both")
    which = next((a for a in sys.argv[2:] if a in ("full", "tight", "both", "five")), "both")
    cuts = ["full", "tight"] if which == "both" else [which]
    for cut in cuts:
        tl = build(seed, cut)
        if "--render" in sys.argv:
            rel = str(tl.relative_to(ROOT))
            py = "/Users/nathan/snowmoon/.venv-voice/bin/python"
            subprocess.run([py, "scripts/mix-scene.py", seed, "--timeline", rel], cwd=ROOT, check=True)
            subprocess.run([py, "scripts/render-scene.py", seed, "--timeline", rel], cwd=ROOT, check=True)
            out = tl.parent / f"{cut}.mp4"
            dst = tl.parent.parent / f"{cut}.mp4"
            dst.write_bytes(out.read_bytes())
            print("wrote", dst.relative_to(ROOT))


if __name__ == "__main__":
    main()
