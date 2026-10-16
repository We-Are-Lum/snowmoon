"""Build an adaptation's rough cut: the converted lines in each location's acoustics, music, stand-in cards.

  /Users/nathan/snowmoon/.venv-image/bin/python scripts/rough-cut.py fifteen-days
  then: python scripts/mix-scene.py fifteen-days && python scripts/render-scene.py fifteen-days

Reads script.md's lines (recording-lines.json), the converted lines in scenes-out/<seed>/lines/, the
drafted shot list (shots.json) and the music recipe, and writes:
- scenes-out/<seed>/stems/<ref>.wav: each line with its location's acoustics (ROOMS below, ffmpeg
  filters: a short early-reflection pattern and a gentle band limit; outdoor places nearly dry), and
  silent stems for the drafted holds of the wordless shots, and each location's bed (CC0, from
  sounds/recipe.json), looped with crossfades and crossfaded into the next at each change of place;
- scenes-out/<seed>/cards/<shot>.png: a stand-in card per shot (its number, name and drafted subject,
  or the book insert it stands for) until the stills are drawn;
- adaptations/<seed>/timeline.json, marked "placeholder" (stand-in cards): every line chained after
  the one before (0.35 s inside a beat, 1.6 s between beats), shots on their anchors from shots.json,
  the chosen music cue, and the laugh. Its mix and render recipes stay in scenes-out/.
The robot's line is the owner's take converted into the robot's designed voice (voices/robot.json,
the owner's description); a line with no converted file falls back to the take with a robotic filter,
a stand-in, never published. The gate is the city hum alone (owner, 2026-10-15). A bed that isn't downloaded yet is left out (the gate uses the café, darker, until its own arrive).
"""

import hashlib
import json
import subprocess
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
TAKES = Path.home() / "snowmoon-takes" / "full" / "takes"
# Each beat's place, and its acoustics as ffmpeg filters (drafted by the coding agent; tune by ear).
ROOMS = {
    "waiting room": "highpass=f=90,aecho=0.85:0.55:18|31:0.16|0.10,lowpass=f=9000",
    "rock corridor": "highpass=f=80,aecho=0.85:0.7:37|71|113:0.26|0.17|0.10",
    "courtyard café, open air": "highpass=f=70,aecho=0.9:0.6:14:0.06",
    "street gate at dusk": "highpass=f=70,aecho=0.9:0.6:55:0.08",
}
BEAT_ROOM = {1: "waiting room", 2: "rock corridor", 3: "courtyard café, open air", 4: "courtyard café, open air",
             5: "courtyard café, open air", 6: "street gate at dusk"}
ROBOT = "aecho=0.8:0.7:6|11:0.4|0.3,highpass=f=300,lowpass=f=5000,acrusher=bits=10:samples=3:mix=0.35"
WITHIN, BETWEEN = 0.35, 1.6
LAUGH = "X-laugh-3.deluin.wav"  # the owner left the pick to the agent: the longest, quietest one, still laughing as Zei arrives


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def ffmpeg(src: Path, dst: Path, af: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", af, "-ar", "48000", "-ac", "1", "-c:a", "pcm_f32le", str(dst)], check=True)


# The book's own pictures and screens (scripts/capture-screen.ts, scenes-out/<seed>/inserts/), on a night-dark frame.
INSERTS = {"s16": "c14-b108", "s35": "c15-b50", "s37": "c15-b53", "s39": "c15-b55"}
# Shots with no frame that passed the review (owner's rule: redraw doubles, extras dressed like the cast, lettering).
UNRESOLVED = {"s28"}


def insert_frame(src: Path, dst: Path) -> None:
    img = Image.open(src).convert("RGB")
    W, H = 1920, 1080
    k = min(W * 0.8 / img.width, H * 0.8 / img.height)
    img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    frame = Image.new("RGB", (W, H), (12, 14, 28))
    # The capture's corners outside its rounded frame are the page's white: leave them out.
    from PIL import ImageDraw as _D
    mask = Image.new("L", img.size, 0)
    _D.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=round(min(img.size) * 0.05), fill=255)
    frame.paste(img, ((W - img.width) // 2, (H - img.height) // 2), mask)
    frame.save(dst)


def card(path: Path, shot: dict) -> None:
    img = Image.new("RGB", (1920, 1080), (52, 56, 64))
    d = ImageDraw.Draw(img)
    face = "/System/Library/Fonts/Supplemental/Arial.ttf"
    big, mid, small = (ImageFont.truetype(face, n) for n in (72, 40, 32))
    for x in range(0, 1920, 120):
        d.line([(x, 0), (x, 1080)], fill=(62, 66, 75), width=2)
    for y in range(0, 1080, 120):
        d.line([(0, y), (1920, y)], fill=(62, 66, 75), width=2)
    d.text((960, 300), f"STAND-IN · {shot['id']} · beat {shot['beat']}", font=mid, fill=(200, 200, 200), anchor="mm")
    d.text((960, 400), shot["name"], font=big, fill=(245, 245, 245), anchor="mm")
    body = shot.get("subject") or f"Insert: {shot.get('insert')}"
    for i, line in enumerate(textwrap.wrap(body, 70)[:7]):
        d.text((960, 520 + i * 46), line, font=small, fill=(215, 215, 215), anchor="mm")
    if shot.get("lettering"):
        d.text((960, 900), f"lettering: {shot['lettering']}", font=small, fill=(240, 200, 120), anchor="mm")
    d.text((960, 1010), "drafted shot · not the picture", font=small, fill=(160, 160, 160), anchor="mm")
    img.save(path)


def main() -> None:
    seed = sys.argv[1]
    adir, out = ROOT / "adaptations" / seed, ROOT / "scenes-out" / seed
    lines = json.loads((adir / "recording-lines.json").read_text())["lines"]
    shots = json.loads((adir / "shots.json").read_text())["shots"]
    music = json.loads((adir / "music" / "recipe.json").read_text())
    stems, cards = out / "stems", out / "cards"
    stems.mkdir(parents=True, exist_ok=True)
    cards.mkdir(parents=True, exist_ok=True)

    cues, prev = [], None
    for l in lines:
        dst = stems / f"{l['ref']}.wav"
        conv = list((out / "lines").glob(f"L{l['n']:02d}-{l['ref']}.*.wav"))
        if conv:
            ffmpeg(conv[0], dst, ROOMS[BEAT_ROOM[l["beat"]]])
            src = {"converted": str(conv[0].relative_to(ROOT))}
        else:  # the robot: a stand-in from the owner's take
            take = next(TAKES.glob(f"L{l['n']:02d}-{l['ref']}.t1.wav"))
            ffmpeg(take, dst, ROBOT + "," + ROOMS[BEAT_ROOM[l["beat"]]])
            src = {"stand_in": "the owner's take with a robotic filter (no voice sheet yet); never published"}
        gap = BETWEEN if prev and prev["beat"] != l["beat"] else WITHIN
        at = {"cue": "@start", "offset": 9.0} if not prev else {"cue": prev["ref"], "edge": "end", "offset": gap}
        cues.append({"id": l["ref"], "track": "voice", "stem": str(dst.relative_to(ROOT)), "at": at,
                     "room": BEAT_ROOM[l["beat"]], "source": src})
        prev = l
    # Wordless shots: a silent stem per drafted hold, chained after the last line.
    last = lines[-1]["ref"]
    for s in shots:
        if s.get("hold_s") and s["at"]["cue"].startswith("s"):
            dst = stems / f"hold-{s['id']}.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", str(s["hold_s"]), "-c:a", "pcm_f32le", str(dst)], check=True)
    # Shots: anchors from shots.json; a shot anchored to the shot before starts at that shot's hold cue.
    tl_shots, hold_prev = [], None
    style = json.loads((adir / "style.json").read_text()) if (adir / "style.json").exists() else None
    drawn = {}
    if style and (adir / f"shots-{style['slug']}" / "recipe.json").exists():
        drawn = {e["shot"]: e for e in json.loads((adir / f"shots-{style['slug']}" / "recipe.json").read_text())["images"]
                 if not e.get("rejected")}
    # The owner's picks among the night's options (adaptations/<seed>/picks.json: {"<shot>": {"file": ...}}).
    picks = json.loads((adir / "picks.json").read_text())["picks"] if (adir / "picks.json").exists() else {}
    for s in shots:
        if s["id"] in picks and picks[s["id"]].get("file"):
            png = ROOT / picks[s["id"]]["file"]
        elif s["id"] in UNRESOLVED:
            continue  # no acceptable frame yet: the shot before holds instead
        elif s["id"] in drawn:
            png = ROOT / drawn[s["id"]]["file"]
        elif s.get("insert") and (out / "inserts" / f"{INSERTS[s['id']]}.png").exists():
            png = cards / f"{s['id']}.png"
            insert_frame(out / "inserts" / f"{INSERTS[s['id']]}.png", png)
        else:
            png = cards / f"{s['id']}.png"
            card(png, s)
        if s["at"]["cue"].startswith("s"):
            hold_id = f"hold-{s['id']}"
            prev_hold = f"hold-{s['at']['cue']}"
            anchor = {"cue": prev_hold, "edge": "end", "offset": 0} if any(c["id"] == prev_hold for c in cues) else {"cue": last, "edge": "end", "offset": 1.0}
            cues.append({"id": hold_id, "track": "hold", "stem": f"scenes-out/{seed}/stems/{hold_id}.wav", "at": anchor})
            at = {"cue": hold_id, "edge": "start", "offset": 0}
        else:
            at = s["at"]
        tl_shots.append({"id": s["id"], "image": str(png.relative_to(ROOT)), "image_sha256": sha256(png), "at": at,
                         "transition": s["transition"], "move": s["move"]})
    # Shots before the first line need a cue to sit on, in the hall: s02 is anchored from @start.
    v3 = next(v for v in music["versions"] if v["id"] == "dreadnaught-v3-fal")
    cues.append({"id": "dreadnaught", "track": "music", "stem": v3["file"], "at": {"cue": "b5-5", "edge": "start", "offset": -1.2},
                 "level_db": 4, "fade_in": 0.15, "fade_out": 2.0, "note": "Dreadnaught v3 (owner's pick), blaring as Bai pulls off one side of her headphones; sits under her line"})
    lp = out / "lines" / LAUGH
    ldst = stems / "laugh.wav"
    ffmpeg(lp, ldst, ROOMS["courtyard café, open air"])
    cues.append({"id": "laugh", "track": "voice", "stem": str(ldst.relative_to(ROOT)), "at": {"cue": "b3-1", "edge": "start", "offset": -2.6},
                 "level_db": -4, "note": "Deluin laughing at the table as Zei arrives (the owner's take, the agent's pick of four)"})
    # Location beds (CC0, sounds/recipe.json): each runs from its location's first shot to the next
    # location's, looped with crossfades, and crossfades into the next bed over XF seconds at the cut.
    sounds = {x["effect"]: x for x in json.loads((adir / "sounds" / "recipe.json").read_text())["sounds"]} if (adir / "sounds" / "recipe.json").exists() else {}
    XF = 1.5
    def bed(cid, effect, start, until, level, af="anull", note=None):
        src = sounds.get(effect)
        if not src:
            return
        dst = stems / f"{cid}.wav"
        ffmpeg(ROOT / src["file"], dst, af)
        cues.append({"id": cid, "track": "bed", "stem": str(dst.relative_to(ROOT)), "loop": True, "loop_xfade_s": 1.5,
                     "at": start, "until": until, "level_db": level, "fade_in": XF, "fade_out": XF,
                     "source": {"effect": effect, "url": src["source"].get("url"), "author": src["source"].get("author"), "licence": src["source"]["licence"]},
                     **({"note": note} if note else {})})
    cut = lambda cue, off: {"cue": cue, "edge": "start", "offset": off}
    h, w = XF / 2, XF / 2
    bed("bed-hall", "bed: match hall", {"cue": "@start", "offset": 0}, cut("b1-1", -0.6 + h), 4)
    # The live game in the hall (beat 1), each placed only once its CC0 file is recorded in sounds/recipe.json.
    # Positions are drafted: the swell and gasp land on the shots of the board, the drone passes over the
    # waiting room, the alarm buzz (c14-b86) comes under Bai's last line, as the game nears its end.
    def fx(cid, effect, at, level, note):
        src = sounds.get(effect)
        if not src:
            return
        dst = stems / f"{cid}.wav"
        ffmpeg(ROOT / src["file"], dst, "anull")
        cues.append({"id": cid, "track": "foley", "stem": str(dst.relative_to(ROOT)), "at": at, "level_db": level,
                     "fade_in": 0.05, "fade_out": 0.3, "note": note,
                     "source": {"effect": effect, "url": src["source"].get("url"), "author": src["source"].get("author"), "licence": src["source"]["licence"]}})
    fx("hall-swell", "hall: crowd swell", {"cue": "@start", "offset": 1.5}, -8, "the audience murmurs as the gliders crash into Deluin's walls")
    fx("hall-gasp", "hall: gasp", {"cue": "@start", "offset": 5.5}, -10, "a gasp as Kau's attack breaks on the walls (c4-b134)")
    fx("hall-drone", "hall: drone", cut("b1-2", -0.4), -16, "an anti-cheat drone passes (c4-b81), heard faintly")
    fx("hall-alarm", "hall: alarm", cut("b1-6", 1.5), -14, "the alarm buzz near the game's end (c14-b86), through the wall")
    bed("bed-hall-wall", "bed: match hall", cut("b1-1", -0.6 - w), cut("b2-1", -1.4 + h), -4, "lowpass=f=450,volume=0.8",
        note="the game through the waiting-room wall (drafted: the owner hasn't decided yet)")
    bed("bed-waiting", "bed: waiting room", cut("b1-1", -0.6 - w), cut("b2-1", -1.4 + h), -2)
    bed("bed-corridor", "bed: corridor", cut("b2-1", -1.4 - w), cut("b3-1", -3.0 + h), -2)
    bed("bed-cafe", "bed: courtyard café", cut("b3-1", -3.0 - w), cut("b6-1", -1.5 + h), 0)
    if "bed: gate at dusk" in sounds:
        bed("bed-gate", "bed: gate at dusk", cut("b6-1", -1.5 - w), cut("hold-s34", 0 + h), -2)
    else:
        bed("bed-gate", "bed: courtyard café", cut("b6-1", -1.5 - w), cut("hold-s34", 0 + h), -6, "lowpass=f=1800",
            note="stand-in until the gate-at-dusk recordings are in: the café, quieter and darker")
    bed("bed-lobby", "bed: lobby restaurant", cut("hold-s34", 0 - w), {"cue": "@end", "offset": 0}, -2)
    timeline = {
        "about": "Fifteen Days rough cut (2026-10-15): the owner's performances converted into the character voices, each location's acoustics, Dreadnaught v3, stand-in cards for the drafted shots. Line gaps, shot anchors, holds and acoustics are drafted by the coding agent. A bed that isn't downloaded yet is left out (the gate uses the café, darker, until its own arrive).",
        "seed": seed, "placeholder": True, "placeholder_reason": "the stills are in a DRAFT style awaiting the owner's approval; s28 has no accepted frame yet",
        "video": {"width": 1920, "height": 1080, "fps": 30}, "loudness": {"integrated_lufs": -16, "true_peak_db": -1, "lra": 11},
        "tail_s": 2.0, "tracks": {"voice": {"level_db": 0}, "hold": {"level_db": -60}, "bed": {"level_db": -24}, "foley": {"level_db": -10}, "music": {"level_db": -16}},
        "rooms": ROOMS, "cues": cues, "shots": tl_shots, "lettering": [],
        "end_card": {"file": f"adaptations/{seed}/end-card.json", "seconds": 8, "fade_s": 0.8},
    }
    (adir / "timeline.json").write_text(json.dumps(timeline, indent=2, ensure_ascii=False) + "\n")
    print(f"timeline: {len(cues)} cues, {len(tl_shots)} shots; stems in {stems.relative_to(ROOT)}, cards in {cards.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
