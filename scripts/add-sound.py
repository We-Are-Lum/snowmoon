"""Record a sound effect in an adaptation's sound recipe, and copy it in.

  python3 scripts/add-sound.py fifteen-days ~/Downloads/546270__raggedyangst__footsteps.wav \
      --url https://freesound.org/people/RaggedyAngst/sounds/546270/ --effect "corridor footsteps"
  python3 scripts/add-sound.py fifteen-days ~/snowmoon-takes/sfx/tea-pour.m4a --recorded-by "FID 6786" --effect "tea pouring"

A Freesound sound must be one of the CC0 candidates in adaptations/<seed>/sound-effects.md, where
its licence and author were read from its own page; the URL is looked up there, and a sound that
isn't listed is refused (add it to the list after checking its page). A home recording is the
owner's own and needs no licence line beyond that. The file is copied to scenes-out/<seed>/sfx/
(gitignored) and its entry written to adaptations/<seed>/sounds/recipe.json: the effect, the source
URL, the licence, the author, the title, the file's sha256 and duration, and when it was added.
"""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROW_LINK = re.compile(r"\[([^\]]+)\]\((https://freesound\.org/people/([^/]+)/sounds/(\d+)/)\), ([^,]+), ([0-9:.]+), (CC0)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("file", type=Path)
    ap.add_argument("--url")
    ap.add_argument("--recorded-by")
    ap.add_argument("--effect", required=True)
    args = ap.parse_args()
    if bool(args.url) == bool(args.recorded_by):
        raise SystemExit("give --url (a Freesound CC0 candidate) or --recorded-by (a home recording)")
    src = args.file.expanduser().resolve()
    if not src.exists():
        raise SystemExit(f"no such file: {src}")
    adir = ROOT / "adaptations" / args.seed
    if args.url:
        url = args.url if args.url.endswith("/") else args.url + "/"
        listed = {m[2]: m for m in ROW_LINK.finditer((adir / "sound-effects.md").read_text())}
        m = listed.get(url)
        if not m:
            raise SystemExit(f"{url} is not a checked CC0 candidate in sound-effects.md; read its page and add it there first")
        source = {"kind": "freesound", "url": url, "id": int(m[4]), "title": m[1], "author": m[5].strip(),
                  "licence": "Creative Commons 0 (CC0 1.0), as shown on the sound's page",
                  "licence_checked": "2026-10-15, from the sound's own page (sound-effects.md)"}
    else:
        source = {"kind": "home recording", "recorded_by": args.recorded_by, "licence": "the owner's own recording"}
    out = ROOT / "scenes-out" / args.seed / "sfx"
    out.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", args.effect.lower()).strip("-")
    dst = out / f"{slug}{src.suffix.lower()}"
    shutil.copyfile(src, dst)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(dst)], capture_output=True, text=True).stdout or 0)
    rec_path = adir / "sounds" / "recipe.json"
    rec_path.parent.mkdir(exist_ok=True)
    rec = json.loads(rec_path.read_text()) if rec_path.exists() else {"about": "Every sound effect used, with where it came from: a CC0 Freesound sound (source URL, licence, author) or the owner's own recording. No generated sound effects (owner, 2026-10-15).", "sounds": []}
    rec["sounds"] = [s for s in rec["sounds"] if s["effect"] != args.effect]
    rec["sounds"].append({"effect": args.effect, "source": source, "file": str(dst.relative_to(ROOT)),
                          "sha256": hashlib.sha256(dst.read_bytes()).hexdigest(), "duration_s": round(dur, 2),
                          "added_at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    rec_path.write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")
    print(f"{args.effect}: {dst.relative_to(ROOT)} ({source.get('author') or source.get('recorded_by')}, {source['licence']})")


if __name__ == "__main__":
    main()
