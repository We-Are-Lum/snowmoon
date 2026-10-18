// GPT cut (owner, 2026-10-18, private; closed model, comparison only): one GPT Image draw per job in plan.json,
// through the AI Gateway's /v1/images/edits with the AI_GATEWAY_API_KEY already on this Mac (never printed).
// Usage: node gpt.mjs <try-tag> [id,id,...]   e.g. node gpt.mjs g1   |   node gpt.mjs g2 cov-cafe-X,cov-cafe-Y
// Each output gets a recipe labelled "closed model"; each call's reported cost goes to costs.jsonl (merged into
// ledger-s7 by ledger.py). Stops before a call that could take this job past $10.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const HERE = new URL('.', import.meta.url).pathname;
const SC = '/Users/nathan/snowmoon-scenes/';
const MODEL = 'openai/gpt-image-2.5-sunburst';
const SIZE = '1536x864';
const CAP = 10;
const [tag, only] = process.argv.slice(2);
const key = process.env.AI_GATEWAY_API_KEY;
if (!key) throw new Error('AI_GATEWAY_API_KEY not set');
const plan = JSON.parse(readFileSync(HERE + (process.env.PLAN || 'plan.json'), 'utf8'));
const ids = only ? new Set(only.split(',')) : null;
const jobs = plan.filter((j) => !ids || ids.has(j.id));
mkdirSync(HERE + 'raw', { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex');
const spent = () => (existsSync(HERE + 'costs.jsonl') ? readFileSync(HERE + 'costs.jsonl', 'utf8').trim().split('\n').filter(Boolean).reduce((n, l) => n + JSON.parse(l).cost_usd, 0) : 0);
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++];
    const out = `${HERE}raw/${j.id}-${tag}.png`;
    if (existsSync(out)) { console.log(j.id, 'exists'); continue; }
    if (spent() + 0.08 > CAP) { console.log(j.id, 'SKIPPED: the $10 cap'); continue; }
    const images = j.refs.map((f) => ({ image_url: 'data:image/png;base64,' + readFileSync(SC + f).toString('base64') }));
    const t0 = Date.now();
    let r, text, body;
    for (let a = 0; a < 3; a++) {
      r = await fetch('https://ai-gateway.vercel.sh/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, prompt: j.prompt, images, n: 1, size: SIZE }) });
      text = await r.text();
      try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
      if (r.ok && body.data?.[0]?.b64_json) break;
      if (![429, 500, 502, 503, 504].includes(r.status)) break;
      await new Promise((z) => setTimeout(z, 4000 * (a + 1)));
    }
    if (!r.ok || !body.data?.[0]?.b64_json) { console.log(j.id, 'FAILED', r.status, JSON.stringify(body).slice(0, 300)); continue; }
    const buf = Buffer.from(body.data[0].b64_json, 'base64');
    writeFileSync(out, buf);
    const meta = { ...body, data: undefined };
    const cost = Number(meta.providerMetadata?.gateway?.cost ?? 0);
    appendFileSync(HERE + 'costs.jsonl', JSON.stringify({ id: `${j.id}-${tag}`, endpoint: `ai-gateway ${MODEL} (closed model, gpt-cut, private)`, cost_usd: cost, at: new Date().toISOString() }) + '\n');
    const rec = {
      closed_model: true, label: 'closed model', model: MODEL, model_name: 'GPT Image 2.5 Sunburst (OpenAI)', route: 'Vercel AI Gateway /v1/images/edits (AI_GATEWAY_API_KEY)',
      date: new Date().toISOString(), purpose: process.env.PURPOSE || 'gpt-cut: a private full-cut comparison for the owner (2026-10-18); not in the cut or on the site',
      v6_picture: j.v6_image, edited_from: j.refs[0], from: { base: j.base, finish: j.finish, edits: j.edits }, prompt: j.prompt,
      references: j.refs.map((f) => ({ file: f, sha256: sha(readFileSync(SC + f)) })), request: { size: SIZE, n: 1 },
      response_meta: meta, cost_usd: cost, output: { file: out, sha256: sha(buf), bytes: buf.length }, ms: Date.now() - t0,
    };
    writeFileSync(`${HERE}raw/${j.id}-${tag}.recipe.json`, JSON.stringify(rec, null, 1));
    console.log(j.id, 'ok', `$${cost}`, `${Math.round((Date.now() - t0) / 1000)}s`);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
console.log(`job spend so far $${spent().toFixed(4)}`);
