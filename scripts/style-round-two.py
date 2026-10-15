"""Style test, round two: the owner's top styles on four more frames, faces locked, plus a motion test each.

  python3 scripts/style-round-two.py fifteen-days <slug> [<slug> ...] [--cap 1.0] [--stage all|jobs|klein|z|motion|page]

For each chosen style (the owner's stars on the round-one page, collection "marks"):
- klein: four new frames on FLUX.2 [klein] 4B, locally (scripts/illustrate.py), with the character
  sheets (images-out/cast/*-sheet.png, checked against content/snowmoon/recipes/images/cast.json)
  as reference images, so the faces hold from frame to frame. Free.
- z: the same four frames on Z-Image Turbo (the round-one model, hosted on fal) with no references,
  so the page shows what locking the faces did to the style. About $0.005 a frame.
- motion: one cheap clip per style from its gate frame, LongCat-Video distilled at 480p on fal
  ($0.005 a second as listed, 5 s). The cost is counted before each call against --cap.

Frame subjects and the motion prompt are model-drafted test prompts, labelled in the recipes; the
style prompts are round one's. Nothing here is published; the page is an owner-only artifact.
Heavy local stages wait while the take pipeline (split-takes / convert-voice) runs: one big model at a
time on the 8 GB Mac.
"""

import argparse
import base64
import hashlib
import html
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
IMG_PY = "/Users/nathan/snowmoon/.venv-image/bin/python"
DESIGNS = ROOT / "content" / "snowmoon" / "designs"
LONGCAT = {"endpoint": "fal-ai/longcat-video/distilled/image-to-video/480p", "price_usd_per_second": 0.005,
           "price_seen": "config/models.json longcat-video, 2026-10-13", "weights": "https://huggingface.co/meituan-longcat/LongCat-Video",
           "license": "MIT", "num_frames": 75, "fps": 15}
ASSIST = {"model": "claude-coding-agent", "by": "the coding agent", "drafted": ["frame subjects", "motion prompt", "reference choices"],
          "note": "test prompts for a style test, never published; the style prompts are round one's", "see": "config/models.json drafting; principle 3"}

# Four new moments from the script (draft 1 as edited), chosen to show faces in different light and framing.
FRAMES = [
    {"id": "f4-corridor", "name": "The corridor, three together", "seed": 404, "cast": ["deluin", "zei", "bai"], "place": None,
     "scene": "Three eighteen-year-olds stand together in a bright corridor outside a game hall just after a match: on the left the tall pale young man smiles, relaxed; in the middle the slim spiky-haired young man grins and talks with his hands; on the right the young woman folds her arms, unimpressed. Medium shot at eye level."},
    {"id": "f5-menu", "name": "The robot's menu", "seed": 505, "cast": ["zei", "deluin"], "place": "courtyard-cafe",
     "scene": "At a small table in an open-air courtyard cafe, two young men lean over a glowing menu screen held up by a little wheeled serving robot; the spiky-haired one stares at it in wonder, the tall pale one looks on, curious. The screen shows only abstract glowing shapes. Medium close shot."},
    {"id": "f6-headphones", "name": "Bai: \"Dreadnaught!\"", "seed": 606, "cast": ["bai", "zei", "deluin"], "place": "courtyard-cafe",
     "scene": "At a cafe table a young woman pulls one side of a pair of big headphones away from her ear and shouts across to the next table, grinning, a handheld game device in her other hand; behind her, softer, two young men at the next table turn to look. Medium shot."},
    {"id": "f7-gate", "name": "The gate at dusk", "seed": 707, "cast": ["deluin", "zei"], "place": "courtyard-cafe",
     "scene": "Dusk at the gate of an open-air courtyard cafe, the lamps just coming on. The tall pale young man stands alone in the foreground looking down at a small handheld device in his hand, his thumb hovering; far behind him, the slim spiky-haired young man walks away toward a table. Wide shot."},
]
MOTION_FRAME = "f7-gate"
MOTION_PROMPT = "The young man in the foreground hesitates, then taps the device once and lowers it; far behind him the other young man keeps walking away; the lamps glow a little brighter. Still camera, gentle natural movement."
NO_TEXT = "No text, no lettering, no signs with words, no logos, no numbers."


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def descriptor(kind: str, slug: str) -> str:
    return json.loads((DESIGNS / kind / f"{slug}.json").read_text())["descriptor"]


def wait_for_takes() -> None:
    while subprocess.run(["pgrep", "-f", "split-takes.py|convert-voice.py"], capture_output=True).returncode == 0:
        print("  waiting: the take pipeline is running", flush=True)
        time.sleep(120)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("styles", nargs="+")
    ap.add_argument("--cap", type=float, default=1.0)
    ap.add_argument("--stage", default="all", choices=["all", "jobs", "klein", "z", "motion", "page"])
    args = ap.parse_args()
    seed = args.seed
    r1 = json.loads((ROOT / "adaptations" / seed / "style-test" / "jobs.json").read_text())
    by_slug = {s["slug"]: s for s in r1["styles"]}
    unknown = [s for s in args.styles if s not in by_slug]
    if unknown:
        raise SystemExit(f"not round-one styles: {unknown}")
    styles = [by_slug[s] for s in args.styles]
    d = ROOT / "adaptations" / seed / "style-test-2"
    d.mkdir(parents=True, exist_ok=True)

    # The faces: the current character sheets, as recorded in the cast recipe.
    cast_rec = {e["id"]: e for e in json.loads((ROOT / "content/snowmoon/recipes/images/cast.json").read_text())["images"]}
    for c in ("zei", "deluin", "bai"):
        p = ROOT / "images-out" / "cast" / f"{c}-sheet.png"
        if not p.exists() or sha256(p) != cast_rec[f"{c}-sheet"]["sha256"]:
            raise SystemExit(f"{p.relative_to(ROOT)} is missing or doesn't match the cast recipe")

    klein_file = d / f"{seed}-round-two.json"
    z_file = d / "jobs.json"
    if args.stage in ("all", "jobs"):
        kjobs, zjobs = [], []
        for st in styles:
            for fr in FRAMES:
                place = f" The place: {descriptor('locations', fr['place'])}." if fr["place"] else ""
                kjobs.append({"id": f"r2-{st['slug']}-{fr['id']}", "style": {"prompt": st["prompt"]}, "style_slug": st["slug"],
                              "frame": fr["id"], "prompt": fr["scene"] + place, "characters": [f"designs/characters/{c}.json" for c in fr["cast"]],
                              "references": [f"cast/{c}-sheet" for c in fr["cast"]], "seed": fr["seed"], "width": 1024, "height": 576})
                people = " ".join(f"{descriptor('characters', c)[0].upper()}{descriptor('characters', c)[1:]}." for c in fr["cast"])
                zjobs.append({"id": f"r2z-{st['slug']}-{fr['id']}", "model": "z", "beat": fr["id"], "attempt": 1, "style": st["slug"], "frame": fr["id"],
                              "prompt": f"{fr['scene']}\n\n{st['prompt']}\n\nThe people: {people}{place}\n\n{NO_TEXT}", "seed": fr["seed"], "width": 1024, "height": 576})
        about = (f"Style test, round two (owner, 2026-10-14): the owner's starred styles ({', '.join(args.styles)}) on four more frames. "
                 "Frame subjects are model-drafted test prompts, labelled, never published; style prompts are round one's; no artist or studio is named.")
        klein_file.write_text(json.dumps({"about": about + " FLUX.2 [klein] with the character sheets as references, to lock the faces.",
                                          "style": {"prompt": "(each job carries its own style)"}, "jobs": kjobs, "assist": ASSIST}, indent=2, ensure_ascii=False) + "\n")
        z_file.write_text(json.dumps({"about": about + " Z-Image Turbo with no references, for comparison.", "cap_usd": args.cap,
                                      "models": r1["models"], "styles": styles, "frames": FRAMES, "jobs": zjobs, "assist": ASSIST}, indent=2, ensure_ascii=False) + "\n")
        print(f"jobs: {len(kjobs)} klein, {len(zjobs)} z")

    if args.stage in ("all", "z"):
        subprocess.run([IMG_PY, "scripts/fal-render.py", str(z_file)], cwd=ROOT, check=True)

    if args.stage in ("all", "klein"):
        wait_for_takes()
        subprocess.run([IMG_PY, "scripts/illustrate.py", str(klein_file)], cwd=ROOT, check=True)

    if args.stage in ("all", "motion"):
        motion(seed, styles, d, args.cap)

    if args.stage in ("all", "page"):
        page(seed, styles, d)


def motion(seed: str, styles: list, d: Path, cap: float) -> None:
    import importlib
    fal = importlib.import_module("fal-render")
    key = fal.fal_key()
    if not key:
        raise SystemExit("FAL_KEY is not set; no motion test")
    ledger_path = ROOT / "images-out" / "style-test-2" / "ledger.json"
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {"cap_usd": cap, "spent_usd": 0.0, "calls": []}
    rec_path = d / "motion-recipe.json"
    rec = json.loads(rec_path.read_text()) if rec_path.exists() else {"about": "One cheap motion test per style (round two). The prompt is model-drafted, labelled; never published.", "assist": ASSIST, "clips": []}
    done = {c["id"] for c in rec["clips"]}
    out = ROOT / "images-out" / "style-test-2-motion"
    out.mkdir(parents=True, exist_ok=True)
    seconds = LONGCAT["num_frames"] / LONGCAT["fps"]
    for st in styles:
        cid = f"r2m-{st['slug']}"
        src = ROOT / "images-out" / f"{seed}-round-two" / f"r2-{st['slug']}-{MOTION_FRAME}.png"
        if cid in done or not src.exists():
            print(f"{cid}: {'done' if cid in done else 'no source frame yet'}")
            continue
        cost = round(max(seconds, 5) * LONGCAT["price_usd_per_second"] * 1.0, 4)
        if ledger["spent_usd"] + cost > cap:
            print(f"{cid}: refused, would pass the ${cap} cap (spent ${ledger['spent_usd']})")
            continue
        ledger["spent_usd"] = round(ledger["spent_usd"] + cost, 4)
        ledger["calls"].append({"id": cid, "endpoint": LONGCAT["endpoint"], "cost_usd": cost, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
        ledger_path.write_text(json.dumps(ledger, indent=2) + "\n")
        body = {"image_url": "data:image/png;base64," + base64.b64encode(src.read_bytes()).decode(), "prompt": MOTION_PROMPT,
                "num_frames": LONGCAT["num_frames"], "fps": LONGCAT["fps"], "seed": 7, "enable_prompt_expansion": False,
                "video_output_type": "X264 (.mp4)", "video_quality": "high"}
        res, headers = fal.call(LONGCAT["endpoint"], body, key)
        path = out / f"{cid}.mp4"
        subprocess.run(["curl", "-sS", "--fail", "-o", str(path), res["video"]["url"]], check=True, timeout=300)
        rec["clips"].append({"id": cid, "style": st["slug"], "from_frame": {"file": str(src.relative_to(ROOT)), "sha256": sha256(src)},
                             "host": "fal.ai", "endpoint": LONGCAT["endpoint"], "weights": LONGCAT["weights"], "license": LONGCAT["license"],
                             "weights_revision": "not exposed by the host; the endpoint as served on the date below",
                             "request_id": headers.get("x-fal-request-id") or res.get("request_id"), "served_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                             "prompt": MOTION_PROMPT, "seed": res.get("seed", 7), "num_frames": LONGCAT["num_frames"], "fps": LONGCAT["fps"],
                             "enable_prompt_expansion": False, "safety_checker": "host default (on)",
                             "price_usd_per_second": LONGCAT["price_usd_per_second"], "price_seen": LONGCAT["price_seen"], "cost_usd": cost,
                             "cost_basis": "seconds of video (at least 5) times the listed price", "file": str(path.relative_to(ROOT)), "sha256": sha256(path)})
        rec_path.write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")
        print(f"{cid}: {path.name}, ${cost}; total ${ledger['spent_usd']}", flush=True)


def page(seed: str, styles: list, d: Path) -> None:
    out = ROOT / "scenes-out" / seed / "style-test-2-page"
    for sub in ("frames", "clips", "refs"):
        (out / sub).mkdir(parents=True, exist_ok=True)

    def jpg(src: Path, name: str, width: int = 1024) -> str | None:
        if not src.exists():
            return None
        dst = out / "frames" / f"{name}.jpg"
        if not dst.exists():
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", f"scale={width}:-2", "-q:v", "4", str(dst)], check=True)
        return f"frames/{name}.jpg"

    for c in ("zei", "deluin", "bai"):
        dst = out / "refs" / f"{c}.jpg"
        if not dst.exists():
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ROOT / "images-out/cast" / f"{c}-sheet.png"), "-vf", "scale=640:-2", "-q:v", "4", str(dst)], check=True)
    zrec = d / "recipe.json"
    spent = json.loads(zrec.read_text()).get("spent_usd", 0) if zrec.exists() else 0
    mrec = json.loads((d / "motion-recipe.json").read_text()) if (d / "motion-recipe.json").exists() else {"clips": []}
    rows = []
    for st in styles:
        r1 = [{"name": f["name"], "src": jpg(ROOT / "images-out/style-test" / f"st-{st['slug']}-{f['id']}.png", f"r1-{st['slug']}-{f['id']}", 640)}
              for f in json.loads((ROOT / "adaptations" / seed / "style-test" / "jobs.json").read_text())["frames"]]
        frames = [{"id": f["id"], "name": f["name"], "cast": f["cast"],
                   "locked": jpg(ROOT / "images-out" / f"{seed}-round-two" / f"r2-{st['slug']}-{f['id']}.png", f"r2-{st['slug']}-{f['id']}"),
                   "free": jpg(ROOT / "images-out/style-test-2" / f"r2z-{st['slug']}-{f['id']}.png", f"r2z-{st['slug']}-{f['id']}")} for f in FRAMES]
        clip = next((c for c in mrec["clips"] if c["style"] == st["slug"]), None)
        if clip:
            dst = out / "clips" / f"{st['slug']}.mp4"
            if not dst.exists():
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ROOT / clip["file"]), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-crf", "26", str(dst)], check=True)
        rows.append({"slug": st["slug"], "name": st["name"], "prompt": st["prompt"], "round1": r1, "frames": frames,
                     "clip": f"clips/{st['slug']}.mp4" if clip else None, "clip_frame": MOTION_FRAME})
    spent = round(spent + sum(c["cost_usd"] for c in mrec["clips"]), 4)
    data = {"rows": rows, "spent": spent, "motion_prompt": MOTION_PROMPT, "made": datetime.now().strftime("%-d %b, %H:%M")}
    (out / "index.html").write_text(TEMPLATE.replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/")))
    print(f"{out.relative_to(ROOT)}/index.html: {len(rows)} styles, ${spent}")


TEMPLATE = r"""<title>Style test round two</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=DM+Mono:wght@400;500&display=swap">
<style>
/* Phone-first: one column of styles; each style shows its four locked frames full width, a tap swaps to the unlocked version. */
:root {
  --paper: #f3f1ec; --ink: #1d1b18; --muted: #6b665d; --rule: #d9d4c9; --card: #fbfaf7;
  --mark: #c2410c; --mark-soft: #fde7d9;
  --reading: "Crimson Pro", Georgia, serif; --label: "DM Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper: #161614; --ink: #e7e4dd; --muted: #9c988e; --rule: #33322e; --card: #1e1d1a; --mark: #f08a5d; --mark-soft: #3a2419; color-scheme: dark; } }
:root[data-theme="dark"] { --paper: #161614; --ink: #e7e4dd; --muted: #9c988e; --rule: #33322e; --card: #1e1d1a; --mark: #f08a5d; --mark-soft: #3a2419; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--reading); font-size: 17px; line-height: 1.45; }
main { max-width: 1100px; margin: 0 auto; padding: 20px 16px 64px; }
h1 { font-weight: 600; font-size: 28px; margin: 0 0 6px; }
h2 { font-weight: 600; font-size: 24px; margin: 0; }
.label { font-family: var(--label); font-size: 12px; color: var(--muted); letter-spacing: .02em; }
.lede { color: var(--muted); max-width: 62ch; }
nav { position: sticky; top: 0; z-index: 2; background: var(--paper); border-bottom: 1px solid var(--rule); padding: 8px 0; display: flex; gap: 8px; overflow-x: auto; }
nav a { font-family: var(--label); font-size: 13px; color: var(--ink); white-space: nowrap; padding: 6px 10px; border: 1px solid var(--rule); border-radius: 4px; text-decoration: none; }
section.style { border-top: 1px solid var(--rule); padding: 28px 0 8px; scroll-margin-top: 48px; }
.grid { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 14px; }
@media (min-width: 760px) { .grid { grid-template-columns: 1fr 1fr; } }
figure { margin: 0; background: var(--card); border-radius: 6px; overflow: hidden; }
figure img, figure video { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; background: var(--rule); }
figcaption { padding: 8px 10px; display: flex; justify-content: space-between; gap: 8px; align-items: baseline; flex-wrap: wrap; }
button.swap { font-family: var(--label); font-size: 12px; border: 1px solid var(--mark); color: var(--mark); background: transparent; border-radius: 4px; padding: 6px 10px; cursor: pointer; }
figure.free button.swap { background: var(--mark); color: var(--card); }
.missing { aspect-ratio: 16 / 9; display: grid; place-items: center; color: var(--muted); font-family: var(--label); font-size: 12px; background: var(--rule); }
.strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 10px; }
.strip img { width: 100%; display: block; border-radius: 4px; aspect-ratio: 16 / 9; object-fit: cover; }
details { margin-top: 12px; } summary { cursor: pointer; font-family: var(--label); font-size: 13px; }
details p { font-size: 15px; color: var(--muted); }
.refs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 12px 0 4px; }
.refs img { width: 100%; border-radius: 4px; display: block; }
</style>
<main>
  <p class="label">Fifteen Days · owner only · not published</p>
  <h1>Style test, round two</h1>
  <p class="lede" id="lede"></p>
  <details><summary>The face references (cast sheets)</summary>
    <div class="refs"><img src="refs/zei.jpg" alt="Zei's character sheet"><img src="refs/deluin.jpg" alt="Deluin's character sheet"><img src="refs/bai.jpg" alt="Bai's character sheet"></div>
  </details>
  <nav id="nav" aria-label="Styles"></nav>
  <div id="rows"></div>
</main>
<script>
const DATA = __DATA__;
const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
$('lede').textContent = `Your top ${DATA.rows.length} styles on four new frames. Each frame is drawn with the character sheets as references, to hold the faces (FLUX.2 klein, on the Mac). Tap “Without references” to see the same frame as round one drew it (Z-Image, no references), which shows what locking the faces did to the style. Each style ends with a five-second motion test (LongCat, 480p). Frame subjects and the motion prompt are model-drafted test prompts. Made ${DATA.made}; $${DATA.spent.toFixed(3)} spent.`;
for (const r of DATA.rows) {
  $('nav').append(el('a', { href: '#' + r.slug, textContent: r.name }));
  const sec = el('section', { className: 'style', id: r.slug });
  sec.append(el('h2', { textContent: r.name }));
  const grid = el('div', { className: 'grid' });
  for (const f of r.frames) {
    const fig = el('figure');
    const show = free => {
      fig.className = free ? 'free' : '';
      const src = free ? f.free : f.locked;
      const media = src ? el('img', { src, alt: `${f.name}, ${r.name}, ${free ? 'without references' : 'faces locked'}`, loading: 'lazy' }) : el('div', { className: 'missing', textContent: 'not made yet' });
      const btn = el('button', { className: 'swap', textContent: free ? 'Without references ✓' : 'Without references' });
      btn.setAttribute('aria-pressed', free ? 'true' : 'false');
      btn.onclick = () => show(!free);
      fig.replaceChildren(media, el('figcaption', {}, el('span', { className: 'label', textContent: `${f.name} · ${free ? 'Z-Image, no references' : 'klein, faces locked'}` }), btn));
    };
    show(false);
    grid.append(fig);
  }
  const vid = r.clip ? el('video', { src: r.clip, muted: true, loop: true, autoplay: true, playsInline: true, controls: true, preload: 'metadata' }) : el('div', { className: 'missing', textContent: 'motion test not made yet' });
  if (r.clip) vid.setAttribute('playsinline', '');
  grid.append(el('figure', {}, vid, el('figcaption', {}, el('span', { className: 'label', textContent: 'Motion test · from the gate frame · 5 s, 480p' }))));
  sec.append(grid);
  const d1 = el('details', {}, el('summary', { textContent: 'Round one in this style' }));
  const strip = el('div', { className: 'strip' });
  for (const x of r.round1) strip.append(x.src ? el('img', { src: x.src, alt: `${x.name}, round one`, loading: 'lazy' }) : el('div', { className: 'missing', textContent: '—' }));
  d1.append(strip);
  const d2 = el('details', {}, el('summary', { textContent: 'The style prompt' }), el('p', { textContent: r.prompt }));
  sec.append(d1, d2);
  $('rows').append(sec);
}
const dm = el('details', {}, el('summary', { textContent: 'The motion prompt (model-drafted)' }), el('p', { textContent: DATA.motion_prompt }));
$('rows').append(dm);
</script>
"""

if __name__ == "__main__":
    main()
