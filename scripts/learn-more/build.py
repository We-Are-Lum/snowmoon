"""
Builds the "Learn more" outputs (owner, 2026-11-12) from the per-character drafts:
  <out>/texts.json      per character: who, start, later, drives (segment arrays), invent (array of segment arrays)
  <out>/glossary.json   every ⓘ term: its existing glossary id, or a DRAFT entry quoted from the book with its block
  <out>/index.html      the review page (DRAFT): the seven texts with ⓘ and block links, the book's text under each
                        section for checking, and the glossary list (existing vs DRAFT)
The DRAFT glossary entries are hand-picked in scripts/learn-more/glossary-drafts.json: each quote must be an exact
substring of its block's plain text (checked here). Nothing is published. Drafted by the coding agent (Claude, a
closed model by Anthropic).

  python3 -I scripts/learn-more/build.py <drafts dir> <out dir>
"""
import html
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import book  # noqa: E402
import verify  # noqa: E402

ORDER = ['zei', 'gladias', 'bai', 'seila', 'deluin', 'mu', 'ephelion']
HERE = os.path.dirname(os.path.abspath(__file__))
GLOSS = {t['slug']: t for t in json.load(open(os.path.join(book.ROOT, 'content', 'snowmoon', 'glossary.json')))['terms']}
READER = 'https://snowmoon.party/chapter'


def esc(s):
    return html.escape(str(s), quote=True)


def cite_href(c):
    ch, ids = book.parse(c)
    return f'{READER}/{ch}#c{ch}-b{ids[0]}'


def main():
    drafts, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    chars = []
    for slug in ORDER:
        p = os.path.join(drafts, f'{slug}.json')
        if os.path.exists(p):
            chars.append(json.load(open(p)))
    problems = [x for d in chars for x in verify.check(d)]
    if problems:
        for x in problems:
            print('PROBLEM', x)
        sys.exit(1)

    texts = {d['slug']: {k: d[k] for k in ('name', 'pronoun', 'author', 'who', 'start', 'later', 'drives', 'invent')} for d in chars}
    json.dump({'about': 'Learn more texts, one per challenge character. Segments: {text} | {term, glossaryId} | {cite}. Zei is the owner\'s text, exact; the others are DRAFT, drafted by the coding agent (Claude, a closed model by Anthropic).', 'characters': texts},
              open(os.path.join(out, 'texts.json'), 'w'), indent=1, ensure_ascii=False)

    # Glossary: every term used, existing or DRAFT.
    hand = json.load(open(os.path.join(HERE, 'glossary-drafts.json')))
    used = {}
    for d in chars:
        for k in ('who', 'start', 'later', 'drives'):
            for s in d[k]:
                if 'term' in s:
                    used.setdefault(s['term'], {'glossaryId': s.get('glossaryId'), 'in': set()})['in'].add(d['slug'])
        for line in d['invent']:
            for s in line:
                if 'term' in s:
                    used.setdefault(s['term'], {'glossaryId': s.get('glossaryId'), 'in': set()})['in'].add(d['slug'])
    entries, missing = [], []
    for term, u in sorted(used.items(), key=lambda x: x[0].lower()):
        if u['glossaryId']:
            g = GLOSS[u['glossaryId']]
            entries.append({'term': term, 'status': 'existing', 'glossaryId': u['glossaryId'], 'glossaryTerm': g['term'], 'in': sorted(u['in'])})
            continue
        h = hand.get(term)
        if not h:
            missing.append(term)
            entries.append({'term': term, 'status': 'missing', 'glossaryId': None, 'in': sorted(u['in'])})
            continue
        t = book.text(h['block'])
        if h['quote'] not in t:
            print(f'PROBLEM glossary draft for {term!r}: quote not in {h["block"]}')
            sys.exit(1)
        entries.append({'term': term, 'status': 'DRAFT', 'glossaryId': None, 'draft': {'slug': h['slug'], 'term': h.get('display', term), 'quote': h['quote'], 'block': h['block'], 'note': h.get('note')}, 'in': sorted(u['in'])})
    json.dump({'about': 'Every ⓘ term in the Learn more texts: its existing entry in content/snowmoon/glossary.json, or a DRAFT entry quoted word for word from the book with its block (DRAFT until the owner approves it).', 'terms': entries},
              open(os.path.join(out, 'glossary.json'), 'w'), indent=1, ensure_ascii=False)

    # Review page.
    def seg_html(segs):
        parts, run = [], []

        def flush():
            if run:
                parts.append('<span class="cites">(' + ', '.join(f'<a href="{esc(cite_href(c))}">{esc(c)}</a>' for c in run) + ')</span>')
                run.clear()
        for s in segs:
            if 'cite' in s:
                run.append(s['cite'])
                continue
            flush()
            if 'term' in s:
                gid = s.get('glossaryId')
                cls = 'term' if gid else 'term draft'
                parts.append(f'<span class="{cls}" title="{esc(gid or "no glossary entry yet")}">{esc(s["term"])}<sup>ⓘ</sup></span>')
            else:
                parts.append(esc(s['text']))
        flush()
        return ''.join(parts)

    def checks(segs):
        cs = []
        for s in segs:
            if 'cite' in s and s['cite'] not in cs:
                cs.append(s['cite'])
        return ''.join(f'<li><b>{esc(c)}</b> {esc(book.text(c))}</li>' for c in cs)

    blocks = []
    for d in chars:
        p, o, P = verify.PRON[d['pronoun']]
        heads = {'who': f'Who {p} is.', 'start': 'At the start.', 'later': 'Later in the book (spoilers).', 'drives': f'What drives {o}.'}
        secs = []
        for k in ('who', 'start', 'later', 'drives'):
            body = f'<p><b>{esc(heads[k])}</b> {seg_html(d[k])}</p><details class="check"><summary>The book’s text for these cites</summary><ul>{checks(d[k])}</ul></details>'
            secs.append(f'<details class="spoil"><summary>{esc(heads[k])}</summary>{body}</details>' if k == 'later' else body)
        inv = ''.join(f'<li>{seg_html(line)}</li>' for line in d['invent'])
        inv_checks = checks([s for line in d['invent'] for s in line])
        who = 'The owner’s text, exactly as written.' if d['slug'] == 'zei' else 'DRAFT, drafted by the coding agent (Claude, a closed model by Anthropic).'
        blocks.append(f'<section id="{esc(d["slug"])}"><h2>Learn more about {esc(d["name"])}</h2><p class="by">{who}</p>{"".join(secs)}<p><b>Room to invent.</b></p><ul>{inv}</ul>{f"<details class=check><summary>The book’s text for these cites</summary><ul>{inv_checks}</ul></details>" if inv_checks else ""}</section>')

    def gl_row(e):
        if e['status'] == 'existing':
            return f'<tr><td>{esc(e["term"])}</td><td class="ok">existing</td><td><code>{esc(e["glossaryId"])}</code></td><td>{esc(", ".join(e["in"]))}</td></tr>'
        if e['status'] == 'DRAFT':
            dr = e['draft']
            return f'<tr><td>{esc(e["term"])}</td><td class="draft">DRAFT</td><td><code>{esc(dr["slug"])}</code>: “{esc(dr["quote"])}” ({esc(dr["block"])}){(" — " + esc(dr["note"])) if dr.get("note") else ""}</td><td>{esc(", ".join(e["in"]))}</td></tr>'
        return f'<tr><td>{esc(e["term"])}</td><td class="bad">missing</td><td></td><td>{esc(", ".join(e["in"]))}</td></tr>'

    page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Learn More Texts</title>
<style>
:root {{ --bg: #f7f6f2; --surface: #ffffff; --ink: #1d1d1b; --muted: #5f5d57; --line: #dcd9d0; --accent: #2f5d8a; --ok: #2e6b3a; --bad: #8a3b2f; --draft: #8a5a0c; color-scheme: light; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --accent: #8fb6dc; --ok: #8fd19e; --bad: #e4a08f; --draft: #f0c25a; color-scheme: dark; }} }}
:root[data-theme="dark"] {{ --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --accent: #8fb6dc; --ok: #8fd19e; --bad: #e4a08f; --draft: #f0c25a; color-scheme: dark; }}
* {{ box-sizing: border-box; }}
html {{ -webkit-text-size-adjust: 100%; }}
body {{ margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }}
main {{ max-width: 720px; margin: 0 auto; padding: 24px 16px 64px; }}
h1 {{ font-size: 26px; margin: 0 0 4px; }} h2 {{ font-size: 20px; margin: 0 0 4px; }}
.draftmark {{ display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .06em; color: var(--bad); border: 1px solid currentColor; border-radius: 4px; padding: 0 6px; margin-left: 8px; vertical-align: middle; }}
.note {{ background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin: 14px 0 22px; font-size: 14px; }}
nav a, a {{ color: var(--accent); }}
section {{ background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 18px 0; }}
.by {{ color: var(--muted); font-size: 13px; margin: 0 0 8px; }}
.term {{ border-bottom: 1px dotted var(--accent); }} .term sup {{ color: var(--accent); font-size: 10px; }}
.term.draft {{ border-bottom-color: var(--draft); }} .term.draft sup {{ color: var(--draft); }}
.cites {{ font-size: 12px; color: var(--muted); }} .cites a {{ color: var(--muted); }}
details.spoil > summary {{ cursor: pointer; font-weight: 600; margin: 6px 0; }}
details.check > summary {{ cursor: pointer; font-size: 12px; color: var(--muted); }}
details.check ul {{ font-size: 12.5px; color: var(--muted); padding-left: 18px; }}
details.check li {{ margin: 4px 0; }}
.tablewrap {{ overflow-x: auto; }}
table {{ border-collapse: collapse; width: 100%; font-size: 13px; }} th, td {{ border-bottom: 1px solid var(--line); padding: 4px 6px; text-align: left; vertical-align: top; }}
.ok {{ color: var(--ok); }} .bad {{ color: var(--bad); }} .draft {{ color: var(--draft); }}
</style>
</head>
<body>
<main>
<h1>Learn More Texts<span class="draftmark">DRAFT</span></h1>
<div class="note">The expandable “Learn more about …” texts for the seven challenge characters. Zei’s is the owner’s text, exactly as written; the other six are DRAFT, drafted by the coding agent (Claude, a closed model by Anthropic). Every quotation was checked as an exact substring of its cited block; under each section, “The book’s text for these cites” shows the blocks for checking the paraphrases. ⓘ marks a glossary term (amber: no entry yet; a DRAFT entry is in the table at the end). Block links open the reader.</div>
<nav>{" · ".join(f'<a href="#{esc(d["slug"])}">{esc(d["name"])}</a>' for d in chars)} · <a href="#glossary">Glossary</a></nav>
{"".join(blocks)}
<section id="glossary"><h2>Glossary terms</h2><p class="by">Every ⓘ term: its existing entry in content/snowmoon/glossary.json, or a DRAFT entry quoted word for word from the book.</p><div class="tablewrap"><table><thead><tr><th>Term</th><th>Status</th><th>Entry</th><th>Used in</th></tr></thead><tbody>{"".join(gl_row(e) for e in entries)}</tbody></table></div></section>
</main>
</body>
</html>
'''
    open(os.path.join(out, 'index.html'), 'w').write(page)
    print(f'{len(chars)} characters; {len(entries)} terms ({sum(e["status"] == "existing" for e in entries)} existing, {sum(e["status"] == "DRAFT" for e in entries)} DRAFT, {len(missing)} missing: {missing})')


if __name__ == '__main__':
    main()
