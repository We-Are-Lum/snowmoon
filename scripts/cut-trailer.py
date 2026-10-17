"""A 45-60 s trailer for the cast, cut from the rendered coverage cut (owner, 2026-10-17: "propose the moments, no new words").

  python scripts/cut-trailer.py <seed>

Reads scenes-out/<seed>/cuts/coverage/timeline.json and cuts/coverage.mp4, takes the MOMENTS below (each from one shot or
line to another, or the first seconds of a line), joins them with short audio and picture fades, and ends on a title card
drawn in code. Writes scenes-out/<seed>/cuts/trailer.mp4 and trailer.json (the moments, with their times in the cut).
The moments and the card's words are DRAFTED by the coding agent; every spoken word is the scene's own.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# (what, from, to): "shot:<frame id prefix>" starts/ends with a shot, "line:<ref>" with a line; "+s" trims to s seconds after from.
MOMENTS = [
    ("the game", "shot:cov-game-FLOOR", "shot:cov-game-SCREEN"),
    ("Bai on Deluin", "line:b1-2", "line:b1-2"),
    ("the game below, 'Such patience'", "shot:cov-overlook-POV", "line:b1-4"),
    ("the competition", "line:b2-8", "line:b2-9"),
    ("Dzegoban", "line:b3-10", "line:b3-11"),
    ("the wall", "line:b4-4", "shot:cov-cafe-SUGAR-door"),
    ("the invitation", "line:b5-1", "+1.6"),
    ("fifteen days", "line:b5-2", "line:b5-2"),
    ("the vigil", "shot:cov-lobby-CU-Z-down", "shot:cov-lobby-SCREEN"),
]
CARD = ["Fifteen Days", "one scene from Snowmoon by Vitalik Buterin", "Fork the next shot"]  # DRAFTED wording


def main() -> None:
    seed = sys.argv[1]
    cuts = ROOT / "scenes-out" / seed / "cuts"
    tl = json.loads((cuts / "coverage" / "timeline.json").read_text())
    import soundfile as sf
    voice = {c["id"]: (c["at"]["offset"], c["at"]["offset"] + sf.info(ROOT / c["stem"]).duration) for c in tl["cues"] if c["track"] == "voice"}
    shots = tl["shots"]
    starts = [s["at"]["offset"] for s in shots]

    def shot_span(prefix: str, after: float) -> tuple:
        """The first shot at or after `after` whose frame id starts with prefix: its start and end."""
        for i, s in enumerate(shots):
            if s.get("frame", "").startswith(prefix) and starts[i] >= after - 0.01:
                return starts[i], starts[i + 1] if i + 1 < len(shots) else starts[i] + 2
        raise SystemExit(f"no shot {prefix} after {after}")

    out, t_after = [], 0.0
    for what, a, b in MOMENTS:
        if a.startswith("line:"):
            t0 = voice[a[5:]][0] - 0.15
        else:
            t0 = shot_span(a[5:], t_after)[0]
        if b.startswith("+"):
            t1 = t0 + 0.15 + float(b[1:])
        elif b.startswith("line:"):
            t1 = voice[b[5:]][1] + 0.35
        else:
            t1 = shot_span(b[5:], t0)[1]
        out.append({"what": what, "from": round(t0, 2), "to": round(t1, 2)})
        t_after = t0
    total = sum(m["to"] - m["from"] for m in out) + 4.0
    work = cuts / "trailer"
    work.mkdir(exist_ok=True)
    src = cuts / "coverage.mp4"
    parts = []
    for k, m in enumerate(out):
        p = work / f"p{k:02d}.mp4"
        d = m["to"] - m["from"]
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(m["from"]), "-t", str(d), "-i", str(src),
                        "-vf", f"fade=t=in:st=0:d=0.15,fade=t=out:st={d - 0.15}:d=0.15", "-af", f"afade=t=in:d=0.12,afade=t=out:st={d - 0.15}:d=0.15",
                        "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", str(p)], check=True)
        parts.append(p)
    from PIL import Image, ImageDraw, ImageFont
    card = Image.new("RGB", (1920, 1080), (22, 21, 19))
    dr = ImageDraw.Draw(card)
    fonts = ROOT / "node_modules" / "@fontsource" / "crimson-pro" / "files"
    big, small = ImageFont.truetype(str(fonts / "crimson-pro-latin-600-normal.woff"), 110), ImageFont.truetype(str(fonts / "crimson-pro-latin-400-normal.woff"), 46)
    dr.text((960, 430), CARD[0], font=big, fill=(236, 232, 223), anchor="mm")
    dr.text((960, 540), CARD[1], font=small, fill=(163, 157, 145), anchor="mm")
    dr.text((960, 680), CARD[2], font=small, fill=(236, 232, 223), anchor="mm")
    card.save(work / "card.png")
    pc = work / "card.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-t", "4", "-i", str(work / "card.png"), "-f", "lavfi", "-t", "4", "-i", "anullsrc=r=48000:cl=stereo",
                    "-vf", "fade=t=in:st=0:d=0.5", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-shortest", str(pc)], check=True)
    parts.append(pc)
    lst = work / "list.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in parts))
    dst = cuts / "trailer.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(dst)], check=True)
    (cuts / "trailer.json").write_text(json.dumps({"about": "Trailer moments (DRAFTED by the coding agent), times in the coverage cut.", "moments": out, "card": CARD}, indent=1) + "\n")
    print(f"trailer: {len(out)} moments, about {total:.0f} s -> {dst.relative_to(ROOT)}")
    for m in out:
        print(f"  {m['from']:7.2f}-{m['to']:7.2f}  {m['what']}")


if __name__ == "__main__":
    main()
