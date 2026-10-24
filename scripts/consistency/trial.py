"""The consistency trial (owner's brief, 2026-10-23): the 10 worst character images, redrawn three ways,
side by side. PREPARED, NOT RUN. Nothing here is published; the owner picks before any full redraw.

  # 0. See every prompt, reference list and price; calls nothing (the default):
  .venv-image/bin/python scripts/consistency/trial.py
  # 1. Portraits first (way a needs them), then the owner looks at them:
  .venv-image/bin/python scripts/consistency/trial.py --run --portraits --cap 2
  # 2. The trial itself:
  .venv-image/bin/python scripts/consistency/trial.py --run --ways a b c --cap 5

The ten are review.json's "trial10": the worst real problems found by looking at every image beside its
sheets (most of the measured worst 10, scores.json "worst10", were measurement errors). --only overrides. Each is redrawn with its own
seed and size, so only the method changes:

  orig  the published image (FLUX.2 [klein] 4B distilled, 4 steps, the cast sheets as references).
  a     the same model and settings, with a head-and-shoulders portrait of each character added as a
        second reference (images-out/portraits/<slug>-portrait.png, made by --portraits from the sheet).
        klein takes at most 4 references: with two characters (2 sheets + 2 portraits) the location
        plate is left out and the place stays in words. That is a second change; it is recorded.
  b     more steps: FLUX.2 [klein] base 4B, the same family's undistilled weights (Apache-2.0), 28
        steps, guidance 5. The distilled model is made for 4 steps; fal allows it 4-8 (--ways b8 tries
        the distilled model at 8). On the allowlist as flux2-klein-base-4b (owner, 2026-10-23).
  c     Qwen-Image-Edit-2511 (Qwen, Apache-2.0, 20B), multi-image edit, 28 steps, guidance 4.5 (fal's
        defaults). On the allowlist as qwen-image-edit-2511 (owner, 2026-10-23); the owner's main option.

All three ways use the same prompt wording for who is who (see who_is_who()): each reference is
named by its number and by a letter, A or B, and the scene's "the boy from reference image 1"
phrases are kept, so the scene and the references agree.

Hosted on fal.ai. The key comes from FAL_KEY (environment or .env.local) and reaches curl on stdin
only (scripts/fal-render.py). Before each call its cost is added to images-out/trial/ledger.json and
the call is refused if the total would pass --cap. Costs are counted high: the listed price per
megapixel times (the output, at least 1 MP, plus every reference), in case fal bills inputs.
Each call's recipe (endpoint, prompt, seed, size, references and their sha256, request id, cost,
output sha256) goes to images-out/trial/recipe.json; the side-by-side page is images-out/trial/index.html.
"""

import argparse
import base64
import hashlib
import html
import importlib.util
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content" / "snowmoon"
IMG = ROOT / "images-out"
OUT = IMG / "trial"
_spec = importlib.util.spec_from_file_location("fal_render", ROOT / "scripts" / "fal-render.py")
fal = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fal)
_spec2 = importlib.util.spec_from_file_location("illustrate", ROOT / "scripts" / "illustrate.py")
illustrate = importlib.util.module_from_spec(_spec2)
_spec2.loader.exec_module(illustrate)

# USD per megapixel, read from fal's model pages on 2026-10-23.
WAYS = {
    "a": {"endpoint": "fal-ai/flux-2/klein/4b/edit", "price": 0.01, "body": {"num_inference_steps": 4},
          "model": "FLUX.2 [klein] 4B (distilled), Apache-2.0, allowlist flux2-klein-4b, + portraits", "portraits": True},
    "b": {"endpoint": "fal-ai/flux-2/klein/4b/base/edit", "price": 0.009, "body": {"num_inference_steps": 28, "guidance_scale": 5},
          "model": "FLUX.2 [klein] base 4B (undistilled), Apache-2.0, allowlist flux2-klein-base-4b", "portraits": False},
    "b8": {"endpoint": "fal-ai/flux-2/klein/4b/edit", "price": 0.01, "body": {"num_inference_steps": 8},
           "model": "FLUX.2 [klein] 4B (distilled) at 8 steps, the most fal allows", "portraits": False},
    "c": {"endpoint": "fal-ai/qwen-image-edit-2511", "price": 0.03, "body": {"num_inference_steps": 28, "guidance_scale": 4.5},
          "model": "Qwen-Image-Edit-2511, Apache-2.0, allowlist qwen-image-edit-2511", "portraits": False},
    # The redo (owner, 2026-10-23): with the full sheet, Qwen drew its three views as three people, so it gets
    # only the front view, cropped from the sheet (no portraits: two crops and the plate already make 3 inputs).
    "c2": {"endpoint": "fal-ai/qwen-image-edit-2511", "price": 0.03, "body": {"num_inference_steps": 28, "guidance_scale": 4.5},
           "model": "Qwen-Image-Edit-2511 with front-view crops of the sheets", "portraits": False, "front": True},
}
PORTRAIT = {"endpoint": "fal-ai/flux-2/klein/4b/edit", "price": 0.01, "body": {"num_inference_steps": 4}}
MAX_REFS = {"a": 4, "b": 4, "b8": 4, "c": 3, "c2": 3}  # klein: 4 (fal); Qwen 2511 is trained and shown with 1-3 inputs
LETTERS = "AB"


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def load(rel):
    return json.loads((CONTENT / rel).read_text())


def look_of(descriptor: str) -> str:
    """The parts of a descriptor that tell people apart at a glance: the hair, and the first garment."""
    parts = [p.strip() for p in re.split(r",\s+(?![^()]*\))", descriptor)]
    hair = next((p for p in parts if "hair" in p or "head" in p), "")
    hair = re.sub(r" and [^,]*\beyes$", "", hair)
    worn = next((p for p in parts if p.startswith("wearing")), "")
    worn = re.sub(r"^wearing\s+", "", worn)
    return " and ".join(x for x in (hair, worn) if x)


def front_view(slug: str) -> Path:
    """The sheet's front view: its left third (341 x 576), as scripts/fal-shots.py crops it."""
    out = IMG / "cast" / "front" / f"{slug}.png"
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        sheet = Image.open(IMG / "cast" / f"{slug}-sheet.png")
        sheet.crop((0, 0, sheet.size[0] // 3, sheet.size[1])).save(out)
    return out


def who_is_who(chars, sheet_no, portrait_no, place_no, place_desc, picture="reference image", front=False):
    """The sentences that say which reference is which. Used by all three ways.

    For two characters (the owner: "say in the prompt which reference is which"):
      "Two people from the references are in the picture, each exactly once. Person A is shown in
       reference image 1 (a sheet with three full-body views of one person: front, three-quarter and
       back) and reference image 3 (a close portrait of the same person): <descriptor A>. Person B ...
       Keep each person's own face, hair, build and clothing; never swap hair, faces or clothes between
       A and B, and never draw either of them twice. Only person A has <look A>. Only person B has
       <look B>. Everyone else in the scene looks clearly different from both."
    """
    n = len(chars)
    out = []
    count = {1: "One person from the references is in the picture, exactly once.",
             2: "Two people from the references are in the picture, each exactly once."}[n]
    out.append(count)
    for k, slug in enumerate(chars):
        d = load(f"designs/characters/{slug}.json")["descriptor"]
        who = f"Person {LETTERS[k]}" if n > 1 else "This person"
        bits = [f"{picture} {sheet_no[k]} (" + ("a full-body front view of one person" if front else
                "a sheet with three full-body views of one person: front, three-quarter and back") + ")"]
        if portrait_no:
            bits.append(f"{picture} {portrait_no[k]} (a close head-and-shoulders portrait of the same person)")
        out.append(f"{who} is shown in {' and '.join(bits)}: {d}.")
    if n > 1:
        out.append("Keep each person's own face, hair, build and clothing; never swap hair, faces or clothes between A and B, "
                   "and never draw either of them twice.")
        for k, slug in enumerate(chars):
            out.append(f"Only person {LETTERS[k]} has {look_of(load(f'designs/characters/{slug}.json')['descriptor'])}.")
        out.append("Everyone else in the scene looks clearly different from both.")
    else:
        out.append("Keep the same face, hair, build and clothing; everyone else in the scene looks clearly different from them.")
    out.append("A single continuous picture, not split into panels." if front else
               "A single continuous picture, not split into panels; the character sheet's three views are one person, not three.")
    if place_no:
        out.append(f"{picture[0].upper()}{picture[1:]} {place_no} shows the location, {place_desc}; keep its architecture, layout and colors.")
    elif place_desc:
        out.append(f"The location: {place_desc}.")
    return " ".join(out)


def plan(job, way, style):
    """References and prompt for one image, one way."""
    chars = [Path(c).stem for c in job["characters"]]
    n = len(chars)
    front = WAYS[way].get("front", False)
    sheets = [front_view(c) if front else IMG / "cast" / f"{c}-sheet.png" for c in chars]
    portraits = [IMG / "portraits" / f"{c}-portrait.png" for c in chars] if WAYS[way]["portraits"] else []
    place = load(job["location"]) if job.get("location") else None
    plate = IMG / f"{place['plate']}.png" if place else None
    refs = sheets + portraits
    dropped = None
    if plate is not None:
        if len(refs) + 1 <= MAX_REFS[way]:
            refs.append(plate)
        else:
            dropped = f"location plate left out: {len(refs) + 1} references, the endpoint takes {MAX_REFS[way]}"
    sheet_no = list(range(1, n + 1))
    portrait_no = list(range(n + 1, 2 * n + 1)) if portraits else []
    place_no = len(refs) if plate is not None and refs[-1] == plate else None
    # Qwen-Image-Edit's template labels its inputs "Picture 1", "Picture 2"...; klein's prompts say "reference image".
    qwen = "qwen" in WAYS[way]["endpoint"]
    picture = "Picture" if qwen else "reference image"
    scene = re.sub(r"reference image (\d)", r"Picture \1", job["prompt"]) if qwen else job["prompt"]
    parts = [scene, who_is_who(chars, sheet_no, portrait_no, place_no, place["descriptor"] if place else None, picture, front)]
    for prop in job.get("props", []):
        parts.append(load(prop)["prompt"])
    parts.append(style["prompt"])
    if job.get("setting") in style.get("settings", {}):
        parts.append(style["settings"][job["setting"]])
    return refs, " ".join(parts), dropped


def cost_of(price, w, h, refs):
    # A portrait not drawn yet is counted at its planned size (768 x 768, portraits.json).
    ref_mp = sum((Image.open(r).size[0] * Image.open(r).size[1]) if r.exists() else 768 * 768 for r in refs) / 1e6
    return round((max(w * h / 1e6, 1.0) + ref_mp) * price, 4)


def data_uri(p: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true", help="call fal (spends money); without it, only print the plan")
    ap.add_argument("--ways", nargs="*", default=["a", "b", "c"], choices=list(WAYS))
    ap.add_argument("--portraits", action="store_true", help="make the portraits way a needs (only those characters)")
    ap.add_argument("--only", nargs="*", help="image ids (default: review.json trial10)")
    ap.add_argument("--estimate-full", action="store_true", help="price a full redraw of every character image, each way; calls nothing")
    ap.add_argument("--cap", type=float, default=2.0, help="USD; the trial's own ceiling, $2 (owner, 2026-10-23; the overall limit is $25 across all weekend jobs)")
    args = ap.parse_args()

    scores = json.loads((CONTENT / "consistency" / "scores.json").read_text())
    review_p = CONTENT / "consistency" / "review.json"
    # The ten come from the check by eye (review.json "trial10") when there is one: most of the measured
    # worst 10 turned out to be measurement errors. Without it, the measured worst 10.
    ids = args.only or (json.loads(review_p.read_text())["trial10"] if review_p.exists() else scores["worst10"])
    jobs = {}
    for f in (CONTENT / "illustrations").glob("chapter-*.json"):
        for j in json.loads(f.read_text())["jobs"]:
            jobs[j["id"]] = j
    style = load("designs/styles/techno-vistas.json")
    if args.estimate_full:
        every = [j for j in jobs.values() if j.get("characters")]
        for way in args.ways:
            usd = sum(cost_of(WAYS[way]["price"], j["width"], j["height"], plan(j, way, style)[0]) for j in every)
            low = sum(WAYS[way]["price"] * max(j["width"] * j["height"] / 1e6, 1.0) for j in every)
            print(f"way {way}: {len(every)} images, at most ${usd:.2f} (if fal bills every reference), ${low:.2f} if it bills the output only")
        n = len({Path(c).stem for j in every for c in j["characters"]})
        print(f"portraits for way a: {n} characters, at most ${n * cost_of(PORTRAIT['price'], 768, 768, [IMG / 'cast' / 'zei-sheet.png']):.2f}")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    (IMG / "portraits").mkdir(parents=True, exist_ok=True)
    ledger_p, recipe_p = OUT / "ledger.json", OUT / "recipe.json"
    ledger = json.loads(ledger_p.read_text()) if ledger_p.exists() else {"cap_usd": args.cap, "spent_usd": 0.0, "calls": []}
    ledger["cap_usd"] = args.cap
    recipe = json.loads(recipe_p.read_text()) if recipe_p.exists() else {
        "about": "Consistency trial (owner-only, not published). Prompts drafted by the coding agent; scene prompts are the published images' own.",
        "assist": {"model": "claude-coding-agent", "drafted": ["who-is-who wording", "portrait prompt"], "see": "principle 3"},
        "ways": WAYS, "price_seen": "fal model pages, 2026-10-23", "images": []}
    key = fal.fal_key() if args.run else None
    if args.run and not key:
        raise SystemExit("FAL_KEY is not set (environment or .env.local); nothing was called")

    def spend(label, endpoint, body, cost, out_path):
        if ledger["spent_usd"] + cost > args.cap:
            print(f"{label}: refused, would pass the ${args.cap} cap (spent ${ledger['spent_usd']:.4f})")
            return None
        ledger["spent_usd"] = round(ledger["spent_usd"] + cost, 4)  # counted before the call, in case it bills and then fails
        ledger["calls"].append({"what": label, "endpoint": endpoint, "cost_usd": cost, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
        ledger_p.write_text(json.dumps(ledger, indent=2) + "\n")
        res, headers = fal.call(endpoint, body, key)
        img = res["images"][0]
        subprocess.run(["curl", "-sS", "--fail", "-o", str(out_path), img["url"]], check=True, timeout=300)
        return res, headers

    total = 0.0
    if args.portraits:
        pj = json.loads((CONTENT / "illustrations" / "portraits.json").read_text())
        need = {Path(c).stem for i in ids for c in jobs[i]["characters"]}
        for job in pj["jobs"]:
            slug = job["id"].removesuffix("-portrait")
            if slug not in need:
                continue
            out_path = IMG / "portraits" / f"{slug}-portrait.png"
            refs = [IMG / "cast" / f"{slug}-sheet.png"]
            prompt = illustrate.compose_prompt(job, style)
            cost = cost_of(PORTRAIT["price"], job["width"], job["height"], refs)
            total += cost
            if not args.run:
                print(f"portrait {slug} (${cost}): {prompt}\n")
                continue
            if out_path.exists():
                continue
            body = {"prompt": prompt, "image_size": {"width": job["width"], "height": job["height"]}, "seed": job["seed"], "num_images": 1,
                    "output_format": "png", "image_urls": [data_uri(r) for r in refs], **PORTRAIT["body"]}
            got = spend(f"portrait {slug}", PORTRAIT["endpoint"], body, cost, out_path)
            if not got:
                break
            res, headers = got
            recipe["images"].append({"what": "portrait", "character": slug, "endpoint": PORTRAIT["endpoint"], "prompt": prompt, "seed": job["seed"],
                                     "request_id": headers.get("x-fal-request-id") or res.get("request_id"), "references": [{"file": str(r.relative_to(ROOT)), "sha256": sha256(r)} for r in refs],
                                     "cost_usd": cost, "file": str(out_path.relative_to(ROOT)), "sha256": sha256(out_path)})
            recipe_p.write_text(json.dumps(recipe, indent=2, ensure_ascii=False) + "\n")
            print(f"portrait {slug}: ${cost}; total ${ledger['spent_usd']:.4f}", flush=True)
        print(f"portraits: ${total:.4f}{'' if args.run else ' (estimate, nothing called)'}")
        return

    rows = []
    for iid in ids:
        job = jobs[iid]
        row = {"id": iid, "orig": str((IMG / f"chapter-{job['chapter']}" / f"{iid}.png").relative_to(OUT.parent.parent)), "ways": {}}
        for way in args.ways:
            refs, prompt, dropped = plan(job, way, style)
            cost = cost_of(WAYS[way]["price"], job["width"], job["height"], refs)
            total += cost
            out_path = OUT / f"{iid}.{way}.png"
            row["ways"][way] = {"file": out_path.name, "prompt": prompt, "refs": [r.name for r in refs], "dropped": dropped, "cost": cost}
            if not args.run:
                print(f"{iid} way {way} ({len(refs)} refs: {', '.join(r.name for r in refs)}; ${cost}){' [' + dropped + ']' if dropped else ''}:\n  {prompt}\n")
                continue
            missing = [r.name for r in refs if not r.exists()]
            if missing:
                print(f"{iid} {way}: skipped, missing {', '.join(missing)} (run --portraits first for way a)")
                continue
            if out_path.exists():
                continue
            body = {"prompt": prompt, "image_size": {"width": job["width"], "height": job["height"]}, "seed": job["seed"], "num_images": 1,
                    "output_format": "png", "image_urls": [data_uri(r) for r in refs], **WAYS[way]["body"]}
            got = spend(f"{iid} {way}", WAYS[way]["endpoint"], body, cost, out_path)
            if not got:
                break
            res, headers = got
            recipe["images"].append({"what": "trial", "image": iid, "way": way, "endpoint": WAYS[way]["endpoint"], "settings": WAYS[way]["body"],
                                     "prompt": prompt, "seed": job["seed"], "width": job["width"], "height": job["height"], "dropped": dropped,
                                     "request_id": headers.get("x-fal-request-id") or res.get("request_id"),
                                     "references": [{"file": str(r.relative_to(ROOT)), "sha256": sha256(r)} for r in refs],
                                     "cost_usd": cost, "file": str(out_path.relative_to(ROOT)), "sha256": sha256(out_path)})
            recipe_p.write_text(json.dumps(recipe, indent=2, ensure_ascii=False) + "\n")
            print(f"{iid} {way}: ${cost}; total ${ledger['spent_usd']:.4f}", flush=True)
        rows.append(row)
    if args.run:
        page(rows, args.ways)
        composites(rows, args.ways)
    print(f"trial: ${total:.4f} for {len(ids)} images x {len(args.ways)} ways{'' if args.run else ' (estimate, nothing called)'}")


def composites(rows, ways):
    """images-out/trial/side-by-side/<id>.jpg: original | a / b | c in one picture each, labelled, no scores,
    for looking at on a phone (the owner's Drive)."""
    from PIL import ImageDraw
    out = OUT / "side-by-side"
    out.mkdir(exist_ok=True)
    names = {"orig": "original (published)", "a": "(a) klein 4B + portraits", "b": "(b) klein base 4B, 28 steps",
             "b8": "(b8) klein 4B, 8 steps", "c": "(c) Qwen-Image-Edit-2511, full sheet",
             "c2": "(c, v2) Qwen-Image-Edit-2511, front-view crop"}
    for r in rows:
        cells = [("orig", IMG / r["orig"].removeprefix("images-out/"))] + [(w, OUT / r["ways"][w]["file"]) for w in ways]
        tiles = []
        for key, f in cells:
            im = Image.open(f).convert("RGB").resize((768, 432)) if f.exists() else Image.new("RGB", (768, 432), "#ddd")
            d = ImageDraw.Draw(im)
            d.rectangle([0, 0, 768, 30], fill=(0, 0, 0))
            d.text((10, 8), names[key] + ("" if f.exists() else ": not made"), fill=(255, 230, 0))
            tiles.append(im)
        cols = 2 if len(tiles) <= 4 else 3
        sheet = Image.new("RGB", (776 * cols - 8, 440 * ((len(tiles) + cols - 1) // cols)), "white")
        for k, t in enumerate(tiles):
            sheet.paste(t, ((k % cols) * 776, (k // cols) * 440))
        sheet.save(out / f"{r['id']}.jpg", quality=86)


def page(rows, ways):
    """images-out/trial/index.html: each image's original and its redraws in one row, prompts folded."""
    cells = lambda r: "".join(
        f"<figure><img src='{html.escape(r['ways'][w]['file'])}' alt='{w}'><figcaption><b>{w}</b> {html.escape(WAYS[w]['model'])}"
        f"{' · ' + html.escape(r['ways'][w]['dropped']) if r['ways'][w]['dropped'] else ''}"
        f"<details><summary>prompt</summary>{html.escape(r['ways'][w]['prompt'])}</details></figcaption></figure>" for w in ways)
    body = "".join(f"<h2>{html.escape(r['id'])}</h2><div class='row'><figure><img src='../{html.escape(r['orig'].removeprefix('images-out/'))}' alt='original'>"
                   f"<figcaption><b>original</b> published, klein 4B, 4 steps</figcaption></figure>{cells(r)}</div>" for r in rows)
    (OUT / "index.html").write_text(
        "<!doctype html><meta charset='utf-8'><title>Consistency trial (owner-only)</title>"
        "<style>body{font:14px system-ui;margin:16px}.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px}"
        "img{width:100%;height:auto;background:#eee}figure{margin:0}details{font-size:12px;color:#555}</style>"
        "<h1>Consistency trial: the ten found by eye, side by side</h1><p>Owner-only. Nothing here is published. Same seed and size as the original.</p>" + body)


if __name__ == "__main__":
    main()
