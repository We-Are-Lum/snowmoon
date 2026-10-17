"""Background plates, round three (owner, 2026-10-16 night): no people at all on any plate, and three ways to hold scale
and perspective, so the owner can choose:
  A  depth control: Qwen-Image-Edit-2509 (Apache-2.0, native depth/edge conditions; provisional on the allowlist) draws from a depth
     map of the empty set plus the swatch (options "aq1", "aq2"); "ak" is a FLUX.2 [klein] restyle of "aq1" into the comic look
     (written with --stage2, once aq1 exists). fal's Z-Image Turbo ControlNet was tried first and ignores its control image.
  B  readable set render: FLUX.2 [klein] edit from the textured, shadowed render of the empty set plus the swatch (options "b1", "b2").
Kept from earlier rounds (the owner's picks): lobby O round one; courtyard G and S, corridor N and S, lobby I option a.
The Bai plate is gone: with no people on plates, she is added at the frame stage.

  .venv-image/bin/python scripts/plate3-jobs.py fifteen-days [plate ...]

Writes adaptations/<seed>/preprod/plate3-jobs.json and the edge images (images-out/preprod/set/<plate>.edge.png).
Prompts DRAFTED by the coding agent.
"""

import importlib.util
import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PRE = ROOT / "images-out" / "preprod"
_spec = importlib.util.spec_from_file_location("plate_jobs", ROOT / "scripts" / "plate-jobs.py")
pj = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pj)

KEEP = {"plate-courtyard-G": "a", "plate-courtyard-S": "a", "plate-corridor-N": "a", "plate-corridor-S": "a", "plate-lobby-I": "a", "plate-lobby-O": "round1"}
PLACE = {**pj.PLACE,
         "courtyard": "the small open-air courtyard café at night: wooden tables and chairs standing on stone paving, a long rectangular wooden table "
                      "in the middle, a shade tree hung with strings of little warm lights, low buildings with glowing pink and cyan windows, a dark metal "
                      "street gate, megastructures towering above the rooftops",
         # the owner (2026-10-16 night): all holograms, light mobile towers, the walkway over the top, a live game
         "hall": "the vast round underground tournament hall: rough dark rock overhead and no sky, empty tiers of seats rising all around, a standing ring "
                 "at the top behind a railing, a broad walkway on a slim girder spanning the whole hall high over the top of the floor, a long drop of "
                 "open air beneath it, and the round floor far below it alive with a live game: glowing holograms everywhere, gliders streaking across "
                 "with long light trails, little ships and walls of light cubes in cyan and amber, a few slim towers made only of light drifting on small "
                 "glowing discs (no dark poles, no pillars), two small sunken pits at opposite edges of the floor, two big blank screens hanging over one "
                 "side. A solid rock ceiling with no openings: no sky, no stars anywhere"}
EMPTY = ("No letters, no glyphs, no writing in any window or neon. Nobody at all: no people anywhere, not at the tables, not in the seats, not on the walkway, not in the street; every chair and seat is "
         "empty. Tables stand on the floor and chairs stand on the floor, at their real size.")
VIEW = {**pj.VIEW,
        "plate-courtyard-B": "across the long table from its north-west corner, toward the small round table for one on the east side",
        "plate-hall-P": "down into the sunken pit at the west edge of the floor in the middle of a live game, gliders streaking over the floor beyond it "
                        "with light trails, the tiers rising behind"}


COMIC = "A hand-drawn science fiction comic book panel, ink linework and flat cel-shaded colour, not a 3D render, not a photograph."
DEPTH = ("Picture 1 is a depth map of this exact scene rendered from a 3D model (near is light, far is dark): follow its camera position, angle, lens "
         "and perspective exactly, and put every wall, table, chair, railing, tier and walkway exactly where and as big as its shape stands there; draw "
         "nothing grey from it, it is only the structure. Picture 2 is only a small swatch of colour and material samples from this place: take its "
         "colours, materials and light, never its layout.")


def small(src: Path, w: int = 1024) -> str:
    dst = PRE / "set-small" / src.name
    dst.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src)
    im.thumbnail((w, w))
    im.save(dst)
    return str(dst.relative_to(ROOT))


def edge(pid: str) -> Path:
    src, dst = PRE / "set" / f"{pid}.line.empty.png", PRE / "set" / f"{pid}.edge.png"
    ImageOps.invert(Image.open(src).convert("L")).save(dst)
    return dst


def main() -> None:
    seed = sys.argv[1]
    stage2 = "--stage2" in sys.argv
    only = set(a for a in sys.argv[2:] if not a.startswith("--"))
    adir = ROOT / "adaptations" / seed / "preprod"
    style = json.loads((ROOT / "adaptations" / seed / "style.json").read_text())
    jobs = []
    for sname in ("courtyard", "hall", "corridor", "lobby"):
        sd = json.loads((adir / "sets" / f"{sname}.json").read_text())
        for k, su in sd["setups"].items():
            pid = f"plate-{sname}-{k}"
            if su.get("people") or pid in KEEP or (only and pid not in only):
                continue
            look = sname
            indoor = sname in ("hall", "corridor")
            st = style["prompt"].split(" Wherever the sky shows")[0] if indoor else style["prompt"]
            signs = pj.NO_ICONS if indoor else style["signs"]
            view = VIEW.get(pid, su["what"])
            assert not any(n in view for n in pj.NAMES), pid
            extra = pj.EXTRA.get(pid, "") if pid in ("plate-courtyard-E", "plate-hall-V") else ""
            extra = extra.replace("the floor's posts with their glowing cube clusters seen from above, holograms among them", "the glowing holograms of the live game seen from above")
            base = [f"An empty background plate of {PLACE[look]}. The view: {view}.", extra, EMPTY,
                    "One single continuous picture filling the whole frame. Fully coloured and lit, never grey."]
            dep = small(PRE / "set" / f"{pid}.depth.empty.png")
            for opt, sd_ in (("aq1", 24000), ("aq2", 24500)):
                jobs.append({"id": f"{pid}-{opt}", "plate": pid, "option": opt, "approach": "A", "engine": "qwen",
                             "prompt": " ".join(p for p in [COMIC] + base[:2] + [DEPTH] + base[2:] + [st, signs, style["no_text"],
                                                "Draw it as a finished comic panel: inked outlines on every shape, painted flat colour, glowing lights."] if p),
                             "refs": [dep, str((PRE / "swatch" / f"{look}.png").relative_to(ROOT))], "width": 1536, "height": 864, "seed": sd_ + len(jobs)})
            if stage2 and (PRE / "plates3" / f"{pid}-aq1.png").exists():
                jobs.append({"id": f"{pid}-ak", "plate": pid, "option": "ak", "approach": "A",
                             "prompt": "Redraw reference image 1 as a finished hand-drawn science fiction comic book panel: keep its camera, perspective and every "
                                       "shape, table, chair, wall, railing and walkway exactly where and as big as it is; add inked outlines, flat cel-shaded colour, "
                                       "rich detail and glowing practical lights, with the colours and materials of the swatch in reference image 2. " +
                                       " ".join(p for p in [extra, EMPTY, st, signs, style["no_text"]] if p),
                             "refs": [f"images-out/preprod/plates3/{pid}-aq1.png", str((PRE / "swatch" / f"{look}.png").relative_to(ROOT))],
                             "width": 1536, "height": 864, "seed": 24800 + len(jobs)})
            ref1 = ("a simple 3D model of this place, textured and lit, taken from this exact camera: copy its camera position, height, angle, lens and "
                    "perspective exactly, and the size and place of every wall, table, chair, railing, door, window, tier and walkway; turn its plain "
                    "materials into the real, finished place.")
            for opt, sd_ in (("b1", 23000), ("b2", 23500)):
                parts = base[:1] + ([extra] if extra else []) + [f"Reference image 1 is {ref1}",
                         "Reference image 2 is only a small swatch of colour and material samples from this place: take its colours, materials and light, "
                         "never its layout, framing or grid."] + base[2:] + [st, signs, style["no_text"]]
                jobs.append({"id": f"{pid}-{opt}", "plate": pid, "option": opt, "approach": "B", "prompt": " ".join(parts),
                             "refs": [str((PRE / "set" / f"{pid}.look.empty.png").relative_to(ROOT)), str((PRE / "swatch" / f"{look}.png").relative_to(ROOT))],
                             "width": 1536, "height": 864, "seed": sd_ + len(jobs)})
    spec = {"about": "Fifteen Days background plates, round three (owner, 2026-10-16 night): no people; A depth/edge control (Z-Image Turbo ControlNet), "
                     "B readable set render (FLUX.2 klein edit). Prompts DRAFTED by the coding agent.",
            "out": "images-out/preprod/plates3", "ledger": "images-out/preprod/ledger-s6.json", "cap_usd": 40.0, "style": "", "jobs": jobs}
    (adir / "plate3-jobs.json").write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n")
    print(len(jobs), "plate jobs")


if __name__ == "__main__":
    main()
