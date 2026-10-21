"""Assemble an adaptation: the video (panels and narration, simple cuts) and the page's panel list.

Inputs, all committed:
  adaptations/<seed>/picks.json             the locked pictures, in beat order (a beat may have several)
  adaptations/<seed>/narration/recipe.json  the narration, one file per beat (scripts/narrate-adaptation.py)

Timing comes from the audio, never by hand: each beat lasts LEAD + its
narration + TAIL; a beat with no narration holds for HOLD. A beat with two
images cuts from the first to the second at the midpoint of its narration.

Outputs:
  images-out/adaptation-<seed>/video/<seed>.mp4   1920x1080, 30 fps, H.264 + AAC (gitignored)
  adaptations/<seed>/video/recipe.json            the timeline, every input by sha256, the ffmpeg
                                                  version and command, the output's sha256
  adaptations/<seed>/panels.json                  the page's images: planned media URLs (by sha256),
                                                  size, alt text, recipe link. "uploaded": false until
                                                  the owner has watched the video and it is published.

  .venv/bin/python scripts/assemble-adaptation.py dog-dawn
"""

import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
REPO_URL = "https://github.com/We-Are-Lum/snowmoon"
MEDIA = "https://media.snowmoon.party"
W, H, FPS, SR = 1920, 1080, 30, 24000
LEAD, TAIL, HOLD = 0.6, 0.9, 3.0


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    seed = sys.argv[1]
    base = ROOT / "adaptations" / seed
    picks = json.loads((base / "picks.json").read_text())["images"]
    rec_path = base / "narration" / "recipe.json"
    narration = {b["beat"]: b for b in json.loads(rec_path.read_text())["beats"]} if rec_path.exists() else {}
    beats = sorted({p["beat"] for p in picks})
    out_dir = ROOT / "images-out" / f"adaptation-{seed}" / "video"
    out_dir.mkdir(parents=True, exist_ok=True)

    timeline, audio, t = [], [], 0.0
    for b in beats:
        imgs = sorted([p for p in picks if p["beat"] == b], key=lambda p: p["order"])
        n = narration.get(b)
        if n:
            wav, sr = sf.read(ROOT / n["file"], dtype="float32")
            assert sr == SR, f"beat {b}: sample rate {sr}"
            speech = len(wav) / SR
            dur = LEAD + speech + TAIL
            audio += [np.zeros(int(LEAD * SR), np.float32), wav, np.zeros(int(TAIL * SR), np.float32)]
        else:
            speech, dur = 0.0, HOLD
            audio.append(np.zeros(int(HOLD * SR), np.float32))
        cut = LEAD + speech / 2 if len(imgs) > 1 else None
        shots = []
        for i, p in enumerate(imgs):
            start = 0.0 if i == 0 else cut
            end = dur if i == len(imgs) - 1 else (cut if len(imgs) == 2 else dur * (i + 1) / len(imgs))
            if len(imgs) > 2:
                start = dur * i / len(imgs)
            shots.append({"image": p["file"], "sha256": p["sha256"], "start": round(t + start, 3), "end": round(t + end, 3)})
        timeline.append({"beat": b, "start": round(t, 3), "end": round(t + dur, 3), "narration": n["file"] if n else None,
                         "narration_sha256": n["sha256"] if n else None, "cut_at": round(t + cut, 3) if cut else None, "shots": shots})
        t += dur

    # Audio track, then the video: each still for its exact duration, scaled to 1080p.
    track = out_dir / f"{seed}-audio.wav"
    sf.write(track, np.concatenate(audio), SR, subtype="PCM_16")
    concat = out_dir / f"{seed}-stills.txt"
    lines = []
    for beat in timeline:
        for s in beat["shots"]:
            lines += [f"file '{(ROOT / s['image']).resolve()}'", f"duration {s['end'] - s['start']:.3f}"]
    lines.append(f"file '{(ROOT / timeline[-1]['shots'][-1]['image']).resolve()}'")  # concat demuxer: repeat the last
    concat.write_text("\n".join(lines) + "\n")
    video = out_dir / f"{seed}.mp4"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(concat), "-i", str(track),
           "-vf", f"scale={W}:{H}:flags=lanczos:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,fps={FPS},format=yuv420p",
           "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(video)]
    subprocess.run(cmd, check=True)
    ff = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.splitlines()[0]
    probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(video)],
                                      capture_output=True, text=True, check=True).stdout)

    (base / "video").mkdir(exist_ok=True)
    rec = {
        "about": "The dog-dawn video: the locked pictures, timed by the narration, with simple cuts; beat 8 cuts mid-beat.",
        "inputs": {"picks": f"adaptations/{seed}/picks.json", "picks_sha256": sha256(base / "picks.json"),
                   "narration_recipe": f"adaptations/{seed}/narration/recipe.json" if narration else None,
                   "narration_recipe_sha256": sha256(rec_path) if narration else None},
        "settings": {"width": W, "height": H, "fps": FPS, "lead_s": LEAD, "tail_s": TAIL, "hold_s": HOLD, "codec": "H.264 crf 18 + AAC 192k"},
        "ffmpeg": ff, "command": [c if not c.startswith(str(ROOT)) else str(Path(c).relative_to(ROOT)) for c in cmd],
        "timeline": timeline,
        "duration_s": round(float(probe["format"]["duration"]), 3),
        "output": {"file": str(video.relative_to(ROOT)), "sha256": sha256(video)},
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "cost_usd": 0,
        "assist": None,
    }
    (base / "video" / "recipe.json").write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")

    panels = []
    for p in sorted(picks, key=lambda p: (p["beat"], p["order"])):
        f = ROOT / p["file"]
        w, h = map(int, subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                         "-of", "csv=p=0:s=x", str(f)], capture_output=True, text=True, check=True).stdout.strip().split("x"))
        ext = f.suffix
        panels.append({"beat": p["beat"], "order": p["order"], "url": f"{MEDIA}/adaptations/{seed}/b{p['beat']:02d}-{p['order']}-{p['sha256'][:12]}{ext}",
                       "sha256": p["sha256"], "width": w, "height": h, "alt": p["alt"], "recipe": f"{REPO_URL}/blob/main/{p['recipe']}"})
    (base / "panels.json").write_text(json.dumps({"uploaded": False, "panels": panels}, indent=2, ensure_ascii=False) + "\n")
    print(f"video {video.relative_to(ROOT)}: {rec['duration_s']} s, {len(timeline)} beats; panels.json: {len(panels)} images (not uploaded)")


if __name__ == "__main__":
    main()
