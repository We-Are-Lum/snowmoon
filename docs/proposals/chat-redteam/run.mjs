// Red-team the no-writing rule. Usage: node run.mjs <model> <out.json>
// Reads the OIDC token from ../.env.dev; book blocks from ../read.tsv.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const [model, out] = process.argv.slice(2);
const env = Object.fromEntries(readFileSync(path.join(here, '../.env.dev'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const TOKEN = env.VERCEL_OIDC_TOKEN;
const PRICES = JSON.parse(readFileSync(path.join(here, '../gw-models.json'), 'utf8')).data.reduce((m, x) => ((m[x.id] = x.pricing), m), {});
const blocks = readFileSync(path.join(here, '../read.tsv'), 'utf8').trim().split('\n').map((l) => { const [id, kind, text] = l.split('\t'); return { id, ch: Number(id.slice(1, id.indexOf('-'))), kind, text }; }).filter((b) => b.kind === 'P' || b.kind === 'Q');
const SYSTEM = readFileSync(path.join(here, 'system.md'), 'utf8');
const LIMIT = 15;

function retrieve(q, k = 8) {
  const words = q.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  return blocks.filter((b) => b.ch <= LIMIT).map((b) => ({ b, s: words.reduce((n, w) => n + (b.text.toLowerCase().includes(w) ? 1 : 0), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.b);
}

const attacks = JSON.parse(readFileSync(path.join(here, 'attacks.json'), 'utf8'));
const results = [];
let cost = 0;
for (const a of attacks) {
  const passages = retrieve(a.retrieve ?? a.q).map((b) => `[${b.id}] ${b.text}`).join('\n');
  const body = {
    model,
    temperature: 0.7,
    max_tokens: 1200,
    messages: [
      { role: 'system', content: SYSTEM.replace('{{LIMIT}}', String(LIMIT)) },
      { role: 'user', content: `Passages from chapters 1–${LIMIT}:\n${passages}\n\nQuestion: ${a.q}` },
    ],
  };
  const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { console.error(r.status, JSON.stringify(j).slice(0, 300)); results.push({ ...a, error: j }); continue; }
  const u = j.usage ?? {};
  const p = PRICES[model];
  const c = (u.prompt_tokens ?? 0) * Number(p.input) + (u.completion_tokens ?? 0) * Number(p.output);
  cost += c;
  results.push({ ...a, reply: j.choices?.[0]?.message?.content ?? '', usage: u, cost_usd: c, gateway_cost: j.usage?.cost ?? null, id: j.id, model_reported: j.model });
  process.stdout.write('.');
}
writeFileSync(out, JSON.stringify({ model, cost_usd: cost, results }, null, 1));
console.log(`\n${model}: ${results.length} prompts, $${cost.toFixed(5)}`);
