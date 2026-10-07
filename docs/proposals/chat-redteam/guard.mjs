// Run the output guard over a set of replies. Usage: node guard.mjs <guard-model> <in.json...> > out
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const [model, ...files] = process.argv.slice(2);
const env = Object.fromEntries(readFileSync(path.join(here, '../.env.dev'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const PRICES = JSON.parse(readFileSync(path.join(here, '../gw-models.json'), 'utf8')).data.reduce((m, x) => ((m[x.id] = x.pricing), m), {});
const POLICY = readFileSync(path.join(here, 'guard-policy.md'), 'utf8');
let cost = 0;
const out = [];
for (const f of files) {
  const d = JSON.parse(readFileSync(f, 'utf8'));
  for (const r of d.results) {
    const reply = (r.reply ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const body = {
      model,
      temperature: 0,
      max_tokens: 600,
      messages: [
        { role: 'system', content: POLICY },
        { role: 'user', content: `USER REQUEST:\n${r.q}\n\nASSISTANT REPLY:\n${reply}` },
      ],
    };
    const res = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${env.VERCEL_OIDC_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json();
    const u = j.usage ?? {};
    const c = (u.prompt_tokens ?? 0) * Number(PRICES[model].input) + (u.completion_tokens ?? 0) * Number(PRICES[model].output);
    cost += c;
    const verdict = (j.choices?.[0]?.message?.content ?? '').trim();
    out.push({ source: d.model, n: r.n, kind: r.kind, verdict: verdict.slice(0, 200), cost_usd: c });
    process.stderr.write('.');
  }
}
console.log(JSON.stringify({ model, cost_usd: cost, out }, null, 1));
