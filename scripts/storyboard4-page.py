"""Build the storyboard v4 page: per shot, the labelled 3D frame from the set, an overhead map (the camera, its view
and who is where), the line, the exact prompt and references, OK / change and a comment; above it, the café test,
the background plates to approve, Bai's new sheet and the voice candidates.

  .venv-image/bin/python scripts/storyboard4-page.py fifteen-days <out-dir>
"""

import html
import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PRE = ROOT / "images-out" / "preprod"
COL = {"Z": "#e8771e", "B": "#7fb43a", "D": "#c9b98f", "K": "#8a8a99", "R": "#4fb3c4"}
FACEV = {"N": (0, -1), "S": (0, 1), "E": (1, 0), "W": (-1, 0), "NE": (0.707, -0.707), "NW": (-0.707, -0.707), "SE": (0.707, 0.707), "SW": (-0.707, 0.707)}
BOUNDS = {"courtyard": (-9, -12, 18, 20), "hall": (-19, -19, 38, 38), "corridor": (-4, -18, 8, 26), "lobby": (-12, -6, 19, 12)}


def base_map(name: str, sd: dict) -> list:
    e = []
    if name == "courtyard":
        e.append('<rect x="-8" y="-7" width="16" height="14" class="m-floor"/>')
        e.append('<path d="M5.3 -7 L-8 -7 L-8 7 L8 7 L8 -7 L7.7 -7" class="m-wall"/>')
        e.append('<rect x="-9" y="-12" width="18" height="4.8" class="m-street"/><text x="-8.6" y="-10.6" class="m-t">street</text>')
        e.append('<text x="5.0" y="-7.5" class="m-t">gate</text>')
        for o in sd["objects"]:
            if o.get("kind") == "table":
                e.append(f'<rect x="{o["at"][0] - o["size"][0] / 2}" y="{o["at"][1] - o["size"][1] / 2}" width="{o["size"][0]}" height="{o["size"][1]}" class="m-table"/>')
            elif o.get("kind") == "roundtable":
                e.append(f'<circle cx="{o["at"][0]}" cy="{o["at"][1]}" r="{o["r"]}" class="m-table{" dim" if o.get("diners") else ""}"/>')
            elif o.get("kind") == "tree":
                e.append(f'<circle cx="{o["at"][0]}" cy="{o["at"][1]}" r="1.5" class="m-tree"/><text x="{o["at"][0] - 0.8}" y="{o["at"][1] + 0.3}" class="m-t">tree</text>')
            elif o.get("kind") == "counter":
                e.append(f'<rect x="{o["at"][0] - 0.6}" y="{o["at"][1] - 1.5}" width="1.2" height="3" class="m-table"/>')
    elif name == "hall":
        e += ['<circle cx="0" cy="0" r="17.2" class="m-wall"/>', '<circle cx="0" cy="0" r="16" class="m-tier"/>', '<circle cx="0" cy="0" r="10" class="m-floor"/>',
              '<rect x="-1.6" y="-17" width="3.2" height="34" class="m-walk"/>', '<text x="1.9" y="14" class="m-t">walkway</text>',
              '<circle cx="-8.4" cy="0" r="1.6" class="m-pit"/><circle cx="8.4" cy="0" r="1.6" class="m-pit"/>',
              '<line x1="-6" y1="-11.5" x2="6" y2="-11.5" class="m-screen"/><text x="-3" y="-12.3" class="m-t">screens</text>']
        for x in (-5, -2.5, 0, 2.5, 5):
            for z in (-5, -2.5, 0, 2.5, 5):
                if x * x + z * z < 40:
                    e.append(f'<circle cx="{x}" cy="{z}" r="0.3" class="m-post"/>')
    elif name == "corridor":
        e += ['<rect x="-1" y="-34" width="2" height="40" class="m-floor"/>', '<path d="M-1 -34 L-1 6 M1 -34 L1 6" class="m-wall"/>']
        for z in (-2, -6, -10, -14):
            e.append(f'<rect x="-1.25" y="{z - 0.65}" width="0.25" height="1.3" class="m-door"/>')
        e.append('<text x="-3.8" y="-6" class="m-t">lifts</text>')
    elif name == "lobby":
        e += ['<rect x="-6" y="-5" width="12" height="10" class="m-floor"/>', '<path d="M-6 -5 L6 -5 L6 5 L-6 5" class="m-wall"/>', '<line x1="-6" y1="-5" x2="-6" y2="5" class="m-glass"/>',
              '<rect x="-12" y="-6" width="5.8" height="12" class="m-street"/><text x="-11.5" y="-4.6" class="m-t">street</text>', '<rect x="4.7" y="-1.6" width="1" height="3.2" class="m-table"/>']
        for o in sd["objects"]:
            if o.get("kind") == "table":
                e.append(f'<rect x="{o["at"][0] - 0.45}" y="{o["at"][1] - 0.45}" width="0.9" height="0.9" class="m-table{"" if o["id"] == "ztable" else " dim"}"/>')
    return e


def shot_map(name: str, sd: dict, cam: dict, people: dict) -> str:
    x0, z0, w, h = BOUNDS[name]
    e = base_map(name, sd)
    k = w / 40
    cx, cz = cam["cam"][0], cam["cam"][2]
    dx, dz = cam["look"][0] - cx, cam["look"][2] - cz
    l = math.hypot(dx, dz) or 1
    dx, dz = dx / l, dz / l
    hf = math.atan(math.tan(math.radians(cam.get("fov", 36) / 2)) * 16 / 9)
    reach = max(w, h) * 0.45
    pts = [(cx, cz)]
    for a in (-hf, hf):
        rx, rz = dx * math.cos(a) - dz * math.sin(a), dx * math.sin(a) + dz * math.cos(a)
        pts.append((cx + rx * reach, cz + rz * reach))
    e.append(f'<polygon points="{" ".join(f"{p[0]:.2f},{p[1]:.2f}" for p in pts)}" class="m-view"/>')
    for who, p in people.items():
        fx, fz = FACEV.get(p.get("face", "S"), (0, 1))
        r = 0.42 * k * 1.6
        e.append(f'<line x1="{p["at"][0]}" y1="{p["at"][1]}" x2="{p["at"][0] + fx * r * 2.1}" y2="{p["at"][1] + fz * r * 2.1}" class="m-face"/>'
                 f'<circle cx="{p["at"][0]}" cy="{p["at"][1]}" r="{r:.2f}" fill="{COL.get(who, "#999")}" class="m-p"/>'
                 f'<text x="{p["at"][0]}" y="{p["at"][1] + r * 0.45:.2f}" class="m-l" style="font-size:{r * 1.3:.2f}px">{who}</text>')
    s = 0.55 * k * 1.6
    e.append(f'<circle cx="{cx}" cy="{cz}" r="{s:.2f}" class="m-cam"/>')
    style = f"font-size:{w / 24:.2f}px"
    return f'<svg viewBox="{x0} {z0} {w} {h}" class="map" style="{style}" role="img" aria-label="overhead map: camera and positions">{"".join(e)}</svg>'


def jpg(src: Path, dst: Path, w: int) -> None:
    im = Image.open(src).convert("RGB")
    im.thumbnail((w, w))
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, quality=78)


def main() -> None:
    seed, out = sys.argv[1], Path(sys.argv[2])
    adir = ROOT / "adaptations" / seed / "preprod"
    board = json.loads((adir / "storyboard4.json").read_text())["shots"]
    sets = {n: json.loads((adir / "sets" / f"{n}.json").read_text()) for n in ("hall", "corridor", "courtyard", "lobby")}
    img = out / "img"
    used = {}

    def put(path: Path, w: int = 640) -> str:
        key = str(path)
        if key not in used:
            name = str(path.relative_to(PRE)).replace("/", "-").rsplit(".", 1)[0] + ".jpg"
            jpg(path, img / name, w)
            used[key] = f"img/{name}"
        return used[key]

    for s in board:
        if s.get("camera"):
            s["frame"] = put(PRE / "set" / f"{s['id']}.labelled.png", 720)
            s["map"] = shot_map(s["set"], sets[s["set"]], s["camera"], s["camera"]["people"])
            s["refimgs"] = [{"src": put(ROOT / r, 420), "what": ("3D layout, labels stripped" if "/set-small/" in r else "plate" if "plates" in r else "cast card")} for r in s["refs"]]
        s.pop("camera", None)
    plates = []
    for sname, sd in sets.items():
        for k, su in sd["setups"].items():
            pid = f"plate-{sname}-{k}"
            plates.append({"id": pid, "what": f"{sname}: {su['what']}", "set": put(PRE / "set" / f"{pid}.labelled.png", 520), "img": put(PRE / "plates" / f"{pid}.png", 900)})
    held = {"plate-corridor-N", "plate-corridor-S", "plate-courtyard-A", "plate-courtyard-G", "plate-courtyard-S", "plate-hall-A", "plate-hall-B", "plate-hall-W"}
    for p in plates:
        p["held"] = p["id"] in held
    test = []
    rev = {"F07": ("pass", "Placement holds: Deluin on the left, Bai directly across on the right, Zei at the end facing us. Faces and costumes right."),
           "F08": ("fail", "Placement holds and the robot is a robot (in words only), but the model copied the grey render's look: the café came out grey."),
           "F17": ("pass", "Over Deluin's shoulder onto Zei at the end of the table, as the set has it."),
           "S04": ("fail", "Bai should be small, behind Zei at her own table; the model put her beside him and drew a second, shaved-head version of her."),
           "F05": ("pass", "Deluin close, laughing and waving toward the gate; the robot small in the background."),
           "F14": ("pass", "Bai close with her menu, glancing; the menu came out as paper, not a thin tablet.")}
    for sid in ("F07", "F08", "F17", "S04", "F05", "F14"):
        test.append({"id": sid, "frame": put(PRE / "set" / f"{sid}.labelled.png", 640), "img": put(PRE / "test3" / f"T3-{sid}.png", 1100), "verdict": rev[sid][0], "note": rev[sid][1]})
    bai = put(PRE / "step3" / "face4-bai.png", 1200)
    (out / "snd").mkdir(parents=True, exist_ok=True)
    voices = []
    vc = ROOT / "scenes-out" / seed / "voice-cand"
    for who, cands, lines, cur in (("Zei", ("zei-v4a", "zei-v4b"), ("L33-b4-2", "L09-b2-3"), "zei-v3"), ("Bai", ("bai-v3a", "bai-v3b"), ("L16-b2-10", "L31-b3-13"), "bai.eq")):
        rows = []
        for v in (cur,) + cands:
            srcs = []
            for n in lines:
                f = (ROOT / "scenes-out" / seed / "lines-v2" / f"{n}.{v}.wav") if v == cur else (vc / f"{n}.cand.{v}.wav")
                if not f.exists():
                    continue
                mp3 = out / "snd" / f"{n}-{v}.mp3"
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-c:a", "libmp3lame", "-b:a", "128k", str(mp3)], check=True)
                srcs.append(f"snd/{mp3.name}")
            desc = "current pick" if v == cur else json.loads((ROOT / "adaptations" / seed / "voices" / f"{v}.json").read_text())["description"]
            rows.append({"key": v, "label": desc, "srcs": srcs})
        voices.append({"who": who, "rows": rows})
    ledger = json.loads((PRE / "ledger-s5.json").read_text())
    data = {"shots": board, "plates": plates, "test": test, "bai": bai, "voices": voices, "spent": ledger["spent_usd"] + 0.36,
            "geography": json.loads((adir / "shotlist-v3.json").read_text())["geography"]}
    page = (ROOT / "scripts" / "storyboard4-page.html").read_text().replace("__DATA__", json.dumps(data, ensure_ascii=False))
    (out / "index.html").write_text(page)
    files = sorted(str(p.relative_to(out)) for p in out.rglob("*") if p.is_file() and p.name not in ("index.html", "files.json"))
    (out / "files.json").write_text(json.dumps([{"path": f} for f in files]))
    print(f"{out / 'index.html'}: {len(board)} cards, {len(files)} files")


if __name__ == "__main__":
    main()
