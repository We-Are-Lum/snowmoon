"""Build the second Fifteen Days pre-production page: the courtyard consistency test, the step 1 redraws, the
tutorial references, the updated floor plans and shot list v3, on one page for the owner's review.

  .venv-image/bin/python scripts/preprod2-page.py fifteen-days <out-dir>

Reads adaptations/<seed>/preprod/ (test-jobs.json, test-review.json, step1-jobs.json, shotlist-v2/v3.json) and
images-out/preprod/ (test, step1, cast, places, cards, refs). Writes <out-dir>/index.html, img/, snd/, files.json.
The page keeps the owner's marks in its db: review/<item> {"pick", "status", "note", "at"}.
"""

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("pp1", ROOT / "scripts" / "preprod-page.py")
pp1 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pp1)


def main() -> None:
    seed, out = sys.argv[1], Path(sys.argv[2])
    pre, adir = ROOT / "images-out" / "preprod", ROOT / "adaptations" / seed / "preprod"
    img = out / "img"
    img.mkdir(parents=True, exist_ok=True)

    def put(src: str, name: str, w: int = 1400) -> str:
        pp1.jpg(pre / src, img / f"{name}.jpg", w)
        return f"img/{name}.jpg"

    tests = json.loads((adir / "test-jobs.json").read_text())["jobs"]
    review = json.loads((adir / "test-review.json").read_text())
    test = [{"id": j["id"], "img": put(f"test/{j['id']}.png", j["id"]), "prompt": j["prompt"].split(" Reference image 1")[0],
             "refs": [put(str(Path(r).relative_to("images-out/preprod")), "ref-" + Path(r).stem, 500) for r in j["refs"]],
             "review": review[j["id"]]} for j in tests]
    cast = {k: put(v, k) for k, v in {
        "face-bai-c": "step1/face-bai-c.png", "face-bai-d": "step1/face-bai-d.png", "figure-bai": "step1/figure-bai.png",
        "face-deluin-c": "step1/face-deluin-c.png", "face-deluin-d": "step1/face-deluin-d.png",
        "face-zei-b": "cast/face-zei-b.png", "costume-zei": "cast/costume-zei.png", "costume-deluin": "cast/costume-deluin.png"}.items()}
    places = {k: put(v, k) for k, v in {
        "hall4-a-crop": "step1/hall4-a-crop.png", "hall4-b": "step1/hall4-b.png", "hall3-b": "step1/hall3-b.png",
        "gallery4-a": "step1/gallery4-a.png", "gallery4-b": "step1/gallery4-b.png",
        "est2-corridor-b": "places/est2-corridor-b.png",
        "courtyard3-b": "step1/courtyard3-b.png", "courtyard3-a": "step1/courtyard3-a.png",
        "gate3-a": "step1/gate3-a.png", "gate3-b": "step1/gate3-b.png",
        "lobby3-a": "step1/lobby3-a.png", "lobby4-out-a": "step1/lobby4-out-a.png", "lobby4-out-b": "step1/lobby4-out-b.png"}.items()}
    refs = {k: put(f"refs/{k}.png", "tut-" + k, 1000) for k in
            ("holo-towers-cyan", "holo-towers-pink-amber", "holo-gliders-burst", "holo-field-wide", "board-flat-2p", "board-console-fog")}
    v3 = json.loads((adir / "shotlist-v3.json").read_text())
    v2 = {s["id"]: s for s in json.loads((adir / "shotlist-v2.json").read_text())["shots"]}
    for s in v3["shots"]:
        o = v2.get(s["id"])
        s["changed"] = "new" if not o else ("changed" if (o["size"], o["action"]) != (s["size"], s["action"]) else "")
    (out / "snd").mkdir(exist_ok=True)
    snd = []
    for name in ("device-message-received-b", "device-message-sent", "device-menu-tap-1", "device-robot-greet", "device-robot-glide"):
        f = ROOT / "scenes-out" / seed / "sfx" / f"{name}.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-c:a", "libmp3lame", "-b:a", "160k", str(out / "snd" / f"{name}.mp3")], check=True)
        snd.append({"id": name, "src": f"snd/{name}.mp3"})
    led = json.loads((pre / "ledger-s12.json").read_text())
    data = {"test": test, "cast": cast, "places": places, "refs": refs, "plans": pp1.plans(), "geography": v3["geography"],
            "shots": v3["shots"], "sizes": v3["sizes"], "sounds": snd, "spent": led["spent_usd"], "cap": led["cap_usd"]}
    page = (ROOT / "scripts" / "preprod2-page.html").read_text().replace("__DATA__", json.dumps(data, ensure_ascii=False))
    (out / "index.html").write_text(page)
    files = sorted(str(p.relative_to(out)) for p in out.rglob("*") if p.is_file() and p.name not in ("index.html", "files.json"))
    (out / "files.json").write_text(json.dumps([{"path": f} for f in files]))
    print(f"{out / 'index.html'}: {len(test)} test shots, {len(v3['shots'])} shots in v3, {len(files)} files")


if __name__ == "__main__":
    main()
