"""
The book's blocks as plain text, for the "Learn more" texts (owner, 2026-11-12): tags removed (speaker-colour spans,
device views, tables), Markdown marks removed (** * _ and quote-block "> "), whitespace collapsed. Nothing else is
changed, so a quote that is an exact substring of this text is the book's words.

Block ids: c<chapter>-b<block>, and ranges c<chapter>-b<from>–b<to> (en dash or hyphen).
"""
import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_chapters = {}


def chapter(n):
    if n not in _chapters:
        d = json.load(open(os.path.join(ROOT, 'content', 'snowmoon', 'text', f'chapter-{n}.json')))
        _chapters[n] = d['blocks']
    return _chapters[n]


def plain(content):
    t = re.sub(r'<br\s*/?>', ' ', content)
    t = re.sub(r'</(p|div|tr|td|th|b|li|h\d)>', ' ', t)
    t = re.sub(r'<hr[^>]*>', ' ', t)
    t = re.sub(r'<[^>]+>', '', t)
    t = html.unescape(t)
    t = re.sub(r'^\s*>\s?', '', t, flags=re.M)
    t = t.replace('**', '').replace('*', '')
    t = re.sub(r'(?<!\w)_([^_]+)_(?!\w)', r'\1', t)
    return re.sub(r'\s+', ' ', t).strip()


CITE = re.compile(r'^c(\d+)-b(\d+)(?:\s*[–-]\s*b?(\d+))?$')


def parse(cite):
    m = CITE.match(cite.strip())
    if not m:
        raise ValueError(f'bad cite {cite!r}')
    ch, a, b = int(m.group(1)), int(m.group(2)), m.group(3)
    b = int(b) if b else a
    if b < a:
        raise ValueError(f'bad range {cite!r}')
    return ch, list(range(a, b + 1))


def text(cite):
    """The plain text of every block a cite covers, joined with spaces."""
    ch, ids = parse(cite)
    blocks = chapter(ch)
    out = []
    for i in ids:
        if i >= len(blocks) or blocks[i]['idx'] != i:
            raise ValueError(f'{cite}: no block {i}')
        out.append(plain(blocks[i]['content']))
    return ' '.join(out)


def search(pattern, chapters=range(1, 40)):
    """Blocks whose plain text matches a regex: [(cite, text)]."""
    rx = re.compile(pattern)
    hits = []
    for n in chapters:
        p = os.path.join(ROOT, 'content', 'snowmoon', 'text', f'chapter-{n}.json')
        if not os.path.exists(p):
            continue
        for b in chapter(n):
            t = plain(b['content'])
            if rx.search(t):
                hits.append((f'c{n}-b{b["idx"]}', t))
    return hits


if __name__ == '__main__':
    import sys
    # python3 -I scripts/learn-more/book.py c2-b98–b103      -> the blocks' text
    # python3 -I scripts/learn-more/book.py --search 'Bai\b'  -> every matching block
    if sys.argv[1] == '--search':
        for c, t in search(sys.argv[2]):
            print(f'{c}: {t}')
    else:
        for c in sys.argv[1:]:
            print(f'{c}: {text(c)}')
