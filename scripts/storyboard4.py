"""Storyboard v4 prompts: each shot's exact prompt and references, from its grey-box set render.

  .venv-image/bin/python scripts/storyboard4.py fifteen-days

Reads adaptations/<seed>/preprod/storyboard-v4.json, the sets' seen.json (from scripts/set-render.mjs: the
landmarks each camera sees, each person's screen side and facing) and the plates. For every drawn shot:
  layout reference = the set render with mannequins, labels stripped (images-out/preprod/set/<id>.png), sent small;
  place reference  = the plate of the nearest camera setup (an approved plate wins over a nearer unapproved one);
  people           = one face-and-costume card each, or one three-person card; the robot in words only, never a card.
The prompt names only the landmarks that shot's camera sees, and where each person is in frame and which way they
face, in the set's own terms. Writes adaptations/<seed>/preprod/storyboard4.json and the small layout copies.
"""

import json
import math
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PRE = ROOT / "images-out" / "preprod"
DESC = {"Z": "the slim young man with spiky black hair with one blue streak, dark brown eyes and an orange cropped jacket",
        "B": "the thin, wiry young woman with warm brown skin, shaved sides, a tall magenta ponytail, dangly geometric earrings, a lime-green vest and tattooed arms",
        "D": "the tall young man with wavy shoulder-length light-brown hair and a long cream cable-knit tunic",
        "K": "the stocky young man with a shaved head and dark brown skin in a plain charcoal tunic"}
ROBOT = ("the serving robot: a machine, not a person: a rounded white head with a dark face screen showing two small kind glowing eyes, slim white shoulders and jointed arms holding a flat tray, "
         "and no legs: below the waist a smooth white column down to a round gliding base")
CARD = {"Z": "cards2/zei.png", "B": "cards2/bai.png", "D": "cards2/deluin.png", "K": "cards2/kau.png"}
SIZE = {"EWS": "Extreme wide shot", "WS": "Wide shot", "MS": "Medium shot", "MCU": "Medium close-up", "CU": "Close-up", "ECU": "Extreme close-up",
        "INSERT": "Insert close-up", "OTS": "Over-the-shoulder shot", "POV": "Point-of-view shot"}
CROWD = ("Every other person is an ordinary background figure in plain, muted everyday clothes with ordinary hair: no orange jackets, no magenta hair, "
         "no cream knitwear, nobody who looks like the main people.")
SIDE = {"left": "on the left of the frame", "right": "on the right of the frame", "centre": "in the middle of the frame"}


def small(src: Path, dst: Path, w: int) -> str:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime:
        im = Image.open(src).convert("RGB")
        im.thumbnail((w, w))
        im.save(dst)
    return str(dst.relative_to(ROOT))


def fwd(c):
    v = [c["look"][i] - c["cam"][i] for i in range(3)]
    l = math.sqrt(sum(x * x for x in v)) or 1
    return [x / l for x in v]


def main() -> None:
    seed = sys.argv[1]
    adir = ROOT / "adaptations" / seed / "preprod"
    sets = adir / "sets"
    board = json.loads((adir / "storyboard-v4.json").read_text())["shots"]
    style = json.loads((ROOT / "adaptations" / seed / "style.json").read_text())
    approved = json.loads((adir / "plates-approved.json").read_text()) if (adir / "plates-approved.json").exists() else {}
    seen = {n: json.loads((sets / f"{n}.seen.json").read_text()) for n in ("hall", "corridor", "courtyard", "lobby")}
    shotsj = {n: json.loads((sets / f"{n}.shots.json").read_text()) for n in seen}
    for s in board:
        if s.get("composite") or not s.get("camera"):
            s["prompt"], s["refs"] = None, []
            continue
        n = s["set"]
        cam = s["camera"]
        # the nearest setup's plate: direction first, then distance; an approved plate is preferred
        best = None
        for pid, pc in shotsj[n].items():
            if not pid.startswith("plate-"):
                continue
            if n == "courtyard" and s["id"][0] != "D" and pid.endswith(("-G", "-S")):
                continue
            f1, f2 = fwd(cam), fwd(pc)
            ang = math.degrees(math.acos(max(-1, min(1, sum(a * b for a, b in zip(f1, f2))))))
            d = math.dist(cam["cam"], pc["cam"])
            score = ang + 4 * d - (40 if approved.get(pid) else 0)
            if best is None or score < best[0]:
                best = (score, pid)
        plate = s.get("plate_override") or best[1]
        sz = s["size"].split(",")[0].split(" ")[0]
        sz = "INSERT" if "INSERT" in s["size"] else sz
        sn = seen[n].get(s["id"], {"people": {}, "landmarks": []})
        people = [w for w in s["who"] if w != "R"]
        refs = [small(PRE / "set" / f"{s['id']}.png", PRE / "set-small" / f"{s['id']}.png", 512),
                small(PRE / "plates" / f"{plate}.png", PRE / "plates-small" / f"{plate}.png", 640)]
        if len(people) >= 3:
            refs.append(small(PRE / "cards2" / "cast.png", PRE / "cards-small" / "cast.png", 560))
        else:
            refs += [small(PRE / CARD[w], PRE / "cards-small" / Path(CARD[w]).name, 900) for w in people]
        WHO = {**DESC, "R": "the serving robot"}
        action = s["action"]
        for k, v in WHO.items():
            action = action.replace("{" + k + "}", v)
        parts = [f"{SIZE.get(sz, '')} ({s['size']}). {action}",
                 "Reference image 1 is a plain grey 3D layout render taken from this exact camera: copy its framing, height, angle and perspective, where each person sits or stands, "
                 "how big each is in the frame and which way each faces, and where the table, chairs, railing, doors and walls stand; draw nothing of its grey blocks or simple figures as they are.",
                 "Reference image 2 shows how the place looks: its materials, colours and light."]
        if len(people) >= 3:
            parts.append("Reference image 3 shows the three main people, one per row: " + "; ".join(DESC[w] for w in ("Z", "B", "D")) +
                         ". Copy only their faces, hair, skin and clothes, never the sheet's layout, poses or grey background.")
        else:
            for i, w in enumerate(people, 3):
                parts.append(f"Reference image {i} is {DESC[w]}: copy only that person's face, hair, skin and clothes, never the sheet's layout, poses or grey background.")
        where = []
        for w in s["who"]:
            p = sn["people"].get(w)
            if p and p.get("visible") and sz not in ("INSERT",):
                where.append(f"{'the robot' if w == 'R' else DESC[w].split(' with ')[0]} is {SIDE[p['side']]}, {p['facing']}")
        if where:
            parts.append("In this frame: " + "; ".join(where) + ".")
        if "R" in s["who"]:
            parts.append("The robot is " + ROBOT + ".")
        if people:
            n_ = len(people)
            parts.append({1: "Exactly one main person, appearing once.", 2: "Exactly two main people, each appearing once.", 3: "Exactly three main people, each appearing once."}[min(n_, 3)] + " " + CROWD)
        lms = [l["name"] for l in sn.get("landmarks", []) if l.get("name")]
        if lms and sz not in ("ECU", "INSERT"):
            parts.append("Behind them, as the layout shows: " + "; ".join(lms) + ".")
        if "Z" in people:
            parts.append("The spiky-haired young man's eyes are dark brown.")
        if "menu" in s["action"] or "device" in s["action"]:
            parts.append("Menus and devices show only soft blank light, no writing.")
        st = style["prompt"].split(" Wherever the sky shows")[0] if n in ("hall", "corridor") else style["prompt"]
        parts += [st, style["signs"], style["no_text"]]
        s["prompt"], s["refs"], s["plate"] = " ".join(parts), refs, plate
    (adir / "storyboard4.json").write_text(json.dumps({"about": "Storyboard v4 with exact prompts and references (scripts/storyboard4.py).", "shots": board}, indent=2, ensure_ascii=False) + "\n")
    print(sum(1 for s in board if s["prompt"]), "prompts")


if __name__ == "__main__":
    main()
