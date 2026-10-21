"""Build the Fifteen Days pre-production page: cast, robot, places with floor plans, device sounds, shot list v2.

  .venv-image/bin/python scripts/preprod-page.py fifteen-days <out-dir>

Reads adaptations/<seed>/preprod/ (shotlist-v2.json and the job files) and images-out/preprod/ (cast, places,
thumbs), and scenes-out/<seed>/sfx/device-*.wav. Writes <out-dir>/index.html, img/, snd/ and files.json.
The floor plans are drawn here, from the same geography the shot list uses (shotlist-v2.json "geography").
The page keeps the owner's review in its db: review/<item> {"pick", "status", "note", "at"}.
"""

import html
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# Floor plans: top-down, north up. People are dots with a facing tick; dashed line = the 180-degree line;
# the shaded band = the side the cameras stay on.
WHO = {"Z": "zei", "B": "bai", "D": "deluin", "K": "kau", "R": "robot"}


def person(x, y, k, face, label=None):
    import math
    dx, dy = {"N": (0, -1), "S": (0, 1), "E": (1, 0), "W": (-1, 0), "NE": (0.7, -0.7), "NW": (-0.7, -0.7), "SE": (0.7, 0.7), "SW": (-0.7, 0.7)}[face]
    return (f'<g class="p p-{WHO[k]}"><line x1="{x}" y1="{y}" x2="{x + dx * 17}" y2="{y + dy * 17}" class="tick"/>'
            f'<circle cx="{x}" cy="{y}" r="9"/><text x="{x}" y="{y + 3.5}" class="pl">{label or k}</text></g>')


def txt(x, y, s, cls="lab", anchor="middle"):
    return f'<text x="{x}" y="{y}" class="{cls}" text-anchor="{anchor}">{html.escape(s)}</text>'


def svg(body, h=260):
    return f'<svg viewBox="0 0 420 {h}" class="plan" role="img">{body}</svg>'


def plans() -> dict:
    P = {}
    P["hall"] = svg(
        '<ellipse cx="210" cy="135" rx="205" ry="122" class="tier"/><ellipse cx="210" cy="135" rx="178" ry="102" class="tier2"/>'
        '<ellipse cx="210" cy="135" rx="150" ry="80" class="floor"/>'
        + txt(210, 20, "standing overlook at the top, with a railing (Zei, Bai: north)") + person(190, 26, "Z", "S", "Z") + person(232, 26, "B", "S", "B")
        + txt(210, 46, "second tier, seated", "lab small") + txt(210, 240, "good seats near the floor", "lab small")
        + '<circle cx="210" cy="135" r="42" class="holo"/>' + txt(210, 130, "holograms and") + txt(210, 142, "towers on robotic bases")
        + '<rect x="190" y="70" width="40" height="12" class="screen"/>' + txt(210, 66, "big screens: the players' faces", "lab small")
        + '<circle cx="78" cy="135" r="17" class="pit"/><circle cx="342" cy="135" r="17" class="pit"/>'
        + person(78, 135, "D", "W") + person(342, 135, "K", "E")
        + txt(78, 168, "Deluin's pit") + txt(342, 168, "Kau's pit")
        + txt(210, 222, "players sunk in pits, facing outward: they can't see the holograms or each other", "lab small"))
    P["gallery"] = svg(
        '<rect x="20" y="16" width="380" height="34" class="wall"/>' + txt(210, 37, "standing room at the top of the hall; doors to the corridor")
        + '<line x1="20" y1="100" x2="400" y2="100" class="rail"/>' + txt(395, 94, "railing", "lab", "end")
        + person(170, 80, "Z", "S") + person(245, 80, "B", "S") + "".join(f'<circle cx="{x}" cy="64" r="5" class="crowd"/>' for x in (40, 62, 330, 352, 374))
        + "".join(f'<circle cx="{x}" cy="{y}" r="5" class="crowd"/>' for y in (118, 134) for x in range(35, 400, 22))
        + txt(210, 156, "second tier, seated just below the railing") + txt(210, 172, "good seats further down; the holograms and screens across the hall", "lab small")
        + '<rect x="20" y="186" width="380" height="54" class="cam"/>'
        + txt(210, 210, "cameras on the hall side: Zei looks right to Bai, Bai left to Zei"))
    P["corridor"] = svg(
        '<rect x="150" y="10" width="120" height="240" class="floor"/>' + "".join(f'<rect x="141" y="{y}" width="9" height="26" class="door"/>' for y in (40, 90, 140, 190))
        + txt(135, 108, "elevators", "lab", "end") + person(176, 103, "D", "E") + person(232, 113, "Z", "W") + person(258, 140, "B", "W", "B")
        + txt(300, 145, "Bai leans on the wall", "lab", "start") + '<path d="M176 85 L176 25" class="move"/>' + txt(185, 22, "Deluin leaves north", "lab", "start")
        + '<path d="M215 150 L215 240" class="move"/>' + txt(225, 236, "then Zei and Bai walk south, toward camera", "lab", "start")
        + txt(210, 258, "round-topped polished stone, no windows (c4-b59)", "lab small"), h=264)
    P["courtyard"] = svg(
        '<rect x="10" y="10" width="400" height="240" class="floor"/>' + '<rect x="0" y="10" width="62" height="240" class="cam"/>'
        + txt(32, 140, "cameras", "lab") + txt(32, 153, "this side", "lab")
        + '<rect x="150" y="98" width="130" height="64" rx="3" class="table"/>' + txt(215, 134, "wide table for four", "lab small")
        + person(200, 84, "D", "S") + person(200, 176, "B", "N") + person(298, 130, "Z", "W")
        + '<line x1="200" y1="84" x2="298" y2="130" class="axis"/>' + '<circle cx="345" cy="128" r="16" class="table"/>' + txt(345, 160, "Bai's table later", "lab")
        + "".join(f'<circle cx="{x}" cy="{y}" r="12" class="table dim"/>' for x, y in ((100, 50), (150, 215), (260, 45), (300, 210), (110, 190), (370, 60)))
        + '<rect x="380" y="10" width="30" height="22" class="gate"/>' + txt(372, 26, "gate", "lab", "end") + '<circle cx="80" cy="120" r="18" class="tree"/>' + txt(80, 124, "tree", "lab small")
        + txt(215, 244, "Deluin looks right, Zei left; Bai behind Zei once she moves", "lab small"))
    P["gate"] = svg(
        '<rect x="10" y="10" width="200" height="240" class="street"/>' + txt(110, 30, "street") + '<rect x="210" y="10" width="200" height="240" class="floor"/>' + txt(310, 30, "courtyard")
        + '<line x1="210" y1="10" x2="210" y2="105" class="wallline"/><line x1="210" y1="165" x2="210" y2="250" class="wallline"/>' + txt(222, 138, "gate", "lab", "start")
        + person(170, 135, "D", "E") + person(255, 135, "Z", "W") + '<circle cx="190" cy="80" r="6" class="lamp"/>' + txt(180, 70, "lamp", "lab", "end")
        + '<rect x="10" y="190" width="400" height="60" class="cam"/>' + txt(210, 225, "cameras south: Deluin left, Zei right, as in the café")
        + '<path d="M150 150 L60 230" class="move"/>' + txt(60, 186, "Deluin walks off", "lab", "start"))
    P["lobby"] = svg(
        '<rect x="10" y="10" width="400" height="240" class="floor"/>' + '<rect x="10" y="10" width="14" height="240" class="glass"/>' + txt(32, 24, "tall windows", "lab", "start")
        + '<rect x="95" y="110" width="60" height="40" rx="3" class="table"/>' + person(78, 130, "B", "E") + person(172, 130, "Z", "W")
        + '<rect x="360" y="70" width="40" height="110" class="counter"/>' + person(345, 125, "R", "W") + txt(380, 195, "robot's counter", "lab")
        + "".join(f'<rect x="{x}" y="{y}" width="34" height="24" rx="2" class="table dim"/>' for x, y in ((230, 40), (230, 180), (110, 200), (110, 40)))
        + '<rect x="190" y="242" width="60" height="8" class="door"/>' + txt(220, 236, "entrance", "lab")
        + txt(125, 175, "Zei looks left, Bai right", "lab small")
        + '<rect x="0" y="100" width="10" height="60" class="cam"/>' + txt(12, 96, "street camera, through the glass", "lab small", "start"))
    return P


def jpg(src: Path, dst: Path, w: int) -> None:
    im = Image.open(src).convert("RGB")
    im.thumbnail((w, w))
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, quality=82)


def main() -> None:
    seed, out = sys.argv[1], Path(sys.argv[2])
    adir = ROOT / "adaptations" / seed / "preprod"
    pre = ROOT / "images-out" / "preprod"
    sl = json.loads((adir / "shotlist-v3.json").read_text())
    cast = json.loads((pre / "cast" / "recipe.json").read_text())["images"]
    places = json.loads((pre / "places" / "recipe.json").read_text())["images"]
    thumbs = json.loads((pre / "thumbs" / "recipe.json").read_text())["images"]
    ledger = json.loads((pre / "ledger.json").read_text())
    for k in list(cast) + list(places):
        src = ROOT / (cast.get(k) or places.get(k))["file"]
        jpg(src, out / "img" / f"{k}.jpg", 1400)
    for k in thumbs:
        jpg(ROOT / thumbs[k]["file"], out / "img" / f"{k}.jpg", 560)
    sfx = sorted((ROOT / "scenes-out" / seed / "sfx").glob("device-*.wav"))
    (out / "snd").mkdir(parents=True, exist_ok=True)
    for f in sfx:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-c:a", "libmp3lame", "-b:a", "160k", str(out / "snd" / f"{f.stem}.mp3")], check=True)
    # Voice candidates (owner's note, 2026-10-16): the same performed lines in the current and the new voice sheets.
    vt = ROOT / "scenes-out" / seed / "voice-test-v2"
    VOICES = [("bai", "Bai", [("now", "current sheet", "{n}.now.bai.wav"), ("now-eq", "current sheet, less low end", "{n}.now.bai.eq.wav"),
                              ("v2a", "new sheet A, less low end", "{n}.v2.bai-v2a.eq.wav"), ("v2b", "new sheet B, less low end", "{n}.v2.bai-v2b.eq.wav")],
               ["L02-b1-2", "L16-b2-10"]),
              ("zei", "Zei", [("now", "current sheet", "{n}.now.zei.wav"), ("v3", "new sheet, a little quicker", "{n}.v2.zei-v3.wav")], ["L09-b2-3", "L33-b4-2"]),
              ("deluin", "Deluin", [("now", "current sheet", "{n}.now.deluin.wav"), ("v2", "new sheet, a little slower", "{n}.v2.deluin-v2.wav")], ["L10-b2-4", "L29-b3-11"])]
    voices = []
    for vid, name, opts, lines in VOICES:
        group = {"id": vid, "name": name, "options": []}
        for key, label, pat in opts:
            srcs = []
            for n in lines:
                f = vt / pat.format(n=n)
                mp3 = out / "snd" / f"voice-{vid}-{key}-{n}.mp3"
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-c:a", "libmp3lame", "-b:a", "160k", str(mp3)], check=True)
                srcs.append(f"snd/{mp3.name}")
            group["options"].append({"key": key, "label": label, "srcs": srcs})
        voices.append(group)
    rec = {s["effect"]: s for s in json.loads((ROOT / "adaptations" / seed / "sounds" / "recipe.json").read_text())["sounds"]}
    data = {
        "shots": sl["shots"], "geography": sl["geography"], "plans": plans(),
        "sounds": [{"id": f.stem, "what": rec[f"device: {f.stem[7:]}"]["what"], "src": f"snd/{f.stem}.mp3"} for f in sfx],
        "voices": voices, "spent": ledger["spent_usd"], "cap": ledger["cap_usd"],
    }
    page = (ROOT / "scripts" / "preprod-page.html").read_text().replace("__DATA__", json.dumps(data, ensure_ascii=False))
    (out / "index.html").write_text(page)
    files = sorted(str(p.relative_to(out)) for p in out.rglob("*") if p.is_file() and p.name not in ("index.html", "files.json"))
    (out / "files.json").write_text(json.dumps([{"path": f} for f in files]))
    print(f"{out / 'index.html'}: {len(sl['shots'])} shots, {len(files)} files")


if __name__ == "__main__":
    main()
