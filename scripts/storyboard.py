"""Draw an adaptation's storyboard in code, and the exact prompt and references each shot will get.

  .venv-image/bin/python scripts/storyboard.py fifteen-days

For every shot in adaptations/<seed>/preprod/shotlist-v3.json: a 16:9 sketch, drawn from simple shapes, so
placement is exact and costs nothing. Figures are sized for the shot (a small figure for an extreme wide, a head
filling the frame for an extreme close-up), show which way each person faces (a nose wedge; a back view has no
face), carry their hair cue (Zei's spikes, Bai's ponytail, Deluin's shoulder-length hair, Kau's bare head, the
robot's screen face) and stand among the main furniture (table, railing, gate, window, screens, pits).

Two renderings of the same geometry:
  images-out/preprod/sketch/<id>.svg  labelled (Z B D K R, facing arrows), for the owner's storyboard page;
  images-out/preprod/sketch/<id>.png  grey lines on white, no labels, arrows or any text, the layout reference
                                       the image model gets (it would copy lettering).
And adaptations/<seed>/preprod/storyboard.json: per shot, the prompt text the model will get, the reference
pictures in order, and which shots are composited from the book or the tutorial instead of drawn.

Layouts follow the floor plans' screen directions (shotlist-v3.json "geography"): in the cafe Deluin looks
screen-right, Zei screen-left, Bai (at the table) screen-left; in the corridor and at the gate Deluin is on the
left; at the railing Zei is on the left; in the lobby Zei looks screen-left. DRAFTED by the coding agent.
"""

import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
W, H = 1600, 900
COL = {"Z": "#e8771e", "B": "#8cc63f", "D": "#c9b98f", "K": "#8a8a99", "R": "#6fc3d1"}


class Pic:
    """A list of shapes, rendered to SVG (with labels) or to a PIL image (without)."""

    def __init__(self):
        self.s = []

    def line(self, x1, y1, x2, y2, w=4):
        self.s.append(("line", x1, y1, x2, y2, w))

    def poly(self, pts, fill=None, w=4):
        self.s.append(("poly", pts, fill, w))

    def rect(self, x, y, w_, h_, fill=None, w=4):
        self.poly([(x, y), (x + w_, y), (x + w_, y + h_), (x, y + h_)], fill, w)

    def ell(self, cx, cy, rx, ry, fill=None, w=4):
        self.s.append(("ell", cx, cy, rx, ry, fill, w))

    def label(self, x, y, t, who=None):
        self.s.append(("label", x, y, t, who))

    def arrow(self, x, y, dx, dy, who=None):
        self.s.append(("arrow", x, y, dx, dy, who))

    def svg(self) -> str:
        out = [f'<svg viewBox="0 0 {W} {H}" class="sk" role="img"><rect x="0" y="0" width="{W}" height="{H}" class="bg"/>']
        for t, *a in self.s:
            if t == "line":
                x1, y1, x2, y2, w = a
                out.append(f'<line x1="{x1:.0f}" y1="{y1:.0f}" x2="{x2:.0f}" y2="{y2:.0f}" stroke-width="{w}" class="st"/>')
            elif t == "poly":
                pts, fill, w = a
                out.append(f'<polygon points="{" ".join(f"{x:.0f},{y:.0f}" for x, y in pts)}" stroke-width="{w}" class="st {"fl" if fill else "nf"}"/>')
            elif t == "ell":
                cx, cy, rx, ry, fill, w = a
                out.append(f'<ellipse cx="{cx:.0f}" cy="{cy:.0f}" rx="{rx:.0f}" ry="{ry:.0f}" stroke-width="{w}" class="st {"fl" if fill else "nf"}"/>')
            elif t == "label":
                x, y, txt, who = a
                c = COL.get(who, "currentColor")
                out.append(f'<text x="{x:.0f}" y="{y:.0f}" class="lb" fill="{c}">{txt}</text>')
            elif t == "arrow":
                x, y, dx, dy, who = a
                c = COL.get(who, "currentColor")
                ex, ey = x + dx, y + dy
                ang = math.atan2(dy, dx)
                h1 = (ex - 26 * math.cos(ang - 0.45), ey - 26 * math.sin(ang - 0.45))
                h2 = (ex - 26 * math.cos(ang + 0.45), ey - 26 * math.sin(ang + 0.45))
                out.append(f'<path d="M{x:.0f} {y:.0f} L{ex:.0f} {ey:.0f} M{h1[0]:.0f} {h1[1]:.0f} L{ex:.0f} {ey:.0f} L{h2[0]:.0f} {h2[1]:.0f}" stroke="{c}" stroke-width="8" fill="none" stroke-linecap="round"/>')
        out.append("</svg>")
        return "".join(out)

    def png(self, path: Path, size=(1024, 576)):
        im = Image.new("RGB", (W, H), (255, 255, 255))
        d = ImageDraw.Draw(im)
        ink, light = (70, 70, 74), (214, 214, 218)
        for t, *a in self.s:
            if t == "line":
                x1, y1, x2, y2, w = a
                d.line((x1, y1, x2, y2), fill=ink, width=max(2, int(w)))
            elif t == "poly":
                pts, fill, w = a
                d.polygon(pts, fill=light if fill else None, outline=ink, width=max(2, int(w)))
            elif t == "ell":
                cx, cy, rx, ry, fill, w = a
                d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=light if fill else None, outline=ink, width=max(2, int(w)))
        im.resize(size, Image.LANCZOS).save(path)


# Head height (px) and head-centre height for each shot size; bodies scale from the head.
SIZE = {"EWS": (20, 560), "WS": (58, 330), "MS": (125, 290), "MCU": (190, 320), "CU": (320, 400), "ECU": (1100, 470), "OTS": (210, 330), "POV": (40, 500)}


def figure(p: Pic, who: str, x: float, hy: float, hh: float, facing: str, seated=False, back=False, label=True, arms=None):
    """A simple figure: head (with the person's hair cue and a nose wedge for facing), shoulders, torso, legs."""
    r = hh / 2
    if who == "R":  # the robot: round head with a face screen, humanoid shoulders, a column to a gliding base
        p.ell(x, hy, r * 1.05, r, fill=True)
        if not back:
            p.rect(x - r * 0.6, hy - r * 0.45, r * 1.2, r * 0.8)
        p.poly([(x - r * 1.3, hy + r * 1.2), (x + r * 1.3, hy + r * 1.2), (x + r * 0.9, hy + r * 3.6), (x - r * 0.9, hy + r * 3.6)], fill=True)
        p.poly([(x - r * 0.8, hy + r * 3.6), (x + r * 0.8, hy + r * 3.6), (x + r * 1.4, hy + r * 8.2), (x - r * 1.4, hy + r * 8.2)])
        p.ell(x, hy + r * 8.3, r * 1.8, r * 0.35, fill=True)
        p.line(x - r * 1.2, hy + r * 2.3, x + r * 2.6, hy + r * 2.6, max(3, hh / 14))  # the tray arm
        p.line(x + r * 1.6, hy + r * 2.6, x + r * 3.4, hy + r * 2.6, max(4, hh / 10))
    else:
        sh = r * 2.4  # half shoulder width
        top = hy + r * 1.15
        p.poly([(x - sh, top + r * 0.5), (x + sh, top + r * 0.5), (x + sh * 0.75, top + r * 4.6), (x - sh * 0.75, top + r * 4.6)], fill=True)
        p.line(x - r * 0.35, hy + r * 0.8, x - r * 0.35, top + r * 0.4)
        p.line(x + r * 0.35, hy + r * 0.8, x + r * 0.35, top + r * 0.4)
        if seated:
            p.poly([(x - sh * 0.75, top + r * 4.6), (x + sh * 0.75, top + r * 4.6), (x + sh * 0.9, top + r * 5.6), (x - sh * 0.9, top + r * 5.6)])
        else:
            p.line(x - sh * 0.45, top + r * 4.6, x - sh * 0.5, top + r * 9.5, max(4, hh / 9))
            p.line(x + sh * 0.45, top + r * 4.6, x + sh * 0.5, top + r * 9.5, max(4, hh / 9))
        if arms == "up":
            p.line(x + sh * 0.9, top + r * 0.8, x + sh * 1.5, top - r * 1.8, max(4, hh / 10))
        p.ell(x, hy, r * 0.85, r, fill=True)
        # hair cues
        if who == "Z":
            pts = []
            for i in range(9):
                a = math.pi * (1 + i / 8)
                rr = r * (1.25 if i % 2 else 0.95)
                pts.append((x + math.cos(a) * rr * 0.95, hy - r * 0.15 + math.sin(a) * rr))
            p.poly(pts, w=max(3, hh / 40))
        elif who == "B":  # a tall ponytail: a teardrop rising from the crown and falling behind
            side = 0 if facing in ("front", "back") else (-1 if facing in ("R", "3qR") else 1)
            tx = x + side * r * 1.1
            p.poly([(x - r * 0.35, hy - r * 0.85), (x + r * 0.35, hy - r * 0.85), (x + side * r * 0.5 + r * 0.3, hy - r * 1.75),
                    (tx + r * 0.25, hy + r * 0.9), (tx - r * 0.1, hy + r * 1.0), (x + side * r * 0.5 - r * 0.3, hy - r * 1.65)], fill=True, w=max(3, hh / 40))
        elif who == "D":
            p.ell(x - r * 0.9, hy + r * 0.2, r * 0.32, r * 0.8)
            p.ell(x + r * 0.9, hy + r * 0.2, r * 0.32, r * 0.8)
    if not back and who != "R":
        if facing in ("L", "3qL"):
            p.poly([(x - r * 0.8, hy - r * 0.05), (x - r * (1.15 if facing == "L" else 1.0), hy + r * 0.25), (x - r * 0.8, hy + r * 0.35)], w=max(2, hh / 50))
        elif facing in ("R", "3qR"):
            p.poly([(x + r * 0.8, hy - r * 0.05), (x + r * (1.15 if facing == "R" else 1.0), hy + r * 0.25), (x + r * 0.8, hy + r * 0.35)], w=max(2, hh / 50))
        else:
            p.ell(x - r * 0.3, hy - r * 0.05, r * 0.08, r * 0.08, fill=True, w=2)
            p.ell(x + r * 0.3, hy - r * 0.05, r * 0.08, r * 0.08, fill=True, w=2)
    if label:
        ly = max(60, min(H - 20, hy - r * 1.9 if hy - r * 1.9 > 60 else hy + r * 0.2))
        lx = max(30, min(W - 60, x - 18))
        p.label(lx, ly, who, who)
        dxs = {"L": -1, "3qL": -0.7, "R": 1, "3qR": 0.7}
        if facing in dxs and not back:
            ax = max(80, min(W - 80, x))
            ay = max(90, min(H - 40, hy + r * 0.2))
            p.arrow(ax, ay, dxs[facing] * 130, 0, who)


# Furniture
def table_rect(p, x1, x2, y, depth, persp=0.85):
    p.poly([(x1, y + depth), (x2, y + depth), (x2 - (x2 - x1) * (1 - persp) / 2, y), (x1 + (x2 - x1) * (1 - persp) / 2, y)], fill=True)
    p.line(x1 + 30, y + depth, x1 + 30, y + depth + 160, 6)
    p.line(x2 - 30, y + depth, x2 - 30, y + depth + 160, 6)


def table_round(p, cx, y, rx):
    p.ell(cx, y, rx, rx * 0.28, fill=True)
    p.line(cx, y + rx * 0.28, cx, y + rx * 0.28 + rx * 0.9, 6)


def railing(p, x1, y1, x2, y2, posts=9, drop=110, drop2=None):
    drop2 = drop2 if drop2 is not None else drop * 0.35
    p.line(x1, y1, x2, y2, 8)
    p.line(x1, y1 + drop * 0.5, x2, y2 + drop2 * 0.5, 4)
    for i in range(posts + 1):
        t = i / posts
        tt = t ** 0.7
        x, y = x1 + (x2 - x1) * tt, y1 + (y2 - y1) * tt
        p.line(x, y, x, y + drop + (drop2 - drop) * tt, 5)


def tiers(p, y0, y1, n=4):
    for i in range(n):
        y = y0 + (y1 - y0) * i / n
        p.poly([(0, y), (W, y), (W, y + 26), (0, y + 26)], fill=(i % 2 == 0), w=2)
        for k in range(int(W / 46)):
            p.ell(20 + k * 46, y - 8, 9, 11, fill=True, w=2)


def holo(p, cx, y, spread=380, n=7, hpost=150):
    for i in range(n):
        x = cx - spread + 2 * spread * i / (n - 1)
        p.line(x, y, x, y - hpost, 8)
        p.rect(x - 18, y - hpost - 34, 36, 34, fill=True, w=3)
        p.ell(x, y + 6, 26, 8, fill=True, w=2)  # the robotic base
    for i in range(10):
        a = i * 0.7
        p.poly([(cx + math.cos(a) * spread * 0.8, y - hpost * 1.4 + math.sin(a) * 60), (cx + math.cos(a) * spread * 0.8 + 22, y - hpost * 1.4 + math.sin(a) * 60 + 8),
                (cx + math.cos(a) * spread * 0.8, y - hpost * 1.4 + math.sin(a) * 60 + 16)], w=2)


def screens(p, boxes):
    for x, y, w_, h_ in boxes:
        p.rect(x, y, w_, h_, fill=True, w=5)


def corridor(p, vx=800, vy=430):
    for cx, cy in ((0, 0), (W, 0), (0, H), (W, H)):
        p.line(cx, cy, vx + (cx - vx) * 0.18, vy + (cy - vy) * 0.18, 3)
    p.rect(vx - 160, vy - 120, 320, 260, w=3)
    for i, t in enumerate((0.25, 0.45, 0.62)):
        x = t * vx
        p.rect(x, vy - 260 * (1 - t) - 60, 120 * (1 - t * 0.6), 420 * (1 - t * 0.55), w=3)


def gate(p, x1, x2, y1, y2, bars=10):
    p.rect(x1, y1, x2 - x1, y2 - y1, w=5)
    for i in range(1, bars):
        x = x1 + (x2 - x1) * i / bars
        p.line(x, y1, x, y2, 4)


def window(p, x, y, w_, h_, panes=3):
    p.rect(x, y, w_, h_, w=8)
    for i in range(1, panes):
        p.line(x + w_ * i / panes, y, x + w_ * i / panes, y + h_, 6)


def lamp(p, x, y, h_=420):
    p.line(x, y, x, y - h_, 7)
    p.ell(x, y - h_ - 20, 26, 26, fill=True)


def string_lights(p, y=110):
    pts = [(x, y + 40 * math.sin(x / 260)) for x in range(0, W + 1, 80)]
    for (a, b), (c, d) in zip(pts, pts[1:]):
        p.line(a, b, c, d, 2)
    for x, y_ in pts:
        p.ell(x, y_ + 10, 7, 7, fill=True, w=2)


def ground(p, y=None):
    p.line(0, y or 640, W, y or 640, 2)


def bg_scene(p, scene, wide):
    if scene == "courtyard":
        string_lights(p)
        if wide:
            for x in (120, 320, 1300, 1480):
                table_round(p, x, 560, 60)
    elif scene == "corridor":
        corridor(p)
    elif scene == "lobby":
        window(p, 40, 120, 520, 520)
    elif scene == "gate":
        lamp(p, 260, 700)
    elif scene in ("hall", "gallery"):
        tiers(p, 120, 300, 3)


# Per-shot layouts. Each returns a Pic. Defaults below cover singles and two-shots by the scene's screen
# directions; the shots that need more (wides, over-the-shoulders, inserts, the railing, the pits) are written out.
DIR = {  # (who, scene) -> facing in a single, by the floor plans
    ("D", "courtyard"): "R", ("Z", "courtyard"): "L", ("B", "courtyard"): "L", ("R", "courtyard"): "front",
    ("D", "corridor"): "R", ("Z", "corridor"): "L", ("B", "corridor"): "L",
    ("Z", "gallery"): "3qR", ("B", "gallery"): "3qL", ("D", "gate"): "R", ("Z", "gate"): "L",
    ("Z", "lobby"): "L", ("B", "lobby"): "R", ("R", "lobby"): "L", ("D", "hall"): "R", ("K", "hall"): "L",
}
SIDE = {"courtyard": ["D", "R", "B", "Z"], "corridor": ["D", "Z", "B"], "gallery": ["Z", "B"], "gate": ["D", "Z"], "lobby": ["B", "Z", "R"], "hall": ["D", "K"]}


def default(s) -> Pic:
    p = Pic()
    size = s["size"].split(",")[0].split(" ")[0]
    hh, hy = SIZE.get(size, (125, 290))
    who = s["who"]
    seated = s["scene"] in ("courtyard", "lobby") and s["id"][0] in "FSRL" and size not in ("EWS",) and "walks" not in s["action"] and "steps in" not in s["action"]
    bg_scene(p, s["scene"], size in ("EWS", "WS"))
    if "INSERT" in s["size"]:
        return insert(s)
    order = [w for w in SIDE.get(s["scene"], who) if w in who] + [w for w in who if w not in SIDE.get(s["scene"], [])]
    n = len(order)
    if seated and size in ("WS", "MS"):
        table_rect(p, 380, 1220, hy + hh * 3.2, 120)
    if n == 1:
        w = order[0]
        f = s["look"] if s["look"] in ("L", "R") else ("front" if s["look"] in ("-", "down") else DIR.get((w, s["scene"]), "front"))
        f = DIR.get((w, s["scene"]), f) if s["look"] == "-" and size not in ("CU", "ECU") else f
        x = {"L": 980, "R": 620, "3qL": 960, "3qR": 640}.get(f, 800)
        if size == "ECU":
            x = 800
        figure(p, w, x, hy, hh, f, seated=seated)
    else:
        xs = {2: [520, 1080], 3: [420, 800, 1180], 4: [320, 640, 960, 1280]}[min(n, 4)]
        for i, w in enumerate(order[:4]):
            if n == 2:
                f = "R" if i == 0 else "L"
            else:
                f = DIR.get((w, s["scene"]), "front")
            figure(p, w, xs[i], hy + (60 if (s["scene"] == "courtyard" and w == "Z" and n == 3) else 0), hh * (0.8 if (s["scene"] == "courtyard" and w == "Z" and n == 3) else 1), f, seated=seated)
    return p


def insert(s) -> Pic:
    p = Pic()
    a = s["action"].lower()
    if ("sugar" in a and ("fingers" in a or "hand" in a)) and "flicks" not in a:
        table_rect(p, 100, 1500, 300, 600, 0.95)
        p.ell(420, 620, 120, 50, fill=True)
        p.ell(1180, 620, 120, 50, fill=True)
        for i in range(3):
            for j in range(2 - (i == 2)):
                p.rect(700 + j * 80 + i * 40, 520 - i * 70, 72, 66, fill=True)
        p.poly([(900, 120), (1040, 120), (980, 440), (860, 440)], fill=True)  # the hand coming down
    elif "wall of white sugar" in a or "cube" in a:
        table_rect(p, 100, 1500, 380, 520, 0.95)
        p.ell(330, 660, 110, 45, fill=True)
        p.ell(1270, 660, 110, 45, fill=True)
        for row in range(3):
            for i in range(6):
                if row == 0 and s["id"] == "S12" and i == 2:
                    continue
                p.rect(560 + i * 82, 620 - row * 76, 76, 70, fill=True)
        if "flicks" in a:
            p.poly([(1150, 520), (1500, 450), (1500, 560), (1160, 600)], fill=True)
    elif "wrist" in a or "watch" in a:
        p.poly([(200, 900), (1300, 380), (1500, 520), (420, 900)], fill=True)
        p.rect(880, 470, 200, 170, fill=True)
    elif "gadget" in a:
        railing(p, 0, 640, W, 640, 6, 200, 200)
        p.rect(560, 470, 480, 160, fill=True)
        p.poly([(300, 900), (560, 560), (680, 600), (520, 900)], fill=True)
        p.poly([(1300, 900), (1040, 560), (930, 600), (1080, 900)], fill=True)
    elif "menu" in a:
        p.rect(330, 160, 940, 620, fill=True)
        p.poly([(200, 900), (360, 700), (470, 760), (380, 900)], fill=True)
        p.poly([(1400, 900), (1240, 700), (1130, 760), (1220, 900)], fill=True)
    else:  # a screen or device filling the frame
        p.rect(260, 110, 1080, 680, fill=True, w=10)
        p.poly([(120, 900), (300, 640), (420, 700), (300, 900)], fill=True)
        p.poly([(1480, 900), (1300, 640), (1180, 700), (1300, 900)], fill=True)
    return p


def L_H01():
    p = Pic()
    p.rect(0, 0, W, 120, fill=True, w=2)  # the standing ring at the top, crowded
    for k in range(34):
        figure(p, "K", 30 + k * 47, 60, 22, "front", label=False)
    railing(p, 0, 150, W, 150, 30, 40, 40)
    tiers(p, 190, 420, 5)
    p.ell(800, 650, 620, 170, w=3)
    holo(p, 800, 680, 380, 9, 120)
    screens(p, [(420, 300, 300, 170), (880, 300, 300, 170)])
    p.ell(210, 720, 80, 30, fill=True)
    p.ell(1390, 720, 80, 30, fill=True)
    figure(p, "D", 210, 700, 18, "L")
    figure(p, "K", 1390, 700, 18, "R")
    return p


def L_H02():
    p = Pic()
    tiers(p, 40, 260, 4)
    ground(p, 760)
    holo(p, 800, 760, 700, 9, 420)
    return p


def L_H03():
    p = Pic()
    tiers(p, 0, 330, 5)
    screens(p, [(1060, 40, 420, 240)])
    p.ell(760, 760, 560, 200, fill=True)
    p.rect(560, 640, 400, 130, fill=True)
    figure(p, "D", 640, 520, 120, "R", seated=True)
    p.line(560, 600, 380, 860, 6)  # the cable behind him
    return p


def L_H05():
    p = Pic()
    figure(p, "K", 800, 470, 1100, "front")
    return p


def L_H06():
    p = Pic()
    tiers(p, 120, 820, 6)
    return p


def L_H07():
    p = L_H02()
    screens(p, [(560, 30, 480, 200)])
    return p


def L_H08():
    p = Pic()
    p.ell(800, 860, 700, 240, fill=True)
    figure(p, "D", 760, 380, 320, "R", seated=True, arms="up")
    return p


def L_G01():
    p = Pic()
    tiers(p, 380, 900, 6)
    p.rect(0, 120, W, 150, fill=True, w=2)
    railing(p, 0, 270, W, 270, 30, 50, 50)
    for x in (300, 520, 1200):
        figure(p, "K", x, 200, 22, "front", label=False)
    figure(p, "Z", 760, 200, 22, "front")
    figure(p, "B", 820, 200, 22, "front")
    return p


def L_G02():
    p = Pic()
    tiers(p, 520, 900, 4)
    holo(p, 800, 860, 420, 7, 80)
    railing(p, 0, 560, W, 560, 12, 120, 120)
    figure(p, "Z", 560, 300, 170, "front", back=True)
    figure(p, "B", 1040, 300, 170, "front", back=True)
    return p


def L_G08():
    p = Pic()
    railing(p, 0, 90, W, 90, 14, 60, 60)
    for row in range(3):
        for k in range(16):
            p.ell(60 + k * 100 + row * 30, 220 + row * 90, 30, 34, fill=True, w=2)
    holo(p, 800, 820, 360, 7, 90)
    return p


def L_G10():
    p = Pic()
    railing(p, 0, 600, W, 520, 14, 160, 120)
    figure(p, "Z", 520, 330, 110, "R")
    figure(p, "B", 1060, 420, 110, "R")
    return p


def L_C01():
    p = Pic()
    corridor(p)
    figure(p, "Z", 540, 470, 40, "R")
    figure(p, "B", 1060, 470, 40, "L")
    return p


def L_C02():
    p = Pic()
    corridor(p)
    p.rect(640, 220, 320, 520, w=6)
    figure(p, "D", 800, 380, 70, "front")
    figure(p, "Z", 380, 420, 190, "front", back=True)
    figure(p, "B", 1250, 420, 190, "front", back=True)
    return p


def L_C09():
    p = Pic()
    corridor(p)
    figure(p, "D", 1000, 330, 160, "L")
    figure(p, "B", 280, 450, 300, "R", back=True)
    return p


def L_C11():
    p = Pic()
    corridor(p)
    figure(p, "D", 800, 410, 26, "front", back=True)
    figure(p, "Z", 1250, 380, 280, "L", back=True, arms="up")
    return p


def L_C12():
    p = Pic()
    corridor(p)
    figure(p, "Z", 620, 300, 120, "front")
    figure(p, "B", 980, 300, 120, "front")
    return p


def L_C17():
    return L_C12()


def L_F01():
    p = Pic()
    string_lights(p, 60)
    ground(p, 620)
    for x, y in ((140, 520), (330, 700), (1330, 520), (1480, 720), (560, 470), (1100, 470)):
        table_round(p, x, y, 55)
    table_rect(p, 640, 960, 600, 60)
    figure(p, "D", 760, 540, 16, "front", seated=True)
    figure(p, "B", 840, 640, 16, "front", seated=True, back=True)
    gate(p, 1420, 1560, 300, 460, 6)
    figure(p, "R", 1100, 560, 16, "front")
    return p


def L_F03():
    p = Pic()
    string_lights(p)
    figure(p, "K", 150, 480, 260, "R", back=True, label=False)
    figure(p, "K", 1450, 480, 260, "L", back=True, label=False)
    table_rect(p, 560, 1040, 560, 50)
    figure(p, "D", 700, 470, 60, "R", seated=True)
    figure(p, "B", 900, 470, 60, "L", seated=True)
    return p


def L_F04():
    p = Pic()
    string_lights(p)
    for x in (250, 1350):
        table_round(p, x, 620, 120)
    figure(p, "Z", 800, 260, 70, "R")
    return p


def three_at_table(p, hh=70, ty=520):
    table_rect(p, 380, 1220, ty, 110)
    figure(p, "D", 640, ty - hh * 2.4, hh, "R", seated=True)
    figure(p, "B", 1050, ty - hh * 2.4, hh, "L", seated=True)
    figure(p, "Z", 850, ty - hh * 3.2, hh * 0.8, "front", seated=True)


def L_F07():
    p = Pic()
    string_lights(p)
    three_at_table(p)
    return p


def L_F08():
    p = Pic()
    string_lights(p)
    three_at_table(p, 60, 560)
    figure(p, "R", 1350, 330, 70, "L")
    return p


def L_F11():
    p = Pic()
    string_lights(p)
    figure(p, "Z", 800, 300, 900, "front")
    p.rect(150, 520, 1300, 420, fill=True, w=8)  # the top of the menu, covering his face below the eyes
    return p


def L_F17():
    p = Pic()
    string_lights(p)
    table_rect(p, 200, 1500, 600, 140)
    figure(p, "D", 260, 380, 420, "R", back=True)
    figure(p, "Z", 1050, 330, 150, "L", seated=True)
    return p


def L_F26():
    p = Pic()
    string_lights(p)
    figure(p, "Z", 260, 420, 420, "R", back=True)
    table_round(p, 1040, 560, 120)
    figure(p, "B", 1040, 360, 80, "front", seated=True)
    return p


def L_S01():
    p = Pic()
    string_lights(p)
    table_rect(p, 380, 1220, 560, 110)
    figure(p, "D", 560, 330, 85, "R", seated=True)
    figure(p, "Z", 1120, 330, 85, "L", seated=True)
    figure(p, "R", 840, 230, 85, "front")
    return p


def L_bai_behind_zei(sid):
    def f():
        p = Pic()
        string_lights(p)
        table_round(p, 1250, 520, 70)
        figure(p, "B", 1250, 390, 48, "R", seated=True)
        figure(p, "Z", 660, 400, 320, "L", seated=True)
        return p
    return f


def L_R06():
    p = Pic()
    string_lights(p)
    table_round(p, 800, 640, 160)
    figure(p, "B", 800, 360, 300, "R", back=True)
    return p


def L_R08():
    p = Pic()
    string_lights(p)
    table_round(p, 800, 700, 180)
    figure(p, "B", 800, 300, 130, "L", seated=True, arms="up")
    return p


def two_side(p, hh=85):
    table_rect(p, 380, 1220, 560, 110)
    figure(p, "D", 560, 330, hh, "R", seated=True)
    figure(p, "Z", 1120, 330, hh, "L", seated=True)


def L_S13():
    p = Pic()
    string_lights(p)
    two_side(p)
    return p


def L_D01():
    p = Pic()
    lamp(p, 260, 720)
    gate(p, 560, 1040, 240, 660, 10)
    figure(p, "D", 760, 470, 34, "front", back=True)
    figure(p, "Z", 880, 470, 34, "front", back=True)
    return p


def L_D03():
    p = Pic()
    gate(p, 1100, 1600, 120, 900, 8)
    figure(p, "D", 640, 300, 125, "R", arms="up")
    return p


def L_D04():
    p = Pic()
    gate(p, 0, 500, 120, 900, 8)
    figure(p, "Z", 960, 300, 125, "L", arms="up")
    return p


def L_D05():
    p = Pic()
    lamp(p, 400, 720)
    lamp(p, 1200, 640, 300)
    ground(p, 640)
    figure(p, "D", 760, 560, 26, "front", back=True)
    gate(p, 1300, 1600, 300, 900, 5)
    figure(p, "Z", 1420, 520, 50, "L")
    return p


def L_D06():
    p = Pic()
    lamp(p, 800, 640, 360)
    ground(p, 640)
    figure(p, "D", 800, 560, 20, "front")
    return p


def L_D09():
    p = Pic()
    string_lights(p, 60)
    ground(p, 600)
    table_round(p, 1150, 560, 60)
    figure(p, "B", 1150, 500, 18, "L", seated=True)
    figure(p, "Z", 420, 520, 20, "R")
    return p


def L_L01():
    p = Pic()
    window(p, 40, 100, 600, 560)
    table_rect(p, 520, 900, 580, 60)
    figure(p, "Z", 760, 480, 40, "L", seated=True)
    p.rect(1300, 380, 260, 280, fill=True)
    figure(p, "R", 1380, 330, 40, "L")
    return p


def L_L01b():
    p = Pic()
    lamp(p, 200, 900, 600)
    window(p, 420, 140, 900, 620, 3)
    table_rect(p, 760, 1040, 560, 50)
    figure(p, "Z", 900, 480, 32, "L", seated=True)
    ground(p, 820)
    return p


def L_L04():
    p = Pic()
    window(p, 40, 100, 420, 600)
    table_rect(p, 380, 1100, 600, 100)
    figure(p, "Z", 820, 400, 110, "L", seated=True)
    figure(p, "R", 1300, 260, 110, "L")
    return p


def L_L05():
    p = Pic()
    window(p, 40, 60, 520, 640)
    table_rect(p, 380, 1220, 580, 110)
    figure(p, "B", 520, 340, 95, "R", seated=True)
    figure(p, "Z", 1120, 360, 95, "L", seated=True)
    return p


def L_L10():
    p = Pic()
    window(p, 40, 60, 520, 640)
    figure(p, "Z", 1220, 430, 380, "L", back=True)
    figure(p, "B", 620, 360, 150, "R", seated=True)
    p.rect(860, 520, 120, 180, fill=True)
    return p


LAYOUT = {"H01": L_H01, "H02": L_H02, "H03": L_H03, "H05": L_H05, "H06": L_H06, "H07": L_H07, "H08": L_H08,
          "G01": L_G01, "G02": L_G02, "G08": L_G08, "G10": L_G10,
          "C01": L_C01, "C02": L_C02, "C09": L_C09, "C11": L_C11, "C12": L_C12, "C17": L_C17,
          "F01": L_F01, "F03": L_F03, "F04": L_F04, "F07": L_F07, "F08": L_F08, "F11": L_F11, "F17": L_F17, "F26": L_F26,
          "S01": L_S01, "S04": L_bai_behind_zei("S04"), "R02": L_bai_behind_zei("R02"), "R06": L_R06, "R08": L_R08, "S13": L_S13, "R10": L_S13,
          "D01": L_D01, "D03": L_D03, "D04": L_D04, "D05": L_D05, "D06": L_D06, "D09": L_D09,
          "L01": L_L01, "L01b": L_L01b, "L04": L_L04, "L05": L_L05, "L10": L_L10}

# Who each card describes, in words the model gets (never names).
DESC = {"Z": "the slim young man with spiky black hair with one blue streak, dark brown eyes and an orange cropped jacket",
        "B": "the thin, wiry young woman with deep brown skin, shaved sides, a tall magenta ponytail, dangly geometric earrings, a lime-green vest and tattooed arms",
        "D": "the tall young man with wavy shoulder-length light-brown hair and a long cream cable-knit tunic",
        "K": "the stocky young man with a shaved head and dark brown skin in a plain charcoal tunic",
        "R": "the serving robot"}
SIZE_WORDS = {"EWS": "Extreme wide shot", "WS": "Wide shot", "MS": "Medium shot", "MCU": "Medium close-up", "CU": "Close-up", "ECU": "Extreme close-up",
              "INSERT": "Insert close-up", "OTS": "Over-the-shoulder shot", "POV": "Point-of-view shot"}
PLACE = {"hall": "images-out/preprod/places-final/hall.png", "gallery": "images-out/preprod/places-final/overlook.png",
         "corridor": "images-out/preprod/places-final/corridor.png", "courtyard": "images-out/preprod/places-final/courtyard.png",
         "gate": "images-out/preprod/places-final/gate.png", "lobby": "images-out/preprod/places-final/lobby.png"}
CARD = {w: f"images-out/preprod/cards2/{n}.png" for w, n in (("Z", "zei"), ("B", "bai"), ("D", "deluin"), ("K", "kau"))}
CROWD = ("Every other person in the picture is an ordinary background figure in plain, muted everyday clothes with ordinary hair: no orange jackets, no magenta hair, "
         "no cream knitwear, nobody who looks like the main people.")


def prompt_for(s, style: dict, refs: list) -> str:
    WHO = {k: v for k, v in DESC.items()}
    size = s["size"].split(",")[0].split(" ")[0]
    action = s["action"].replace("{Z}", WHO["Z"]).replace("{B}", WHO["B"]).replace("{D}", WHO["D"]).replace("{K}", WHO["K"]).replace("{R}", WHO["R"])
    people = [w for w in s["who"] if w != "R"]
    parts = [f"{SIZE_WORDS.get(size, '')} ({s['size']}). {action}"]
    parts.append("Reference image 1 is a rough layout sketch: follow it exactly for the camera framing, where each person is, how big they are in the frame and which way they face, "
                 "and where the furniture stands; draw nothing of the sketch itself, none of its plain lines or white background.")
    parts.append(f"Reference image 2 is the place: draw the same {s['scene'] if s['scene'] != 'gallery' else 'standing overlook'}, its architecture, light and skyline.")
    if len(people) >= 3:
        parts.append("Reference image 3 shows the three main people, one per row: " + "; ".join(DESC[w] for w in ("Z", "B", "D")) +
                     ". Copy only their faces, hair, skin and clothes, never the sheet's layout, poses or grey background.")
    else:
        for i, w in enumerate(people, 3):
            parts.append(f"Reference image {i} is {DESC[w]}: copy only that person's face, hair, skin and clothes, never the sheet's layout, poses or grey background.")
    n = len(people)
    if n:
        parts.append({1: "Exactly one main person in the picture, appearing once.", 2: "Exactly two main people, each appearing once.",
                      3: "Exactly three main people, each appearing once."}[min(n, 3)] + " " + CROWD)
    if "Z" in people:
        parts.append("The spiky-haired young man's eyes are dark brown.")
    if "menu" in s["action"]:
        parts.append("Menus and devices show only soft blank light, no writing.")
    inside = s["scene"] in ("hall", "gallery", "corridor")
    st = style["prompt"].split(" Wherever the sky shows")[0] if inside else style["prompt"]
    parts += [st, style["signs"], style["no_text"]]
    return " ".join(parts)


def main() -> None:
    seed = sys.argv[1]
    adir = ROOT / "adaptations" / seed
    sl = json.loads((adir / "preprod" / "shotlist-v3.json").read_text())
    style = json.loads((adir / "style.json").read_text())
    out = ROOT / "images-out" / "preprod" / "sketch"
    out.mkdir(parents=True, exist_ok=True)
    board = []
    for s in sl["shots"]:
        p = LAYOUT.get(s["id"], lambda: default(s))()
        (out / f"{s['id']}.svg").write_text(p.svg())
        p.png(out / f"{s['id']}.png")
        size = s["size"].split(",")[0].split(" ")[0]
        people = [w for w in s["who"] if w != "R"]
        composite = s.get("composite")
        if composite:
            refs, prompt = [], None
        else:
            refs = [f"images-out/preprod/sketch/{s['id']}.png", PLACE[s["scene"]]]
            refs += ["images-out/preprod/cards2/cast.png"] if len(people) >= 3 else [CARD[w] for w in people]
            refs = refs[:4]
            prompt = prompt_for(s, style, refs)
        board.append({"id": s["id"], "scene": s["scene"], "size": s["size"], "who": s["who"], "line": s.get("line"), "action": s["action"],
                      "dur_s": s["dur_s"], "composite": composite, "prompt": prompt, "refs": refs, "sketch": f"images-out/preprod/sketch/{s['id']}.svg"})
    (adir / "preprod" / "storyboard.json").write_text(json.dumps({"about": __doc__.strip().splitlines()[0] + " DRAFTED by the coding agent.", "shots": board}, indent=2, ensure_ascii=False) + "\n")
    print(f"{len(board)} sketches in {out.relative_to(ROOT)}; {sum(1 for b in board if b['prompt'])} prompts, {sum(1 for b in board if b['composite'])} composited")


if __name__ == "__main__":
    main()
