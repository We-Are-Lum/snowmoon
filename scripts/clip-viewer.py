"""Build the Fifteen Days clip viewer from scripts/clip-viewer.html: both cuts as playable video, and beside the
video, the playing shot's frame options (tap to pick), its line, its script text and the reviewer's notes; one comment box.

  python scripts/clip-viewer.py fifteen-days <out-dir>

<out-dir>/vid/<cut>/ must already hold the cut as fMP4 HLS segments (init.mp4, sNN.m4s, index.m3u8); the page plays
them through Media Source, so they run as one continuous video. Comments save to the artifact's db, collection "notes",
one document per comment: {cut, shot, t, text, at, by} (by "claude" for the seeded notes); frame picks to "picks", one per shot.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

import soundfile as sf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
NAMES = {"{Z}": "Zei", "{B}": "Bai", "{D}": "Deluin", "{K}": "Kau", "{R}": "the robot"}
SCENE = {"H": "Hall", "G": "Walkway", "C": "Corridor", "F": "Café 1", "S": "Café 2", "R": "Café 3", "D": "Gate", "L": "Lobby"}
LABEL = {"K": "A · depth-guided, klein finish", "Q": "A · depth-guided, Qwen finish", "B": "B · readable set", "C": "A · cropped in and refined"}


def jpg(src: Path, out: Path, w: int = 640) -> str:
    dst = out / "img" / (src.stem + ".jpg")
    if not dst.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        im = Image.open(src).convert("RGB")
        im.thumbnail((w, w))
        im.save(dst, quality=78)
    return f"img/{dst.name}"


def codec(init: Path) -> str:
    p = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=profile,level",
                                   "-of", "json", str(init.parent / "index.m3u8")], capture_output=True, text=True).stdout)["streams"][0]
    prof = {"High": "6400", "Main": "4d40", "Constrained Baseline": "42e0", "Baseline": "4200"}[p["profile"]]
    return f'video/mp4; codecs="avc1.{prof}{p["level"]:02x},mp4a.40.2"'


def label(cid: str) -> str:
    tag = cid.rsplit("-", 1)[1]
    return f"{LABEL.get(tag[0], tag[0])}, attempt {tag[1:]}"


def main() -> None:
    seed, out = sys.argv[1], Path(sys.argv[2])
    adir = ROOT / "adaptations" / seed / "preprod"
    odir = adir / "overnight"
    board = {s["id"]: s for s in json.loads((adir / "storyboard4.json").read_text())["shots"]}
    review = json.loads((odir / "frames-review.json").read_text())
    picks = json.loads((odir / "frames-picks.json").read_text())
    speaker, words = {}, {}
    for s in board.values():
        m = re.match(r"(b\d+-\d+) (\w+): (.*)", s.get("line") or "")
        if m:
            speaker[m[1]] = m[2]
    cuts = {}
    covb = json.loads((adir / "coverage-board.json").read_text()) if (adir / "coverage-board.json").exists() else {"frames": {}}
    rec = {l["ref"]: l for l in json.loads((ROOT / "adaptations" / seed / "recording-lines.json").read_text())["lines"]}
    for r_, l_ in rec.items():
        speaker.setdefault(r_, l_["speaker"])
    argv = sys.argv[3:]
    report = None
    if "--report" in argv:  # a report shown at the top (title, blocks, changes before/after, page tests); its images are copied in
        k = argv.index("--report")
        report = json.loads(Path(argv[k + 1]).read_text())
        argv = argv[:k] + argv[k + 2:]
        for c in report.get("changes", []):
            for side in ("before", "after"):
                c[side] = jpg(ROOT / c[side], out, 900)
        for t in report.get("tests", []):
            if t.get("img"):
                src = Path(t["img"])
                dst = out / "img" / ("test-" + src.stem + ".png")
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.write_bytes(src.read_bytes())
                t["img"] = str(dst.relative_to(out))
    LABELS = {"coverage": "v4", "coverage-v5": "v5"}
    for cut in argv or ("tight", "full"):
        cdir = ROOT / "scenes-out" / seed / "cuts" / cut
        tl = json.loads((cdir / "timeline.json").read_text())
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                    str(ROOT / "scenes-out" / seed / "cuts" / f"{cut}.mp4")], capture_output=True, text=True).stdout)
        card_at = round(dur - tl["end_card"]["seconds"], 3)
        subs = {s["cue"]: s["text"] for s in tl["subtitles"]}
        lines = []
        for c in tl["cues"]:
            t0 = c["at"]["offset"]
            if c["track"] == "voice" and "source" in c:
                d = sf.info(ROOT / c["stem"]).duration
                lines.append({"cue": c["id"], "t0": round(t0, 3), "t1": round(t0 + d, 3), "who": speaker.get(c["id"], "?"),
                              "text": subs.get(c["id"], ""), "voice": c.get("source", {}).get("voice", ""),
                              "L": Path(c.get("source", {}).get("converted", "")).name.split("-")[0]})
        shots = []
        for i, sh in enumerate(tl["shots"]):
            t0 = sh["at"]["offset"]
            t1 = tl["shots"][i + 1]["at"]["offset"] if i + 1 < len(tl["shots"]) else card_at
            s = board.get(sh["id"], {})
            fr = covb["frames"].get(sh.get("frame", ""), {})
            if fr:  # the coverage cut: one frame per setup and expression
                s = {"size": fr.get("size", ""), "action": fr.get("action", "") or fr.get("setup", "")}
            act = s.get("action", "")
            for k, v in NAMES.items():
                act = act.replace(k, v)
            img = ROOT / sh["image"]
            opts = []
            for cid in ([] if fr or sh.get("frame") else picks.get(sh["id"], [])):
                f = ROOT / "images-out" / "preprod" / "pass3" / f"{cid}.png"
                if not f.exists():
                    continue
                v = review.get(cid, {})
                opts.append({"key": cid, "img": jpg(f, out), "label": label(cid), "verdict": "pass" if v.get("pass") else "fail",
                             "score": v.get("score"), "note": v.get("note", ""), "in_cut": cid == img.stem})
            if not any(o["in_cut"] for o in opts):
                opts.insert(0, {"key": img.stem, "img": jpg(img, out), "label": sh.get("picture", ""), "verdict": "", "score": None,
                                "note": "", "in_cut": True})
            shots.append({"id": sh.get("frame", sh["id"]).replace("cov-", ""), "t0": round(t0, 3), "t1": round(t1, 3),
                          "scene": fr.get("scene", "") or SCENE.get(sh["id"][0], ""),
                          "size": s.get("size", ""), "action": act,
                          "move": sh.get("move", {}).get("kind", ""), "zoom": sh.get("move", {}).get("to", {}).get("zoom"),
                          "opts": opts})
        shots.append({"id": "END", "t0": card_at, "t1": round(dur, 3), "scene": "End card", "size": "", "action": "End card B, \"The invitation\".", "opts": []})
        init = out / "vid" / cut / "init.mp4"
        segs = [ln for ln in (out / "vid" / cut / "index.m3u8").read_text().splitlines() if ln and not ln.startswith("#")]
        cuts[cut] = {"label": LABELS.get(cut), "dur": round(dur, 3), "codec": codec(init), "segs": segs, "shots": shots, "lines": lines}
    data = {"seed": seed, "title": "Fifteen Days clips", "cuts": cuts, "report": report}
    page = (ROOT / "scripts" / "clip-viewer.html").read_text().replace("__DATA__", json.dumps(data, ensure_ascii=False))
    (out / "index.html").write_text(page)
    n = sum(1 for p in out.rglob("*") if p.is_file() and p.name != "index.html")
    print(f"{out / 'index.html'}: {n} files, {sum(p.stat().st_size for p in out.rglob('*') if p.is_file()) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
