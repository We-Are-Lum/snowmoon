/**
 * The owner's grading page (owner, 2026-10-24: "neither grader decides the bar … my marks count"). One
 * standalone HTML file: each item shows the question, the passages actually sent (linked to the chapter on
 * snowmoon.party), the answer as shown (with any sentences the claim filter dropped, marked), and, if given,
 * each grader's verdict and reason. Right / Wrong buttons and a note per item; marks are kept in the
 * browser (localStorage) and saved with "Export marks" as a JSON file to send back. Free: reads files only.
 *
 *   npx tsx scripts/chat-grading-page.ts SPEC.json OUT.html
 *
 * SPEC: { "title", "id" (localStorage key), "intro", "gradersHidden" (true: behind a "Show graders" toggle),
 *   "items": "disputed" | "all", "include": ["f08"] (always included), "runs": [{ "name", "file",
 *   "graders": [{ "name", "key", "grades" }] }] }
 * With "disputed", an item is included when the graders don't all give the same verdict.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const [specFile, outFile] = process.argv.slice(2);
interface Spec {
  title: string; id: string; intro: string; gradersHidden?: boolean; items: 'disputed' | 'all'; include?: string[];
  runs: { name: string; file: string; graders: { name: string; key: string; grades: string }[] }[];
}
interface Call { kind: string; text: string }
interface Row { id: string; question: string; gold: string[]; answer_fact?: string; passages_sent: string[]; state: string; answer_as_shown: string; calls?: Call[] }
interface Grade { id: string; label: string; correct: string; note?: string }
const spec = JSON.parse(readFileSync(specFile, 'utf8')) as Spec;
const rel = (f: string) => path.resolve(path.dirname(specFile), f);

const textOf = new Map<string, string>();
for (let n = 1; n <= 32; n++) {
  const doc = JSON.parse(readFileSync(path.join(ROOT, `content/snowmoon/text/chapter-${n}.json`), 'utf8')) as { blocks: { idx: number; content: string }[] };
  for (const b of doc.blocks) textOf.set(`c${n}-b${b.idx}`, b.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}
/** The claim filter's sentence split (scripts/eval-chat.ts), to show which sentences it dropped. */
const sentencesOf = (t: string) => t.split(/\n+/).flatMap((line) => line.split(/(?<=[.!?](?:\s*\[[^\]]+\])*)\s+(?=[A-Z"“*(-])/)).map((x) => x.trim()).filter(Boolean);

const items = [];
for (const run of spec.runs) {
  const rows = (JSON.parse(readFileSync(rel(run.file), 'utf8')) as { results: Row[] }).results;
  const graders = run.graders.map((g) => {
    const key = JSON.parse(readFileSync(rel(g.key), 'utf8')) as Record<string, Record<string, string>>;
    const grades = (JSON.parse(readFileSync(rel(g.grades), 'utf8')) as { items: Grade[] }).items;
    const mine = new Map<string, Grade>();
    for (const x of grades) if (path.basename(key[x.id]?.[x.label] ?? '') === path.basename(run.file)) mine.set(x.id, x);
    return { name: g.name, mine };
  });
  for (const r of rows) {
    const verdicts = graders.map((g) => ({ grader: g.name, verdict: g.mine.get(r.id)?.correct ?? '–', reason: g.mine.get(r.id)?.note ?? '' }));
    const disputed = new Set(verdicts.map((v) => v.verdict)).size > 1;
    if (spec.items === 'disputed' && !disputed && !(spec.include ?? []).includes(r.id)) continue;
    const answers = (r.calls ?? []).filter((c) => c.kind === 'answer');
    const filter = (r.calls ?? []).filter((c) => c.kind === 'filter').at(-1);
    const dropNums = filter && /^DROP\b/i.test(filter.text.trim()) ? (filter.text.split('\n')[0].match(/\d+/g) ?? []).map(Number) : [];
    const dropped = dropNums.length && answers.length ? sentencesOf(answers.at(-1)!.text).filter((_, i) => dropNums.includes(i + 1)) : [];
    items.push({
      run: run.name, id: r.id, question: r.question, gold: r.gold, fact: r.answer_fact ?? '',
      passages: r.passages_sent.map((id) => ({ id, text: textOf.get(id) ?? '' })),
      shown: r.state === 'answer' ? r.answer_as_shown : r.state === 'unsupported' ? '(Not shown. The reader sees: "The passages don\'t say.")' : `(Not shown: ${r.state})`,
      dropped, verdicts, disputed,
    });
  }
}

const data = JSON.stringify({ title: spec.title, id: spec.id, intro: spec.intro, gradersHidden: !!spec.gradersHidden, items }).replace(/</g, '\\u003c');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${spec.title.replace(/</g, '&lt;')}</title>
<style>
body{font:16px/1.5 -apple-system,system-ui,sans-serif;margin:0;background:#f6f5f2;color:#1d1d1f}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:10px 16px;z-index:2;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
main{max-width:860px;margin:0 auto;padding:16px}
.item{background:#fff;border:1px solid #ddd;border-radius:10px;padding:16px;margin:0 0 18px}
.item.right{border-left:6px solid #2e7d32}.item.wrong{border-left:6px solid #c62828}
.run{display:inline-block;font-size:13px;padding:1px 8px;border-radius:9px;background:#eee;margin-right:6px}
.q{font-weight:600;font-size:18px;margin:6px 0}.fact{color:#555;font-size:14px}
details{margin:8px 0}summary{cursor:pointer;color:#0b5cad}
.p{font-size:14px;margin:4px 0;padding-left:8px;border-left:3px solid #eee}.p.gold{border-left-color:#e0a800;background:#fffbe6}
.p a{font-family:ui-monospace,monospace;font-size:12px;margin-right:6px}
.answer{background:#f2f6fb;border-radius:8px;padding:10px;white-space:pre-wrap}
.dropped{background:#fdecea;border-radius:8px;padding:8px;margin-top:6px;font-size:14px}.dropped s{color:#8a1c1c}
table{border-collapse:collapse;width:100%;font-size:14px;margin-top:8px}td,th{border-top:1px solid #eee;padding:4px 6px;text-align:left;vertical-align:top}
.v-wrong{color:#c62828;font-weight:600}.v-yes{color:#2e7d32;font-weight:600}
.marks{display:flex;gap:8px;margin-top:10px;align-items:flex-start;flex-wrap:wrap}
button{font:inherit;padding:6px 14px;border-radius:8px;border:1px solid #bbb;background:#fff;cursor:pointer}
button.on.r{background:#2e7d32;color:#fff;border-color:#2e7d32}button.on.w{background:#c62828;color:#fff;border-color:#c62828}
textarea{flex:1;min-width:220px;min-height:38px;font:inherit;font-size:14px;padding:6px;border-radius:8px;border:1px solid #ccc}
.graders.hidden{display:none}
</style></head><body>
<header><strong id="t"></strong><span id="count"></span><label id="tg"><input type="checkbox" id="showg"> Show graders</label><button id="export">Export marks</button></header>
<main><p id="intro"></p><div id="list"></div></main>
<script>
const D=${data};
const K='snowmoon-grading:'+D.id;
const marks=JSON.parse(localStorage.getItem(K)||'{}');
const save=()=>{localStorage.setItem(K,JSON.stringify(marks));count()};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cite=s=>esc(s).replace(/\\[(c(\\d+)-b(\\d+))\\]/g,(m,id,c)=>'<a href="https://snowmoon.party/chapter/'+c+'#'+id+'" target="_blank">['+id+']</a>');
document.getElementById('t').textContent=D.title;
document.getElementById('intro').textContent=D.intro;
const showg=document.getElementById('showg');
if(!D.gradersHidden){showg.checked=true;document.getElementById('tg').style.display='none'}
showg.onchange=()=>document.querySelectorAll('.graders').forEach(g=>g.classList.toggle('hidden',!showg.checked));
function count(){const n=Object.values(marks).filter(m=>m.mark).length;const w=Object.values(marks).filter(m=>m.mark==='wrong').length;document.getElementById('count').textContent=n+' / '+D.items.length+' marked · '+w+' wrong'}
const list=document.getElementById('list');
D.items.forEach((it,i)=>{
  const k=it.run+' '+it.id; const m=marks[k]||{};
  const el=document.createElement('div'); el.className='item'+(m.mark?' '+m.mark:'');
  el.innerHTML='<div><span class="run">'+esc(it.run)+'</span><span class="run">'+esc(it.id)+'</span>'+(it.disputed?'<span class="run">graders differ</span>':'')+'</div>'+
   '<div class="q">'+esc(it.question)+'</div>'+(it.fact?'<div class="fact">Expected (written with the question): '+esc(it.fact)+' · answering block '+it.gold.map(g=>cite('['+g+']')).join(' ')+'</div>':'')+
   '<details><summary>Passages sent to the model ('+it.passages.length+')</summary>'+it.passages.map(p=>'<div class="p'+(it.gold.includes(p.id)?' gold':'')+'">'+cite('['+p.id+']')+esc(p.text)+'</div>').join('')+'</details>'+
   '<div class="answer">'+cite(it.shown)+'</div>'+
   (it.dropped.length?'<div class="dropped">Dropped by the claim filter (not shown to the reader):<br>'+it.dropped.map(s=>'<s>'+cite(s)+'</s>').join('<br>')+'</div>':'')+
   '<div class="graders'+(D.gradersHidden?' hidden':'')+'"><table><tr><th>Grader</th><th>Verdict</th><th>Reason</th></tr>'+it.verdicts.map(v=>'<tr><td>'+esc(v.grader)+'</td><td class="v-'+esc(v.verdict)+'">'+esc(v.verdict)+'</td><td>'+esc(v.reason)+'</td></tr>').join('')+'</table></div>'+
   '<div class="marks"><button class="r">Right</button><button class="w">Wrong</button><textarea placeholder="Note (optional)"></textarea></div>';
  const [r,w]=el.querySelectorAll('button'); const ta=el.querySelector('textarea'); ta.value=m.note||'';
  const paint=()=>{const x=marks[k]||{};r.classList.toggle('on',x.mark==='right');w.classList.toggle('on',x.mark==='wrong');el.className='item'+(x.mark?' '+x.mark:'')};
  r.onclick=()=>{marks[k]={...(marks[k]||{}),mark:'right'};paint();save()};
  w.onclick=()=>{marks[k]={...(marks[k]||{}),mark:'wrong'};paint();save()};
  ta.oninput=()=>{marks[k]={...(marks[k]||{}),note:ta.value};save()};
  paint(); list.appendChild(el);
});
count();
document.getElementById('export').onclick=()=>{
  const out={page:D.id,title:D.title,exported:new Date().toISOString(),marks:D.items.map(it=>({run:it.run,id:it.id,...(marks[it.run+' '+it.id]||{})}))};
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{type:'application/json'}));a.download=D.id+'-marks.json';a.click();
};
</script></body></html>`;
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
console.log(`${items.length} items → ${outFile}`);
