"""
Checks the "Learn more" drafts (owner, 2026-11-12) against the book, and renders them as plain text.

For each character file (<drafts>/<slug>.json, sections who/start/later/drives as segment arrays, invent as an array
of segment arrays; segments are {"text"} | {"term", "glossaryId"} | {"cite"}):
  - every cite parses and names blocks that exist;
  - every quotation (text between straight or curly double quotes) is an exact substring of the plain text of at least
    one cite in the same section (tags and Markdown marks removed: scripts/learn-more/book.py);
  - every glossaryId exists in content/snowmoon/glossary.json (or is null);
  - "later" is where spoilers go; "invent" ends with the looks line;
  - for Zei, the render must equal the owner's text exactly (zei-owner.txt).
Prints problems and exits 1 on any. `--facts` also prints each section's cites with their block text for a human check.

  python3 -I scripts/learn-more/verify.py <drafts dir> [--facts]
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import book  # noqa: E402

SECTIONS = [('who', 'Who {p} is.'), ('start', 'At the start.'), ('later', 'Later in the book (spoilers).'), ('drives', 'What drives {o}.')]
PRON = {'he': ('he', 'him', 'His'), 'she': ('she', 'her', 'Her')}
QUOTE = re.compile(r'"([^"]+)"|“([^”]+)”')
glossary = {t['slug'] for t in json.load(open(os.path.join(book.ROOT, 'content', 'snowmoon', 'glossary.json')))['terms']}


def render(segs, mark=True):
    """Plain text: terms get ⓘ, a run of cites becomes "(a, b)"."""
    out, cites = [], []

    def flush():
        if cites:
            out.append('(' + ', '.join(cites) + ')')
            cites.clear()
    for s in segs:
        if 'cite' in s:
            cites.append(s['cite'])
            continue
        flush()
        if 'term' in s:
            out.append(s['term'] + ('ⓘ' if mark else ''))
        else:
            out.append(s['text'])
    flush()
    return ''.join(out)


def render_character(d):
    p, o, P = PRON[d['pronoun']]
    lines = [f'Learn more about {d["name"]}', '']
    for key, head in SECTIONS:
        lines.append(head.format(p=p, o=o) + ' ' + render(d[key]))
        lines.append('')
    lines.append('Room to invent.')
    for line in d['invent']:
        lines.append('- ' + render(line))
    return '\n'.join(lines) + '\n'


def check(d, facts=False):
    problems = []
    p, o, P = PRON[d['pronoun']]
    for key in [k for k, _ in SECTIONS] + ['invent']:
        segs = [s for line in d[key] for s in line] if key == 'invent' else d[key]
        cites = [s['cite'] for s in segs if 'cite' in s]
        texts = {}
        for c in cites:
            try:
                texts[c] = book.text(c)
            except Exception as e:  # noqa: BLE001
                problems.append(f'{d["slug"]}.{key}: {e}')
        for s in segs:
            if 'term' in s and s.get('glossaryId') is not None and s['glossaryId'] not in glossary:
                problems.append(f'{d["slug"]}.{key}: glossaryId {s["glossaryId"]!r} not in glossary.json')
        plain = render(segs, mark=False)
        for m in QUOTE.finditer(plain):
            q = m.group(1) or m.group(2)
            q_norm = q.replace('’', "'")
            if not any(q_norm in t.replace('’', "'") for t in texts.values()):
                problems.append(f'{d["slug"]}.{key}: quote not found in its section\'s cites: "{q}"')
        if facts:
            print(f'\n## {d["slug"]} · {key}\n{render(segs)}')
            for c, t in texts.items():
                print(f'  [{c}] {t[:700]}')
    last = render(d['invent'][-1], mark=False) if d['invent'] else ''
    if last != f'{P} looks: every look on this site is this edition\'s invention.':
        problems.append(f'{d["slug"]}.invent: must end with "{P} looks: every look on this site is this edition\'s invention."')
    if not 3 <= len(d['invent']) <= 5:
        problems.append(f'{d["slug"]}.invent: {len(d["invent"])} lines (3–5 wanted)')
    return problems


def main():
    drafts = sys.argv[1]
    facts = '--facts' in sys.argv
    problems = []
    for f in sorted(os.listdir(drafts)):
        if not f.endswith('.json'):
            continue
        d = json.load(open(os.path.join(drafts, f)))
        problems += check(d, facts)
        if d['slug'] == 'zei':
            owner = open(os.path.join(os.path.dirname(drafts.rstrip('/')), 'zei-owner.txt')).read()
            if render_character(d) != owner:
                problems.append('zei: the render differs from the owner\'s text')
    for p in problems:
        print('PROBLEM', p)
    print(f'{len(problems)} problem(s)')
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
