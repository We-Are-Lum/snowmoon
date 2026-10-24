"""Score every character image against that character's cast sheet, locally, with no paid API.

  .venv-image/bin/python scripts/consistency/collect.py "<Drive>/Snowmoon images"   # once: the renders
  .venv-image/bin/python scripts/consistency/measure.py

Reads images-out/cast/<slug>-sheet.png and images-out/chapter-N/<id>.png (hash-checked by collect.py),
and the jobs in content/snowmoon/illustrations/chapter-*.json (who is in each image, in reference order).
Writes content/snowmoon/consistency/scores.json and small sheet thumbnails beside it.

NOT USED FOR PICKING (owner, 2026-10-23: "The automatic scores were wrong 6 times in 10, so don't use them to pick
redos: use the by-eye list"). Redos come from review.json's by-eye list; these scores are kept as a record only.

Models (all open weights, run on this Mac, used only to measure, never to make anything published):
  google/owlv2-base-patch16-ensemble (Apache-2.0): finds people and faces by text query ("a person", "a face").
  facebook/dinov2-base (Apache-2.0): image features for faces and whole figures.
  laion/CLIP-ViT-B-32-laion2B-s34B-b79K (MIT): image features for clothes, and a text probe for build.
  (OWLv2's own CLIP towers were tried first and are useless here: after detection training every crop's
  pooled feature is the same, similarity 0.9999 for all.)

What each score is, honestly:
  face    DINOv2 similarity of the face crop to the sheet's front and three-quarter faces (best of the two).
          Drawn faces are small (about 40 px on a sheet), so this is "the face region looks alike": skin
          tone, eyes, framing and hair around the face count. It is NOT an identity match like a photo
          face recogniser; those are trained on photographs and don't apply to this drawing style.
  hair    Colour only: a Lab colour histogram of the head with the face left out, against the
          sheet's front and three-quarter views. Catches a wrong hair colour or a lost streak; it cannot see the haircut.
  clothes CLIP similarity of the body below the face to the sheet's three views (best), averaged with
          a Lab colour-histogram overlap with the sheet's front view. Catches wrong garments and wrong
          colours; partly hidden bodies (sitting, behind a table) score lower for that reason alone.
  build   Weak. CLIP's answers to a few text probes (slim, broad, heavy-set, child, elderly, tall,
          short) for the figure and for the sheet, compared (1 - Jensen-Shannon distance). Pose and
          framing move it; read it as a hint only.
  look    DINOv2 similarity of the whole figure to the sheet's views (best). Not in the combined score.
Which detected figure is which character is decided by likeness() (clothes, colours, hair, look, and a
small preference for figures drawn large); a figure not chosen that is nearly as alike is a possible double.
Every figure's similarities are kept in scores.json, so all of this can be redone with --rescore.
Each aspect is turned into a z-score over all (image, character) pairs; the combined score weights
face 1, hair 1, clothes 1.5, build 0.5 over the aspects that could be measured.

Veridians wear a privacy robe in public (the book). Where a scene has the robe in it and the character
is one who wears it, a closed robe leaves the pair unranked (only build would be left) and an open robe
leaves out clothes. Outliers per character: 1.5 robust z below the character's own median (with 4 or more
images), a combined score of -1 or less, any aspect at -1.75 or less, not found, or a possible double.
The worst 10 rank published images by their weakest character. --rescore redoes this part only.
"""

import itertools
import json
import math
from pathlib import Path

import numpy as np
import torch
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content" / "snowmoon"
IMG = ROOT / "images-out"
OUT = CONTENT / "consistency"
DEBUG = IMG / "consistency"

OWL = ("google/owlv2-base-patch16-ensemble", None)
DINO = ("facebook/dinov2-base", None)
CLIP = ("laion/CLIP-ViT-B-32-laion2B-s34B-b79K", None)
WEIGHTS = {"face": 1.0, "hair": 1.0, "clothes": 1.5, "build": 0.5}
BUILD_PROBES = ["a slim person", "a broad-shouldered person", "a heavy-set person", "a child",
                "an elderly person", "a tall person", "a short person", "a muscular person"]
dev = "mps" if torch.backends.mps.is_available() else "cpu"


def revision(repo):
    """The revision actually loaded: the local cache's ref for main."""
    ref = Path.home() / ".cache" / "huggingface" / "hub" / f"models--{repo.replace('/', '--')}" / "refs" / "main"
    return ref.read_text().strip() if ref.exists() else None


class Models:
    def __init__(self):
        from transformers import AutoImageProcessor, AutoModel, CLIPModel, CLIPProcessor, Owlv2ForObjectDetection, Owlv2Processor
        self.owl_p = Owlv2Processor.from_pretrained(OWL[0])
        self.owl = Owlv2ForObjectDetection.from_pretrained(OWL[0]).to(dev).eval()
        self.dino_p = AutoImageProcessor.from_pretrained(DINO[0])
        self.dino = AutoModel.from_pretrained(DINO[0]).to(dev).eval()
        self.clip_p = CLIPProcessor.from_pretrained(CLIP[0])
        self.clip = CLIPModel.from_pretrained(CLIP[0]).to(dev).eval()
        with torch.no_grad():
            t = self.clip_p(text=BUILD_PROBES, return_tensors="pt", padding=True).to(dev)
            e = self.clip.get_text_features(input_ids=t["input_ids"], attention_mask=t["attention_mask"])
            e = e if isinstance(e, torch.Tensor) else e.pooler_output
            self.build_text = torch.nn.functional.normalize(e, dim=-1)

    @torch.no_grad()
    def detect(self, im, queries=("a person", "a face"), thr=(0.18, 0.12)):
        """Boxes per query, in pixels, after NMS. OWLv2 pads to a square, so boxes scale by the long side."""
        inputs = self.owl_p(text=[list(queries)], images=im, return_tensors="pt").to(dev)
        out = self.owl(**inputs)
        side = max(im.size)
        res = self.owl_p.image_processor.post_process_object_detection(out, threshold=min(thr), target_sizes=torch.tensor([[side, side]]))[0]
        found = {q: [] for q in queries}
        for box, score, label in zip(res["boxes"].tolist(), res["scores"].tolist(), res["labels"].tolist()):
            q = queries[label]
            if score < thr[label]:
                continue
            x0, y0, x1, y1 = box
            x0, y0 = max(0, x0), max(0, y0)
            x1, y1 = min(im.size[0], x1), min(im.size[1], y1)
            if x1 - x0 > 6 and y1 - y0 > 6:
                found[q].append((x0, y0, x1, y1, score))
        return {q: nms(v) for q, v in found.items()}

    @torch.no_grad()
    def dino_emb(self, crops):
        if not crops:
            return []
        x = self.dino_p(images=crops, return_tensors="pt").to(dev)
        e = self.dino(**x).pooler_output
        return list(torch.nn.functional.normalize(e, dim=-1).cpu().numpy())

    @torch.no_grad()
    def clip_emb(self, crops):
        """CLIP image features, and CLIP's answers to the build probes."""
        if not crops:
            return []
        x = self.clip_p(images=crops, return_tensors="pt").to(dev)
        e = self.clip.get_image_features(pixel_values=x["pixel_values"])
        e = torch.nn.functional.normalize(e if isinstance(e, torch.Tensor) else e.pooler_output, dim=-1)
        probs = (100 * e @ self.build_text.T).softmax(-1)
        return list(zip(e.cpu().numpy(), probs.cpu().numpy()))


def iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / u if u else 0


def nms(boxes, t=0.5):
    keep = []
    for b in sorted(boxes, key=lambda b: -b[4]):
        if all(iou(b, k) < t for k in keep):
            keep.append(b)
    return keep


def lab_hist(im, box, bins=8, exclude=None):
    """Lab colour histogram of a box, optionally leaving out another box (the face, for the hair)."""
    if box is None:
        return None
    x0, y0, x1, y1 = [int(round(v)) for v in box[:4]]
    if x1 - x0 < 4 or y1 - y0 < 4:
        return None
    a = np.asarray(im.crop((x0, y0, x1, y1)).convert("LAB")).astype(np.int32)
    keep = np.ones(a.shape[:2], bool)
    if exclude is not None:
        ex0, ey0, ex1, ey1 = [int(round(v)) for v in exclude[:4]]
        keep[max(0, ey0 - y0):max(0, ey1 - y0), max(0, ex0 - x0):max(0, ex1 - x0)] = False
    a = a[keep]
    if len(a) < 16:
        return None
    h, _ = np.histogramdd(a, bins=(bins, bins, bins), range=((0, 256), (0, 256), (0, 256)))
    h = h.flatten()
    return h / h.sum()


def overlap(h1, h2):
    return float(np.minimum(h1, h2).sum()) if h1 is not None and h2 is not None else None


def js_sim(p, q):
    m = (p + q) / 2
    kl = lambda a, b: float(np.sum(a * np.log((a + 1e-9) / (b + 1e-9))))
    return 1 - math.sqrt(max(0.0, (kl(p, m) + kl(q, m)) / 2) / math.log(2))


def crop(im, box, pad=0.0):
    x0, y0, x1, y1 = box[:4]
    w, h = x1 - x0, y1 - y0
    return im.crop((int(max(0, x0 - pad * w)), int(max(0, y0 - pad * h)), int(min(im.size[0], x1 + pad * w)), int(min(im.size[1], y1 + pad * h)))).convert("RGB")


FACE_THR, HEAD_THR = 0.09, 0.08


def head_and_face(m, im, person):
    """Look for a head and a face in the top of one figure. Drawn faces are small, so the detector
    sees them far better in the figure's own crop than in the whole picture. A back view finds a head
    but (almost always) no face above the threshold."""
    px0, py0, px1, py1 = person[:4]
    top = (px0, py0, px1, py0 + 0.45 * (py1 - py0))
    c = crop(im, top)
    d = m.detect(c, queries=("a face", "a head"), thr=(FACE_THR, HEAD_THR))
    shift = lambda b: (b[0] + top[0], b[1] + top[1], b[2] + top[0], b[3] + top[1], b[4])
    face = shift(d["a face"][0]) if d["a face"] else None
    head = shift(d["a head"][0]) if d["a head"] else None
    if face and head and not (head[0] <= (face[0] + face[2]) / 2 <= head[2] and head[1] <= (face[1] + face[3]) / 2 <= head[3]):
        head = None
    return head, face


def figures(m, im, max_people=10):
    """Detected people, each with a face (if one is found), a hair region (the head without the face)
    and a body (below the face, or below the head), and features for each."""
    people = sorted(m.detect(im, queries=("a person",), thr=(0.12,))["a person"], key=lambda b: -b[4])[:max_people]
    figs = []
    nfaces = 0
    for p in people:
        head, face = head_and_face(m, im, p)
        nfaces += bool(face)
        px0, py0, px1, py1 = p[:4]
        if head is None and face is not None:
            fw, fh = face[2] - face[0], face[3] - face[1]
            head = (face[0] - 0.3 * fw, face[1] - 0.6 * fh, face[2] + 0.3 * fw, face[3], face[4])
        if head is None:
            head = (px0, py0, px1, py0 + 0.15 * (py1 - py0), 0)
        body_top = (face or head)[3]
        body = (px0, body_top, px1, py1) if py1 - body_top > 10 else None
        figs.append({"box": [round(v, 1) for v in p[:4]], "score": round(p[4], 3),
                     "face": [round(v, 1) for v in face[:4]] if face else None,
                     "head": [round(v, 1) for v in head[:4]], "body_box": body})
    look = m.dino_emb([crop(im, f["box"]) for f in figs])
    face_e = m.dino_emb([crop(im, f["face"], 0.15) for f in figs if f["face"]])
    body_c = m.clip_emb([crop(im, f["body_box"]) for f in figs if f["body_box"]])
    whole_c = m.clip_emb([crop(im, f["box"]) for f in figs])
    fi = bi = 0
    for k, f in enumerate(figs):
        f["look"] = look[k]
        f["build"] = whole_c[k][1]
        f["face_e"] = face_e[fi] if f["face"] else None
        fi += bool(f["face"])
        f["body_e"] = body_c[bi][0] if f["body_box"] else None
        bi += bool(f["body_box"])
        f["hair_h"] = lab_hist(im, f["head"], exclude=f["face"])
        f["body_h"] = lab_hist(im, f["body_box"])
    return figs, nfaces


def sheet_views(m, slug):
    im = Image.open(IMG / "cast" / f"{slug}-sheet.png").convert("RGB")
    figs, _ = figures(m, im)
    # Three full-body views side by side: keep the three tallest figures, ordered left to right
    # (front, three-quarter, back). Fall back to thirds if detection misses one.
    tall = sorted(figs, key=lambda f: -(f["box"][3] - f["box"][1]))[:3]
    tall = sorted(tall, key=lambda f: f["box"][0])
    if len(tall) < 3:
        W, H = im.size
        thirds = [(i * W / 3, 0, (i + 1) * W / 3, H, 1.0) for i in range(3)]
        tall = []
        for t in thirds:
            sub, _ = figures(m, im.crop(tuple(int(v) for v in t[:4])))
            tall.append(max(sub, key=lambda f: f["box"][3] - f["box"][1]) if sub else None)
        tall = [f for f in tall if f]
    return im, tall


def robe_of(job):
    """'closed' or 'open' when the scene has a Veridian privacy robe in it (designs/props/privacy-robe*.json)."""
    props = job.get("props") or []
    if any(p.endswith("privacy-robe.json") for p in props):
        return "closed"
    if any("privacy-robe-open" in p for p in props):
        return "open"
    return None


def likeness(v, height):
    """How much one figure looks like one character's sheet, to decide who is who: clothes (CLIP, and
    colour), hair colour and the whole figure (DINOv2), plus a small preference for figures drawn large,
    because whole-figure features favour tiny standing figures, which look like a sheet's views."""
    return (v["clothes_clip"] or 0) + 0.5 * (v["clothes_colour"] or 0) + 0.5 * (v["hair"] or 0) + 0.5 * v["look"] + 0.15 * min(1.0, height / 0.6)


def assign(e):
    """Which figure is which character: the assignment with the best total likeness. Also notes, for each
    character, the best likeness among the figures not chosen (a possible double)."""
    figs, chars = e["figures"], e["characters"]
    best, best_s = [], -1e9
    for perm in itertools.permutations(range(len(figs)), min(len(chars), len(figs))):
        sc = sum(likeness(figs[p]["vs"][c], figs[p]["height"]) for c, p in zip(chars, perm))
        if sc > best_s:
            best, best_s = list(perm), sc
    e["chars"] = []
    for k, c in enumerate(chars):
        if k >= len(best):
            e["chars"].append({"character": c, "found": False})
            continue
        f = figs[best[k]]
        others = [likeness(g["vs"][c], g["height"]) for i, g in enumerate(figs) if i not in best]
        e["chars"].append({"character": c, "found": True, "box": f["box"], "face_box": f["face_box"], **f["vs"][c],
                           "like": round(likeness(f["vs"][c], f["height"]), 4), "double_like": round(max(others), 4) if others else None})


def score(images):
    """z-scores, the combined score, outliers and the worst 10, from the raw similarities alone (so a change
    here can be re-run with --rescore without measuring again)."""
    jobs = {}
    for f in (CONTENT / "illustrations").glob("chapter-*.json"):
        for j in json.loads(f.read_text())["jobs"]:
            jobs[j["id"]] = j
    robed_people = {Path(f).stem for f in (CONTENT / "designs" / "characters").glob("*.json")
                    if json.loads(Path(f).read_text()).get("wears_privacy_robe_in_public")}
    for e in images:
        if e["measured"]:
            assign(e)
    pairs = [p for e in images if e["measured"] for p in e["chars"]]
    for e in images:
        if not e["measured"]:
            continue
        robe = robe_of(jobs[e["id"]])
        for p in e["chars"]:
            # Veridians wear the robe in public (the book): a robed figure is meant not to match the sheet.
            p["robe"] = robe if robe and p["character"] in robed_people else None
    skip = {"closed": {"face", "hair", "clothes_clip", "clothes_colour"}, "open": {"clothes_clip", "clothes_colour"}, None: set()}
    raw = ("face", "hair", "clothes_clip", "clothes_colour", "build", "look")
    found = [p for p in pairs if p["found"]]
    stats = {}
    for key in raw:
        a = np.array([p[key] for p in found if p.get(key) is not None and key not in skip[p["robe"]]])
        stats[key] = {"mean": round(float(a.mean()), 4), "sd": round(float(a.std() or 1), 4)}
    for p in found:
        zs = {k: (p[k] - stats[k]["mean"]) / stats[k]["sd"] for k in raw if p.get(k) is not None and k not in skip[p["robe"]]}
        cc, co = zs.pop("clothes_clip", None), zs.pop("clothes_colour", None)
        if cc is not None:
            zs["clothes"] = (cc + co) / 2 if co is not None else cc
        p["z"] = {k: round(v, 2) for k, v in zs.items()}
        w = {k: WEIGHTS[k] for k in WEIGHTS if k in zs}
        # A closed robe leaves only build: not enough to score, so the pair is shown but not ranked.
        p["combined"] = round(sum(zs[k] * w[k] for k in w) / sum(w.values()), 3) if w and p["robe"] != "closed" else None
        # A double: an unassigned figure resembles the sheet nearly as well as the chosen one.
        p["double"] = bool(p.get("double_like") is not None and p["double_like"] >= p["like"] - 0.05)
    for p in pairs:
        if not p["found"]:
            p["combined"], p["z"], p["double"] = -3.0, {}, False

    # Outliers per character: well below the character's own other images (robust z, with 4 or more
    # images), low against everyone, an aspect far down, not found, or a possible double.
    by_char = {}
    for p in pairs:
        by_char.setdefault(p["character"], []).append(p)
    for c, ps in by_char.items():
        scored = [p for p in ps if p["combined"] is not None]
        vals = np.array([p["combined"] for p in scored]) if scored else np.array([0.0])
        med = float(np.median(vals))
        mad = float(np.median(np.abs(vals - med))) * 1.4826 or 0.5
        for p in ps:
            if p["combined"] is None:
                p["within"], p["outlier"] = None, None
                continue
            p["within"] = round((p["combined"] - med) / mad, 2) if len(scored) >= 4 else None
            why = []
            if not p["found"]:
                why.append("not found in the picture")
            if p["found"] and p["within"] is not None and p["within"] <= -1.5:
                why.append("far below this character's other images")
            if p["found"] and p["combined"] <= -1.0:
                why.append("low against all characters")
            low = [k for k, v in p["z"].items() if k != "look" and v <= -1.75]
            if low:
                why.append("weak " + ", ".join(sorted(low)))
            if p["double"]:
                why.append("someone else in the picture looks as much like the sheet (a possible double)")
            p["outlier"] = why or None
    for e in images:
        if e["measured"]:
            vals = [p["combined"] for p in e["chars"] if p["combined"] is not None]
            e["score"] = min(vals) if vals else None
    ranked = sorted([e for e in images if e["measured"] and not e["excluded"] and e["score"] is not None], key=lambda e: e["score"])
    return stats, [e["id"] for e in ranked[:10]]


def main():
    import argparse
    import glob
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, help="only the first N images (a quick check; writes nothing)")
    ap.add_argument("--rescore", action="store_true", help="recompute scores, outliers and the worst 10 from scores.json; measure nothing")
    args = ap.parse_args()
    if args.rescore:
        result = json.loads((OUT / "scores.json").read_text())
        result["stats"], result["worst10"] = score(result["images"])
        for m in result["models"]:
            m["revision"] = m["revision"] or revision(m["repo"])
        (OUT / "scores.json").write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n")
        print("worst 10:", result["worst10"])
        return
    m = Models()
    OUT.mkdir(parents=True, exist_ok=True)
    DEBUG.mkdir(parents=True, exist_ok=True)
    jobs = []
    for f in sorted(glob.glob(str(CONTENT / "illustrations" / "chapter-*.json")), key=lambda p: int(Path(p).stem.split("-")[1])):
        for j in json.loads(Path(f).read_text())["jobs"]:
            if j.get("characters"):
                jobs.append({**j, "stem": Path(f).stem, "chars": [Path(c).stem for c in j["characters"]]})
    published = json.loads((CONTENT / "illustrations" / "published.json").read_text())
    pub_url = {i["id"]: i["url"] for i in published["images"]}
    excluded = published.get("excluded", {})

    if args.limit:
        jobs = jobs[: args.limit]
    sheets = {}
    for slug in sorted({c for j in jobs for c in j["chars"]}):
        im, views = sheet_views(m, slug)
        # Faces from the front and three-quarter views only: the back view's "face" is the back of the head.
        sheets[slug] = {"views": views, "faces": [v["face_e"] for v in views[:2] if v["face_e"] is not None]}
        th = im.copy()
        th.thumbnail((640, 360))
        # Thumbnails for the owner's page (committed: owner, 2026-10-23, "yes, commit the 19 sheet thumbnails").
        th.save(OUT / f"sheet-{slug}.jpg", quality=82)
        print(f"sheet {slug}: {len(views)} views, {len(sheets[slug]['faces'])} faces found", flush=True)

    def compare(fig, slug):
        s = sheets[slug]
        r = {}
        r["look"] = max(float(fig["look"] @ v["look"]) for v in s["views"])
        r["face"] = max((float(fig["face_e"] @ fe) for fe in s["faces"]), default=None) if fig["face_e"] is not None else None
        hair = [overlap(fig["hair_h"], v["hair_h"]) for v in s["views"][:2]]
        r["hair"] = max((h for h in hair if h is not None), default=None)
        if fig["body_e"] is not None:
            clip_s = max(float(fig["body_e"] @ v["body_e"]) for v in s["views"] if v["body_e"] is not None)
            col = overlap(fig["body_h"], s["views"][0]["body_h"])
            r["clothes_clip"], r["clothes_colour"] = clip_s, col
        else:
            r["clothes_clip"] = r["clothes_colour"] = None
        r["build"] = max(js_sim(fig["build"], v["build"]) for v in s["views"][:2])
        return r

    images = []
    face_found = person_found = 0
    for j in jobs:
        path = IMG / j["stem"] / f"{j['id']}.png"
        if not path.exists():
            images.append({"id": j["id"], "chapter": j["chapter"], "characters": j["chars"], "measured": False,
                           "why": "the render's hash does not match its recipe (collect.py)", "excluded": excluded.get(j["id"])})
            continue
        im = Image.open(path).convert("RGB")
        figs, nfaces = figures(m, im)
        person_found += bool(figs)
        face_found += any(f["face"] for f in figs)
        # Every figure found, with its similarities to each character's sheet; which figure is which
        # character is decided in score(), so it can be changed and re-run without measuring again.
        images.append({"id": j["id"], "chapter": j["chapter"], "idx": j["idx"], "characters": j["chars"], "measured": True,
                       "url": pub_url.get(j["id"]), "excluded": excluded.get(j["id"]), "people_found": len(figs), "faces_found": nfaces,
                       "width": im.size[0], "height": im.size[1], "seed": j["seed"],
                       "figures": [{"box": f["box"], "face_box": f["face"], "height": round((f["box"][3] - f["box"][1]) / im.size[1], 3),
                                    "vs": {c: {k: (round(v, 4) if isinstance(v, float) else v) for k, v in compare(f, c).items()} for c in j["chars"]}}
                                   for f in figs]})
        print(f"{j['id']}: {len(figs)} people, {nfaces} faces", flush=True)

    stats, worst10 = score(images)

    clean = lambda p: {k: (round(v, 4) if isinstance(v, float) else v) for k, v in p.items() if k not in ("image",)}
    for e in images:
        if e["measured"]:
            e["chars"] = [clean(p) for p in e["chars"]]
    result = {
        "about": "How closely each character image matches that character's cast sheet. Measured locally by scripts/consistency/measure.py "
                 "(no paid service); see its docstring for what each score does and does not measure. Owner-only until the owner has read it.",
        "not_for_picking": "A record only. Wrong 6 times in its worst 10; redos are picked from review.json's by-eye list (owner, 2026-10-23).",
        "models": [{"repo": r, "revision": revision(r), "license": l, "use": u} for r, l, u in (
            (OWL[0], "apache-2.0", "find people, heads and faces"), (DINO[0], "apache-2.0", "face and figure features"),
            (CLIP[0], "mit", "clothes features, build probe"))],
        "weights": WEIGHTS,
        "detection": {"images": len([e for e in images if e["measured"]]), "with_a_person": person_found, "with_a_face": face_found,
                      "sheet_faces": {s: len(v["faces"]) for s, v in sheets.items()}},
        "stats": stats,
        "worst10": worst10,
        "images": images,
    }
    if args.limit:
        print(json.dumps(result["detection"]), json.dumps([[(p["character"], p.get("combined"), p.get("z"), p.get("outlier")) for p in e.get("chars", [])] for e in images], default=str)[:3000])
        return
    (OUT / "scores.json").write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n")
    print("worst 10:", worst10)


if __name__ == "__main__":
    main()
