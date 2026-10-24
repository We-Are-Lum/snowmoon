"""
Embedding ranks for the search check (docs/proposals/chat-eval/search/). Free, local: no outside service at
question time. Embeds every searchable block of the book and each question with BAAI/bge-small-en-v1.5
(MIT, 33M parameters, 384 dimensions), and writes, per question, the block ids within the chapter limit
ranked by cosine similarity (the DENSE file format scripts/eval-chat.ts and eval-search.ts read).

  /Users/nathan/snowmoon/.venv-image/bin/python -I scripts/eval-embed.py QUESTIONS.json OUT.json [LIMIT] [WINDOW]

WINDOW=n embeds each block together with the n blocks before it (so a line of dialogue carries the names and
the scene around it); the rank is still the block's own id.

The model is downloaded once from Hugging Face (the only network use) and runs on this machine's CPU.
"""
import json
import pathlib
import re
import sys
import time

import torch
from transformers import AutoModel, AutoTokenizer

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODEL = 'BAAI/bge-small-en-v1.5'
QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '
KINDS = {'paragraph', 'quote', 'screen'}

questions = json.loads(pathlib.Path(sys.argv[1]).read_text())
out = pathlib.Path(sys.argv[2])
limit = int(sys.argv[3]) if len(sys.argv) > 3 else 15
window = int(sys.argv[4]) if len(sys.argv) > 4 else 0

ids, texts = [], []
for n in range(1, limit + 1):
    doc = json.loads((ROOT / f'content/snowmoon/text/chapter-{n}.json').read_text())
    plain = [re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', b['content'])).strip() if b['kind'] in KINDS else '' for b in doc['blocks']]
    for k, b in enumerate(doc['blocks']):
        if b['kind'] in KINDS:
            ids.append(f'c{n}-b{b["idx"]}')
            texts.append(' '.join(t for t in plain[max(0, k - window):k + 1] if t))

tok = AutoTokenizer.from_pretrained(MODEL)
model = AutoModel.from_pretrained(MODEL).eval()


def embed(batch):
    with torch.no_grad():
        enc = tok(batch, padding=True, truncation=True, max_length=512, return_tensors='pt')
        cls = model(**enc).last_hidden_state[:, 0]
        return torch.nn.functional.normalize(cls, dim=-1)


t0 = time.time()
blocks = torch.cat([embed(texts[i:i + 64]) for i in range(0, len(texts), 64)])
t1 = time.time()
q = embed([QUERY_PREFIX + x['question'] for x in questions])
t2 = time.time()
sims = q @ blocks.T
ranks = {x['id']: [ids[j] for j in sims[i].argsort(descending=True)[:50].tolist()] for i, x in enumerate(questions)}
out.write_text(json.dumps({'model': MODEL + (f' (window {window})' if window else ''), 'blocks': len(ids), 'block_seconds': round(t1 - t0, 1),
                           'query_ms_each': round(1000 * (t2 - t1) / len(questions), 1), 'ranks': ranks}, indent=1) + '\n')
print(f'{len(ids)} blocks in {t1 - t0:.1f}s; {len(questions)} questions at {1000 * (t2 - t1) / len(questions):.1f} ms each -> {out}')
