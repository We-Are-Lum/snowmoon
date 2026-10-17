"""Storyboard frames: each shot's exact prompt and references, from its 3D set, in two approaches (owner, 2026-10-16 night).

  .venv-image/bin/python scripts/storyboard4.py fifteen-days [--attempt N] [--shots ID ...]

Reads adaptations/<seed>/preprod/storyboard-v4.json, the sets' seen.json (from scripts/set-render.mjs: the landmarks each
camera sees, each person's screen side and facing), the shot renders and the chosen plates (plates-approved.json:
{plate id: file under images-out/preprod/}). For every drawn shot:
  A  Qwen-Image-Edit-2509 (native depth conditions): picture 1 = the shot's depth map (human-shaped mannequins on chairs),
     then one card per main person, or the three-person card. Then (job "K", written once the A picture exists) a FLUX.2
     [klein] restyle: reference 1 = the A picture (geometry, poses), reference 2 = the plate (or the set's swatch), then the
     cards again, into the night comic look with the faces held to the cards.
  B  FLUX.2 [klein] edit: reference 1 = the readable render (textured, shadowed, each main person in their clothes' colours),
     reference 2 = the chosen plate, then the cards.
The robot is in words only, never a card. The prompt names only the landmarks that shot's camera sees, and where each person
is in frame and which way they face. Nobody is named. Plates hold no people: Bai, when she sits small behind Zei, is drawn
from her card in the frame like everyone else.
The small copies sent to the model are committed in adaptations/<seed>/preprod/set-frames/ (depth, readable). Each job
carries its layers (set, camera and mannequins, set frame, plate, cards, each by sha256); fal-batch.py copies them into the
frame's recipe. Writes storyboard4.json and pass3-A-r<N>.json, pass3-B-r<N>.json (attempt N; seeds differ per attempt).
"""

import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PRE = ROOT / "images-out" / "preprod"
DESC = {"Z": "the slim young man with spiky black hair with one blue streak, dark brown eyes and an orange cropped zip jacket over a black top",
        "B": "the thin, wiry young woman with warm brown skin, shaved sides, a tall magenta ponytail, dangly geometric earrings, a lime-green vest and tattooed arms",
        "D": "the tall young man with wavy shoulder-length light-brown hair and a long cream cable-knit tunic",
        "K": "the stocky young man with a shaved head and dark brown skin in a plain charcoal tunic"}
COLOUR = {"Z": "orange", "B": "lime green", "D": "cream", "K": "charcoal"}
ROBOT = ("the serving robot: a machine, not a person: a rounded white head with a dark face screen showing two small kind glowing eyes, slim white shoulders and jointed arms holding a flat tray, "
         "and no legs: below the waist a smooth white column down to a round gliding base")
NO_ICONS = ("No signs, no panels with pictograms, no icons, no symbols anywhere: walls are bare. Screens show only what the shot describes, "
            "or are blank and softly glowing. No letters, words, digits or numbers anywhere.")
CARD = {"Z": "cards2/zei.png", "B": "cards2/bai.png", "D": "cards2/deluin.png", "K": "cards2/kau.png"}
SIZE = {"EWS": "Extreme wide shot", "WS": "Wide shot", "MS": "Medium shot", "MCU": "Medium close-up", "CU": "Close-up", "ECU": "Extreme close-up",
        "INSERT": "Insert close-up", "OTS": "Over-the-shoulder shot", "POV": "Point-of-view shot"}
CROWD = ("Every other person is an ordinary background figure in plain, muted everyday clothes with ordinary hair: no orange jackets, no magenta hair, "
         "no cream knitwear, nobody who looks like the main people.")
NO_DINERS = "The other tables in the courtyard are empty: no other diners."
# attempt 1 invited crowds everywhere; from attempt 2 only the hall has one (the owner: no diners, or far back)
NOBODY = {"courtyard": "Nobody else in the picture at all: no other diners, no passers-by, no figures in the windows.",
          "corridor": "Nobody else in the corridor at all.", "lobby": "Nobody else in the lobby at all, apart from what the shot describes."}
FACES = "Faces stay soft and natural: smiles and laughs are closed-mouthed, never open-mouthed grins, no teeth showing."
FACES3 = ("Every mouth is closed, lips together: smiles and laughs are small closed-lip smiles, no teeth visible at all, never a grin. "
          "Faces stay soft and natural.")  # from attempt 3: open grins kept coming back
TABLE = "The table they share is a long rectangular wooden table, never round."
GROUND = "Everyone stands on the ground or sits on a chair at their real size: nobody floats, nobody sits or stands on a table."
COMIC = "A hand-drawn science fiction comic book panel, ink linework and flat cel-shaded colour, not a 3D render, not a photograph."
NIGHT = ("At night: deep blue and violet darkness, pools of warm and cool glowing light, rich saturated colour everywhere; no grey or white "
         "surfaces, no daylight.")
SIDE = {"left": "on the left of the frame", "right": "on the right of the frame", "centre": "in the middle of the frame"}


def small(src: Path, dst: Path, w: int) -> str:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime:
        im = Image.open(src).convert("RGB")
        im.thumbnail((w, w))
        im.save(dst)
    return str(dst.relative_to(ROOT))


def layer(rel: str, **kw) -> dict:
    return {"file": rel, "sha256": hashlib.sha256((ROOT / rel).read_bytes()).hexdigest(), **kw}


def fwd(c):
    v = [c["look"][i] - c["cam"][i] for i in range(3)]
    l = math.sqrt(sum(x * x for x in v)) or 1
    return [x / l for x in v]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("--attempt", type=int, default=1)
    ap.add_argument("--shots", nargs="*")
    ap.add_argument("--stage", choices=["AB", "K", "Q"], default="AB")
    ap.add_argument("--from-a", type=int, help="K: restyle this attempt's A picture (default: the same attempt)")
    ap.add_argument("--board", default="storyboard-v4", help="'coverage': the frames of coverage-board.json (scripts/coverage-plan.py): one A per layout, one K per frame")
    args = ap.parse_args()
    seed, att = args.seed, args.attempt
    adir = ROOT / "adaptations" / seed / "preprod"
    sets = adir / "sets"
    if args.board == "coverage":
        cb = json.loads((adir / "coverage-board.json").read_text())
        board = [{"id": fid, "layout": f["layout"], "set": f["set"], "size": f["size"], "who": f["who"], "action": f["action"],
                  "over": f.get("over"), "subject": f.get("subject"), "look": f.get("look"), "bai_bg": f.get("far") == "B",
                  "camera": cb["layouts"][f["layout"]]["camera"]} for fid, f in cb["frames"].items() if f.get("layout")]
    else:
        board = json.loads((adir / "storyboard-v4.json").read_text())["shots"]
    a_done = set()
    style = json.loads((ROOT / "adaptations" / seed / "style.json").read_text())
    approved = json.loads((adir / "plates-approved.json").read_text()) if (adir / "plates-approved.json").exists() else {}
    seen = {n: json.loads((sets / f"{n}.seen.json").read_text()) for n in ("hall", "corridor", "courtyard", "lobby")}
    shotsj = {n: json.loads((sets / f"{n}.shots.json").read_text()) for n in seen}
    jobs = {"A": [], "B": [], "K": [], "Q": []}
    for i, s in enumerate(board):
        if s.get("composite") or not s.get("camera"):
            s["prompt"], s["refs"] = None, []
            continue
        n = s["set"]
        cam = s["camera"]
        # the nearest setup's plate (direction first, then distance) among the plates that exist
        best = None
        for pid, pc in shotsj[n].items():
            if not pid.startswith("plate-") or pid not in approved:
                continue
            if n == "courtyard" and s["id"][0] != "D" and pid.endswith(("-G", "-S")):
                continue
            ang = math.degrees(math.acos(max(-1, min(1, sum(a * b for a, b in zip(fwd(cam), fwd(pc)))))))
            score = ang + 4 * math.dist(cam["cam"], pc["cam"])
            if best is None or score < best[0]:
                best = (score, pid)
        plate = s.get("plate_override") if s.get("plate_override") in approved else best[1] if best else None
        sz = s["size"].split(",")[0].split(" ")[0]
        sz = "INSERT" if "INSERT" in s["size"] else sz
        lay = s.get("layout", s["id"])
        sn = seen[n].get(lay, {"people": {}, "landmarks": []})
        people = [w for w in s["who"] if w != "R"]
        WHO = {**DESC, "R": "the serving robot"}
        action = s["action"].replace("wide table", "long rectangular table")
        for k, v in WHO.items():
            action = action.replace("{" + k + "}", v)
        core = [f"{SIZE.get(sz, '')} ({s['size']}). {action}"]
        where = []
        for w in s["who"]:
            p = sn["people"].get(w)
            if w == s.get("over"):  # the near shoulder of an over-the-shoulder: once, from behind, at the frame's edge
                where.append(f"{DESC[w].split(' with ')[0]} is seen only from behind in the near foreground, the back of the head and one shoulder "
                             f"at the {SIDE[p['side']].split(' of ')[0].replace('in the middle', 'side')} edge of the frame, soft; he or she appears only once")
            elif w == s.get("subject") and s.get("look"):  # coverage: never straight at the camera
                where.append(f"{DESC[w].split(' with ')[0]} is turned three-quarters, looking toward the {s['look']} of the frame, never straight at the camera")
            elif p and p.get("visible") and sz != "INSERT":
                where.append(f"{'the robot' if w == 'R' else DESC[w].split(' with ')[0]} is {SIDE[p['side']]}, {p['facing']}")
        tail = []
        if where:
            tail.append("In this frame: " + "; ".join(where) + ".")
        if "R" in s["who"]:
            tail.append("The robot is " + ROBOT + ".")
        elif s.get("layout"):  # coverage frames kept gaining a robot or a stranger in the background
            tail.append("No robot and no other people anywhere in the picture" + (", apart from the crowd in the tiers." if n == "hall" else "."))
        if people:
            tail.append({1: "Exactly one main person, appearing once.", 2: "Exactly two main people, each appearing once.", 3: "Exactly three main people, each appearing once."}[min(len(people), 3)] + " " +
                        (CROWD if n == "hall" or att == 1 else NOBODY[n]))
            if sz != "INSERT":
                tail.append(GROUND)
        if n == "courtyard" and att == 1:
            tail.append(NO_DINERS)
        elif n != "hall" and att > 1 and not people:
            tail.append(NOBODY[n])
        lms = [l["name"] for l in sn.get("landmarks", []) if l.get("name")]
        if lms and sz not in ("ECU", "INSERT"):
            tail.append("Behind them, as the layout shows: " + "; ".join(lms) + ".")
        if any("rectangular" in l for l in lms) or "rectangular table" in action:
            tail.append(TABLE)
        if people and sz != "INSERT":
            tail.append(FACES)
        if s.get("bai_bg") and att > 2:  # the reviewers: the restyle kept bringing her forward, big
            tail.insert(0, "The young woman with the magenta ponytail is small and far behind him, at her own small round table in the background, "
                           "about a fifth of the frame's height, exactly where reference image 1 has her; she is never beside him.")
        for w, pp in cam.get("people", {}).items():
            if isinstance(pp, dict) and pp.get("y", 0) < 0 and att > 2:
                tail.insert(0, f"{DESC[w].split(' with ')[0][0].upper() + DESC[w].split(' with ')[0][1:]} sits low inside a small round sunken pit at the "
                               "edge of the play floor, only his upper body above its rim, at a glowing console.")
        if "Z" in people:
            tail.append("The spiky-haired young man's eyes are dark brown.")
        if "menu" in s["action"] or "device" in s["action"]:
            tail.append("Menus and devices show only soft blank light, no writing." if att < 5 else
                        "Every menu is a thin glass tablet glowing with soft blank light, never paper; every screen and device shows only soft blank "
                        "light: no writing, no letters, no symbols at all.")
        st = style["prompt"].split(" Wherever the sky shows")[0] if n in ("hall", "corridor") else style["prompt"]
        signs = NO_ICONS if n in ("hall", "corridor") else style["signs"]
        if att >= 5 and n not in ("hall", "corridor"):  # neon signs kept spelling letters
            signs = ("Shop windows and panels glow plainly, at most with one simple pictogram (a cup, a leaf, a bowl); no lettered signs at all. "
                     "No letters, words, digits or numbers anywhere.")
        tail += [st, signs, style["no_text"]]
        three = len(people) >= 3
        cards = ["cards2/cast.png"] if three else [CARD[w] for w in people]
        card_refs = [small(PRE / "cards2" / "cast.png", PRE / "cards-small" / "cast.png", 560)] if three else \
                    [small(PRE / CARD[w], PRE / "cards-small" / Path(CARD[w]).name, 900) for w in people]
        frames = {m: small(PRE / "set" / f"{lay}{x}.png", adir / "set-frames" / f"{lay}{x}.png", 768 if m == "depth" else 640)
                  for m, x in (("depth", ".depth"), ("look", ".look"))}
        layers = {"set": layer(str((sets / f"{n}.json").relative_to(ROOT))),
                  "camera": {"file": str((sets / f"{n}.shots.json").relative_to(ROOT)), "key": lay, **cam}}
        card_layers = [layer(r, source=layer(f"images-out/preprod/{c}")) for r, c in zip(card_refs, cards)]

        def card_words(first: int, word: str) -> list:
            if three:
                return [f"{word} {first} shows the three main people, one per row: " + "; ".join(DESC[w] for w in ("Z", "B", "D")) +
                        ". Copy only their faces, hair, skin and clothes, never the sheet's layout, poses or grey background."]
            return [f"{word} {k} is {DESC[w]}: copy only that person's face, hair, skin and clothes, never the sheet's layout, poses or grey background."
                    for k, w in enumerate(people, first)]

        # A: depth map + cards (Qwen-Image-Edit-2509 takes at most three pictures)
        a_refs = [frames["depth"]] + card_refs
        if len(a_refs) <= 3 and lay not in a_done and not (PRE / "pass3" / f"{lay}-A{att}.png").exists():
            a_done.add(lay)
            a = [COMIC] + core + ([FACES] if people and sz != "INSERT" else []) + ["Picture 1 is a depth map of this exact frame rendered from a 3D model (near is light, far is dark): follow its camera, angle, "
                                  "lens and perspective exactly; every person, chair, table, wall and railing goes exactly where and as big as its shape stands "
                                  "there, people sitting on the chairs and standing on the floor; the simple mannequin shapes are only where the people go. "
                                  "Draw nothing grey from it."] + card_words(2, "Picture") + tail + \
                ["Draw it as a finished comic panel: inked outlines, painted flat colour, glowing lights."]
            jobs["A"].append({"id": f"{lay}-A{att}", "shot": s["id"], "approach": "A", "attempt": att, "engine": "qwen", "prompt": " ".join(a), "refs": a_refs,
                              "width": 1024, "height": 576, "seed": 31000 + 100 * att + i,
                              "layers": {**layers, "set_frame": layer(frames["depth"], mode="depth", rendered_from=f"images-out/preprod/set/{lay}.depth.png"),
                                         "plate": None, "cards": card_layers}})
        # K: the A picture restyled, faces held to the cards
        apic = PRE / "pass3" / f"{lay}-A{args.from_a or att}.png"
        close = sz in ("CU", "ECU", "INSERT", "MCU") and att > 1  # from attempt 2: no wide place picture for close shots (it widened them)
        if args.stage == "K" and apic.exists():
            look = PRE / approved[plate] if plate and not close else PRE / "swatch" / f"{n}.png"
            lref = small(look, PRE / "plates-small" / f"{look.stem}.png", 640)
            k = ([core[0], f"Keep reference image 1's exact framing and crop: the same {SIZE.get(sz, 'shot').lower()}, nothing added outside its edges, "
                  "never widen the view."] + ([FACES3 if att > 2 else FACES] if people and sz != "INSERT" else []) if att > 1 else []) + \
                ["Redraw reference image 1 as a finished, detailed hand-drawn science fiction comic book panel at night: keep its camera, perspective, every "
                 "person's position, pose, gesture, expression and size, and every table, chair and wall exactly as they are; nobody is added or removed.",
                 f"Reference image 2 shows how the place looks{'' if plate and not close else ' (samples)'}: take its colours, materials and night light; it has nobody in it."] + \
                card_words(3, "Reference image") + ["Each main person's face, hair, skin and clothes match their reference exactly."] + tail
            # from attempt 5: no cards for extreme close-ups and inserts (they pulled the view wide), and no Bai card where she sits small
            # behind (it brought her forward or doubled her); faces then come from the A picture, which was drawn from the cards
            kc = [(r, w) for r, w in zip(card_refs, cards) if not (att >= 5 and (sz in ("ECU", "INSERT") or (s.get("bai_bg") and "bai" in w)))]
            if s.get("over") and not three:  # the near shoulder's card made the model draw that person twice
                kc = [(r, w) for r, w in kc if Path(CARD[s["over"]]).name not in w]
            if len(kc) != len(card_refs):
                k = [x for x in k if not x.startswith("Reference image 3") and not x.startswith("Reference image 4") and "match their reference" not in x]
                back = {Path(v).name: w for w, v in CARD.items()}
                for i, (_, cw) in enumerate(kc, 3):
                    k.insert(i, f"Reference image {i} is {DESC[back[Path(cw).name]]}: copy only that person's face, hair, skin and clothes.")
            jobs["K"].append({"id": f"{s['id']}-K{att}", "shot": s["id"], "approach": "A", "attempt": att, "prompt": " ".join(k),
                              "refs": [str(apic.relative_to(ROOT)), lref] + [r for r, _ in kc], "width": 1024, "height": 576, "seed": 34000 + 100 * att + i,
                              "layers": {**layers, "set_frame": layer(frames["depth"], mode="depth", rendered_from=f"images-out/preprod/set/{lay}.depth.png"),
                                         "stage1": layer(str(apic.relative_to(ROOT)), engine="qwen-image-edit-2509"),
                                         "plate": layer(lref, plate=plate, source=layer(str(look.relative_to(ROOT)))),
                                         "cards": [c for c in card_layers if c["file"] in {r for r, _ in kc}]}})
        # Q (from attempt 3): the A picture restyled by Qwen-Image-Edit-2509 itself, which holds framing best; at most three pictures
        if args.stage == "Q" and apic.exists() and len(card_refs) <= 2:
            q = [COMIC, core[0], f"Picture 1 is this exact frame: keep its framing and crop (the same {SIZE.get(sz, 'shot').lower()}), camera, perspective, "
                 "and every person's position, pose, gesture and size exactly; nothing added outside its edges, nobody added or removed. Redraw it as a "
                 "finished, detailed hand-drawn comic book panel at night: deep blue and violet darkness, pools of warm and cool glowing light, inked "
                 "outlines, cel-shaded colour.", FACES3 if people and sz != "INSERT" else ""] + card_words(2, "Picture") + tail
            jobs["Q"].append({"id": f"{s['id']}-Q{att}", "shot": s["id"], "approach": "A", "attempt": att, "engine": "qwen", "prompt": " ".join(x for x in q if x),
                              "refs": [str(apic.relative_to(ROOT))] + card_refs, "width": 1024, "height": 576, "seed": 36000 + 100 * att + i,
                              "layers": {**layers, "set_frame": layer(frames["depth"], mode="depth", rendered_from=f"images-out/preprod/set/{lay}.depth.png"),
                                         "stage1": layer(str(apic.relative_to(ROOT)), engine="qwen-image-edit-2509"), "plate": None, "cards": card_layers}})
        # B: readable render + plate + cards (FLUX.2 klein edit)
        if plate:
            psrc = PRE / approved[plate] if not close else PRE / "swatch" / f"{n}.png"
            pref = small(psrc, PRE / "plates-small" / f"{psrc.stem}.png", 640)
            colours = "; ".join(f"the {COLOUR[w]} figure is {DESC[w].split(' with ')[0]}" for w in people)
            b = core + ([FACES3 if att > 2 else FACES] if att > 1 and people and sz != "INSERT" else []) + ["Reference image 1 is a simple 3D model of this exact frame, textured and lit: copy its framing, height, angle and perspective, where each "
                        "person sits or stands and how big each is, which way each faces, and where the table, chairs, railing, doors and walls stand; people sit "
                        "on the chairs and stand on the floor exactly as there. Its figures are only mannequins coloured by who they are" +
                        (f" ({colours})" if colours else "") + "; draw real people, never mannequins.",
                        "Reference image 2 shows how the place looks: its materials, colours and light. The finished picture is fully coloured and lit like that "
                        "place picture, never grey; the place picture has nobody in it, and the people come only from the other references."] + \
                card_words(3, "Reference image") + tail
            jobs["B"].append({"id": f"{s['id']}-B{att}", "shot": s["id"], "approach": "B", "attempt": att, "prompt": " ".join(b),
                              "refs": [frames["look"], pref] + card_refs, "width": 1024, "height": 576, "seed": 32000 + 100 * att + i,
                              "layers": {**layers, "set_frame": layer(frames["look"], mode="readable", rendered_from=f"images-out/preprod/set/{lay}.look.png"),
                                         "plate": layer(pref, plate=plate, source=layer(str(psrc.relative_to(ROOT)))), "cards": card_layers}})
        s["prompt_A"] = jobs["A"][-1]["prompt"] if jobs["A"] and jobs["A"][-1]["shot"] == s["id"] else None
        s["prompt_B"] = jobs["B"][-1]["prompt"] if jobs["B"] and jobs["B"][-1]["shot"] == s["id"] else None
        s["plate"] = plate
    if args.stage == "AB" and args.board != "coverage":
        (adir / "storyboard4.json").write_text(json.dumps({"about": "Storyboard frames with exact prompts per approach (scripts/storyboard4.py).", "shots": board},
                                                      indent=2, ensure_ascii=False) + "\n")
    for ap_, js in jobs.items():
        if (args.stage in ("K", "Q")) != (ap_ in ("K", "Q")) or (args.stage in ("K", "Q") and ap_ != args.stage):
            continue
        js = [j for j in js if not args.shots or j["shot"] in args.shots]
        (adir / f"pass3-{ap_}-r{att}.json").write_text(json.dumps({
            "about": f"Fifteen Days storyboard frames, approach {ap_}, attempt {att} (owner, 2026-10-16 night): scripts/storyboard4.py. Prompts DRAFTED by the coding agent.",
            "out": "images-out/preprod/pass3", "ledger": "images-out/preprod/ledger-s7.json", "cap_usd": 25.0, "style": "", "jobs": js}, indent=2, ensure_ascii=False) + "\n")
        print(ap_, att, len(js), "jobs")


if __name__ == "__main__":
    main()
