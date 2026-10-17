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
shots["F05"].update(size="CU", who=["D"], action="{D} at the long rectangular table, a soft closed-mouth laugh, turns and raises one hand to wave someone over.")
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
# the owner (2026-10-16): no open grins in any prompt unless the owner asks for one
for sid, a in (("C05", "{Z}, standing, a small self-deprecating closed-mouth smile, rubbing the back of his neck."),
               ("C08", "{Z}'s face, delighted, a warm closed-mouth smile."),
               ("C17", "{Z} smiles, mouth closed, and nudges her shoulder with his; {B} rolls her eyes, half smiling."),
               ("D04", "{Z} mirrors it with a closed-mouth smile: ten fingers, then five.")):
    shots[sid]["action"] = a
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
# the owner: Zei with Bai small behind him (S04, R02, F26 and any others) is drawn on the plate from setup B with
# Bai already at her table. Zei's singles in the later café scenes sit on the line from Bai's table through Zei,
# turned a little so she shows beside his head, small; F26 is over Zei's shoulder onto her.
BAI_BG = {"S04", "R02", "S10", "R04", "F26"}
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
        if spec.get("front"):  # from the side they face (the overlook: out over the hall)
            f = FACEV[pos[ws[0]]["face"]]
            cam = [mid[0] + f[0] * d, mid[1] + 0.05, mid[2] + f[1] * d]
        elif spec.get("mode") == "front":
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


def direct(s, cam, setdef):
    """Screen direction for the owner's 2026-10-17 frames: Zei on the left looking right, Deluin and Bai on the right looking left.
    If the solved camera breaks it, the camera is mirrored across the vertical plane through the people (or the subject's
    eyeline), which swaps left and right and keeps the framing."""
    spec = SPEC.get(s["id"], {})
    if "setup" in spec or "cam" in spec or "insert" in spec:
        return
    pos = {}
    for st in spec.get("state", STATE[s["id"][0]]):
        for w, p in setdef["states"][st].items():
            pos[w] = {**p, "who": w}
    for w, p in spec.get("people", {}).items():
        pos[w] = {**p, "who": w}
    c, l = cam["cam"], cam["look"]
    f = norm((l[0] - c[0], l[2] - c[2]))
    right = (-f[1], f[0])
    sx = lambda p: (p[0] - c[0]) * right[0] + (p[2] - c[2]) * right[1]
    group = spec.get("pair") or spec.get("ots")
    if group:
        hs = {w: head(pos[w]) for w in group}
        if "Z" not in hs:
            return
        ok = all(sx(hs["Z"]) < sx(h) for w, h in hs.items() if w != "Z")
        a, b = hs[group[0]], hs[group[-1]]
        u = norm((b[0] - a[0], b[2] - a[2]))
        P = ((a[0] + b[0]) / 2, (a[2] + b[2]) / 2)
    else:
        w = next(x for x in s["who"] if x != "R") if any(x != "R" for x in s["who"]) else "R"
        if w not in pos or w == "R":
            return
        h = head(pos[w])
        partner = spec.get("partner")
        t = head(pos[partner]) if isinstance(partner, str) and partner in pos else \
            [h[0] + FACEV[pos[w]["face"]][0] * 2, h[1], h[2] + FACEV[pos[w]["face"]][1] * 2]
        ok = sx(t) > sx(h) if w == "Z" else sx(t) < sx(h)
        u = norm((t[0] - h[0], t[2] - h[2]))
        P = (h[0], h[2])
    if ok:
        return
    v = (c[0] - P[0], c[2] - P[1])
    d = v[0] * u[0] + v[1] * u[1]
    m = (P[0] + 2 * d * u[0] - v[0], P[1] + 2 * d * u[1] - v[1])
    cam["cam"] = [round(m[0], 3), c[1], round(m[1], 3)]


def bai_behind(s, cam, setdef):
    """Zei's single with Bai small behind him: the camera on the line from her table through his head."""
    pos = {**setdef["states"]["seated"], **setdef["states"]["bai-away"]}
    z = head({**pos["Z"], "who": "Z"})
    b = (pos["B"]["at"][0], pos["B"]["at"][1])
    size = s["size"].split(",")[0].split(" ")[0]
    d = dist_for(size if size in VIS else "CU") * 1.05
    base = norm((z[0] - b[0], z[2] - b[1]))
    c = side_pick(base, z, d, setdef["axis"]["cam_side"], 14)
    cam["cam"] = [round(c[0], 3), cam["cam"][1], round(c[1], 3)]
    cam["look"] = [z[0], cam["look"][1], z[2]]
    cam["people"]["B"] = {k: v for k, v in pos["B"].items()}
    cam["plate"] = "plate-courtyard-B-bai"
    if "B" not in s["who"]:
        s["who"] = s["who"] + ["B"]
    s["bai_bg"] = True


# --- the owner's notes in the clip viewer (2026-10-17): 35 frames redrawn for the five-minute cut. Screen direction for these:
# Zei on the left of frame looking right; Deluin and Bai on the right looking left; from F26 on Bai sits at her own back table.
# Two-shots and over-the-shoulders instead of singles, and no straight-on singles (turned 40 degrees off the eyeline). DRAFTED.
def v5(sid, after=None, **kw):
    if sid not in shots:
        shots[sid] = {"id": sid, "scene": shots[after]["scene"], "line": None, "look": "-", "dur_s": 2}
        order.insert(order.index(after) + 1, sid)
    shots[sid].update({k: v for k, v in kw.items() if k != "spec"})
    SPEC[sid] = kw.get("spec", {})
    V5.add(sid)


V5 = set()
v5("H03", size="CU, side-on", who=["D"], action="{D} sits low in his small sunken pit at a large glowing console, the cabled glasses on, calm and focused on the game; hologram light on his face.",
   spec={"mode": "face", "turn": 60})
v5("H03b", after="H03", size="WS", who=["D"], action="The arena: the glowing hologram play floor with its walls and gliders, the crowded tiers rising around it, and above the floor one huge screen showing {D}'s calm face in close-up.",
   purpose="The arena with him on the screen (owner).", spec={"setup": "A"})
v5("H07", size="WS", who=["D"], action="The holographic walls stand as the last gliders break against them in bursts of light; the crowd in the tiers rises; above the floor the huge screen shows {D}'s face, calm.",
   spec={"setup": "B"})
v5("H08", size="CU, side-on", who=["D"], action="{D} in his pit lifts the cabled glasses off his face with one hand, the other hand empty on the console; the cable falls behind his arm; a small private closed-mouth smile.",
   spec={"mode": "face", "turn": 60})
WALK = {"Z": {"at": [-1.1, -0.6], "face": "W", "pose": "standing", "y": 7.6}, "B": {"at": [-1.1, 0.6], "face": "W", "pose": "standing", "y": 7.6}}
v5("G01", size="MS two-shot, from the front, low", who=["Z", "B"], action="High on the overlook, seen from out over the hall: {Z} on the left leans on his forearms on the railing, looking down at the game far below; {B} on the right leans on the railing beside him, eyes down on a small electronic gadget she works on with both hands. Two arms each.",
   spec={"pair": ["Z", "B"], "front": True})
v5("G05", size="MS two-shot, from the front", who=["Z", "B"], line="b1-2 Bai: It wouldn't be so annoying…", action="At the overlook railing, seen from out over the hall: {Z} on the left leans on the railing watching the game below; {B} on the right is bent over the small gadget she is working on, not looking up, dry.",
   spec={"pair": ["Z", "B"], "front": True})
v5("G06", size="MS two-shot, from the front", who=["Z", "B"], action="At the overlook railing: {Z} on the left turns his head to look at her, one eyebrow raised; {B} on the right still looks down at her gadget.",
   spec={"pair": ["Z", "B"], "front": True})
v5("G07", size="OTS over Zei's shoulder", who=["Z", "B"], action="Over {Z}'s shoulder: {B} snaps the gadget's casing shut and looks up at him, shrugging.",
   spec={"state": ["walkway-turned"], "ots": ["Z", "B"], "people": {"B": {"at": [-1.15, 0.6], "face": "N", "pose": "standing", "y": 7.6}}})
shots["G08"]["line"] = None  # "a pause before 'such patience'": the game, then Deluin playing, then Zei close on the line
v5("G08b", after="G08", size="OTS over Zei's shoulder, looking down", who=["Z"], action="Over {Z}'s shoulder at the railing, looking down past the crowd's heads to the game far below: the glowing hologram floor, walls holding against streams of gliders.",
   spec={"cam": [-0.55, 8.75, -0.95], "look": [-9.0, 0.0, 0.2], "fov": 46})
v5("G08c", after="G08b", size="MCU, side-on", who=["D"], action="{D} in his sunken pit at the glowing console, playing: eyes on the board, hands still, patient, unhurried.",
   spec={"state": ["game"], "mode": "face", "turn": 60, "high": 0.15})
v5("G08d", after="G08c", size="CU", who=["Z"], line="b1-4 Zei: Such patience…", action="{Z} at the railing, close, looking down at the game, admiring, a small closed-mouth smile; hologram light from below.",
   spec={"mode": "face", "turn": 60})
v5("G09", size="MS two-shot, from the front", who=["Z", "B"], line="b1-5 Bai: Total wimp, just like you…", action="At the overlook railing: {B} on the right glances sideways at him, wry, still working on the gadget in her hands; {Z} on the left looks down at the game.",
   spec={"pair": ["Z", "B"], "front": True})
v5("G10", size="MS two-shot, side-on", who=["Z", "B"], action="{B} on the right straightens from her gadget, sets it on the rail and leans far out over the railing to study the board below; {Z} on the left beside her watches her.",
   spec={"state": ["walkway-turned"], "pair": ["Z", "B"]})
v5("C01", size="EWS, down the corridor", who=["Z", "B"], action="The long round-topped stone corridor deep under the hall, a row of metal elevator doors along one wall; {Z} and {B} at their real size, standing waiting by the elevators in the middle distance. Nobody else.",
   spec={"state": ["waiting"], "setup": "N"})
v5("C07", size="MCU, three-quarter", who=["D"], action="{D} standing in the open elevator doorway, turned three-quarters, looking toward the left of the frame at Zei, easy and asking. The picture fills the whole frame: no borders, no bars.",
   spec={"partner": "Z", "turn": 55})
v5("C09", size="OTS over Bai's shoulder", who=["B", "D"], action="Over {B}'s shoulder: {D} at the elevator turns to her, open and warm. Nobody else in the corridor.",
   spec={"ots": ["B", "D"]})
v5("C13", size="MCU walking, three-quarter", who=["B"], action="{B} walking, serious and worried about him, not smiling, eyes ahead, looking a little toward the left of the frame.",
   spec={"state": ["walking"], "mode": "face", "turn": -60})
v5("C14", size="MCU walking, three-quarter", who=["Z"], action="{Z} walking, teasing, a closed-mouth smile, turned three-quarters toward the right of the frame where she walks.",
   spec={"state": ["walking"], "mode": "face", "turn": 60})
v5("F01", size="EWS establishing, high", who=["D", "B"], action="The courtyard café at night from high in a corner: string lights over the courtyard, small trees, the street gate, the long rectangular wooden table in the middle with {D} and {B} small at it, sitting across from each other; the megastructure skyline beyond. Nobody else.",
   spec={"cam": [-8.5, 4.6, 6.0], "look": [1.0, 0.4, -1.5], "fov": 44})
v5("F05", size="MS two-shot", who=["D", "B"], action="{D} and {B} at the long rectangular table, sitting across from each other; {D} turns toward the left of the frame and raises one hand to wave someone over, a soft closed-mouth laugh; {B} looks over the same way.",
   spec={"cam": [3.6, 1.35, -0.2], "look": [0.0, 0.85, 0.0], "fov": 40})
v5("F08", size="MS", who=["R", "D", "B", "Z"], action="{R} glides up beside the long rectangular table where {D} and {B} sit across from each other and {Z} sits at the end.", spec=SPEC["F08"])
v5("F09", size="MCU", who=["R"], action="{R} beside the table, its face screen kind, holding its tray level.", spec={"mode": "face", "turn": 55})
v5("F14", size="MS three-shot", who=["Z", "D", "B"], action="All three at the long rectangular table: {Z} at the end on the left, {D} and {B} sitting across from each other; {B} looks down at her thin glowing menu, unimpressed.",
   spec={"state": ["seated", "talking"], "pair": ["Z", "D", "B"]})
v5("F17", size="MS two-shot", who=["Z", "D"], line="b3-8 Zei: Hmmm. More straight horizontal lines…", action="{Z} on the left at the end of the table looks down at the thin glowing menu in his hands; {D} on the right, still sitting, leans over toward him to look at it.",
   spec={"state": ["seated", "talking"], "pair": ["Z", "D"]})
v5("F18", size="MS two-shot", who=["Z", "D"], line="b3-9 Deluin: Top right is 'kai', right?…", action="Both still sitting: {D} on the right leans in and points at the thin glowing menu in {Z}'s hands; {Z} on the left holds it out toward him.",
   spec={"state": ["seated", "talking"], "pair": ["Z", "D"]})
v5("F20", size="MS two-shot, side-on", who=["Z", "D"], line="b3-10 Zei: Wait, you know Dzegoban?", action="{Z} on the left, astonished, turns to {D} on the right, who sits easy, menu in hand.",
   spec={"state": ["seated", "talking"], "pair": ["Z", "D"]})
v5("F23", size="MS three-shot", who=["Z", "D", "B"], line="b3-13 Bai: Actually, I don't think I want anything…", action="{B} puts her thin menu down on the long rectangular table; {Z} on the left and {D} both look at her.",
   spec={"state": ["seated", "talking"], "pair": ["Z", "D", "B"]})
v5("F24", size="MCU, three-quarter", who=["B"], action="{B}, standing now, big headphones in her hand, looking down toward the left of the frame at Zei: serious, a straight face, not smiling.",
   spec={"state": ["seated", "bai-standing"], "partner": "Z", "turn": 55})
v5("F26", size="MS two-shot, Bai far behind", who=["Z", "D", "B"], action="{Z} on the left and {D} on the right together at the long rectangular table; far behind them, small, {B} sits alone at a small round table in the background, putting on big headphones.",
   spec={"state": ["seated", "bai-back", "talking"], "pair": ["Z", "D"]})
v5("S01", size="MS", who=["R", "Z", "D"], action="{R} pours tea from a pot into two cups on the long rectangular table while {Z} on the left and {D} on the right keep talking, not looking at it.",
   spec={"state": ["seated", "bai-back", "talking"], "pair": ["Z", "D"], "people": {"R": {"at": [0.75, -0.9], "face": "S", "pose": "robot"}}})
# "imagine the camera doesn't actually move that much, just cuts between views": one camera for each person's singles at the table
ZEI_CU = {"state": ["seated", "bai-back", "talking"], "partner": "D", "turn": 55}
DELUIN_CU = {"state": ["seated", "bai-back", "talking"], "partner": "Z", "turn": 80}
v5("S04", size="MCU, three-quarter", who=["Z"], action="{Z} sits at the end of the long rectangular table, turned three-quarters toward the right of the frame, talking to Deluin.",
   spec=ZEI_CU)
v5("S05", size="MCU, three-quarter", who=["D"], action="{D} sitting at the long rectangular table, warm, thinking about home, turned three-quarters toward the left of the frame where Zei sits.",
   spec=DELUIN_CU)
v5("S10", size="MS two-shot", who=["Z", "D", "B"], action="{Z} on the left, amused, and {D} on the right at the long rectangular table; far behind them, small, {B} at her back table with headphones on.",
   spec={"state": ["seated", "bai-back", "talking"], "pair": ["Z", "D"]})

# --- the owner's second batch (2026-10-17): the end of the café, the gate, the lobby
v5("R01", size="MCU, three-quarter", who=["D"], action="{D} sitting at the long rectangular table, leaning in, eager and inviting, turned three-quarters toward the left of the frame where Zei sits.", spec=DELUIN_CU)
v5("R02", size="MCU, three-quarter", who=["Z"], action="{Z} sitting at the end of the long rectangular table, smiling with his mouth closed, a little embarrassed, looking toward the right of the frame at Deluin.", spec=ZEI_CU)
v5("R03", size="MCU, three-quarter", who=["Z"], action="{Z} at the table glances down at the watch on his wrist, smiling with his mouth closed.", spec=ZEI_CU)
v5("R04", size="MCU, three-quarter", who=["Z"], action="{Z} at the table, smiling with his mouth closed, looking toward the right of the frame at Deluin.", spec=ZEI_CU)
v5("R05", size="MCU, three-quarter", who=["D"], action="{D} still sitting at the long rectangular table, playful, plain conversation, turned three-quarters toward the left of the frame where Zei sits.", spec=DELUIN_CU)
v5("R06", size="MCU, Bai near, the two far behind", who=["B", "Z", "D"], action="{B} alone at her small round table in the foreground, big headphones on, glancing sideways out of the corner of her eye; far behind her, small and soft, {Z} and {D} talk at the long rectangular table.",
   spec={"state": ["seated", "bai-back", "talking"], "partner": "Z", "turn": 30})
v5("R07", size="WS, all three", who=["Z", "D", "B"], action="{D} on the right leans out and waves across the courtyard to {B}; {Z} on the left at the end of the long rectangular table; {B} small, apart at her own small round table, big headphones on.",
   spec={"state": ["seated", "bai-back", "talking"], "pair": ["Z", "D"], "people": {}, "wide": True})
v5("R08", size="MS", who=["B"], action="{B} at her small round table turns around in her chair toward the left of the frame and lifts one side of her big headphones off one ear.",
   spec={"state": ["seated", "bai-back", "talking"], "partner": "Z", "turn": 35, "mode": "ms"})
v5("D04", size="MS two-shot", who=["Z", "D"], action="At the courtyard's street gate at dusk: {Z} on the left mirrors {D}'s gesture with both arms up, a closed-mouth smile: ten fingers, then five; {D} on the right watches. Both arms and hands clearly drawn.",
   spec={"pair": ["Z", "D"]})
v5("D05", size="MS two-shot", who=["Z", "D"], action="At the gate under the lamps: {D} on the right, already turning to go into the street, gives a quick wave goodbye; {Z} on the left waves back.",
   spec={"pair": ["Z", "D"]})
v5("D09", size="MS two-shot, dusk", who=["Z", "B"], action="At dusk in the emptying courtyard: {Z} on the left walks up to {B}'s small round table and talks to her; {B} on the right, seated, headphones around her neck, looks up at him.",
   spec={"state": ["dusk-walk"], "pair": ["Z", "B"]})
v5("L05", size="MS two-shot", who=["Z", "B"], action="The hotel lobby restaurant late at night: {Z} on the left at his table, worried, not smiling; {B} on the right sits down across from him carefully, concerned and caring, not smiling, without a word.",
   spec={"state": ["together"], "pair": ["Z", "B"]})
v5("L06", size="ECU", who=["Z"], action="{Z}'s eyes, very close, looking down at the device in his hands as it lights up; worried, not smiling.",
   spec={"state": ["together"], "mode": "face", "turn": 30, "high": 0.1})
BAI_BG -= {"S04", "S10", "F26", "R02", "R04"}

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
    if sid in V5:
        direct(s, cam, setdefs[sname])
    if sid in BAI_BG and sid != "F26":
        bai_behind(s, cam, setdefs[sname])
    elif sid == "F26":
        cam["plate"], s["bai_bg"] = "plate-courtyard-B-bai", True
    out.setdefault(sname, {})[sid] = cam
    board.append({**s, "set": sname, "camera": cam})
# the plates: each setup's camera, the set empty of the main people
for sname, sd in setdefs.items():
    for k, su in sd["setups"].items():
        out.setdefault(sname, {})[f"plate-{sname}-{k}"] = {"cam": su["cam"], "look": su["look"], "fov": su["fov"], "people": su.get("people", {})}
for sname, sh in out.items():
    (SETS / f"{sname}.shots.json").write_text(json.dumps(sh, indent=1) + "\n")
(HERE / "storyboard-v4.json").write_text(json.dumps({"about": __doc__.strip().splitlines()[0], "geography": v3["geography"], "shots": board}, indent=2, ensure_ascii=False) + "\n")
print(len(board), "shots;", {k: len(v) for k, v in out.items()})
