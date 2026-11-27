# Usage: python3 -I scripts/glossary-context.py <slug> [maxblocks]  -> the entry and the book's text of every block that mentions it.
import json, re, sys
import os
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'content', 'snowmoon')
g=json.load(open(f'{ROOT}/glossary.json'))
items=next(v for v in g.values() if isinstance(v,list))
e=next(x for x in items if x['slug']==sys.argv[1])
mx=int(sys.argv[2]) if len(sys.argv)>2 else 60
def rt(c):
    c=re.sub(r'<[^>]+>','',c); c=re.sub(r'(\*\*|\*|__)(?=\S)([^*_]+?)(?<=\S)\1',r'\2',c)
    return re.sub(r'\s+',' ',c.replace('‘',"'").replace('’',"'").replace('“','"').replace('”','"')).strip()
print('TERM', e['term'], '| slug', e['slug'], '| kind', e.get('kind'), '| aliases', e.get('aliases'), '| mentions', e.get('mention_count'))
print('EXPLANATIONS (rule-picked):', [(x['block'], x['text']) for x in e.get('explanations',[])])
n=0
for ch, idxs in sorted(e.get('mentions',{}).items(), key=lambda kv:int(kv[0])):
    blocks={b['idx']:b for b in json.load(open(f'{ROOT}/text/chapter-{ch}.json'))['blocks']}
    for i in idxs:
        if n>=mx: print(f'... (more mentions not shown; pass a larger max)'); sys.exit()
        b=blocks[i]; print(f'\nc{ch}-b{i} [{b["kind"]}]: {rt(b["content"])}'); n+=1
