"""Copy the cast sheets, the location plates and every chapter image that shows a character into images-out/,
checking each file's sha256 against its committed recipe (content/snowmoon/recipes/images/).

images-out/ was cleaned from the main checkout; the renders live on in the owner's Drive
("Snowmoon images/cast v2" and "chapter NN"). Only files whose hash matches the recipe are used.

  python3 scripts/consistency/collect.py "<Drive>/Snowmoon images"
"""
import hashlib, json, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RECIPES = ROOT / "content/snowmoon/recipes/images"
src = Path(sys.argv[1])
out = ROOT / "images-out"
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

ok = bad = 0
def take(recipe_stem, folder):
    global ok, bad
    rec = json.loads((RECIPES / f"{recipe_stem}.json").read_text())
    for im in rec["images"]:
        if recipe_stem.startswith("chapter-") and not im.get("references"):
            continue  # only images made with character references
        p = src / folder / im["file"]
        if not p.exists():
            print("missing", folder, im["file"]); bad += 1; continue
        if sha(p) != im["sha256"]:
            print("hash differs", folder, im["file"]); bad += 1; continue
        (out / recipe_stem).mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, out / recipe_stem / im["file"]); ok += 1

take("cast", "cast v2")
take("locations", "locations")  # the location plates, references in the trial
for n in range(1, 33):
    take(f"chapter-{n}", f"chapter {n:02d}")
print(f"copied {ok}, problems {bad}")
