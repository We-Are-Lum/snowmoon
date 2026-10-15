"""Watch a phone inbox (an iCloud Drive folder) for beat recordings, bring them in, and process them.

  python3 scripts/watch-takes.py fifteen-days \
      --inbox "~/Library/Mobile Documents/com~apple~CloudDocs/snowmoon-takes/full" [--dir ~/snowmoon-takes/full]

Every minute:
1. Inbox. A file named beat-<n>.<ext> (or "beat-<n> 2.<ext>", the phone's name for a second copy)
   is copied into --dir once its size has held still for --settle minutes and ffprobe can read it,
   so a file still syncing is never taken half-written. A file that iCloud has only as a placeholder
   is asked for with brctl. A newer beat-<n> replaces the one in --dir; the older one is kept in
   --dir/replaced/<time>/, never deleted.
2. Processing. When the set of recordings in --dir has changed and nothing has arrived for --quiet
   minutes, scripts/takes-overnight.sh runs (split with Whisper, convert with Chatterbox, both local).
   Each run's log is kept as takes/overnight-<time>.log. It waits while scripts/illustrate.py is
   drawing, so two big models never share the 8 GB Mac.
3. Clean-up. After a run that finished, each inbox file it processed is deleted from iCloud, but only
   if it still matches the copy byte for byte (sha256), so a newer upload under the same name stays.

Raw takes stay outside the repository; a --dir inside it is refused. The log is --dir/takes/watch.log.
"""

import argparse
import hashlib
import re
import shutil
import subprocess
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAME = re.compile(r"^beat-(\d+)(?: \d+)?\.([A-Za-z0-9]+)$", re.I)


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def readable(p: Path) -> bool:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)], capture_output=True, text=True)
    try:
        return r.returncode == 0 and float(r.stdout.strip()) > 0
    except ValueError:
        return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("--inbox", type=Path, required=True)
    ap.add_argument("--dir", type=Path, default=Path("~/snowmoon-takes/full"))
    ap.add_argument("--settle", type=float, default=3, help="minutes an inbox file's size must hold still")
    ap.add_argument("--quiet", type=float, default=30, help="minutes with no new recording before processing")
    args = ap.parse_args()
    inbox, dest = args.inbox.expanduser(), args.dir.expanduser().resolve()
    if ROOT.resolve() in dest.parents or Path("/Users/nathan/snowmoon").resolve() in dest.parents:
        raise SystemExit("refused: --dir is inside a repository folder")
    (dest / "takes").mkdir(parents=True, exist_ok=True)
    logf = dest / "takes" / "watch.log"

    def log(msg: str) -> None:
        line = f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
        print(line, flush=True)
        with logf.open("a") as f:
            f.write(line + "\n")

    seen: dict[str, tuple[int, float]] = {}   # inbox name -> (size, first time seen at that size)
    pending: dict[Path, str] = {}             # inbox file -> sha256 of its copy, waiting for a run
    last_arrival = 0.0
    done_sig = None
    asked: set[str] = set()
    log(f"watching {inbox} -> {dest}")
    while True:
        now = time.time()
        for p in sorted(inbox.iterdir()) if inbox.exists() else []:
            if p.name.startswith(".") and p.name.endswith(".icloud"):
                if p.name not in asked:
                    subprocess.run(["brctl", "download", str(p)], capture_output=True)
                    asked.add(p.name)
                    log(f"asked iCloud to download {p.name[1:-7]}")
                continue
            m = NAME.match(p.name)
            if not m or not p.is_file() or p in pending:
                continue
            size = p.stat().st_size
            if seen.get(p.name, (None,))[0] != size:
                seen[p.name] = (size, now)
                continue
            if now - seen[p.name][1] < args.settle * 60 or not readable(p):
                continue
            target = dest / f"beat-{int(m[1])}.{m[2].lower()}"
            old = [q for q in dest.glob(f"beat-{int(m[1])}.*") if q.is_file()]
            if old:
                keep = dest / "replaced" / datetime.now().strftime("%Y%m%d-%H%M%S")
                keep.mkdir(parents=True, exist_ok=True)
                for q in old:
                    shutil.move(str(q), keep / q.name)
                log(f"beat-{int(m[1])}: older recording kept in {keep.relative_to(dest)}/")
            shutil.copyfile(p, target)
            h = sha256(target)
            if h != sha256(p):
                target.unlink()
                log(f"{p.name}: copy did not match, will retry")
                continue
            pending[p] = h
            last_arrival = now
            log(f"copied {p.name} -> {target.name} ({size / 1e6:.1f} MB)")

        sig = tuple(sorted((q.name, q.stat().st_mtime) for q in dest.iterdir() if q.is_file() and re.match(r"beat-\d+\.", q.name)))
        busy = subprocess.run(["pgrep", "-f", "scripts/illustrate.py"], capture_output=True).returncode == 0
        if sig and sig != done_sig and not busy and now - last_arrival >= args.quiet * 60 and not any(
                now - mt < args.quiet * 60 for _, mt in sig):
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            log(f"processing {len(sig)} recording(s): {', '.join(n for n, _ in sig)}")
            r = subprocess.run([str(ROOT / "scripts" / "takes-overnight.sh"), args.seed, str(dest), "0"], capture_output=True, text=True)
            run_log = dest / "takes" / "overnight.log"
            text = run_log.read_text() if run_log.exists() else ""
            if run_log.exists():
                shutil.copyfile(run_log, dest / "takes" / f"overnight-{stamp}.log")
            for line in r.stdout.splitlines():
                log(f"  {line}")
            done_sig = sig
            if "== " in text and text.rstrip().splitlines()[-1].startswith("== ") and "done" in text.rstrip().splitlines()[-1]:
                for p, h in list(pending.items()):
                    if p.exists() and sha256(p) == h:
                        p.unlink()
                        log(f"deleted iCloud copy {p.name}")
                    pending.pop(p)
                log(f"run finished; log takes/overnight-{stamp}.log")
            else:
                log(f"run did not finish (exit {r.returncode}); iCloud copies kept; see takes/overnight-{stamp}.log")
        time.sleep(60)


if __name__ == "__main__":
    main()
