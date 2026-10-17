"""Build a Fifteen Days review page from scripts/review-page.html.

  .venv-image/bin/python scripts/review-page.py fifteen-days plates <out-dir>   # round-two plates, one pick or a redo each
  .venv-image/bin/python scripts/review-page.py fifteen-days frames <out-dir>   # every storyboard frame, OK / Change, by scene

Marks save to the artifact's db: collection "plates" or "frames", one document per plate or shot.
"""

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PRE = ROOT / "images-out" / "preprod"
SCENES = [("H", "hall", "The hall: the tournament", "Hall"), ("G", "walkway", "The walkway: Zei and Bai watch", "Walkway"),
          ("C", "corridor", "The corridor: they meet Deluin", "Corridor"), ("F", "cafe1", "The café: first course", "Café 1"),
          ("S", "cafe2", "The café: sugar cubes", "Café 2"), ("R", "cafe3", "The café: Bai's headphones", "Café 3"),
          ("D", "gate", "The gate and the street", "Gate"), ("L", "lobby", "The lobby", "Lobby")]


# options the coding agent checked and dropped before the owner sees them (wrong view, or Bai big or doubled)
HIDE = {"plate-courtyard-B-bai-a", "plate-courtyard-B-bai-b", "plate-courtyard-B-bai-c", "plate-courtyard-B-bai-d", "plate-courtyard-B-bai-f",
        "plate-courtyard-E-a", "plate-courtyard-E-b", "plate-courtyard-E-c", "plate-courtyard-E-d", "plate-hall-P-a", "plate-hall-P-b", "plate-hall-P-c",
        "plate-hall-V-a", "plate-hall-V-b", "plate-lobby-O-a", "plate-lobby-O-b"}
LABEL = {"a": "from the shaded set", "b": "from the outline set", "c": "retry, shaded set", "d": "retry, outline set", "e": "edit of plate B, Bai added",
         "crop": "a crop of a wider plate"}


def jpg(src: Path, out: Path, name: str, w: int) -> str:
    dst = out / "img" / name
    dst.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert("RGB")
    im.thumbnail((w, w))
    im.save(dst, quality=80)
    return f"img/{name}"


def main() -> None:
    seed, mode, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    adir = ROOT / "adaptations" / seed / "preprod"
    board = json.loads((adir / "storyboard4.json").read_text())["shots"]
    if mode == "plates":
        jobs = json.loads((adir / "plate2-jobs.json").read_text())["jobs"]
        uses = {}
        for s in board:
            if s.get("plate"):
                uses.setdefault(s["plate"], []).append(s["id"])
        groups = {}
        for j in jobs:
            pid = j["plate"]
            sname = pid.split("-")[1]
            g = groups.setdefault(sname, {})
            if pid not in g:
                sd = json.loads((adir / "sets" / f"{sname}.json").read_text())
                k = pid.split("-", 2)[2]
                g[pid] = {"id": pid, "what": sd["setups"][k]["what"], "set": jpg(PRE / "set" / f"{pid}.labelled.png", out, f"{pid}.set.jpg", 520),
                          "uses": ", ".join(uses.get(pid, [])), "options": []}
                old = PRE / "plates" / f"{pid}.png"
                if old.exists():
                    g[pid]["old"] = old
            img = PRE / "plates2" / f"{j['id']}.png"
            if img.exists() and j["id"] not in HIDE:
                g[pid]["options"].append({"key": j["option"], "img": jpg(img, out, f"{j['id']}.jpg", 1000), "label": f"{j['option']}: {LABEL[j['option']]}"})
            crop = PRE / "plates2" / f"{pid}-crop.png"
            if crop.exists() and not any(o["key"] == "crop" for o in g[pid]["options"]):
                g[pid]["options"].append({"key": "crop", "img": jpg(crop, out, f"{pid}-crop.jpg", 1000), "label": "crop: " + LABEL["crop"]})
        for g in groups.values():
            for p in g.values():
                if p.get("old"):
                    p["options"].append({"key": "old", "img": jpg(p.pop("old"), out, f"{p['id']}.old.jpg", 1000), "label": "round one"})
        titles = {"courtyard": "Café courtyard, gate and street", "hall": "The hall", "corridor": "The corridor", "lobby": "The lobby"}
        notes = {"courtyard": "B, C and D are now real reverse angles. B-bai is new: setup B with Bai already at her table, for S04, R02, S10, R04 and F26.",
                 "hall": "No pictograms. The wide (A) now looks along the walkway from the south end, so it crosses the middle.",
                 "corridor": "No pictograms.", "lobby": "Both empty of people."}
        data = {"mode": "plates", "coll": "plates", "title": "Fifteen Days plates, round two",
                "intro": ["Pick one picture per plate, or mark it to redo. Each plate is the place reference for the shots listed under its 3D view; "
                          "the frames are drawn from it overnight.",
                          "a is drawn from the shaded set render, b from an outline drawing of the same set; c and d are retries with the view spelled out. "
                          "Options that drew the wrong view, or Bai big or twice, are left out. Round one is shown last where it exists."],
                "groups": [{"key": k, "title": titles[k], "note": notes[k], "items": list(groups[k].values())} for k in ("courtyard", "hall", "corridor", "lobby") if k in groups]}
    elif mode == "pick2":
        # the overnight frames (owner, 2026-10-16 night): the best two of each shot, with the reviewer agent's notes
        odir = adir / "overnight"
        picks = json.loads((odir / "frames-picks.json").read_text())
        review = json.loads((odir / "frames-review.json").read_text())
        name = {"K": "A · depth-guided, klein finish", "Q": "A · depth-guided, Qwen finish", "B": "B · readable set", "C": "A · cropped in and refined"}
        scenes = []
        for pre, key, title, short in SCENES:
            shots = []
            for s in board:
                if s["id"][0] != pre or s.get("composite"):
                    continue
                act = s["action"]
                for k, v in {"{Z}": "Zei", "{B}": "Bai", "{D}": "Deluin", "{K}": "Kau", "{R}": "the robot"}.items():
                    act = act.replace(k, v)
                cands = []
                for cid in picks.get(s["id"], []):
                    v = review.get(cid, {})
                    tag = cid.rsplit("-", 1)[1]
                    cands.append({"key": cid, "img": jpg(PRE / "pass3" / f"{cid}.png", out, f"{cid}.jpg", 1000),
                                  "label": f"{name[tag[0]]}, attempt {tag[1:]} · reviewer {v.get('score', '?')}/10",
                                  "verdict": "pass" if v.get("pass") else "fail", "note": v.get("note", "")})
                if not cands:
                    continue
                shots.append({"id": s["id"], "size": s["size"], "line": s.get("line"), "action": act, "cands": cands})
            scenes.append({"key": key, "title": title, "short": short, "shots": shots})
        summary = json.loads((odir / "page-summary.json").read_text()) if (odir / "page-summary.json").exists() else []
        for sec in summary:  # pictures named by repo path become small copies beside the page; videos are copied as they are
            for im in sec.get("images", []):
                if "path" in im:
                    im["src"] = jpg(ROOT / im.pop("path"), out, Path(im["label"].split(" ")[0]).name + ".jpg", 900)
            for v in sec.get("videos", []):
                if "path" in v:
                    dst = out / "vid" / Path(v["path"]).name
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    dst.write_bytes((ROOT / v.pop("path")).read_bytes())
                    v["src"] = f"vid/{dst.name}"
        data = {"mode": "pick2", "coll": "frames2", "title": "Fifteen Days frames",
                "intro": ["The best two frames of each shot, side by side, with the reviewer agent's notes (an agent that did not draw them). "
                          "Tap the one you want, or Neither; a comment says what to change. Your picks save as you go."],
                "summary": summary, "scenes": scenes}
    else:
        scenes = []
        for pre, key, title, short in SCENES:
            shots = []
            for s in board:
                if s["id"][0] != pre:
                    continue
                if s.get("composite"):
                    src = ROOT / "images-out" / "preprod" / "refs" / "menu-c14-b108.png"
                    tag = "the book's menu picture"
                else:
                    src = PRE / "pass" / f"{s['id']}.png"
                    tag = None
                if not src.exists():
                    continue
                act = s["action"]
                for k, v in {"{Z}": "Zei", "{B}": "Bai", "{D}": "Deluin", "{K}": "Kau", "{R}": "the robot"}.items():
                    act = act.replace(k, v)
                shots.append({"id": s["id"], "size": s["size"], "line": s.get("line"), "action": act, "tag": tag,
                              "img": jpg(src, out, f"{s['id']}.jpg", 1100),
                              "frame": jpg(PRE / "set" / f"{s['id']}.labelled.png", out, f"{s['id']}.set.jpg", 300) if not s.get("composite") else None})
            scenes.append({"key": key, "title": title, "short": short, "shots": shots})
        data = {"mode": "frames", "coll": "frames", "title": "Fifteen Days frames",
                "intro": ["Every storyboard frame from the overnight pass, in story order, grouped by scene. Mark each OK or Change; a comment says what to change."],
                "scenes": scenes}
    title = data["title"]
    page = (ROOT / "scripts" / "review-page.html").read_text().replace("__TITLE__", title).replace("__DATA__", json.dumps(data, ensure_ascii=False))
    (out / "index.html").write_text(page)
    files = sorted(str(p.relative_to(out)) for p in out.rglob("*") if p.is_file() and p.name != "index.html")
    print(f"{out / 'index.html'}: {len(files)} files")


if __name__ == "__main__":
    main()
