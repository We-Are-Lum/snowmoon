"""Build the owner-only style test page: one row per style (name, prompt, its frames) with favourites.

Reads a style-test job file (adaptations/<seed>/style-test/jobs.json) and the rendered frames in
images-out/style-test/, and writes scenes-out/<seed>/style-test-page/: index.html and frames/*.jpg
(JPEG copies sized for the page). The page is published as a private claude.ai artifact; the owner's
favourites and notes are kept in its db (collection "marks", one document per style slug), where the
coding agent can read them back for round two.

  python3 scripts/style-test-page.py fifteen-days
"""

import html
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    seed = sys.argv[1]
    spec = json.loads((ROOT / "adaptations" / seed / "style-test" / "jobs.json").read_text())
    rec_path = ROOT / "adaptations" / seed / "style-test" / "recipe.json"
    made = {e["id"]: e for e in json.loads(rec_path.read_text())["images"]} if rec_path.exists() else {}
    out = ROOT / "scenes-out" / seed / "style-test-page"
    (out / "frames").mkdir(parents=True, exist_ok=True)

    frames = spec["frames"]
    rows = []
    for st in spec["styles"]:
        cells = []
        for fr in frames:
            jid = f"st-{st['slug']}-{fr['id']}"
            e = made.get(jid)
            if e:
                jpg = out / "frames" / f"{jid}.jpg"
                if not jpg.exists():
                    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ROOT / e["file"]), "-q:v", "4", str(jpg)], check=True)
                cells.append({"frame": fr["id"], "src": f"frames/{jid}.jpg", "seed": e.get("seed"), "cost": e.get("cost_usd")})
            else:
                cells.append({"frame": fr["id"], "src": None})
        rows.append({**{k: st[k] for k in ("slug", "name", "group", "source", "prompt")}, "cells": cells})
    spent = round(sum(e.get("cost_usd", 0) for e in made.values()), 4)
    data = {"seed": seed, "frames": frames, "rows": rows, "spent": spent, "made": len(made), "planned": len(spec["jobs"])}
    page = TEMPLATE.replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))
    (out / "index.html").write_text(page)
    print(f"{out.relative_to(ROOT)}/index.html: {len(rows)} styles, {len(made)} of {len(spec['jobs'])} frames, ${spent}")


TEMPLATE = r"""<title>Fifteen Days style test</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=DM+Mono:wght@400;500&display=swap">
<style>
/* Layout: a contact sheet. One row per style: its card on the left, three frames to the right; stacks on phones. */
:root {
  --paper: #f3f1ec; --ink: #1d1b18; --muted: #6b665d; --rule: #d9d4c9; --card: #fbfaf7;
  --mark: #c2410c; --mark-soft: #fde7d9; --chip: #e7e2d7;
  --reading: "Crimson Pro", Georgia, "Times New Roman", serif;
  --label: "DM Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper: #161513; --ink: #ece8df; --muted: #a39d91; --rule: #34312b; --card: #1e1c19;
  --mark: #fb923c; --mark-soft: #3a2416; --chip: #2a2723; color-scheme: dark } }
:root[data-theme="dark"] {
  --paper: #161513; --ink: #ece8df; --muted: #a39d91; --rule: #34312b; --card: #1e1c19;
  --mark: #fb923c; --mark-soft: #3a2416; --chip: #2a2723; color-scheme: dark }
body { background: var(--paper); color: var(--ink); font-family: var(--reading); font-size: 17px; }
.wrap { max-width: 1400px; margin: 0 auto; padding-inline: 16px; padding-block: 24px 64px; }
header { display: grid; gap: 8px; margin-bottom: 20px; }
h1 { font-size: clamp(28px, 4vw, 40px); font-weight: 600; margin: 0; text-wrap: balance; }
.lede { color: var(--muted); max-width: 70ch; margin: 0; }
.label { font-family: var(--label); font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; position: sticky; top: env(safe-area-inset-top, 0px);
  background: var(--paper); padding-block: 10px; z-index: 2; border-bottom: 1px solid var(--rule); }
.chip { font-family: var(--label); font-size: 12px; letter-spacing: .04em; border: 1px solid var(--rule); background: var(--chip);
  color: var(--ink); border-radius: 999px; padding: 6px 12px; cursor: pointer; }
.chip[aria-pressed="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.count { margin-left: auto; font-family: var(--label); font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.cols { display: grid; grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(0, 1.4fr)); gap: 12px; padding-block: 12px 4px; }
.cols .label { align-self: end; }
.row { display: grid; grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(0, 1.4fr)); gap: 12px; padding-block: 14px;
  border-top: 1px solid var(--rule); }
.row.fav .meta { box-shadow: inset 3px 0 0 var(--mark); background: var(--mark-soft); }
.meta { display: grid; gap: 8px; align-content: start; min-width: 0; padding: 10px 12px; border-radius: 6px; background: var(--card); }
.name { font-size: 21px; font-weight: 600; line-height: 1.15; margin: 0; }
.prompt { font-size: 15px; line-height: 1.4; color: var(--muted); margin: 0; }
.prompt.short { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.more { font-family: var(--label); font-size: 12px; background: none; border: 0; padding: 0; color: var(--ink); text-decoration: underline; cursor: pointer; justify-self: start; }
.actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.star { font-family: var(--label); font-size: 12px; border: 1px solid var(--mark); color: var(--mark); background: transparent; border-radius: 4px; padding: 6px 10px; cursor: pointer; }
.row.fav .star { background: var(--mark); color: var(--card); }
.note { width: 100%; font: inherit; font-size: 15px; color: var(--ink); background: var(--paper); border: 1px solid var(--rule); border-radius: 4px; padding: 6px 8px; }
.frame { margin: 0; min-width: 0; }
.frame button { display: block; width: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; }
.frame img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 4px; background: var(--chip); }
.frame .empty { aspect-ratio: 16 / 9; border-radius: 4px; background: var(--chip); display: grid; place-items: center; font-family: var(--label); font-size: 12px; color: var(--muted); }
.frame figcaption { font-family: var(--label); font-size: 11px; color: var(--muted); margin-top: 4px; }
.state { font-family: var(--label); font-size: 12px; color: var(--muted); }
:focus-visible { outline: 2px solid var(--mark); outline-offset: 2px; }
dialog { border: 0; padding: 0; background: transparent; max-width: min(96vw, 1600px); }
dialog::backdrop { background: rgb(0 0 0 / .85); }
dialog img { display: block; max-width: 100%; max-height: 88vh; border-radius: 4px; }
dialog p { color: #ece8df; font-family: var(--label); font-size: 12px; margin: 8px 0 0; }
@media (max-width: 820px) {
  .cols { display: none; }
  .row { grid-template-columns: 1fr; }
  .frames-m { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
}
@media (min-width: 821px) { .frames-m { display: contents; } }
</style>

<div class="wrap">
  <header>
    <span class="label">Owner only · round one · test prompts, model-drafted</span>
    <h1>Fifteen Days style test</h1>
    <p class="lede" id="lede"></p>
  </header>
  <div class="bar" role="toolbar" aria-label="Filter styles">
    <button class="chip" data-filter="all" aria-pressed="true">All</button>
    <button class="chip" data-filter="fav" aria-pressed="false">Favourites</button>
    <button class="chip" data-filter="in the repo" aria-pressed="false">In the repo</button>
    <button class="chip" data-filter="fork" aria-pressed="false">Forks</button>
    <button class="chip" data-filter="bigger swing" aria-pressed="false">Bigger swings</button>
    <button class="chip" data-filter="new" aria-pressed="false">New</button>
    <span class="count" id="count"></span>
  </div>
  <div class="cols" id="cols"></div>
  <main id="rows"></main>
  <p class="state" id="state">Favourites are saved for Claude to read once this page connects.</p>
</div>
<dialog id="zoom"><img id="zoom-img" alt=""><p id="zoom-cap"></p></dialog>

<script>
const DATA = __DATA__;
const marks = {};          // slug -> {fav, note}, from the artifact's db
let filter = 'all';
let col = null;

const $ = (id) => document.getElementById(id);
$('lede').textContent = `Three frames from the café and the vigil in ${DATA.rows.length} styles. Each frame keeps the same subject and seed in every row, so only the style changes. Star the ones you like; a note is optional. ${DATA.made} of ${DATA.planned} frames made, $${DATA.spent.toFixed(3)} spent.`;
const cols = $('cols');
cols.append(Object.assign(document.createElement('span'), { className: 'label', textContent: 'Style' }));
for (const f of DATA.frames) cols.append(Object.assign(document.createElement('span'), { className: 'label', textContent: f.name }));

function render() {
  const root = $('rows');
  root.textContent = '';
  let shown = 0, favs = 0;
  for (const r of DATA.rows) {
    const m = marks[r.slug] || {};
    if (m.fav) favs++;
    if (filter === 'fav' ? !m.fav : filter !== 'all' && r.group !== filter) continue;
    shown++;
    const row = document.createElement('section');
    row.className = 'row' + (m.fav ? ' fav' : '');
    row.setAttribute('aria-label', r.name);
    const meta = document.createElement('div');
    meta.className = 'meta';
    const label = Object.assign(document.createElement('span'), { className: 'label', textContent: r.group });
    const name = Object.assign(document.createElement('h2'), { className: 'name', textContent: r.name });
    const p = Object.assign(document.createElement('p'), { className: 'prompt short', textContent: r.prompt });
    const more = Object.assign(document.createElement('button'), { className: 'more', textContent: 'Full prompt' });
    more.onclick = () => { const s = p.classList.toggle('short'); more.textContent = s ? 'Full prompt' : 'Less'; };
    const actions = document.createElement('div');
    actions.className = 'actions';
    const star = Object.assign(document.createElement('button'), { className: 'star', textContent: m.fav ? '★ Favourite' : '☆ Mark favourite' });
    star.setAttribute('aria-pressed', m.fav ? 'true' : 'false');
    star.onclick = () => save(r.slug, { fav: !m.fav });
    actions.append(star);
    const note = Object.assign(document.createElement('input'), { className: 'note', id: 'note-' + r.slug, placeholder: 'A note (optional)', value: m.note || '' });
    note.setAttribute('aria-label', `Note on ${r.name}`);
    note.onchange = () => save(r.slug, { note: note.value });
    const src = Object.assign(document.createElement('span'), { className: 'label', textContent: r.source });
    meta.append(label, name, p, more, actions, note, src);
    const fm = document.createElement('div');
    fm.className = 'frames-m';
    r.cells.forEach((c, i) => {
      const fig = document.createElement('figure');
      fig.className = 'frame';
      if (c.src) {
        const b = document.createElement('button');
        const img = Object.assign(document.createElement('img'), { src: c.src, alt: `${DATA.frames[i].name}, in ${r.name} (AI-generated test frame)`, loading: 'lazy' });
        b.append(img);
        b.onclick = () => { $('zoom-img').src = c.src; $('zoom-img').alt = img.alt; $('zoom-cap').textContent = `${r.name} · ${DATA.frames[i].name} · seed ${c.seed}`; $('zoom').showModal(); };
        fig.append(b);
      } else fig.append(Object.assign(document.createElement('div'), { className: 'empty', textContent: 'not made' }));
      fig.append(Object.assign(document.createElement('figcaption'), { textContent: DATA.frames[i].name }));
      fm.append(fig);
    });
    row.append(meta, fm);
    root.append(row);
  }
  $('count').textContent = `${shown} shown · ${favs} favourite${favs === 1 ? '' : 's'}`;
}

async function save(slug, patch) {
  marks[slug] = { ...(marks[slug] || {}), ...patch };
  render();
  if (!col) { $('state').textContent = 'Not connected: this mark shows here but is not saved.'; return; }
  try {
    await col.doc(slug).set({ ...marks[slug], updated: new Date().toISOString() });
    $('state').textContent = 'Saved.';
  } catch (e) {
    $('state').textContent = `Not saved (${e && e.code ? e.code : 'error'}). Try again in a moment.`;
  }
}

for (const b of document.querySelectorAll('.chip')) b.onclick = () => {
  filter = b.dataset.filter;
  for (const o of document.querySelectorAll('.chip')) o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
  render();
};
$('zoom').onclick = () => $('zoom').close();
render();

(async () => {
  const db = window.claude && window.claude.use ? await window.claude.use('db') : null;
  if (!db) { $('state').textContent = 'Favourites can’t be saved in this view; open the page on claude.ai.'; return; }
  col = db.collection('marks');
  col.onSnapshot((snap) => {
    for (const d of snap.docs) marks[d.id] = d.data() || {};
    render();
    $('state').textContent = 'Connected: favourites and notes are saved for Claude to read.';
  }, (e) => { $('state').textContent = `Favourites didn’t load (${e.code}).`; });
})();
</script>
"""

if __name__ == "__main__":
    main()
