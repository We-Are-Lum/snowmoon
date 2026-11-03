/**
 * Prompt to version (spike, 2026-10-21): a plain-language idea becomes a schema-valid version, each
 * change tied to a book passage or marked invented, then playtested (200 computer matches). If it
 * fails, the smallest fix found by a search over the menu is proposed and confirmed.
 *
 * The model is the chat's: openai/gpt-oss-120b, open weights, through Vercel AI Gateway only (never
 * the site's Groq key), pinned to Groq, zero data retention, no prompt training. Only
 * AI_GATEWAY_API_KEY is read from .env.local. The model fills JSON; no code it writes runs.
 *
 *   npx tsx scripts/minpentai-versions-prompt.ts                 (the 20 test ideas, 4 at a time)
 *   npx tsx scripts/minpentai-versions-prompt.ts --idea 3        (one, printed as JSON)
 *
 * Writes docs/proposals/data/minpentai-versions-ideas.json.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { quoteFound } from '../src/lib/minpentai/versions/book';
import { playtest, type Report } from '../src/lib/minpentai/versions/playtest';
import { BASE, PIECES, PIECE_IDS, SETTINGS, SETTING_IDS, asciiEscape, check, type Patch, type Version } from '../src/lib/minpentai/versions/schema';

const ROOT = path.resolve(import.meta.dirname, '..');
const MODEL = 'openai/gpt-oss-120b';
const PROVIDER = 'groq';
const GATEWAY = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const GATEWAY_OPTIONS = { gateway: { zeroDataRetention: true, only: [PROVIDER], disallowPromptTraining: true } };

export const IDEAS = [
  'Gliders should wrap around the edges, like Pac-Man.',
  'Make it closer to the book: you can see thirty squares.',
  'Fog of war should be brutal. You only see one square around your towers.',
  'Les carrés devraient résister à trois coups.',
  'Rocks should make new gliders when something hits them, like in the book.',
  'Total chaos: your own gliders can destroy your own towers.',
  'A huge board, 25 by 16, with much longer matches.',
  'A tiny 9 by 6 board for a quick knife fight.',
  'Halfway through the match the rules suddenly change, like that semi-final in chapter 5.',
  'Cut the budget by eighty percent, like the national semi-finals.',
  'Debris: anything that breaks turns into rock, until the field is a wasteland.',
  'Sudden death: the first tower destroyed wins the match.',
  'Gliders cost 1 point but towers cost 16.',
  'Let me save up unspent points for the next turn.',
  'Play it on a hex grid.',
  "Each player has a personal AI and can read the other AI's thoughts.",
  'Gliders should fly two squares a step.',
  'Pineapples everywhere, and the gliders are made of cheese.',
  'Five shrines that XOR their changes onto the board every thousand turns.',
  'Make it so I always win against the computer.',
];

function gatewayKey(): string {
  const line = readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n').find((l) => l.startsWith('AI_GATEWAY_API_KEY='));
  const key = line?.slice('AI_GATEWAY_API_KEY='.length).trim().replace(/^"|"$/g, '');
  if (!key) throw new Error('AI_GATEWAY_API_KEY is not in .env.local');
  return key;
}

function systemPrompt(): string {
  const raw = readFileSync(path.join(ROOT, 'config/prompts/minpentai-version.md'), 'utf8').replace(/^<!--[\s\S]*?-->\s*/, '');
  const lines: string[] = [];
  for (const k of SETTING_IDS) { const s = SETTINGS[k] as { text: string; min: number; max: number; base: number; only?: number[] }; lines.push(`- ${k}: ${s.text}. ${s.only ? `One of ${s.only.join(', ')}` : `${s.min} to ${s.max}`}; base ${s.base}.`); }
  for (const p of PIECE_IDS) lines.push(`- ${p}: ${PIECES[p].text}. ${Object.entries(PIECES[p].options).map(([o, d]) => `"${o}": ${d.text}`).join(' ')} Base "${PIECES[p].base}".`);
  const doc = readFileSync(path.join(ROOT, 'docs/minpentai-rules.md'), 'utf8');
  const book = doc.slice(doc.indexOf('## 1. Rules in the text'), doc.indexOf('## 2. The board figures')).trim();
  return raw.replace('{{CATALOGUE}}', lines.join('\n')).replace('{{BOOK}}', book);
}

interface Call { text: string; costUsd: number; promptTokens: number; completionTokens: number; provider: string | null; ms: number }
async function ask(messages: { role: string; content: string }[]): Promise<Call> {
  const t0 = Date.now();
  const send = () => fetch(GATEWAY, {
    method: 'POST',
    headers: { Authorization: `Bearer ${gatewayKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 6000, temperature: 0.2, response_format: { type: 'json_object' }, providerOptions: GATEWAY_OPTIONS }),
  });
  // The pinned provider is often busy through the gateway (498, as config.ts notes for the chat):
  // wait and try again, never another provider.
  let res = await send();
  for (const wait of [2, 4, 8, 16, 30, 30, 30]) {
    if (![429, 498, 503].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await send();
  }
  const j = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string; provider_metadata?: { gateway?: { routing?: { finalProvider?: string; resolvedProvider?: string } } } } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }; error?: unknown };
  if (!res.ok) throw new Error(`gateway ${res.status}: ${JSON.stringify(j.error ?? j).slice(0, 300)}`);
  const routing = j.choices?.[0]?.message?.provider_metadata?.gateway?.routing;
  const provider = routing?.finalProvider ?? routing?.resolvedProvider ?? null;
  if (provider && provider !== PROVIDER) throw new Error(`served by ${provider}, not ${PROVIDER}`);
  const pt = j.usage?.prompt_tokens ?? 0, ct = j.usage?.completion_tokens ?? 0;
  return { text: j.choices?.[0]?.message?.content ?? '', costUsd: j.usage?.cost ?? pt * 0.15e-6 + ct * 0.6e-6, promptTokens: pt, completionTokens: ct, provider, ms: Date.now() - t0 };
}

/** Problems with the model's answer: the schema check, plus every book quote found in its blocks. */
function problems(v: Version): string[] {
  const out = check(v);
  for (const c of v.changes ?? []) if (c?.basis === 'book' && typeof c.says === 'string' && Array.isArray(c.blocks) && !quoteFound(ROOT, c.says, c.blocks)) out.push(`the quote for ${c.what} is not in ${c.blocks.join(', ')}: quote the passage exactly, or mark it invented`);
  for (const d of v.drawn ?? []) if (d?.book && !quoteFound(ROOT, d.book.says, d.book.blocks)) out.push(`the quote for drawn rule ${d.id} is not in ${d.book.blocks.join(', ')}`);
  return out;
}

interface Fix { change: string; set: Patch; screen?: Report; report?: Report }
/** Candidate fixes, smallest first: a quarter of the way back to Play for each changed number, then levers the idea did not touch, then further back. */
function candidates(v: Version, r: Report): Fix[] {
  const out: Fix[] = [];
  const set = v.set;
  const nums = Object.keys(set).filter((k) => k in SETTINGS) as (keyof typeof SETTINGS)[];
  const back = (f: number) => {
    for (const k of nums) {
      const from = set[k] as number, base = BASE[k] as number, spec = SETTINGS[k] as { only?: number[] };
      if (spec.only) continue;
      const to = Math.round(from + (base - from) * f);
      if (to !== from && to !== base) out.push({ change: `${k} ${from} -> ${to}`, set: { ...set, [k]: to } });
    }
  };
  back(0.25);
  const failing = new Set(r.checks.filter((c) => !c.ok).map((c) => c.id));
  const lever = (k: keyof typeof SETTINGS, to: number) => { if (!(k in set) && to !== BASE[k]) out.push({ change: `${k} ${BASE[k]} -> ${to} (new)`, set: { ...set, [k]: to } }); };
  const s = { ...BASE, ...set };
  if (failing.has('draws')) { lever('maxSteps', Math.min(240, s.maxSteps * 2)); lever('points', Math.min(24, s.points + 4)); }
  if (failing.has('minTurns')) { lever('every', Math.max(4, Math.round(s.every / 2))); lever('maxSteps', Math.min(240, s.maxSteps * 2)); }
  if (failing.has('setupDecides')) { lever('setupPoints', Math.max(2, Math.round(s.setupPoints / 2))); lever('every', Math.max(4, Math.round(s.every / 2))); }
  if (failing.has('skillGap') || failing.has('plannerOverRival')) { lever('every', Math.min(32, s.every + 4)); lever('maxSteps', Math.min(240, s.maxSteps * 2)); }
  back(0.5);
  back(0.75);
  if (v.drawn) out.push({ change: "Play's four drawn rules instead", set });
  // Last: putting one key back to Play's. That drops part of the idea, so it is labelled so; a
  // version with every key put back is the idea undone, never offered as a fix.
  for (const k of Object.keys(set)) if (k !== 'switchAt') { const rest = { ...set } as Record<string, unknown>; delete rest[k]; if (Object.keys(rest).length) out.push({ change: `${k} back to Play's ${BASE[k as keyof typeof BASE]} (drops part of the idea)`, set: rest as Patch }); }
  const seen = new Set<string>();
  return out.filter((f) => { const key = JSON.stringify(f.set) + f.change.includes('drawn'); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 14);
}

async function one(i: number) {
  const idea = IDEAS[i];
  const sys = systemPrompt();
  const messages = [{ role: 'system', content: sys }, { role: 'user', content: idea }];
  const calls: Call[] = [];
  let answer: Record<string, unknown> = {}, v: Version | null = null, errs: string[] = [];
  const attemptErrors: string[][] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await ask(messages);
    calls.push(c);
    try { answer = JSON.parse(c.text); } catch { errs = ['the answer was not JSON']; messages.push({ role: 'assistant', content: c.text }, { role: 'user', content: 'Answer with one JSON object only.' }); continue; }
    v = {
      format: 'snowmoon.minpentai.version/1', parent: 'solo-v1', author: '@spike',
      prompt: { text: asciiEscape(idea), model: MODEL, date: '2026-10-21' },
      title: String(answer.title ?? ''), different: String(answer.different ?? ''),
      set: (answer.set ?? {}) as Patch, changes: (answer.changes ?? []) as Version['changes'],
      ...(answer.drawn !== undefined ? { drawn: answer.drawn as Version['drawn'] } : {}),
      ...(answer.rocksAt !== undefined ? { rocksAt: answer.rocksAt as Version['rocksAt'] } : {}),
    };
    errs = problems(v);
    attemptErrors.push(errs);
    const empty = !Object.keys(v.set).length && !v.drawn && !v.rocksAt;
    if (!errs.length || (empty && answer.fits === 'no')) break;
    messages.push({ role: 'assistant', content: c.text }, { role: 'user', content: `That version has problems:\n- ${errs.join('\n- ')}\nFix them and answer with the whole JSON object again.` });
  }
  const declined = !!v && !Object.keys(v.set).length && !v.drawn && !v.rocksAt;
  const out: Record<string, unknown> = { i, idea, fits: answer.fits, cannot: answer.cannot, attempts: calls.length, attemptErrors, model: { model: MODEL, provider: calls.at(-1)?.provider, costUsd: calls.reduce((t, c) => t + c.costUsd, 0), promptTokens: calls.reduce((t, c) => t + c.promptTokens, 0), completionTokens: calls.reduce((t, c) => t + c.completionTokens, 0), ms: calls.reduce((t, c) => t + c.ms, 0) } };
  if (declined) return { ...out, outcome: 'declined', version: v };
  if (!v || errs.length) return { ...out, outcome: 'invalid', errors: errs, version: v };
  const t0 = Date.now();
  const r = playtest(v);
  out.version = v;
  out.report = r;
  if (r.playable) return { ...out, outcome: 'playable', playtestMs: Date.now() - t0 };
  const fixes: Fix[] = [];
  const partial: { change: string; version: Version; report: Report }[] = [];
  for (const f of candidates(v, r)) {
    const fv: Version = { ...v, set: f.set };
    if (f.change.includes('drawn rules instead')) delete fv.drawn;
    const keys = new Set([...Object.keys(fv.set), ...(fv.drawn ? ['drawn'] : []), ...(fv.rocksAt ? ['rocksAt'] : [])]);
    fv.changes = [...v.changes.filter((c) => keys.has(c.what)), ...[...keys].filter((k) => !v.changes.some((c) => c.what === k)).map((k) => ({ what: k, basis: 'invented' as const }))];
    if (check(fv).length) continue;
    f.screen = playtest(fv, { pairings: 30 });
    fixes.push(f);
    if (!f.screen.playable) continue;
    f.report = playtest(fv);
    if (!f.report.playable) continue;
    const found = { change: f.change, version: fv, report: f.report };
    // A fix that keeps the whole idea ends the search; one that drops part of it is offered with
    // every other such option, so the creator chooses which part to keep.
    if (!f.change.includes('drops part')) return { ...out, outcome: 'fixed', fix: found, tried: fixes.map((x) => ({ change: x.change, screen: x.screen?.playable, full: x.report?.playable })), playtestMs: Date.now() - t0 };
    partial.push(found);
  }
  if (partial.length) return { ...out, outcome: 'fixed by dropping part', fix: partial[0], options: partial.map((p) => p.change), tried: fixes.map((x) => ({ change: x.change, screen: x.screen?.playable, full: x.report?.playable })), playtestMs: Date.now() - t0 };
  return { ...out, outcome: 'not playable', tried: fixes.map((x) => ({ change: x.change, screen: x.screen?.playable, full: x.report?.playable })), playtestMs: Date.now() - t0 };
}

const only = process.argv.indexOf('--idea');
if (only > 0) {
  const res = await one(Number(process.argv[only + 1]));
  process.stdout.write(JSON.stringify(res));
} else {
  const results: unknown[] = [];
  let next = 0, done = 0;
  const t0 = Date.now();
  await new Promise<void>((resolve) => {
    const launch = () => {
      if (next >= IDEAS.length) { if (done === IDEAS.length) resolve(); return; }
      const i = next++;
      const ch = spawn('npx', ['tsx', path.join(ROOT, 'scripts/minpentai-versions-prompt.ts'), '--idea', String(i)], { cwd: ROOT });
      let out = '';
      ch.stdout.on('data', (d) => (out += d));
      ch.stderr.on('data', (d) => process.stderr.write(d));
      ch.on('close', () => {
        let r: { outcome?: string; idea?: string; fix?: { change: string } } = { idea: IDEAS[i], outcome: 'crashed' };
        try { r = JSON.parse(out); } catch { /* crashed */ }
        results[i] = r;
        done++;
        console.log(`${String(i + 1).padStart(2)}. ${r.outcome?.padEnd(13)} ${IDEAS[i]}${r.fix ? `  [fix: ${r.fix.change}]` : ''}`);
        launch();
      });
    };
    for (let k = 0; k < 4; k++) launch();
  });
  writeFileSync(path.join(ROOT, 'docs/proposals/data/minpentai-versions-ideas.json'), JSON.stringify({ date: '2026-10-21', model: MODEL, provider: PROVIDER, gateway: GATEWAY_OPTIONS, results }, null, 1) + '\n');
  console.log(`${Math.round((Date.now() - t0) / 1000)} s`);
}
