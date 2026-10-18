"""Background plates, round two (owner, 2026-10-16): every setup's empty plate redrawn from its 3D frame and words,
the look picture cut down to a small swatch of samples so it can't impose its own framing. Two options per plate:
"a" from the shaded set render, "b" from the outlines-on-white render. No pictograms in the hall or corridor.
Courtyard B-bai is setup B with Bai already at her small table, headphones on (the owner's note on S04, R02, F26).

  .venv-image/bin/python scripts/plate-jobs.py fifteen-days [plate ...]

Writes adaptations/<seed>/preprod/plate2-jobs.json and the swatches in images-out/preprod/swatch/.
Prompts DRAFTED by the coding agent.
"""

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PRE = ROOT / "images-out" / "preprod"
# where each set's look comes from, and four sample boxes (fractions of the picture: left, top, right, bottom)
SWATCH = {
    "courtyard": ("plates/plate-courtyard-A.png", [(0.0, 0.45, 0.3, 0.8), (0.22, 0.25, 0.52, 0.6), (0.38, 0.62, 0.68, 0.97), (0.55, 0.0, 0.85, 0.35)]),
    "street": ("plates/plate-courtyard-G.png", [(0.0, 0.3, 0.3, 0.65), (0.3, 0.35, 0.6, 0.7), (0.6, 0.4, 0.9, 0.75), (0.35, 0.0, 0.65, 0.35)]),
    "hall": ("refs-small/hall6-a.png", [(0.0, 0.0, 0.3, 0.35), (0.25, 0.55, 0.55, 0.9), (0.5, 0.55, 0.75, 0.85), (0.72, 0.18, 1.0, 0.5)]),
    "corridor": ("places-final/corridor.png", [(0.0, 0.1, 0.3, 0.45), (0.35, 0.3, 0.65, 0.65), (0.0, 0.6, 0.3, 0.95), (0.7, 0.55, 1.0, 0.9)]),
    "lobby": ("places-final/lobby.png", [(0.0, 0.0, 0.3, 0.35), (0.6, 0.1, 0.9, 0.45), (0.35, 0.6, 0.65, 0.95), (0.7, 0.6, 1.0, 0.95)]),
}
PLACE = {
    "courtyard": "the small open-air courtyard café at night: close-set wooden tables and chairs on stone paving, a long rectangular wooden table in the middle, "
                 "a shade tree hung with strings of little warm lights, low buildings with glowing pink and cyan windows on three sides, a dark metal street gate "
                 "in the north wall, megastructures towering above the rooftops",
    "street": "the quiet street outside the courtyard café's gate at night: paving stones, plain building fronts with a few glowing windows, a street lamp, "
              "the dark metal gate in the café's wall, megastructures towering above the rooftops",
    "hall": "the vast round underground tournament hall: rough dark rock overhead and no sky, tiers of seats full of a varied crowd rising all around, a standing "
            "ring at the top behind a railing, a broad walkway with a railing on each side spanning the hall high above the floor, the round floor below with "
            "identical black posts on small robotic bases topped by glowing cube clusters, glowing holograms of gliders, little ships and walls of cubes in cyan "
            "and amber, two small sunken pits at opposite edges of the floor, two big blank screens hanging over one side",
    "corridor": "a long round-topped corridor cut through dark stone deep underground: a smooth floor, small warm lights along the top, a row of sleek elevator "
                "doors in the left-hand wall, no windows, plain bare walls",
    "lobby": "a hotel lobby restaurant late at night, nearly empty: warm plain walls, a few small square tables with chairs, tall windows along one wall onto "
             "the night city, a serving counter on the far wall",
}
EMPTY = {
    "courtyard": "None of the main characters are in the picture. The long rectangular table and the small round table for one are empty, chairs pushed in; "
                 "a few ordinary diners in plain, muted everyday clothes sit only at the other tables, small and natural.",
    "street": "Nobody in the picture, or at most one or two small ordinary passers-by far down the street.",
    "hall": "Nobody on the floor or the walkway: the crowd stays in the tiers and on the standing ring, ordinary people in plain, muted everyday clothes.",
    "corridor": "Nobody in the corridor at all.",
    "lobby": "Nobody at all: no people at the tables, at the windows or at the counter.",
}
NO_ICONS = ("No signs, no panels with pictograms, no icons, no symbols anywhere: walls are bare. Screens are blank and softly glowing. "
            "No letters, words, digits or numbers anywhere.")
# the view in the prompt's own words: prompts never name people, and the set's "what" sometimes does
VIEW = {"plate-courtyard-B": "across the long table from its north-west corner, toward the small round table for one on the east side",
        "plate-courtyard-B-bai": "across the long table from its north-west corner, toward the small round table for one on the east side",
        "plate-courtyard-C": "from the east end of the long table, looking back west toward the shade tree and the west side",
        "plate-courtyard-D": "from the north side of the long table, looking south across it",
        "plate-hall-P": "down into the sunken pit at the west edge of the floor, the tiers rising behind"}
# round-two retries (options c and d): the views the model widened into the whole place, in words
EXTRA = {"plate-courtyard-B-bai": "She is small and far from the camera: beyond the far end of the long table, at the small round table for one, about a fifth of the "
                                  "frame's height. The long table in the foreground is empty, nobody sits at it.",
         "plate-courtyard-E": "Seen from straight above and close: only the wooden tabletop fills the whole frame, with two small tea cups, a little sugar bowl and a "
                              "small neat wall of white sugar cubes; the stone paving shows only at the corners. No sky, no buildings, not a wide view.",
         "plate-hall-P": "Close, looking down from just above the edge of the floor into one small round sunken pit lined with metal, a low console inside it, empty; "
                         "the floor's edge in the foreground, the lowest tiers of the crowd rising behind. Not a wide view of the hall, no screens.",
         "plate-hall-V": "Looking steeply down from high on the walkway, over its railing, onto the floor directly below: the railing and the walkway's edge cut "
                         "across the bottom of the frame, the floor's posts with their glowing cube clusters seen from above, holograms among them. No screens, no "
                         "ceiling, not a wide view of the hall.",
         "plate-lobby-O": "Seen from the dark street outside: the street's pavement along the bottom of the frame, the tall glass window and its frame in the "
                          "foreground, and through the glass the warm, empty lobby with its small tables. Not seen from inside."}
NAMES = ("Zei", "Bai", "Deluin", "Kau")
BAI = ("the thin, wiry young woman with warm brown skin, shaved sides, a tall magenta ponytail, dangly geometric earrings, a lime-green vest and tattooed arms")


def swatch(name: str) -> Path:
    src, boxes = SWATCH[name]
    im = Image.open(PRE / src).convert("RGB")
    W, H = im.size
    out = Image.new("RGB", (520, 520), (255, 255, 255))
    for i, (l, t, r, b) in enumerate(boxes):
        c = im.crop((int(l * W), int(t * H), int(r * W), int(b * H))).resize((250, 250))
        out.paste(c, (6 + (i % 2) * 258, 6 + (i // 2) * 258))
    p = PRE / "swatch" / f"{name}.png"
    p.parent.mkdir(parents=True, exist_ok=True)
    out.save(p)
    return p


def main() -> None:
    seed = sys.argv[1]
    retry = "--retry" in sys.argv
    only = set(a for a in sys.argv[2:] if a != "--retry")
    adir = ROOT / "adaptations" / seed / "preprod"
    style = json.loads((ROOT / "adaptations" / seed / "style.json").read_text())
    sw = {n: swatch(n) for n in SWATCH}
    jobs = []
    for sname in ("courtyard", "hall", "corridor", "lobby"):
        sd = json.loads((adir / "sets" / f"{sname}.json").read_text())
        for k, su in sd["setups"].items():
            pid = f"plate-{sname}-{k}"
            if only and pid not in only:
                continue
            look = "street" if pid in ("plate-courtyard-G", "plate-courtyard-S") else sname
            indoor = sname in ("hall", "corridor")
            st = style["prompt"].split(" Wherever the sky shows")[0] if indoor else style["prompt"]
            signs = NO_ICONS if indoor else style["signs"]
            view = VIEW.get(pid, su["what"])
            assert not any(n in view for n in NAMES), pid
            for opt, layout in ((("c", f"{pid}.png"), ("d", f"{pid}.line.png")) if retry else (("a", f"{pid}.png"), ("b", f"{pid}.line.png"))):
                ref1 = ("a plain grey 3D layout render" if opt == "a" else "a plain outline drawing on white of a 3D layout") + \
                       " taken from this exact camera: copy its camera position, height, angle, lens and perspective exactly, and where every wall, table, chair, " \
                       "railing, door, window, tier and post stands; it is only a layout, so draw nothing of its " + \
                       ("grey blocks, white background or simple figures" if opt == "a" else "white background, bare outlines or simple figures") + \
                       " as they are: turn them into the real, finished place."
                parts = [f"An empty background plate of {PLACE[look]}. The view: {view}.",
                         f"Reference image 1 is {ref1}",
                         "Reference image 2 is only a small swatch of colour and material samples from this place: take its colours, materials and light from it, "
                         "never its layout, framing or grid.",
                         "One single continuous picture filling the whole frame, not a grid, collage or panels. Fully coloured and lit like the swatch, never grey."]
                if retry and pid in EXTRA:
                    parts.insert(1, EXTRA[pid])
                refs = [str((PRE / "set" / layout).relative_to(ROOT)), str(sw[look].relative_to(ROOT))]
                if su.get("people", {}).get("B") and opt == "d":
                    parts.append("She is " + BAI + ", big headphones on, a handheld device in her hands, the only main person in the picture, appearing once.")
                elif su.get("people", {}).get("B"):
                    refs.append(str((PRE / "cards-small" / "bai.png").relative_to(ROOT)))
                    parts.append(f"Reference image 3 is {BAI}: copy only her face, hair, skin and clothes, never the sheet's layout or poses. She is the only main "
                                 "person in the picture, appearing once: small, at the small round table for one on the right where the layout's single figure sits, "
                                 "facing the camera, big headphones on, a handheld device in her hands. The long rectangular table and the chair at its end are empty.")
                    parts.append("A few ordinary diners in plain, muted everyday clothes sit only at the other tables.")
                else:
                    parts.append(EMPTY[look])
                parts += [st, signs, style["no_text"]]
                jobs.append({"id": f"{pid}-{opt}", "plate": pid, "option": opt, "prompt": " ".join(parts), "refs": refs,
                             "width": 1536, "height": 864, "seed": (16500 if retry else 16000) + len(jobs)})
    spec = {"about": "Fifteen Days background plates, round two (owner, 2026-10-16): layout from the set render (shaded or outlines), look from a small swatch. "
                     "Prompts DRAFTED by the coding agent.",
            "out": "images-out/preprod/plates2", "ledger": "images-out/preprod/ledger-s6.json", "cap_usd": 5.0, "style": "", "jobs": jobs}
    path = adir / "plate2-jobs.json"
    if retry and path.exists():  # add the retries to the round-two job file
        old = json.loads(path.read_text())
        spec["jobs"] = [j for j in old["jobs"] if j["id"] not in {x["id"] for x in jobs}] + jobs
    path.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n")
    print(len(jobs), "plate jobs")


if __name__ == "__main__":
    main()
