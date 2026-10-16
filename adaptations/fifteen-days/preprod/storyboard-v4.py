"""Fifteen Days, storyboard v4: every shot placed in a grey-box set with its own camera (DRAFTED by the coding agent, 2026-10-16).

Shot list v3 with the owner's storyboard notes: F10 cut; F12 kept as an insert of the book's menu picture;
F05 a close-up on Deluin; F06 Zei pulling up a chair; F14 closer on Bai; S01 the tea poured, top-down; S02 and
S06 very close on Deluin's hands and the cubes; S03 closer; S12 split into the flick from the side (S12) and the
wall with its new door (S12b). Each shot names its set, the scene state (who is where), and how its camera is
found: a single sits on the eyeline toward the person spoken to, turned off the axis toward the set's camera
side (so the 180-degree rule holds); a two-shot is perpendicular to the pair; an over-the-shoulder sits behind
the near person's shoulder; an insert looks down at its point; a few wides use explicit cameras.

Writes adaptations/<seed>/preprod/sets/<set>.shots.json (for scripts/set-render.mjs) and storyboard-v4.json.
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).parent
SETS = HERE / "sets"
v3 = json.loads((HERE / "shotlist-v3.json").read_text())
shots = {s["id"]: dict(s) for s in v3["shots"]}
order = [s["id"] for s in v3["shots"]]

# --- the owner's notes on the storyboard (2026-10-16) ---
order.remove("F10")
shots["F05"].update(size="CU", who=["D"], action="{D} at the wide table, laughing, turns and waves someone over with a big smile.")
shots["F06"].update(size="MCU", who=["Z"], action="{Z} pulls out the chair at the end of the table and drops into it.")
shots["F12"].update(composite="c14-b108 (the book's menu picture, a short insert)")
shots["F14"].update(size="CU", action="{B}, close, glances around the courtyard, then down at her paper-thin menu, unimpressed.")
shots["S01"].update(size="ECU INSERT, top-down", who=["R"], action="From above: the robot's hand pours tea from a pot into two cups on the wide table.")
shots["S02"].update(size="ECU INSERT", action="Very close: {D}'s fingers, his cream cable-knit sleeve showing, absent-mindedly setting one white sugar cube on another.")
shots["S03"].update(size="CU, tight", action="{D}, close, eyes on Zei, not on his hands.")
shots["S06"].update(size="ECU INSERT", action="Very close on the white sugar cubes, {D}'s fingertips setting another on top: the stack is becoming a little wall.")
shots["S12"].update(size="ECU INSERT, from the side", who=["Z", "D"], action="From the side, low at table height: both their hands by the little wall of sugar cubes; {Z}'s finger flicks one cube out of the bottom row and it goes flying.")
i = order.index("S12")
order.insert(i + 1, "S12b")
shots["S12b"] = {"id": "S12b", "scene": "courtyard", "size": "ECU INSERT", "who": [], "action": "The little wall of sugar cubes, now with a doorway in its bottom row.", "line": None, "look": "-", "dur_s": 2, "purpose": "The door in the wall (owner's note)."}

# --- where each shot is, and how its camera is found ---
SET = {"H": "hall", "G": "hall", "C": "corridor", "F": "courtyard", "S": "courtyard", "R": "courtyard", "D": "courtyard", "L": "lobby"}
STATE = {"H": ["game"], "G": ["walkway"], "C": ["meeting"], "F": ["seated"], "S": ["seated", "bai-away"], "R": ["seated", "bai-away"], "D": ["gate"], "L": ["alone"]}
SPEC = {  # id: {state, cam, partner, mode, people overrides}
    "H01": {"setup": "A"}, "H02": {"setup": "B"}, "H03": {"setup": "P"}, "H05": {"mode": "face"},
    "H06": {"cam": [3.0, 1.4, 4.0], "look": [9.5, 3.5, 9.0], "fov": 40}, "H07": {"setup": "B"}, "H08": {"mode": "face", "high": 0.7},
    "G01": {"cam": [-7.0, 1.6, 8.5], "look": [-1.2, 8.6, 0], "fov": 42}, "G02": {"cam": [1.2, 9.3, 0.1], "look": [-6.0, 6.0, 0], "fov": 48},
    "G03": {"mode": "face", "low": 0.35}, "G04": {"insert": [-1.55, 8.66, 0.6]}, "G05": {"mode": "face", "turn": 30}, "G06": {"state": ["walkway-turned"], "mode": "face"},
    "G07": {"mode": "face", "turn": -20}, "G08": {"setup": "V"}, "G09": {"mode": "face", "turn": 80}, "G10": {"state": ["walkway-turned"], "mode": "pair"},
    "G11": {"mode": "face", "turn": 12, "people": {"Z": {"at": [-0.35, 1.05], "face": "W", "pose": "standing", "y": 7.6}}},
    "C01": {"state": ["waiting"], "setup": "N"}, "C02": {"cam": [0.95, 1.65, -3.0], "look": [-0.6, 1.5, -6.2], "fov": 46},
    "C03": {"partner": "D"}, "C04": {"partner": "Z", "low": 0.3}, "C05": {"partner": "D"}, "C06": {"ots": ["Z", "B"]}, "C07": {"partner": "Z"},
    "C08": {"partner": "D"}, "C09": {"ots": ["B", "D"]}, "C10": {"partner": "D"},
    "C11": {"state": ["leaving"], "cam": [0.75, 1.7, -3.6], "look": [-0.1, 1.5, -15], "fov": 46},
    "C12": {"state": ["walking"], "mode": "front"}, "C13": {"state": ["walking"], "mode": "face", "turn": -25}, "C14": {"state": ["walking"], "mode": "face", "turn": 25},
    "C15": {"state": ["walking"], "mode": "face", "turn": -25}, "C16": {"state": ["walking"], "mode": "face", "turn": -25}, "C17": {"state": ["walking"], "mode": "front"},
    "F01": {"cam": [-8.5, 4.6, 6.0], "look": [1.0, 0.4, -1.5], "fov": 44, "people": {"R": {"at": [-4.2, 1.4], "face": "E", "pose": "robot"}}},
    "F02": {"state": ["zei-arrives"], "mode": "face", "turn": 15}, "F03": {"state": ["seated", "zei-arrives"], "pov": ["Z", [0, 0.9, 0]], "fov": 22},
    "F04": {"state": ["zei-crossing"], "mode": "face", "turn": 20}, "F05": {"partner": [6.3, 1.3, -6.0], "people": {"D": {"at": [0, -0.95], "face": "NE", "pose": "seated"}}},
    "F06": {"state": ["seated", "zei-standing"], "mode": "face", "turn": 20}, "F07": {"cam": [-4.2, 1.5, 0.6], "look": [0.35, 0.85, 0], "fov": 36},
    "F08": {"cam": [-2.6, 1.75, 3.4], "look": [0.2, 0.9, -0.4], "fov": 40}, "F09": {"mode": "face"},
    "F11": {"mode": "face", "high": 0.45}, "F13": {"partner": "D", "low": 0.25}, "F14": {"partner": "Z", "turn": 70}, "F15": {"partner": "D", "turn": 8},
    "F16": {"partner": "Z"}, "F17": {"ots": ["D", "Z"]}, "F18": {"partner": "Z", "high": 0.45}, "F19": {"partner": "D"}, "F20": {"partner": "D"},
    "F21": {"partner": "Z", "low": 0.3}, "F22": {"partner": "D"}, "F23": {"partner": "D", "turn": 10},
    "F24": {"state": ["seated", "bai-standing"], "partner": "Z"}, "F25": {"state": ["seated", "bai-standing"], "partner": "B"},
    "F26": {"state": ["seated", "bai-away"], "ots": ["Z", "B"]},
    "S01": {"insert": [0.95, 0.78, -0.25], "people": {"R": {"at": [0.9, -1.0], "face": "S", "pose": "robot"}}}, "S02": {"insert": [0.5, 0.82, -0.2], "near": 0.34, "people": {"D": {"at": [0.1, -0.85], "face": "S", "pose": "seated"}}},
    "S03": {"partner": "Z", "tight": 0.7}, "S04": {"partner": "D", "low": 0.2}, "S05": {"partner": "Z", "turn": 75}, "S06": {"insert": [0.5, 0.83, -0.18], "near": 0.22},
    "S07": {"partner": "Z", "turn": 8}, "S08": {"partner": "D"}, "S09": {"insert": [0.5, 0.82, -0.18], "low": True}, "S10": {"partner": "D", "high": 0.4},
    "S11": {"partner": "Z", "high": 0.45}, "S12": {"side": [0.5, 0.82, -0.18]}, "S12b": {"insert": [0.5, 0.82, -0.18], "low": True}, "S13": {"pair": ["Z", "D"]},
    "S14": {"partner": "Z"},
    "R01": {"partner": "Z", "low": 0.25}, "R02": {"partner": "D"}, "R03": {"insert": [1.2, 0.85, 0.12]}, "R04": {"partner": "D"}, "R05": {"partner": "Z", "turn": 75},
    "R06": {"cam": [3.75, 1.25, 2.6], "look": [1.2, 1.0, -0.3], "fov": 40}, "R07": {"partner": "B"}, "R08": {"partner": "Z", "mode": "ms"}, "R09": {"partner": "Z"},
    "R10": {"pair": ["Z", "D"]},
    "D01": {"setup": "G"}, "D02": {"partner": "Z"}, "D03": {"partner": "Z"}, "D04": {"partner": "D"},
    "D05": {"state": ["street"], "people": {"Z": {"at": [6.5, -6.2], "face": "N", "pose": "standing"}}, "setup": "G"},
    "D06": {"state": ["street"], "setup": "S"}, "D07": {"state": ["street"], "mode": "face", "high": 0.1}, "D08": {"state": ["street"], "insert": [2.75, 1.15, -9.6], "near": 0.4},
    "D09": {"state": ["dusk-walk"], "cam": [-5.5, 4.6, 5.0], "look": [2.0, 0.4, 0], "fov": 46}, "D10": {"state": ["dusk-walk"], "partner": "Z"},
    "L01": {"setup": "I"}, "L01b": {"setup": "O"}, "L02": {"mode": "face", "high": 0.3}, "L04": {"state": ["refill"], "pair": ["R", "Z"]},
    "L05": {"state": ["together"], "pair": ["B", "Z"]}, "L06": {"state": ["together"], "partner": "B"}, "L08": {"mode": "face"}, "L10": {"state": ["together"], "ots": ["Z", "B"]},
    "L11": {"state": ["together"], "partner": "Z"},
}
# who sits where per shot when the shot's "who" leaves people out of the frame they'd still be in: draw only who is listed.

VIS = {"ECU": 0.32, "CU": 0.6, "MCU": 0.78, "MS": 1.3, "OTS": 1.0, "WS": 3.8, "EWS": 12, "POV": 2.0}
FOV = 36
FACEV = {"N": (0, -1), "S": (0, 1), "E": (1, 0), "W": (-1, 0), "NE": (0.707, -0.707), "NW": (-0.707, -0.707), "SE": (0.707, 0.707), "SW": (-0.707, 0.707)}


def head(p):
    h = {"Z": 0.97, "B": 0.98, "D": 1.07, "K": 1.0, "R": 1.0}.get(p["who"], 1)
    if p["pose"] == "robot":
        return [p["at"][0], p.get("y", 0) + 1.4, p["at"][1]]
    hip = 0.47 if p["pose"] == "seated" else 0.9 * h
    return [p["at"][0], p.get("y", 0) + hip + 0.78 * h, p["at"][1]]


def rot(v, deg):
    a = math.radians(deg)
    return (v[0] * math.cos(a) - v[1] * math.sin(a), v[0] * math.sin(a) + v[1] * math.cos(a))


def norm(v):
    l = math.hypot(*v) or 1
    return (v[0] / l, v[1] / l)


def dist_for(size, fov=FOV):
    return VIS[size] / (2 * math.tan(math.radians(fov / 2)))


def side_pick(base, p, d, side_pt, turn):
    best = None
    for sgn in (1, -1):
        v = rot(base, sgn * turn)
        c = (p[0] + v[0] * d, p[2] + v[1] * d)
        dd = math.hypot(c[0] - side_pt[0], c[1] - side_pt[1])
        if best is None or dd < best[0]:
            best = (dd, c)
    return best[1]


def solve(s, setdef):
    sid, spec = s["id"], SPEC.get(s["id"], {})
    size = s["size"].split(",")[0].split(" ")[0]
    if "INSERT" in s["size"]:
        size = "INSERT"
    states = spec.get("state", STATE[sid[0]] if sid not in ("F01",) else ["seated"])
    pos = {}
    for st in states:
        for w, p in setdef["states"][st].items():
            pos[w] = {**p, "who": w}
    for w, p in spec.get("people", {}).items():
        pos[w] = {**p, "who": w}
    people = {w: {k: v for k, v in pos[w].items() if k != "who"} for w in s["who"] if w in pos}
    side_pt = setdef["axis"]["cam_side"]
    shot = {"people": people, "fov": spec.get("fov", FOV)}
    if "setup" in spec:
        su = setdef["setups"][spec["setup"]]
        return {**shot, "cam": su["cam"], "look": su["look"], "fov": su["fov"], "plate": f"plate-{SET[sid[0]]}-{spec['setup']}"}
    if "cam" in spec:
        return {**shot, "cam": spec["cam"], "look": spec["look"]}
    if "insert" in spec or "side" in spec:
        pt = spec.get("insert") or spec["side"]
        v = norm((side_pt[0] - pt[0], side_pt[1] - pt[2]))
        if "side" in spec:
            return {**shot, "cam": [pt[0] + v[0] * 0.55, pt[1] + 0.08, pt[2] + v[1] * 0.55], "look": pt, "fov": 40}
        if spec.get("low"):
            return {**shot, "cam": [pt[0] + v[0] * 0.42, pt[1] + 0.06, pt[2] + v[1] * 0.42], "look": pt, "fov": 40}
        n = spec.get("near", 0.45)
        return {**shot, "cam": [pt[0] + v[0] * n * 0.35, pt[1] + n, pt[2] + v[1] * n * 0.35], "look": pt, "fov": 44}
    if "ots" in spec:
        f, t = (pos[w] for w in spec["ots"])
        fh, th = head(f), head(t)
        back = norm((fh[0] - th[0], fh[2] - th[2]))
        perp = (-back[1], back[0])
        cand = []
        for sgn in (1, -1):
            c = [fh[0] + back[0] * 0.6 + perp[0] * 0.35 * sgn, fh[1] + 0.12, fh[2] + back[1] * 0.6 + perp[1] * 0.35 * sgn]
            cand.append((math.hypot(c[0] - side_pt[0], c[2] - side_pt[1]), c))
        cam = min(cand)[1]
        shot["people"] = {w: {k: v for k, v in pos[w].items() if k != "who"} for w in spec["ots"]} | people
        return {**shot, "cam": cam, "look": [th[0], th[1] - 0.15, th[2]], "fov": 38}
    if "pov" in spec:
        w, pt = spec["pov"]
        hh = head(pos[w])
        shot["people"] = {k: v for k, v in people.items() if k != w}
        return {**shot, "cam": hh, "look": pt}
    if "pair" in spec or spec.get("mode") in ("pair", "front"):
        ws = spec.get("pair", s["who"])
        hs = [head(pos[w]) for w in ws]
        mid = [sum(h[i] for h in hs) / len(hs) for i in range(3)]
        span = max(math.hypot(a[0] - b[0], a[2] - b[2]) for a in hs for b in hs) if len(hs) > 1 else 0
        d = max(dist_for(size if size in VIS else "MS"), (span + 1.6) / (2 * math.tan(math.radians(FOV / 2)) * 1.78))
        if spec.get("mode") == "front":
            f = FACEV[pos[ws[0]]["face"]]
            cam = [mid[0] + f[0] * d, mid[1] + 0.05, mid[2] + f[1] * d]
        else:
            ax = norm((hs[-1][0] - hs[0][0], hs[-1][2] - hs[0][2]))
            perp = (-ax[1], ax[0])
            c1 = (mid[0] + perp[0] * d, mid[2] + perp[1] * d)
            c2 = (mid[0] - perp[0] * d, mid[2] - perp[1] * d)
            c = min((c1, c2), key=lambda c: math.hypot(c[0] - side_pt[0], c[1] - side_pt[1]))
            cam = [c[0], mid[1] + 0.25, c[1]]
        return {**shot, "cam": cam, "look": [mid[0], mid[1] - 0.25, mid[2]]}
    # a single
    subj = s["who"][0] if s["who"][0] != "R" or len(s["who"]) == 1 else s["who"][1]
    p = pos[subj]
    h = head(p)
    partner = spec.get("partner")
    if spec.get("mode") == "face" or partner is None:
        f = FACEV[p["face"]]
        base = f
        turn = spec.get("turn", 18)
    else:
        tp = head(pos[partner]) if isinstance(partner, str) else partner
        base = norm((tp[0] - h[0], tp[2] - h[2]))
        turn = spec.get("turn", 24 if size != "ECU" else 12)
    sz = "MS" if spec.get("mode") == "ms" else size
    d = dist_for(sz if sz in VIS else "CU") * spec.get("tight", 1.0)
    if "turn" in spec and spec.get("mode") == "face":
        v = rot(base, spec["turn"])
        c = (h[0] + v[0] * d, h[2] + v[1] * d)
    else:
        c = side_pick(base, h, d, side_pt, turn)
    y = h[1] + 0.02 + spec.get("high", 0) - spec.get("low", 0)
    look_y = h[1] - {"ECU": 0.0, "CU": 0.1, "MCU": 0.2, "MS": 0.3}.get(sz, 0.1)
    return {**shot, "cam": [c[0], y, c[1]], "look": [h[0], look_y, h[2]]}


out = {}
board = []
setdefs = {n: json.loads((SETS / f"{n}.json").read_text()) for n in ("hall", "corridor", "courtyard", "lobby")}
for sid in order:
    s = shots[sid]
    sname = SET[sid[0]]
    if s.get("composite"):
        board.append({**s, "set": sname, "camera": None})
        continue
    cam = solve(s, setdefs[sname])
    out.setdefault(sname, {})[sid] = cam
    board.append({**s, "set": sname, "camera": cam})
# the plates: each setup's camera, the set empty of the main people
for sname, sd in setdefs.items():
    for k, su in sd["setups"].items():
        out.setdefault(sname, {})[f"plate-{sname}-{k}"] = {"cam": su["cam"], "look": su["look"], "fov": su["fov"], "people": {}}
for sname, sh in out.items():
    (SETS / f"{sname}.shots.json").write_text(json.dumps(sh, indent=1) + "\n")
(HERE / "storyboard-v4.json").write_text(json.dumps({"about": __doc__.strip().splitlines()[0], "geography": v3["geography"], "shots": board}, indent=2, ensure_ascii=False) + "\n")
print(len(board), "shots;", {k: len(v) for k, v in out.items()})
