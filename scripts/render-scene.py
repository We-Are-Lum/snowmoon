"""Render a scene's video from its mix recipe: stills with camera moves, cuts and dissolves,
lettering on cue, and the mixed audio, as one 1080p file.

docs/adaptation-format.md, stage 3 (animatic). Reads only the resolved timeline in the mix recipe
(scripts/mix-scene.py), never timeline.json, so the picture follows the measured audio.

Shots. Each shot's "move" goes from a framing to a framing over the shot's time:
  {"kind": "push", "from": {"x": 0.5, "y": 0.5, "zoom": 1.0}, "to": {...}, "ease": "inout" | "linear"}
x and y are the frame's centre as fractions of the image; zoom 1 is the largest 16:9 frame the
image holds. The frame is kept inside the image. Every frame is resampled once from the source
(Lanczos, sub-pixel box), so slow moves stay smooth. A "dissolve" transition blends the outgoing
shot into the incoming one over its seconds, starting at the incoming shot's start; a "cut" is hard.

Lettering on cue. A record names a lettering item in an illustration job file (job_file, job,
item) and a shot; it is drawn in code by scripts/letter-images.py's draw_item, at twice the
image's size so it stays sharp when the camera pushes in, moves with the image, and fades in over
fade_s from its start. Text never comes from the timeline.

Output: scenes-out/<seed>/video/<seed>.mp4 (gitignored): H.264 (crf 18, yuv420p) and AAC 256k,
with +faststart. The render recipe (inputs by sha256, settings, command, the output's sha256, its
measured duration and loudness) goes next to the mix recipe's folder: adaptations/<seed>/video/
recipe.json, or scenes-out/<seed>/video/recipe.json for a placeholder timeline.

  python scripts/render-scene.py dog-dawn [--from 50 --to 70] [--stand-ins]

--stand-ins (placeholder timelines only): a still that isn't on this machine (the dog-dawn panels
are gitignored) is drawn as a grey card naming the shot and the missing file, so the whole chain
runs from a fresh clone. The recipe marks each one; a real scene refuses the flag.
"""

import argparse
import hashlib
import importlib.util
import json
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LETTER_SCALE = 2


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def letter_module():
    spec = importlib.util.spec_from_file_location("letter_images", ROOT / "scripts" / "letter-images.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def ease(p: float, kind: str) -> float:
    p = min(1.0, max(0.0, p))
    return p * p * (3 - 2 * p) if kind == "inout" else p


def frame_box(size: tuple[int, int], f: dict, aspect: float) -> tuple[float, float, float, float]:
    """The source rectangle for a framing, inside the image."""
    W, H = size
    bw, bh = (W, W / aspect) if W / H <= aspect else (H * aspect, H)
    w, h = bw / f["zoom"], bh / f["zoom"]
    cx = min(max(f["x"] * W, w / 2), W - w / 2)
    cy = min(max(f["y"] * H, h / 2), H - h / 2)
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


def stand_in(s: dict) -> Image.Image:
    """A grey card for a still that isn't on this machine (--stand-ins, placeholder timelines only)."""
    img = Image.new("RGB", (1920, 1080), (96, 100, 108))
    d = ImageDraw.Draw(img)
    try:
        big, small = ImageFont.truetype(str(CARD_FACES["label"]), 64), ImageFont.truetype(str(CARD_FACES["label"]), 32)
    except OSError:
        big = small = ImageFont.load_default()
    for x in range(0, 1920, 120):  # a grid, so camera moves show
        d.line([(x, 0), (x, 1080)], fill=(110, 114, 122), width=2)
    for y in range(0, 1080, 120):
        d.line([(0, y), (1920, y)], fill=(110, 114, 122), width=2)
    d.text((960, 470), f"STAND-IN · shot {s['id']}", font=big, fill=(240, 240, 240), anchor="mm")
    d.text((960, 570), f"missing: {s['image']}", font=small, fill=(220, 220, 220), anchor="mm")
    return img


class Shot:
    def __init__(self, s: dict, out: tuple[int, int], letters: list[dict], L, stand_ins: bool = False):
        self.s, self.out = s, out
        self.stand_in = stand_ins and not (ROOT / s["image"]).exists()
        self.img = stand_in(s) if self.stand_in else Image.open(ROOT / s["image"]).convert("RGB")
        self.letters = []
        for l in letters:
            jobs = json.loads((ROOT / l["job_file"]).read_text())
            jobs = jobs["jobs"] if isinstance(jobs, dict) else jobs
            item = next(j for j in jobs if j["id"] == l["job"])["lettering"][l["item"]]
            layer = Image.new("RGBA", (self.img.width * LETTER_SCALE, self.img.height * LETTER_SCALE), (0, 0, 0, 0))
            L.draw_item(layer, item)
            self.letters.append((l, layer))

    def at(self, t: float) -> Image.Image:
        s, m = self.s, self.s["move"]
        p = ease((t - s["start"]) / max(1e-6, s["end"] - s["start"]), m.get("ease", "inout"))
        f = {k: m["from"][k] + (m["to"][k] - m["from"][k]) * p for k in ("x", "y", "zoom")}
        box = frame_box(self.img.size, f, self.out[0] / self.out[1])
        frame = self.img.resize(self.out, Image.LANCZOS, box=box).convert("RGBA")
        for l, layer in self.letters:
            a = (t - l["start"]) / max(1e-6, l.get("fade_s", 0.3))
            if a <= 0:
                continue
            lay = layer.resize(self.out, Image.LANCZOS, box=tuple(v * LETTER_SCALE for v in box))
            if a < 1:
                lay.putalpha(lay.getchannel("A").point(lambda v: int(v * a)))
            frame.alpha_composite(lay)
        return frame.convert("RGB")


FONTS = ROOT / "node_modules" / "@fontsource"
CARD_FACES = {"title": FONTS / "crimson-pro" / "files" / "crimson-pro-latin-600-normal.woff",
              "text": FONTS / "crimson-pro" / "files" / "crimson-pro-latin-400-normal.woff",
              "label": FONTS / "dm-mono" / "files" / "dm-mono-latin-500-normal.woff"}
CARD_PAPER, CARD_INK, CARD_MUTED = (22, 21, 19), (236, 232, 223), (163, 157, 145)


def wrap(d: ImageDraw.ImageDraw, text: str, font, width: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if d.textlength(trial, font=font) <= width or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    return lines + ([cur] if cur else [])


def end_card(spec: dict, size: tuple[int, int]) -> Image.Image:
    """The end card, drawn in code from adaptations/<seed>/end-card.json: title, labelled sections, links."""
    W, H = size
    img = Image.new("RGB", size, CARD_PAPER)
    d = ImageDraw.Draw(img)
    s = H / 1080
    f_title = ImageFont.truetype(str(CARD_FACES["title"]), round(64 * s))
    f_text = ImageFont.truetype(str(CARD_FACES["text"]), round(30 * s))
    f_label = ImageFont.truetype(str(CARD_FACES["label"]), round(19 * s))
    x, y, width = round(160 * s), round(110 * s), W - round(320 * s)
    d.text((x, y), spec["title"], font=f_title, fill=CARD_INK)
    y += round(110 * s)
    for sec in spec["sections"]:
        d.text((x, y), sec["label"].upper(), font=f_label, fill=CARD_MUTED)
        y += round(30 * s)
        for line in wrap(d, sec["text"], f_text, width):
            d.text((x, y), line, font=f_text, fill=CARD_INK)
            y += round(38 * s)
        y += round(18 * s)
    y = max(y, H - round(150 * s))
    for link in spec["links"]:
        d.text((x, y), link["label"].upper(), font=f_label, fill=CARD_MUTED)
        d.text((x + round(330 * s), y - round(6 * s)), link["shown"], font=f_text, fill=CARD_INK)
        y += round(44 * s)
    return img


def loudness(path: Path) -> dict:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-map", "0:a", "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    tail = r.stderr[r.stderr.rfind("Summary:"):]
    i = re.search(r"I:\s+(-?[\d.]+) LUFS", tail)
    tp = re.search(r"Peak:\s+(-?[\d.]+) dBFS", tail)
    return {"integrated_lufs": float(i.group(1)) if i else None, "true_peak_dbfs": float(tp.group(1)) if tp else None}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("--from", dest="t0", type=float, default=None, help="render only from this second (a preview)")
    ap.add_argument("--to", dest="t1", type=float, default=None, help="render only to this second (a preview)")
    ap.add_argument("--stand-ins", action="store_true", help="placeholder timelines only: draw a card for a still that isn't on this machine")
    args = ap.parse_args()
    seed = args.seed
    timeline = json.loads((ROOT / "adaptations" / seed / "timeline.json").read_text())
    placeholder = bool(timeline.get("placeholder"))
    if args.stand_ins and not placeholder:
        raise SystemExit("--stand-ins is for placeholder timelines only; a real scene renders its own stills")
    mix_rec_path = (ROOT / "scenes-out" / seed / "mix" if placeholder else ROOT / "adaptations" / seed / "mix") / "recipe.json"
    mix_rec = json.loads(mix_rec_path.read_text())
    if mix_rec["timeline_sha256"] != sha256(ROOT / "adaptations" / seed / "timeline.json"):
        raise SystemExit("timeline.json changed since the mix; run scripts/mix-scene.py first")
    R = mix_rec["resolved"]
    mix_wav = ROOT / mix_rec["output"]["file"]
    if sha256(mix_wav) != mix_rec["output"]["sha256"]:
        raise SystemExit("the mix file does not match its recipe; run scripts/mix-scene.py again")
    v = R["video"]
    out_size, fps = (v["width"], v["height"]), v["fps"]

    L = letter_module()
    shots = [Shot(s, out_size, [l for l in R["lettering"] if l["shot"] == s["id"]], L, args.stand_ins) for s in R["shots"]]
    for sh in shots:
        if sh.stand_in:
            print(f"shot {sh.s['id']}: stand-in card ({sh.s['image']} is not on this machine)")
            continue
        if sha256(ROOT / sh.s["image"]) != sh.s["image_sha256"]:
            raise SystemExit(f"shot {sh.s['id']}: {sh.s['image']} is not the image the timeline names")

    card = R.get("end_card")
    card_img = end_card(json.loads((ROOT / card["file"]).read_text()), out_size) if card else None
    if card and sha256(ROOT / card["file"]) != card["file_sha256"]:
        raise SystemExit("the end card changed since the mix; run scripts/mix-scene.py first")

    t0 = args.t0 or 0.0
    t1 = min(args.t1 or R["duration_s"], R["duration_s"])
    preview = args.t0 is not None or args.t1 is not None
    out_dir = ROOT / "scenes-out" / seed / "video"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / (f"{seed}-preview-{t0:g}-{t1:g}.mp4" if preview else f"{seed}.mp4")
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{out_size[0]}x{out_size[1]}", "-r", str(fps), "-i", "-",
           "-ss", f"{t0:.3f}", "-t", f"{t1 - t0:.3f}", "-i", str(mix_wav),
           "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", str(out)]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    began = time.time()
    n0, n1 = round(t0 * fps), round(t1 * fps)
    for n in range(n0, n1):
        t = n / fps
        if card and t >= card["start"]:
            a = (t - card["start"]) / max(1e-6, card["fade_s"])
            frame = card_img if a >= 1 else Image.blend(shots[-1].at(t), card_img, a)
            ff.stdin.write(np.asarray(frame, dtype=np.uint8).tobytes())
            continue
        i = max(k for k, sh in enumerate(shots) if sh.s["start"] <= t + 1e-9) if t >= shots[0].s["start"] else 0
        frame = shots[i].at(t)
        tr = shots[i].s.get("transition", {"type": "cut"})
        if tr["type"] == "dissolve" and i > 0 and t < shots[i].s["start"] + tr["seconds"]:
            a = (t - shots[i].s["start"]) / tr["seconds"]
            frame = Image.blend(shots[i - 1].at(t), frame, a)
        ff.stdin.write(np.asarray(frame, dtype=np.uint8).tobytes())
        if (n - n0) % (fps * 10) == 0:
            print(f"  {t:6.1f} s / {t1:.1f} s ({time.time() - began:.0f} s elapsed)", flush=True)
    ff.stdin.close()
    if ff.wait():
        raise SystemExit("ffmpeg failed")

    probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height,r_frame_rate",
                                       "-of", "json", str(out)], capture_output=True, text=True, check=True).stdout)
    measured = {"duration_s": round(float(probe["format"]["duration"]), 3),
                "streams": [{k: s.get(k) for k in ("codec_name", "width", "height", "r_frame_rate") if s.get(k)} for s in probe["streams"]],
                "loudness": loudness(out)}
    if preview:
        print(f"preview {out.relative_to(ROOT)}: {measured['duration_s']} s")
        return
    rec = {
        "about": f"The video of {seed}: the mix recipe's resolved timeline, rendered frame by frame (moves, cuts, dissolves, lettering on cue).",
        "placeholder": placeholder,
        "mix_recipe": str(mix_rec_path.relative_to(ROOT)), "mix_recipe_sha256": sha256(mix_rec_path),
        "mix": {"file": mix_rec["output"]["file"], "sha256": mix_rec["output"]["sha256"]},
        "images": [{"shot": sh.s["id"], "file": sh.s["image"], "sha256": sh.s["image_sha256"], **({"stand_in": True} if sh.stand_in else {})} for sh in shots],
        "settings": {"width": out_size[0], "height": out_size[1], "fps": fps, "resample": "Lanczos, one pass per frame from the source",
                     "lettering_scale": LETTER_SCALE, "codec": "H.264 crf 18 preset slow yuv420p + AAC 256k"},
        "script": "scripts/render-scene.py",
        "commit": subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip(),
        "ffmpeg": subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.splitlines()[0],
        "command": [c if not c.startswith(str(ROOT)) else str(Path(c).relative_to(ROOT)) for c in cmd],
        "measured": measured,
        "output": {"file": str(out.relative_to(ROOT)), "sha256": sha256(out)},
        "render_seconds": round(time.time() - began, 1),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "cost_usd": 0,
    }
    rec_dir = out_dir if placeholder else ROOT / "adaptations" / seed / "video"
    rec_dir.mkdir(parents=True, exist_ok=True)
    (rec_dir / "recipe.json").write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")
    print(f"video {out.relative_to(ROOT)}: {measured['duration_s']} s, {out_size[0]}x{out_size[1]} at {fps} fps, "
          f"{measured['loudness']['integrated_lufs']} LUFS; rendered in {rec['render_seconds']} s")


if __name__ == "__main__":
    main()
