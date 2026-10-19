// Speaking-mouth test edits on version 2's GPT frames (owner's long run, 2026-10-19, item 5): candidates only, never
// in a cut. One GPT Image 2.5 Sunburst (OpenAI, a closed model) edit per job in jobs.json, through Vercel AI Gateway's
// /v1/images/edits, the frame itself as the only picture sent. AI_GATEWAY_API_KEY is read from the environment and
// never printed. Every call is logged to costs.jsonl with its reported cost; the run stops before any call that could
// take this job past the $4.00 cap (worst case per call counted as $0.08).
// Usage: node mouths.mjs <try-tag> [id,id,...]
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const HERE = new URL('.', import.meta.url).pathname;
const FRAMES = HERE + '../gpt/frames/';
const MODEL = 'openai/gpt-image-2.5-sunburst';
const SIZE = '1536x864';
// On every call (owner, 2026-10-19): the gateway routes only to a provider that doesn't train on prompts, or refuses
// the call (no_providers_available). No zeroDataRetention: this model has none, and the gateway refuses it.
const GATEWAY_OPTIONS = { gateway: { disallowPromptTraining: true } };
const CAP = 4.0;
const WORST = 0.08;
const [tag = 't1', only] = process.argv.slice(2);
const key = process.env.AI_GATEWAY_API_KEY;
if (!key) throw new Error('AI_GATEWAY_API_KEY not set');
const jobs = JSON.parse(readFileSync(HERE + 'jobs.json', 'utf8')).filter((j) => !only || only.split(',').includes(j.id));
mkdirSync(HERE + 'candidates', { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex');
const ledger = HERE + 'costs.jsonl';
const spent = () => (existsSync(ledger) ? readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean).reduce((n, l) => n + JSON.parse(l).cost_usd, 0) : 0);

export const promptFor = (j) =>
  [
    'Edit this hand-drawn science fiction comic book panel (ink linework, flat cel-shaded colour).',
    `Change only one thing: the mouth of ${j.speaker_desc}. He or she is ${j.manner}.`,
    j.listener_desc ? `Every other visible face keeps a closed mouth: ${j.listener_desc}.` : '',
    'Keep everything else exactly as it is: the same framing and crop, the same faces, eyes, eyebrows, hair, pose, hands, clothes, linework, colours, lighting and background. Draw nothing new. No text, letters or speech balloons.',
  ].filter(Boolean).join(' ');

for (const j of jobs) {
  const out = `${HERE}candidates/${j.id}-${tag}.png`;
  if (existsSync(out)) { console.log(j.id, 'exists'); continue; }
  if (spent() + WORST > CAP) { console.log(j.id, `STOPPED: the next call could pass the $${CAP} cap (spent $${spent().toFixed(4)})`); break; }
  const src = readFileSync(FRAMES + j.frame);
  const prompt = promptFor(j);
  const t0 = Date.now();
  let r, body;
  for (let a = 0; a < 3; a++) {
    r = await fetch('https://ai-gateway.vercel.sh/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, prompt, images: [{ image_url: 'data:image/png;base64,' + src.toString('base64') }], n: 1, size: SIZE, providerOptions: GATEWAY_OPTIONS }) });
    const text = await r.text();
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
    if (r.ok && body.data?.[0]?.b64_json) break;
    if (![429, 500, 502, 503, 504].includes(r.status)) break;
    await new Promise((z) => setTimeout(z, 4000 * (a + 1)));
  }
  const cost = Number(body?.providerMetadata?.gateway?.cost ?? 0);
  appendFileSync(ledger, JSON.stringify({ id: `${j.id}-${tag}`, frame: j.frame, endpoint: `ai-gateway ${MODEL} (closed model)`, status: r.status, ok: Boolean(r.ok && body.data?.[0]?.b64_json), cost_usd: cost, generation_id: body?.providerMetadata?.gateway?.generationId ?? null, at: new Date().toISOString() }) + '\n');
  if (!r.ok || !body.data?.[0]?.b64_json) { console.log(j.id, 'FAILED', r.status, JSON.stringify(body?.error ?? body).slice(0, 300)); continue; }
  const buf = Buffer.from(body.data[0].b64_json, 'base64');
  writeFileSync(out, buf);
  const rec = {
    kind: 'speaking-mouth test edit', candidate_only: 'not in any cut or on the site (owner, 2026-10-19)',
    closed_model: true, label: 'closed model', model: MODEL, model_name: 'GPT Image 2.5 Sunburst (OpenAI)', host: 'Vercel AI Gateway /v1/images/edits',
    date: new Date().toISOString(), job: j, prompt, prompt_by: 'drafted by the coding agent',
    references: [{ file: `adaptations/fifteen-days/preprod/gpt/frames/${j.frame}`, sha256: sha(src) }], request: { size: SIZE, n: 1, providerOptions: GATEWAY_OPTIONS },
    response_meta: { ...body, data: undefined }, cost_usd: cost, output: { file: `candidates/${j.id}-${tag}.png`, sha256: sha(buf), bytes: buf.length }, ms: Date.now() - t0,
  };
  writeFileSync(`${HERE}candidates/${j.id}-${tag}.recipe.json`, JSON.stringify(rec, null, 1));
  console.log(j.id, 'ok', `$${cost}`, `${Math.round((Date.now() - t0) / 1000)}s`);
}
console.log(`spent on this job: $${spent().toFixed(4)} of $${CAP}`);
