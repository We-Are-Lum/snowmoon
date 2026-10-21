"""Build the Fifteen Days storyboard page: one card per shot (sketch, ID and size, line, exact prompt, references,
OK / change and a comment), grouped by scene, with the faces, the hall and overlook, the second test and the
voices above it.

  .venv-image/bin/python scripts/storyboard-page.py fifteen-days <out-dir>

Reads adaptations/<seed>/preprod/storyboard.json (from scripts/storyboard.py) and the pictures in images-out/preprod/.
The page keeps the owner's marks in its db: review/<item> {"status", "pick", "note", "at"}; shot cards use review/shot-<ID>.
"""

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PRE = ROOT / "images-out" / "preprod"


def jpg(src: Path, dst: Path, w: int) -> None:
    im = Image.open(src).convert("RGB")
    im.thumbnail((w, w))
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, quality=80)


def main() -> None:
    seed, out = sys.argv[1], Path(sys.argv[2])
    adir = ROOT / "adaptations" / seed / "preprod"
    sb = json.loads((adir / "storyboard.json").read_text())["shots"]
    img = out / "img"
    used = {}

    def put(path: str, w: int = 1200) -> str:
        if path not in used:
            name = path.replace("images-out/preprod/", "").replace("/", "-").rsplit(".", 1)[0] + ".jpg"
            jpg(ROOT / path, img / name, w)
            used[path] = f"img/{name}"
        return used[path]

    for x in sb:
        x["svg"] = (ROOT / x["sketch"]).read_text()
        x["refimgs"] = [{"src": put(r, 420), "what": ("layout sketch, labels stripped" if "/sketch/" in r else "place" if "places-final" in r else "cast card")} for r in x["refs"]]
    faces = {k: put(f"images-out/preprod/step3/{k}.png") for k in
             ("face2-zei-a", "face2-zei-b", "face2-deluin-a", "face2-deluin-b", "face2-bai-b", "face3-bai", "face2-kau")}
    places = {"hall": put("images-out/preprod/step3/hall6-a-faces.png", 1400), "hall-b": put("images-out/preprod/step3/hall6-b.png", 1400),
              "ovl-a": put("images-out/preprod/step3/overlook8-a.png", 1400), "ovl-b": put("images-out/preprod/step3/overlook8-b.png", 1400)}
    test = []
    for t, sid in (("T1b", "F01"), ("T3b", "F11"), ("T5b", "F17"), ("T8b", "F08")):
        test.append({"id": t, "shot": sid, "img": put(f"images-out/preprod/test2/{t}.png", 1400), "old": put(f"images-out/preprod/test/{t[:2]}.png", 700)})
    (out / "snd").mkdir(parents=True, exist_ok=True)
    voices = []
    for label, old, new in (("Zei, line 33 (\"young here\", \"Redshire\")", "lines/L33-b4-2.zei.wav", "lines-v2/L33-b4-2.zei-v3.wav"),
                            ("Bai, line 16", "lines/L16-b2-10.bai.wav", "lines-v2/L16-b2-10.bai.eq.wav"),
                            ("Bai, line 31", "lines/L31-b3-13.bai.wav", "lines-v2/L31-b3-13.bai.eq.wav"),
                            ("Bai, line 6", "lines/L06-b1-6.bai.wav", "lines-v2/L06-b1-6.bai.eq.wav"),
                            ("Deluin, line 10 (new sheet, 6% slower)", "lines/L10-b2-4.deluin.wav", "lines-v2/L10-b2-4.deluin-v2.wav")):
        pair = []
        for tag, f in (("before", old), ("now", new)):
            mp3 = out / "snd" / (Path(f).stem.replace(".", "-") + f"-{tag}.mp3")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ROOT / "scenes-out" / seed / f), "-c:a", "libmp3lame", "-b:a", "128k", str(mp3)], check=True)
            pair.append(f"snd/{mp3.name}")
        voices.append({"label": label, "before": pair[0], "now": pair[1]})
    led = json.loads((PRE / "ledger-s34.json").read_text())
    data = {"shots": sb, "faces": faces, "places": places, "test": test, "voices": voices, "spent": led["spent_usd"], "cap": led["cap_usd"],
            "geography": json.loads((adir / "shotlist-v3.json").read_text())["geography"]}
    page = (ROOT / "scripts" / "storyboard-page.html").read_text().replace("__DATA__", json.dumps(data, ensure_ascii=False))
    (out / "index.html").write_text(page)
    files = sorted(str(p.relative_to(out)) for p in out.rglob("*") if p.is_file() and p.name not in ("index.html", "files.json"))
    (out / "files.json").write_text(json.dumps([{"path": f} for f in files]))
    print(f"{out / 'index.html'}: {len(sb)} cards, {len(files)} files")


if __name__ == "__main__":
    main()
