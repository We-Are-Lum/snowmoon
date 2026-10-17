"""Plan a scene's coverage from its 3D set, by the rules in docs/coverage.md (owner, 2026-10-17).

  python3 scripts/coverage-plan.py <seed>            computes every setup's camera, checks the rules, writes the layouts
  python3 scripts/coverage-plan.py <seed> --check    only checks and prints the plan

Reads adaptations/<seed>/preprod/coverage.json: who is on the left, then per scene its set, who is where, its setups and
the sequence (each line or wordless beat, and the setup and variant it cuts to). Setup kinds:
  master   the two-shot square to the line between the pair, on the side that keeps the left person on the left
  ots      over one person's shoulder onto the other; the pair is mirrored (same lens, height, distance)
  cu       a clean close-up of one person looking at the other, turned off the eyeline toward the camera side; mirrored
  single   one person alone, turned so they look the way the left/right rule says
  insert   a close camera on a point (a prop modelled in the set), from the camera side of the line
  establish an explicit wide camera
  layout   a camera already in the storyboard (its shot id), reused
  reuse    a frame already drawn and approved;  code: drawn in code (the phone screens)
Writes the layouts into adaptations/<seed>/preprod/sets/<set>.shots.json (for scripts/set-render.mjs) as cov-<scene>-<setup>[-<variant>],
and adaptations/<seed>/preprod/coverage-board.json: the layouts, every frame to draw (one per setup and variant: the variant
restyles its setup's layout, unless it moves someone, then it has its own) and the sequence, for the jobs and the cut.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEIGHT = {"Z": 0.97, "B": 0.98, "D": 1.07, "K": 1.0, "R": 1.0}
FACEV = {"N": (0, -1), "S": (0, 1), "E": (1, 0), "W": (-1, 0), "NE": (0.707, -0.707), "NW": (-0.707, -0.707), "SE": (0.707, 0.707), "SW": (-0.707, 0.707)}
SIZE = {"master": "MS two-shot", "ots": "OTS", "cu": "CU", "single": "MCU", "insert": "ECU INSERT", "establish": "EWS"}
def sugar(kind: str) -> list:
    """The sugar cubes on the café table, a prop per shot (owner, 2026-10-17: no photos; model it): a two-row wall of six small
    cubes between the cups. sugar-few: three cubes, being stacked; sugar-door: the wall with the middle cube of the bottom row out."""
    c, out = 0.025, []
    for row in range(2):
        for k in range(6):
            if kind == "sugar-few" and (row, k) not in ((0, 2), (0, 3), (1, 2)):
                continue
            if kind == "sugar-door" and (row, k) == (0, 2):
                continue
            out.append({"shape": "box", "p": [round(0.42 + k * c * 1.04, 4), round(0.775 + c / 2 + row * c, 4), -0.18], "s": [c, c, c], "c": 16777215})
    return out


def head(p: dict) -> list:
    h = HEIGHT.get(p["who"], 1)
    if p["pose"] == "robot":
        return [p["at"][0], p.get("y", 0) + 1.4, p["at"][1]]
    hip = 0.47 if p["pose"] == "seated" else 0.9 * h
    return [p["at"][0], p.get("y", 0) + hip + 0.78 * h, p["at"][1]]


def norm(v):
    l = math.hypot(*v) or 1
    return (v[0] / l, v[1] / l)


def rot(v, deg):
    a = math.radians(deg)
    return (v[0] * math.cos(a) - v[1] * math.sin(a), v[0] * math.sin(a) + v[1] * math.cos(a))


def heading(v) -> float:
    """The renderer's heading in degrees (0 = toward +z, 90 = toward +x)."""
    return round(math.degrees(math.atan2(v[0], v[1])), 1)


def facing(p: dict) -> tuple:
    f = p["face"]
    if isinstance(f, (int, float)):
        return (math.sin(math.radians(f)), math.cos(math.radians(f)))
    return FACEV[f]


def sx(cam: list, look: list, pt: list) -> float:
    """Signed horizontal screen position (negative = left of centre) of a point, for a camera at cam looking at look."""
    f = norm((look[0] - cam[0], look[2] - cam[2]))
    right = (-f[1], f[0])
    return (pt[0] - cam[0]) * right[0] + (pt[2] - cam[2]) * right[1]


class Scene:
    def __init__(self, sc: dict, left: list):
        self.sc, self.left = sc, left
        self.id = sc["id"]

    def people(self, later: bool = False, over: dict | None = None) -> dict:
        ps = {w: dict(p) for w, p in self.sc.get("people", {}).items()}
        if later:
            ps.update({w: dict(p) for w, p in self.sc.get("later", {}).items()})
        for w, p in (over or {}).items():
            if p is None:
                ps.pop(w, None)
            elif p == "scene":
                ps[w] = dict(self.sc["people"][w])
            else:
                ps[w] = dict(p)
        for w, p in ps.items():
            p["who"] = w
        for w, p in ps.items():  # "toward:X" faces X exactly
            if isinstance(p["face"], str) and p["face"].startswith("toward:"):
                t = ps.get(p["face"][7:]) or self.sc["people"][p["face"][7:]]
                p["face"] = heading((t["at"][0] - p["at"][0], t["at"][1] - p["at"][1]))
        return ps

    def side(self, ps: dict) -> tuple:
        """The camera side: the unit vector n so that a camera at mid + n*d sees the pair's left person on the left."""
        a, b = self.sc["pair"]
        if a not in self.left:
            a, b = b, a
        u = norm((ps[b]["at"][0] - ps[a]["at"][0], ps[b]["at"][1] - ps[a]["at"][1]))
        return (-u[1], u[0]), a, b


def solve(scene: Scene, key: str, st: dict, later: bool, over: dict | None) -> dict:
    ps = scene.people(later or st.get("later", False), {**st.get("people", {}), **(over or {})})
    k = st["kind"]
    cam = {"people": {w: {kk: vv for kk, vv in p.items() if kk != "who"} for w, p in ps.items()}}
    if k == "establish":
        return {**cam, "cam": st["cam"], "look": st["look"], "fov": st["fov"]}
    n, L, R = scene.side(scene.people(later or st.get("later", False))) if scene.sc.get("pair") else ((0, 1), None, None)
    base = scene.people(later or st.get("later", False))
    if k == "master":
        hs = [head(base[w]) for w in scene.sc["pair"] + [w for w in st.get("with", []) if w in base]]
        mid = [sum(h[i] for h in hs) / len(hs) for i in range(3)]
        fov = st.get("fov", 36)
        span = max(math.hypot(a[0] - b[0], a[2] - b[2]) for a in hs for b in hs)
        d = st.get("dist") or (span + 1.6) / (2 * math.tan(math.radians(fov / 2)) * 16 / 9) + 0.8
        y = sum(h[1] for h in hs) / len(hs) + st.get("high", 0.05)
        return {**cam, "cam": [round(mid[0] + n[0] * d, 3), round(y, 3), round(mid[2] + n[1] * d, 3)], "look": [mid[0], mid[1] - 0.25, mid[2]], "fov": fov}
    if k == "ots":
        o = scene.sc.get("ots", {})
        a, b = head(ps[st["over"]]), head(ps[st["onto"]])
        if st.get("turned"):  # people at a railing turn to each other for the over-the-shoulders
            ps[st["over"]]["face"] = heading((b[0] - a[0], b[2] - a[2]))
            ps[st["onto"]]["face"] = heading((a[0] - b[0], a[2] - b[2]))
            cam["people"] = {w: {kk: vv for kk, vv in p.items() if kk != "who"} for w, p in ps.items()}
        u = norm((b[0] - a[0], b[2] - a[2]))
        back, sd = o.get("back", 0.7), o.get("side", 0.45)
        y = (head(base[L])[1] + head(base[R])[1]) / 2 + 0.05
        c = [a[0] - u[0] * back + n[0] * sd, y, a[2] - u[1] * back + n[1] * sd]
        return {**cam, "cam": [round(v, 3) for v in c], "look": [b[0], b[1] - 0.08, b[2]], "fov": o.get("fov", 32)}
    if k == "cu" or k == "single":
        cu = scene.sc.get("cu", {})
        w = st["who"]
        if k == "cu" and (st.get("turned") or scene.sc.get("turn_cu")):  # at a railing they turn to each other for close-ups
            t0 = base[st["toward"]]
            ps[w]["face"] = heading((t0["at"][0] - ps[w]["at"][0], t0["at"][1] - ps[w]["at"][1]))
            cam["people"][w] = {kk: vv for kk, vv in ps[w].items() if kk != "who"}
        h = head(ps[w])
        fov = cu.get("fov", 28) if k == "cu" else st.get("fov", 36)
        vis = 0.62 if k == "cu" else 0.8
        d = vis / (2 * math.tan(math.radians(fov / 2)))
        if k == "cu":
            t = head(base[st["toward"]])
            line = norm((t[0] - h[0], t[2] - h[2]))
            ang = cu.get("angle", 30)
        else:
            line = facing(ps[w])
            ang = st.get("angle", 35)
        best = None
        for sgn in (1, -1):
            v = rot(line, sgn * ang)
            c = [h[0] + v[0] * d, h[1] + 0.02, h[2] + v[1] * d]
            look = [h[0], h[1] - 0.06, h[2]]
            # which way they look on screen: a point a little along their eyeline (the partner may be behind the camera)
            tgt = [h[0] + line[0] * 0.3, h[1], h[2] + line[1] * 0.3]
            ok = (sx(c, look, tgt) > sx(c, look, h)) == (w in scene.left)
            score = (ok, v[0] * facing(ps[w])[0] + v[1] * facing(ps[w])[1] if cu.get("ahead") else 0)
            if best is None or score > best[0]:
                best = (score, c, look)
        return {**cam, "cam": [round(x, 3) for x in best[1]], "look": best[2], "fov": fov}
    if k == "insert":
        p = st["at"]
        if st.get("from") == "up":  # looking down onto the point (a wrist, a watch)
            c = [p[0] + n[0] * 0.12, p[1] + st.get("height", 0.45), p[2] + n[1] * 0.12]
        else:
            c = [p[0] + n[0] * st.get("dist", 0.4), p[1] + st.get("height", 0.1), p[2] + n[1] * st.get("dist", 0.4)]
        if not st.get("who") and "D" not in (over or {}) and "Z" not in (over or {}):
            cam["people"] = {}
        return {**cam, "cam": [round(x, 3) for x in c], "look": p, "fov": st.get("fov", 40)}
    raise SystemExit(f"{scene.id}/{key}: no camera for kind {k}")


def main() -> None:
    seed = sys.argv[1]
    pre = ROOT / "adaptations" / seed / "preprod"
    plan = json.loads((pre / "coverage.json").read_text())
    v4 = {s["id"]: s for s in json.loads((pre / "storyboard-v4.json").read_text())["shots"]}
    left = plan["left"]
    shots_by_set, layouts, frames, seq, problems = {}, {}, {}, [], []
    sigs = {}
    for sc in plan["scenes"]:
        scene = Scene(sc, left)
        # layouts and frames
        for key, st in sc["setups"].items():
            k = st["kind"]
            variants = st.get("variants") or {"": {}}
            for vk, var in variants.items():
                fid = f"cov-{sc['id']}-{key}" + (f"-{vk}" if vk else "")
                if k == "reuse" or var.get("reuse"):
                    frames[fid] = {"scene": sc["id"], "setup": key, "variant": vk, "reuse": var.get("reuse") or st["frame"], "framed": st.get("framed", False)}
                    continue
                if k == "code":
                    frames[fid] = {"scene": sc["id"], "setup": key, "variant": vk, "code": True}
                    continue
                if k == "layout":
                    lid = st["shot"]
                    s4 = v4[lid]
                    layouts.setdefault(lid, {"id": lid, "set": s4["set"], "camera": s4["camera"], "size": s4["size"], "existing": True})
                else:
                    # a variant that moves someone or changes a prop gets its own layout; identical ones share it
                    sig = json.dumps([var.get("people"), var.get("props"), bool(var.get("later") and not st.get("later"))], sort_keys=True)
                    own = sig != json.dumps([None, None, False])
                    lid = sigs.setdefault((sc["id"], key, sig), f"cov-{sc['id']}-{key}" + (f"-{vk}" if own else ""))
                    if lid not in layouts:
                        cam = solve(scene, key, st, var.get("later", False), var.get("people"))
                        pk = var.get("props") or st.get("props")
                        if pk:
                            cam["props"] = sugar(pk)
                        layouts[lid] = {"id": lid, "set": sc["set"], "camera": cam, "size": SIZE[k] if k != "master" or sc.get("pair") else "WS"}
                        shots_by_set.setdefault(sc["set"], {})[lid] = cam
                who = [w for w in "ZBDKR" if "{" + w + "}" in var.get("action", "")]
                frames[fid] = {"scene": sc["id"], "setup": key, "variant": vk, "layout": lid, "action": var.get("action", ""), "who": who,
                               "size": layouts[lid]["size"], "set": layouts[lid]["set"]}
        # rules: count setups per beat, 180 line, establish first, wordless length
        beat, used = None, {}
        for i, it in enumerate(sc["sequence"]):
            if it.get("line"):
                beat = it["line"].split("-")[0]
            for s_ in [it] + [x for x in (it.get("pre"), it.get("cut_at")) if x]:
                if "/" not in s_["setup"] and sc["setups"][s_["setup"]]["kind"] not in ("insert", "code") and s_["setup"] not in ("MENU",):
                    used.setdefault(beat or sc["id"], set()).add(s_["setup"])
            if not it.get("line") and it.get("s", 0) > 1.5 and not it.get("why"):
                problems.append(f"{sc['id']} #{i}: a wordless shot of {it['s']} s with no reason")
        for b, u in used.items():
            if len(u) > 6:
                problems.append(f"{sc['id']} {b}: {len(u)} setups ({', '.join(sorted(u))}); the rule is 4-6")
        first = sc["sequence"][0]
        fs = first.get("pre", first)["setup"]
        if "/" not in fs and sc["setups"][fs]["kind"] not in ("establish", "master", "reuse", "layout") and fs not in ("EST",):
            problems.append(f"{sc['id']}: opens on {fs}, not wide")
        for lid, L_ in layouts.items():
            if L_.get("existing") or not lid.startswith(f"cov-{sc['id']}-") or not sc.get("pair"):
                continue
            c = L_["camera"]
            ps = c["people"]
            a, b = sc["pair"] if sc["pair"][0] in left else sc["pair"][::-1]
            if a in ps and b in ps:
                ha, hb = head({**ps[a], "who": a}), head({**ps[b], "who": b})
                if sx(c["cam"], c["look"], ha) > sx(c["cam"], c["look"], hb):
                    problems.append(f"{lid}: {a} is right of {b} (crosses the line)")
        for it in sc["sequence"]:
            seq.append({**it, "scene": sc["id"]})
    for sname, add in shots_by_set.items():
        p = pre / "sets" / f"{sname}.shots.json"
        cur = json.loads(p.read_text())
        cur = {k: v for k, v in cur.items() if not k.startswith("cov-")}
        cur.update(add)
        p.write_text(json.dumps(cur, indent=1) + "\n")
    board = {"about": "Coverage board (scripts/coverage-plan.py from coverage.json): layouts, frames (setup x variant), sequence. DRAFTED.",
             "layouts": layouts, "frames": frames, "sequence": seq}
    if "--check" not in sys.argv:
        (pre / "coverage-board.json").write_text(json.dumps(board, indent=1, ensure_ascii=False) + "\n")
    new = [l for l in layouts.values() if not l.get("existing")]
    draw = [f for f in frames.values() if f.get("layout")]
    print(f"{len(plan['scenes'])} scenes; {len(layouts)} layouts ({len(new)} new); {len(frames)} frames: {len(draw)} to draw, "
          f"{sum(1 for f in frames.values() if f.get('reuse'))} reused, {sum(1 for f in frames.values() if f.get('code'))} in code; {len(seq)} sequence items")
    for p_ in problems:
        print("RULE:", p_)
    if problems and "--check" not in sys.argv:
        raise SystemExit("the plan breaks a rule; fix coverage.json")


if __name__ == "__main__":
    main()
