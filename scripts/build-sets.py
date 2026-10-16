"""Build the Fifteen Days grey-box sets as data for scripts/set-render.html (three.js).

  .venv-image/bin/python scripts/build-sets.py fifteen-days

Writes adaptations/<seed>/preprod/sets/{courtyard,hall,corridor,lobby}.json. Metres; x east, z south, y up.
Each set has objects (landmarks the prompts can name when a camera sees them), the people's positions in each
state of the scene, and its camera setups (the plates). DRAFTED by the coding agent from the floor plans, the
book (the corridor, c4-b59; the hall, c4-b78-b82; the lobby, c15-b51) and the owner's notes (the walkway across
the middle of the hall, 2026-10-16).
"""

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def box(p, s, c=0xd2d2d8, **kw):
    return {"shape": "box", "p": p, "s": s, "c": c, **kw}


def cyl(p, r, h, c=0xd2d2d8, **kw):
    return {"shape": "cyl", "p": p, "r": r, "h": h, "c": c, **kw}


def group(id, prims, landmark=None):
    return {"kind": "group", "id": id, "prims": prims, **({"landmark": landmark} if landmark else {})}


def railing(x1, z1, x2, z2, y, posts=None, c=0x8e8e96):
    n = posts or max(2, int(math.hypot(x2 - x1, z2 - z1) / 1.2))
    pr = [{"shape": "line", "pts": [[x1, y + 1.05, z1], [x2, y + 1.05, z2]]}, {"shape": "line", "pts": [[x1, y + 0.55, z1], [x2, y + 0.55, z2]]}]
    for i in range(n + 1):
        t = i / n
        pr.append(box([x1 + (x2 - x1) * t, y + 0.53, z1 + (z2 - z1) * t], [0.05, 1.06, 0.05], c, edges=False))
    return pr


def courtyard() -> dict:
    s = json.loads((SETS / "courtyard.json").read_text())
    s["objects"] = [o for o in s["objects"] if o["id"] not in ("chairX", "wallN", "wallN2", "t1", "street", "lamp")]
    s["objects"] += [
        {"id": "wallN", "kind": "wall", "landmark": "the shop fronts with windows glowing pink and cyan", "from": [-8, -7], "to": [5.3, -7], "h": 3.2, "windows": 4},
        {"id": "wallN2", "kind": "wall", "from": [7.7, -7], "to": [8, -7], "h": 3.2, "windows": 0},
        {"id": "t1", "kind": "roundtable", "at": [-4.6, 4.4], "r": 0.45, "h": 0.75, "diners": 2},
        group("street", [box([0, -0.01, -11.5], [30, 0.02, 8], 0xdcdce0, edges=False)] +
              [box([x, 3.5, -16], [5.6, 7 + (i % 3) * 2, 3], 0xc6c6cc) for i, x in enumerate(range(-12, 16, 6))] +
              [box([x, 1.4, -14.48], [1.4, 1.6, 0.06], 0xa9a9b2) for x in range(-12, 16, 3)],
              "the quiet street beyond the gate, plain building fronts with no signs"),
        group("props", [cyl([0.35, 0.8, -0.3], 0.05, 0.07, 0xf0f0f4), cyl([1.05, 0.8, 0.12], 0.05, 0.07, 0xf0f0f4),
                        cyl([0.62, 0.79, -0.02], 0.07, 0.05, 0xe8e8ee)] +
              [box([0.42 + i * 0.032, 0.79 + r * 0.03, -0.18], [0.03, 0.03, 0.03], 0xffffff) for r in range(3) for i in range(6) if not (r == 0 and i == 2)],
              "two tea cups, a little sugar bowl and a small wall of sugar cubes on the table"),
        group("lamp", [cyl([5.0, 1.8, -8.4], 0.06, 3.6, 0x77777f), {"shape": "sphere", "p": [5.0, 3.7, -8.4], "r": 0.22, "c": 0xe8e8ee}], "a street lamp by the gate"),
    ]
    s["ground"] = {"w": 30, "d": 30}
    s["states"] = {
        "seated": {"D": {"at": [0, -0.95], "face": "S", "pose": "seated"}, "B": {"at": [0, 0.95], "face": "N", "pose": "seated"},
                   "Z": {"at": [1.5, 0], "face": "W", "pose": "seated"}, "R": {"at": [-0.9, -1.6], "face": "SE", "pose": "robot"}},
        "bai-away": {"B": {"at": [3.3, 1.35], "face": "N", "pose": "seated"}},
        "bai-standing": {"B": {"at": [0.55, 1.35], "face": "NE", "pose": "standing"}},
        "zei-arrives": {"Z": {"at": [6.3, -6.0], "face": "SW", "pose": "standing"}},
        "zei-crossing": {"Z": {"at": [3.6, -2.6], "face": "SW", "pose": "standing"}},
        "zei-standing": {"Z": {"at": [1.9, -0.45], "face": "W", "pose": "standing"}},
        "gate": {"D": {"at": [6.5, -8.0], "face": "S", "pose": "standing"}, "Z": {"at": [6.5, -6.2], "face": "N", "pose": "standing"}},
        "street": {"D": {"at": [3.0, -9.6], "face": "W", "pose": "standing"}},
        "dusk-walk": {"Z": {"at": [1.8, -1.2], "face": "SE", "pose": "standing"}, "B": {"at": [3.3, 1.35], "face": "N", "pose": "seated"}},
    }
    s["axis"] = {"cam_side": [-12, 6]}  # cameras stay on the west and south-west, so Deluin looks screen-right and Zei screen-left
    s["setups"] = {
        "A": {"what": "wide, from the west", "cam": [-6.2, 1.9, 1.4], "look": [0.6, 0.8, -0.3], "fov": 40},
        "B": {"what": "toward Zei and Bai's later table (from behind Deluin's side)", "cam": [-1.4, 1.25, -1.6], "look": [3.0, 0.9, 0.6], "fov": 40},
        "C": {"what": "toward Deluin, the tree and the west side (from Zei's side)", "cam": [2.6, 1.25, 0.9], "look": [-2.5, 1.0, -1.6], "fov": 40},
        "D": {"what": "toward Bai across the table (from Deluin's side)", "cam": [-0.6, 1.25, -2.4], "look": [0.6, 0.9, 3.0], "fov": 40},
        "E": {"what": "the tabletop from above", "cam": [-0.3, 2.1, -0.6], "look": [0.35, 0.75, 0.05], "fov": 40},
        "G": {"what": "the gate and the street, from inside the courtyard", "cam": [2.0, 1.6, -3.4], "look": [6.5, 1.4, -8.0], "fov": 42},
        "S": {"what": "the street outside the gate", "cam": [8.6, 1.6, -10.4], "look": [2.5, 1.4, -9.4], "fov": 42},
    }
    return s


def hall() -> dict:
    o = []
    R0, R1, TOP = 10.0, 16.0, 7.6
    # tiers: rings rising from the floor's edge to the standing ring at the top, a gap on the west and east for the pits' paths
    tiers = []
    rows = 9
    for i in range(rows):
        r = R0 + (R1 - R0) * i / rows
        y = 0.8 + (TOP - 0.8) * i / rows
        for k in range(40):
            a = k / 40 * math.pi * 2
            tiers.append(box([math.cos(a) * r, y / 2, math.sin(a) * r], [1.0, y, 1.6], 0xd0d0d6, ry=-a, edges=(k % 2 == 0)))
    o.append(group("tiers", tiers, "tiers of seats rising all around the hall, full of a varied crowd"))
    crowd = []
    for i in range(1, rows):
        r = R0 + (R1 - R0) * i / rows - 0.3
        y = 0.8 + (TOP - 0.8) * i / rows
        for k in range(46):
            a = (k + 0.5 * (i % 2)) / 46 * math.pi * 2
            crowd.append([round(math.cos(a) * r, 2), round(y, 2), round(math.sin(a) * r, 2), "N", "seated"])
    o.append({"kind": "crowd", "id": "crowd", "at": crowd})
    # the standing ring at the top, and the walkway across the middle joining it north to south
    ring = []
    for k in range(48):
        a = k / 48 * math.pi * 2
        ring.append(box([math.cos(a) * (R1 + 1.0), TOP - 0.1, math.sin(a) * (R1 + 1.0)], [2.2, 0.2, 2.2], 0xc8c8ce, ry=-a, edges=False))
    ring += [{"shape": "line", "pts": [[math.cos(k / 64 * 6.2832) * (R1 + 0.05), TOP + 1.05, math.sin(k / 64 * 6.2832) * (R1 + 0.05)] for k in range(65)]}]
    o.append(group("ring", ring, "the standing ring around the top of the hall, crowded behind a railing"))
    ringcrowd = [[round(math.cos(k / 70 * 6.2832) * (R1 + 1.1), 2), TOP, round(math.sin(k / 70 * 6.2832) * (R1 + 1.1), 2), "N", "standing"] for k in range(70)]
    o.append({"kind": "crowd", "id": "ringcrowd", "at": [[c[0], c[1], c[2], c[3], c[4]] for c in ringcrowd]})
    walk = [box([0, TOP - 0.15, 0], [3.2, 0.3, 2 * R1 + 2], 0xc4c4ca)]
    walk += railing(-1.6, -R1, -1.6, R1, TOP, 26) + railing(1.6, -R1, 1.6, R1, TOP, 26)
    o.append(group("walkway", walk, "the broad walkway spanning the hall high above the floor, with a railing on each side"))
    o.append({"kind": "crowd", "id": "walkcrowd", "at": [[1.2, TOP, z, "E", "standing"] for z in (-9, -6.5, -3, 4, 7.5, 10.5)] + [[-1.2, TOP, z, "W", "standing"] for z in (-10, -7, 3.5, 6, 9.5)]})
    # the floor: identical posts on robotic bases, holograms of gliders, ships and walls
    posts = []
    for i, (x, z) in enumerate([(x, z) for x in (-5, -2.5, 0, 2.5, 5) for z in (-5, -2.5, 0, 2.5, 5) if x * x + z * z < 40]):
        posts += [cyl([x, 0.12, z], 0.45, 0.24, 0xa8a8b0), cyl([x, 1.3, z], 0.12, 2.1, 0x55555c), box([x, 2.55, z], [0.5, 0.4, 0.5], 0xe2e2e8, glow=0x9fe3ef if i % 2 else 0xf2c46a)]
    o.append(group("posts", posts, "identical black posts on small robotic bases, glowing cube clusters on top"))
    holo = []
    for i in range(40):
        a, rr, y = i * 2.4, 2 + (i * 37 % 50) / 10, 1.2 + (i * 13 % 30) / 10
        holo.append(box([math.cos(a) * rr, y, math.sin(a) * rr], [0.35, 0.12, 0.2], 0xe8e8ee, glow=0x9fe3ef if i % 3 else 0xf2c46a, ry=a, edges=False))
    for k in range(6):
        holo.append(box([-3 + k * 0.42, 0.45, 3.6], [0.4, 0.9, 0.4], 0xe8e8ee, glow=0x9fe3ef))
    o.append(group("holo", holo, "glowing holograms of gliders, little ships and walls of cubes in cyan and amber over the floor"))
    o.append(group("floor", [cyl([0, -0.02, 0], R0, 0.04, 0xdedee3, seg=64, edges=False)] +
                   [{"shape": "line", "pts": [[math.cos(k / 48 * 6.2832) * rr, 0.01, math.sin(k / 48 * 6.2832) * rr] for k in range(49)]} for rr in (3, 6, 9)]))
    # the pits, sunk at the west and east edges of the floor, each with a console
    for id, x, face in (("pitD", -8.4, "W"), ("pitK", 8.4, "E")):
        sx = -1 if x < 0 else 1
        o.append(group(id, [cyl([x, -0.6, 0], 1.6, 1.2, 0x9c9ca4, seg=32, open=True), box([x + sx * 0.75, -0.2, 0], [0.5, 0.9, 1.3], 0xb0b0b8)],
                       "Deluin's sunken pit at the edge of the floor" if x < 0 else "Kau's sunken pit at the edge of the floor"))
    # the two big screens, side by side on the north side, facing the hall
    o.append(group("screens", [box([-3.2, 11.5, -11.5], [5.6, 3.2, 0.2], 0xf2f2f5), box([3.2, 11.5, -11.5], [5.6, 3.2, 0.2], 0xf2f2f5),
                               cyl([-3.2, 14.5, -11.5], 0.04, 3, 0x77777f), cyl([3.2, 14.5, -11.5], 0.04, 3, 0x77777f)],
                   "two big screens hung over the hall, showing the two players' faces"))
    return {
        "about": "The Minpentai hall as a grey-box set: tiers all round, the standing ring at the top, the broad walkway across the middle (owner, 2026-10-16), the floor of posts and holograms with nobody on it, the two pits, two big screens.",
        "ground": {"w": 40, "d": 40}, "objects": o, "fog": [30, 70],
        "states": {
            "game": {"D": {"at": [-8.4, 0], "face": "W", "pose": "seated", "y": -1.1}, "K": {"at": [8.4, 0], "face": "E", "pose": "seated", "y": -1.1}},
            "walkway": {"Z": {"at": [-1.1, -0.6], "face": "W", "pose": "standing", "y": TOP}, "B": {"at": [-1.1, 0.6], "face": "W", "pose": "standing", "y": TOP}},
            "walkway-turned": {"Z": {"at": [-1.1, -0.6], "face": "S", "pose": "standing", "y": TOP}, "B": {"at": [-1.15, 0.6], "face": "W", "pose": "standing", "y": TOP}},
        },
        "axis": {"cam_side": [-20, 6]},
        "setups": {
            "A": {"what": "the whole hall from the standing ring on the south-west, the walkway crossing the frame", "cam": [-11.5, TOP + 2.6, 12.0], "look": [1.0, 2.0, -2.0], "fov": 62},
            "B": {"what": "low on the floor among the posts", "cam": [-4.0, 0.9, 6.8], "look": [1.5, 1.8, -1.5], "fov": 50},
            "P": {"what": "down into Deluin's pit, the tiers rising behind", "cam": [-6.6, 2.0, 1.2], "look": [-8.9, -0.2, 0], "fov": 46},
            "W": {"what": "the walkway from the air beside it, the floor below", "cam": [-6.5, TOP + 1.4, 2.5], "look": [-1.1, TOP + 1.0, 0], "fov": 42},
            "V": {"what": "straight down from the walkway's railing to the floor", "cam": [-1.4, TOP + 1.6, 0], "look": [-4.0, 0, 0.3], "fov": 55},
        },
    }


def corridor() -> dict:
    o = []
    L = 40
    vault = [box([0, -0.01, -L / 2 + 6], [2.0, 0.02, L], 0xdedee3, edges=False),
             box([-1.05, 1.0, -L / 2 + 6], [0.1, 2.0, L], 0xd6d6dc), box([1.05, 1.0, -L / 2 + 6], [0.1, 2.0, L], 0xd6d6dc),
             cyl([0, 2.0, -L / 2 + 6], 1.05, L, 0xdcdce2, seg=24, open=True, rx=math.pi / 2, t0=-math.pi / 2, tl=math.pi)]
    for z in range(6, -L + 6, -2):
        vault.append({"shape": "line", "pts": [[math.cos(a) * 1.0, 2.0 + math.sin(a) * 1.0, z] for a in [k / 12 * math.pi for k in range(13)]]})
    vault.append({"shape": "line", "pts": [[-1.0, 0.02, 6], [-1.0, 0.02, -L + 6]]})
    vault.append({"shape": "line", "pts": [[1.0, 0.02, 6], [1.0, 0.02, -L + 6]]})
    o.append(group("vault", vault, "the round-topped corridor of polished pale stone, no windows"))
    doors = []
    for z in (-2, -6, -10, -14):
        doors += [box([-1.0, 1.1, z], [0.06, 2.2, 1.3], 0xb2b2ba), {"shape": "line", "pts": [[-0.96, 0, z], [-0.96, 2.2, z]]}]
    o.append(group("elevators", doors, "a row of sleek elevator doors in the left-hand wall"))
    o.append({"kind": "crowd", "id": "passers", "at": [[0.3, 0, -24, "N", "standing"], [-0.4, 0, -28, "S", "standing"]]})
    return {
        "about": "The corridor inside the mountain (book c4-b59: two metres wide, three tall, a semicircular top, polished stone, no windows), the elevators on the west wall. Nobody sits here.",
        "ground": {"w": 4, "d": 50}, "objects": o, "fog": [12, 34],
        "states": {
            "waiting": {"Z": {"at": [0.15, -7.2], "face": "W", "pose": "standing"}, "B": {"at": [0.8, -4.6], "face": "W", "pose": "standing"}},
            "meeting": {"D": {"at": [-0.55, -6.0], "face": "E", "pose": "standing"}, "Z": {"at": [0.35, -6.6], "face": "W", "pose": "standing"},
                        "B": {"at": [0.8, -4.6], "face": "NW", "pose": "standing"}},
            "leaving": {"D": {"at": [-0.1, -15], "face": "N", "pose": "standing"}, "Z": {"at": [0.35, -6.6], "face": "N", "pose": "standing"},
                        "B": {"at": [0.8, -4.6], "face": "W", "pose": "standing"}},
            "walking": {"Z": {"at": [-0.4, 0.5], "face": "S", "pose": "standing"}, "B": {"at": [0.4, 0.5], "face": "S", "pose": "standing"}},
        },
        "axis": {"cam_side": [3, -2]},
        "setups": {
            "N": {"what": "down the corridor toward the elevators (north)", "cam": [0.5, 1.6, 2.5], "look": [-0.2, 1.4, -10], "fov": 50},
            "S": {"what": "the corridor looking south, the way they walk", "cam": [0.0, 1.55, 4.8], "look": [0.0, 1.3, -2], "fov": 50},
        },
    }


def lobby() -> dict:
    o = []
    room = [box([0, -0.01, 0], [12, 0.02, 10], 0xdedee3, edges=False), box([6.0, 1.6, 0], [0.2, 3.2, 10], 0xd2d2d8), box([0, 1.6, -5], [12, 3.2, 0.2], 0xd2d2d8),
            box([0, 3.25, 0], [12, 0.1, 10], 0xe4e4e8, edges=False)]
    o.append(group("room", room, "the warm, plain walls of the hotel lobby restaurant"))
    win = [box([-6.0, 0.25, 0], [0.2, 0.5, 10], 0xc4c4ca), box([-6.0, 3.0, 0], [0.2, 0.5, 10], 0xc4c4ca)] + [box([-6.0, 1.6, z], [0.2, 2.3, 0.12], 0x8e8e96) for z in (-5, -2.5, 0, 2.5, 5)]
    o.append(group("window", win, "tall windows along the west wall, the night city outside"))
    o.append(group("counter", [box([5.2, 0.55, 0], [1.0, 1.1, 3.2], 0xbfbfc6)], "the robot's counter on the east wall"))
    o.append({"id": "ztable", "kind": "table", "landmark": "his table by the window, a bowl and a tea cup on it", "at": [-4.0, 0], "size": [0.9, 0.9], "h": 0.75})
    for x, z in ((-1, -3), (-1, 3), (2, -3), (2, 3), (2, 0)):
        o.append({"id": f"lt{x}{z}", "kind": "table", "at": [x, z], "size": [0.9, 0.9], "h": 0.75})
    o.append({"id": "chairZ", "kind": "chair", "at": [-3.35, 0], "face": "W"})
    o.append({"id": "chairB", "kind": "chair", "at": [-4.65, 0], "face": "E"})
    o.append(group("lamps", [cyl([-4.0, 0.95, -0.3], 0.08, 0.35, 0xe6e6ea)], None))
    o.append(group("street", [box([-11, -0.02, 0], [10, 0.02, 30], 0xd8d8dc, edges=False), box([-16, 4, 0], [2, 8, 30], 0xc6c6cc)] +
                   [box([-14.9, 1.6, z], [0.06, 1.6, 1.6], 0xa9a9b2) for z in range(-12, 13, 4)], "the dark street outside"))
    o.append(group("streetlamp", [cyl([-8.5, 1.8, 3.5], 0.06, 3.6, 0x77777f), {"shape": "sphere", "p": [-8.5, 3.7, 3.5], "r": 0.22, "c": 0xe8e8ee}], "a street lamp outside"))
    return {
        "about": "The hotel lobby restaurant (book c15-b51), nearly empty: Zei's table by the tall west windows, the robot's counter on the east wall, the street outside the glass.",
        "ground": {"w": 36, "d": 36}, "objects": o,
        "states": {
            "alone": {"Z": {"at": [-3.35, 0], "face": "W", "pose": "seated"}, "R": {"at": [4.4, 0.6], "face": "W", "pose": "robot"}},
            "refill": {"Z": {"at": [-3.35, 0], "face": "W", "pose": "seated"}, "R": {"at": [-3.6, -0.95], "face": "S", "pose": "robot"}},
            "together": {"Z": {"at": [-3.35, 0], "face": "W", "pose": "seated"}, "B": {"at": [-4.65, 0], "face": "E", "pose": "seated"}},
        },
        "axis": {"cam_side": [0, 9]},
        "setups": {
            "I": {"what": "inside, toward the windows", "cam": [1.5, 1.5, 3.8], "look": [-4.6, 1.0, -0.4], "fov": 46},
            "O": {"what": "from the street outside, through the window", "cam": [-10.5, 1.6, 2.0], "look": [-4.0, 1.0, 0], "fov": 40},
        },
    }


SETS = None


def main() -> None:
    global SETS
    seed = sys.argv[1]
    SETS = ROOT / "adaptations" / seed / "preprod" / "sets"
    for name, fn in (("courtyard", courtyard), ("hall", hall), ("corridor", corridor), ("lobby", lobby)):
        s = fn()
        s.pop("shots", None)
        (SETS / f"{name}.json").write_text(json.dumps(s, indent=1) + "\n")
        print(name, len(s["objects"]), "objects;", len(s.get("setups", {})), "setups")


if __name__ == "__main__":
    main()
