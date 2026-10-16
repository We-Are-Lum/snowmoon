"""Draw an adaptation's shots on fal.ai with FLUX.2 [klein] 4B, the open weights on the allowlist, under a hard cap.

  .venv-image/bin/python scripts/fal-shots.py fifteen-days [--only s07 s17] [--redraw s07 --why "doubled Zei"] [--cap 5]

The style is adaptations/<seed>/style.json; the shots, their settings and who is in each are
adaptations/<seed>/shots.json. Each prompt says exactly how many people are in the picture and who,
and only those people's references are passed: the front view cropped from each cast sheet
(images-out/cast/front/<id>.png).
A shot with people goes to fal-ai/flux-2/klein/4b/edit (the sheets as data URIs, never uploaded to our
storage); a shot with nobody goes to fal-ai/flux-2/klein/4b. Inserts (no subject) are skipped.

fal serves "FLUX.2 [klein] 4B distilled" (its own description, read 2026-10-15) but does not expose a
weights revision, so each recipe records the allowlist's revision as the one checked, and says so.
The key comes from FAL_KEY (environment or .env.local) and reaches curl on stdin only.

Before each call the cost is added to images-out/shots-<style>/ledger.json and the call is refused if
the total would pass the cap. Each image is costed as the listed price per megapixel times the output
(at least 1 MP) plus every reference image, in case fal bills inputs, so the ledger never undercounts.
Each image's recipe (endpoint, model, weights, licence, prompt, seed, size, reference files and their
sha256, request id, cost, output sha256) goes to adaptations/<seed>/shots-<style>/recipe.json. A redraw
keeps the rejected attempt in the recipe with the reason, and draws again with a new seed.
"""

import argparse
import base64
import hashlib
import importlib.util
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("fal_render", ROOT / "scripts" / "fal-render.py")
fal = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fal)

EDIT, PLAIN = "fal-ai/flux-2/klein/4b/edit", "fal-ai/flux-2/klein/4b"
PRICE = {EDIT: 0.01, PLAIN: 0.005}  # USD per megapixel, fal's pricing API, read 2026-10-15
W, H = 1536, 864
WORDS = {1: "one", 2: "two", 3: "three", 4: "four"}
# Each person's most recognisable look, so the prompt can say nobody else shares it (doubles were the commonest fault).
LOOK = {"zei": "spiky black hair with a blue streak and an orange jacket", "bai": "a magenta ponytail and a lime-green vest",
        "deluin": "wavy light-brown hair and a cream cable-knit sweater"}


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def compose(shot: dict, places: dict, style: dict, chars: dict) -> str:
    n = len(shot["cast"])
    parts = [shot["subject"]]
    if n:
        who = "; ".join(f"reference image {i} shows {chars[c]}" for i, c in enumerate(shot["cast"], 1))
        total = n + len(shot.get("described", []))
        parts.append(f"Exactly {WORDS[total]} main {'person' if total == 1 else 'people'} in the picture: {who}. "
                     "Draw each of them exactly once, with the same face, hair, build and clothing as their reference; "
                     "never repeat a person, and no one else wears their clothes. "
                     + " ".join(f"Only one person in the whole picture has {LOOK[c]}." for c in shot["cast"])
                     + " A single continuous picture, not split into panels.")
    for c in shot.get("described", []):
        # Seen from behind or far off: described in words, no reference image (three references in one
        # shot kept swapping clothes between people).
        parts.append(f"Also in the picture, with no reference image, seen only from behind: {chars[c]}. "
                     f"Only one person in the whole picture has {LOOK[c]}.")
    parts.append(style["others"][shot["others"]] if n else "No people anywhere in the picture.")
    parts.append(f"The place: {places[shot['setting']]['text']}.")
    parts += [style["signs"], style["prompt"], style["no_text"]]
    return " ".join(parts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--redraw", nargs="*", default=[])
    ap.add_argument("--why", default=None, help="why the redrawn frames were rejected (recorded)")
    ap.add_argument("--cap", type=float, default=5.0)
    ap.add_argument("--dry", action="store_true", help="print the prompts and costs; call nothing")
    args = ap.parse_args()
    if args.redraw and not args.why:
        raise SystemExit("--redraw needs --why")
    adir = ROOT / "adaptations" / args.seed
    style = json.loads((adir / "style.json").read_text())
    shots_doc = json.loads((adir / "shots.json").read_text())
    places = shots_doc["places"]
    D = ROOT / "content" / "snowmoon" / "designs" / "characters"
    allow = next(m for m in json.loads((ROOT / "config" / "models.json").read_text())["models"] if m["id"] == "flux2-klein-4b")
    out = ROOT / "images-out" / f"shots-{style['slug']}"
    rdir = adir / f"shots-{style['slug']}"
    out.mkdir(parents=True, exist_ok=True)
    rdir.mkdir(exist_ok=True)
    ledger_p, recipe_p = out / "ledger.json", rdir / "recipe.json"
    ledger = json.loads(ledger_p.read_text()) if ledger_p.exists() else {"cap_usd": args.cap, "spent_usd": 0.0, "calls": []}
    ledger["cap_usd"] = args.cap
    recipe = json.loads(recipe_p.read_text()) if recipe_p.exists() else {
        "about": f"Fifteen Days shots in the style '{style['slug']}' (style.json, {'DRAFT' if style.get('draft') else 'approved'}). "
                 "Shot prompts drafted by the coding agent (shots.json); people described, never named.",
        "model": {"id": allow["id"], "weights": allow["weights"], "revision_checked": allow["revision"], "license": allow["license"],
                  "host": "fal.ai", "endpoints": {EDIT: "with references", PLAIN: "no people"},
                  "host_says": "FLUX.2 [klein] 4B distilled, 4-step (fal's endpoint description, read 2026-10-15)",
                  "weights_revision": "not exposed by fal; the Hugging Face revision above was checked on 2026-10-15 and matches the allowlist"},
        "price_usd_per_megapixel": PRICE, "price_seen": "fal pricing API, 2026-10-15", "images": []}
    current = {e["shot"]: e for e in recipe["images"] if not e.get("rejected")}
    key = None if args.dry else fal.fal_key()
    if not args.dry and not key:
        raise SystemExit("FAL_KEY is not set (environment or .env.local); nothing was called")
    chars = {c: json.loads((D / f"{c}.json").read_text())["descriptor"] for c in ("zei", "bai", "deluin")}

    for i, shot in enumerate(shots_doc["shots"], 1):
        sid = shot["id"]
        wanted = set(args.only or []) | set(args.redraw)
        if not shot.get("subject") or (wanted and sid not in wanted):
            continue
        if sid in current and sid not in args.redraw:
            continue
        attempt = 1 + sum(1 for e in recipe["images"] if e["shot"] == sid)
        seed = 5000 + i + 1000 * (attempt - 1)
        # The front view only (the left third of each cast sheet, images-out/cast/front/): the sheets' three
        # views of one person were drawn as extra people.
        refs = [ROOT / "images-out" / "cast" / "front" / f"{c}.png" for c in shot["cast"]]
        endpoint = EDIT if refs else PLAIN
        prompt = compose(shot, places, style, chars)
        ref_mp = sum(Image.open(r).size[0] * Image.open(r).size[1] for r in refs) / 1e6
        cost = round((max(W * H / 1e6, 1.0) + ref_mp) * PRICE[endpoint], 4)
        if args.dry:
            print(f"{sid} ({len(refs)} refs, ${cost}): {prompt}\n")
            continue
        if ledger["spent_usd"] + cost > args.cap:
            print(f"{sid}: refused, would pass the ${args.cap} cap (spent ${ledger['spent_usd']:.4f})")
            break
        body = {"prompt": prompt, "image_size": {"width": W, "height": H}, "seed": seed, "num_images": 1, "output_format": "png"}
        if refs:
            body["image_urls"] = ["data:image/png;base64," + base64.b64encode(r.read_bytes()).decode() for r in refs]
        ledger["spent_usd"] = round(ledger["spent_usd"] + cost, 4)  # counted before the call, in case it bills and then fails
        ledger["calls"].append({"shot": sid, "attempt": attempt, "endpoint": endpoint, "cost_usd": cost,
                                "at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
        ledger_p.write_text(json.dumps(ledger, indent=2) + "\n")
        res, headers = fal.call(endpoint, body, key)
        img = res["images"][0]
        path = out / f"{sid}-{shot['beat']}.a{attempt}.png"
        subprocess.run(["curl", "-sS", "--fail", "-o", str(path), img["url"]], check=True, timeout=300)
        if sid in args.redraw and sid in current:
            current[sid].update(rejected=True, rejected_because=args.why, rejected_by="the coding agent, looking at the frame (owner's rule, 2026-10-15)")
        entry = {"shot": sid, "beat": shot["beat"], "attempt": attempt, "host": "fal.ai", "endpoint": endpoint,
                 "request_id": headers.get("x-fal-request-id") or res.get("request_id"),
                 "served_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 "prompt": prompt, "seed": res.get("seed", seed), "steps": "host default (4)",
                 "width": img.get("width"), "height": img.get("height"), "people": len(refs) + len(shot.get("described", [])), "cast": shot["cast"],
                 "described_without_reference": shot.get("described", []),
                 "references": [{"file": str(r.relative_to(ROOT)), "sha256": sha256(r),
                                 **({"cropped_from": f"images-out/cast/{r.stem}-sheet.png (left third, 341 x 576)",
                                     "sheet_sha256": sha256(ROOT / "images-out" / "cast" / f"{r.stem}-sheet.png")} if r.parent.name == "front" else {})}
                                for r in refs],
                 "safety_checker": "host default (on)", "has_nsfw_concepts": res.get("has_nsfw_concepts"),
                 "cost_usd": cost, "cost_basis": "listed price x (output MP, at least 1, + every reference's MP)",
                 "file": str(path.relative_to(ROOT)), "sha256": sha256(path)}
        recipe["images"].append(entry)
        current[sid] = entry
        recipe["spent_usd"] = ledger["spent_usd"]
        recipe_p.write_text(json.dumps(recipe, indent=2, ensure_ascii=False) + "\n")
        print(f"{sid} a{attempt}: {path.name}, ${cost}; total ${ledger['spent_usd']:.4f}", flush=True)
    print(f"spent ${ledger['spent_usd']:.4f} of ${args.cap}")


if __name__ == "__main__":
    main()
