/**
 * Eval of the planning coach before any UI (owner, 2026-10-11). Design 2: the owner's four
 * approved changes (docs/proposals/plan-coach.md).
 *
 *   npx tsx --conditions=react-server scripts/plan-coach-eval.ts [--models=a,b] [--dry] [fixture ...]   (needs AI_GATEWAY_API_KEY)
 *
 * For each fixture in scripts/fixtures/plan-coach/ (a draft in labelled fragments, with a
 * chapter limit; the header's "planted" list is for the reviewer and is never sent) and each
 * model, one coach turn in four steps, every step on the same model:
 *   1. notes (config/prompts/plan-coach.md): craft notes, order, picture slots without words, a question;
 *   2. claims (plan-coach-claims.md): the draft's claims about the book's world, one per line;
 *   3. world check (plan-coach-world-check.md), once per claim, with its own passages and world
 *      guide lines up to the limit, plus later guide lines marked LATER. Code turns LATER into
 *      "I can't check this within your chapter." and drops any later block id, so nothing past
 *      the limit reaches the person;
 *   4. the coach's own guard (gpt-oss-safeguard-20b, plan-coach-guard.md) on the assembled reply.
 * The craft guide is filtered to the reader's chapter (scripts/lib/craft-guide.ts), like the world
 * guide. Each fixture's "expected:" line gives the right world answers, scored in code.
 * Code checks, for the reviewer: cited ids that don't exist or are past the limit; phrases that
 * offer wording; quoted spans that are neither the person's words nor the book's; any quotation
 * marks or on-screen text in the picture slots.
 *
 * Models (owner, 2026-10-11, test drafts only): gpt-oss-120b; Kimi K3 pinned to moonshotai;
 * Claude Sonnet 5.5 and, as a ceiling, Claude Opus 5.5, both pinned to anthropic, each reply checked for
 * the gateway's zero-retention flag (scripts/lib/zdr-check.ts). Every call goes through the Vercel AI Gateway only
 * (scripts/lib/batch-model.ts, never the site's Groq key), with zero data retention, pinned as
 * config/models.json says. Spending for design 2 stops at $2.
 * Results: content/snowmoon/recipes/plan-coach-eval.json; report: docs/craft/plan-coach-eval.md.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { completeViaGateway, batchGatewayToken, type BatchReply } from './lib/batch-model';
import { withZdrCheck, ZdrRefused } from './lib/zdr-check';
import { loadGatewayKey, promptFile } from './lib/gateway-key';
import { codeFlags, CANT, norm } from './lib/plan-coach-checks';
import { craftUpTo } from './lib/craft-guide';
import guide from '../content/snowmoon/world-guide.json';

const ROOT = process.cwd();
const DIR = 'scripts/fixtures/plan-coach';
const RESULTS = 'content/snowmoon/recipes/plan-coach-eval.json';
const REPORT = 'docs/craft/plan-coach-eval.md';
const DESIGN = 2;
const MODELS: Record<string, string> = {
  'gpt-oss-120b': 'openai/gpt-oss-120b',
  'kimi-k3': 'moonshotai/kimi-k3',
  'claude-sonnet-5.5': 'anthropic/claude-sonnet-5.5',
  'claude-opus-5.5': 'anthropic/claude-opus-5.5',
};
// Owner, 2026-10-11: for these, any reply without the zero-retention flag and the pinned provider fails.
const ZDR_ENFORCED: Record<string, string> = { 'anthropic/claude-sonnet-5.5': 'anthropic', 'anthropic/claude-opus-5.5': 'anthropic' };
const GUARD = 'openai/gpt-oss-safeguard-20b';
const CAP_USD = 2;
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const chapterOf = (id: string) => Number(id.slice(1).split('-')[0]);

type Block = { id: string; chapter: number; text: string };
const book: Block[] = [];
for (let n = 1; n <= 32; n++) {
  for (const b of JSON.parse(read(`content/snowmoon/text/chapter-${n}.json`)).blocks as { idx: number; content: string; kind: string }[]) {
    const t = b.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (t && b.kind !== 'break') book.push({ id: `c${n}-b${b.idx}`, chapter: n, text: t });
  }
}
const byId = new Map(book.map((b) => [b.id, b]));
const bookNorm = norm(book.map((b) => b.text).join(' '));
type GLine = { id: string; section: string; entity: string; kind: string; text: string; sources: string[]; from_chapter: number };
const glines = guide.lines as GLine[];

const STOP = new Set('the a an and or of to in on at for with his her he she they is was are be it its as by from that this into not no one two their them who what when where which there then than have has had were been'.split(' '));
const words = (s: string) => new Set(norm(s).split(' ').filter((w) => w.length > 3 && !STOP.has(w)));
function overlap<T>(items: T[], text: (x: T) => string, query: string, n: number): T[] {
  const q = words(query);
  return items
    .map((x) => ({ x, score: norm(text(x)).split(' ').filter((w) => q.has(w)).length }))
    .filter((s) => s.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((s) => s.x);
}
const passages = (query: string, limit: number, n: number) =>
  overlap(book.filter((b) => b.chapter <= limit && b.text.length > 40), (b) => b.text, query, n).sort((x, y) => x.chapter - y.chapter || Number(x.id.split('-b')[1]) - Number(y.id.split('-b')[1]));
const guideLine = (l: GLine) => `- ${l.entity}${l.kind === 'fact' || l.kind === 'event' ? '' : ` (${l.kind})`}: ${l.text} [${l.sources.join('] [')}]`;
function guideUpTo(limit: number): string {
  const out: string[] = [];
  for (const section of guide.sections) {
    const here = glines.filter((l) => l.section === section && l.from_chapter <= limit);
    if (here.length) out.push(`## ${section}`, ...here.map(guideLine));
  }
  return out.join('\n');
}

// ---- code checks (scripts/lib/plan-coach-checks.ts)
const autoFlags = (reply: string, draft: string, limit: number) => codeFlags(reply, draft, limit, { byId, bookNorm });

// ---- runs
loadGatewayKey();
const args = process.argv.slice(2);
const dry = args.includes('--dry');
if (!dry) batchGatewayToken(); // stop before any call if there is no gateway credential
const modelArg = args.find((a) => a.startsWith('--models='))?.slice(9);
const models = (modelArg ? modelArg.split(',') : ['gpt-oss-120b']).map((m) => {
  if (!MODELS[m]) throw new Error(`unknown model ${m}; one of ${Object.keys(MODELS).join(', ')}`);
  return m;
});
const only = args.filter((a) => !a.startsWith('--'));
// The owner (2026-10-11): the Anthropic models receive nothing until their zero retention on our account
// is confirmed. config/models.json records that confirmation; until then a model is refused.
const allowlist = JSON.parse(read('config/models.json')) as { models: { id: string; hosted?: { retention_confirmed_by_owner?: string | null } }[] };
for (const m of models) {
  const entry = allowlist.models.find((x) => x.id === m);
  if (MODELS[m].startsWith('anthropic/') && !entry?.hosted?.retention_confirmed_by_owner) throw new Error(`${m} is blocked: the owner has not confirmed its zero retention for our account (config/models.json hosted.retention_confirmed_by_owner)`);
}

const results = existsSync(path.join(ROOT, RESULTS)) ? JSON.parse(read(RESULTS)) : { runs: [] as unknown[] };
results.assist = results.assist ?? null;
type Run = { design?: number; cost_usd: number };
let spent = (results.runs as Run[]).filter((r) => r.design === DESIGN).reduce((a, r) => a + r.cost_usd, 0);
const prompts = {
  notes: promptFile('plan-coach.md'),
  claims: promptFile('plan-coach-claims.md'),
  check: promptFile('plan-coach-world-check.md'),
  guard: promptFile('plan-coach-guard.md'),
};
const craftFull = read('docs/craft/visual-storytelling.md');

type Call = { step: string; model: string; provider: string | null; request_id: string | null; prompt_tokens: number; completion_tokens: number; cost_usd: number; ms: number };
async function call(step: string, model: string, system: string, user: string, maxTokens: number, temperature: number, calls: Call[]): Promise<BatchReply> {
  if (spent > CAP_USD - 0.1) throw new Error(`stopping: $${spent.toFixed(3)} spent of $${CAP_USD} for design ${DESIGN}`);
  const t0 = Date.now();
  let r: BatchReply | null = null;
  for (let attempt = 0; attempt < 3 && !r; attempt++) {
    try {
      const go = () => completeViaGateway(model, [{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens, temperature });
      r = ZDR_ENFORCED[model] ? await withZdrCheck(ZDR_ENFORCED[model], go) : await go();
    } catch (e) {
      if (e instanceof ZdrRefused) throw new Error(`${model} ${step}: refused, ${e.message}; nothing from it is used`);
      if (attempt === 2) throw e;
      await new Promise((res) => setTimeout(res, 10_000 * (attempt + 1)));
    }
  }
  spent += r!.costUsd;
  calls.push({ step, model: r!.model, provider: r!.provider, request_id: r!.requestId, prompt_tokens: r!.promptTokens, completion_tokens: r!.completionTokens, cost_usd: r!.costUsd, ms: Date.now() - t0 });
  return r!;
}

for (const f of readdirSync(path.join(ROOT, DIR)).filter((x) => x.endsWith('.md')).sort()) {
  const name = f.replace(/\.md$/, '');
  if (only.length && !only.includes(name)) continue;
  const raw = read(`${DIR}/${f}`);
  const [, header, body] = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!;
  const limit = Number(header.match(/^limit:\s*(\d+)/m)![1]);
  const form = header.match(/^form:\s*(.+)$/m)![1];
  const draft = body.trim();
  // The fixture's expected world answers ("keyword => verdict; …"), for scoring; never sent.
  const expected = (header.match(/^expected:\s*(.+)$/m)?.[1] ?? '').split(';').map((x) => x.trim()).filter(Boolean).map((x) => ({ key: norm(x.split('=>')[0]), verdict: x.split('=>')[1].trim() }));
  // The craft guide without any example past the reader's chapter (scripts/lib/craft-guide.ts).
  const craft = craftUpTo(craftFull, limit);
  const ps = passages(draft, limit, 12);
  const notesUser = [
    `The person has read up to chapter ${limit}. Their piece: ${form}.`,
    '',
    `WORLD GUIDE, UP TO CHAPTER ${limit} (AI-made reference; cite the block ids):`,
    guideUpTo(limit),
    '',
    'CRAFT GUIDE (the principles you apply):',
    craft,
    '',
    `PASSAGES FROM THE BOOK, UP TO CHAPTER ${limit}:`,
    ps.map((b) => `[${b.id}] ${b.text}`).join('\n'),
    '',
    "THE PERSON'S DRAFT, IN FRAGMENTS:",
    draft,
    '',
    'Give your notes on this draft, in the form you were given.',
  ].join('\n');
  if (dry) {
    console.log(`${name}: limit ${limit}, notes prompt ~${Math.round((prompts.notes.length + notesUser.length) / 4)} tokens`);
    continue;
  }
  for (const m of models) {
    const model = MODELS[m];
    const calls: Call[] = [];
    const t0 = Date.now();
    // 1. notes
    const notes = await call('notes', model, prompts.notes, notesUser, 8000, 0.3, calls);
    // 2. claims
    const claimsReply = await call('claims', model, prompts.claims, `THE PERSON'S DRAFT, IN FRAGMENTS:\n${draft}`, 3000, 0, calls);
    const claims = claimsReply.text
      .split('\n')
      .map((x) => x.trim())
      .filter((x) => /^F\d+\s*\|/.test(x))
      .slice(0, 8)
      .map((x) => ({ label: x.split('|')[0].trim(), claim: x.split('|').slice(1).join('|').trim() }));
    // 3. world check, claim by claim
    const checks: { label: string; claim: string; verdict: string; said: string; shown: string; evidence: string[]; later_withheld: number }[] = [];
    for (const c of claims) {
      const cp = passages(c.claim, limit, 6);
      const gUp = overlap(glines.filter((l) => l.from_chapter <= limit), (l) => `${l.entity} ${l.text}`, c.claim, 8);
      const gLater = overlap(glines.filter((l) => l.from_chapter > limit), (l) => `${l.entity} ${l.text}`, c.claim, 4);
      const user = [
        `The person has read up to chapter ${limit}.`,
        `CLAIM (from ${c.label}): ${c.claim}`,
        '',
        `PASSAGES UP TO CHAPTER ${limit}:`,
        cp.map((b) => `[${b.id}] ${b.text}`).join('\n') || '(none found)',
        '',
        `WORLD GUIDE LINES UP TO CHAPTER ${limit}:`,
        gUp.map(guideLine).join('\n') || '(none found)',
        '',
        'WORLD GUIDE LINES MARKED LATER (after the limit; never cite these):',
        gLater.map((l) => `LATER ${guideLine(l)}`).join('\n') || '(none)',
      ].join('\n');
      const r = await call('world-check', model, prompts.check, user, 2000, 0, calls);
      const first = r.text.trim().split('\n')[0].toUpperCase();
      const verdict = /CONFLICT/.test(first) ? 'conflicts' : /MATCH/.test(first) ? 'matches' : /LATER/.test(first) ? 'later' : 'not said';
      let said = r.text.trim().split('\n').slice(1).join(' ').trim();
      // Spoiler safety, in code: any later id turns the verdict into "can't check".
      const later = (said.match(/c\d+-b\d+/g) ?? []).some((id) => chapterOf(id) > limit);
      const finalVerdict = later ? 'later' : verdict;
      if (finalVerdict === 'later' || finalVerdict === 'not said') said = '';
      const shown = finalVerdict === 'later' ? CANT : finalVerdict === 'not said' ? "the book doesn't say, up to your chapter." : `${finalVerdict}. ${said}`;
      checks.push({ label: c.label, claim: c.claim, verdict: finalVerdict, said, shown, evidence: [...cp.map((b) => b.id), ...gUp.map((l) => l.id)], later_withheld: later || verdict === 'later' ? 1 : 0 });
    }
    const worldCheck = checks.length ? checks.map((c) => `- ${c.label} ${c.claim}: ${c.shown}`).join('\n') : 'Nothing to check.';
    const reply = `${notes.text.trim()}\n\nWORLD CHECK:\n${worldCheck}`;
    // Score the world check against the fixture's expected answers.
    const scored = expected.map((e) => {
      const hit = checks.find((c) => norm(c.claim).includes(e.key));
      return { key: e.key, expected: e.verdict, got: hit ? hit.verdict : 'not extracted', ok: hit ? hit.verdict === e.verdict : false };
    });
    // 4. the coach's guard
    const g = await call('guard', GUARD, prompts.guard, `DRAFT:\n${draft}\n\nREPLY:\n${reply}`, 800, 0, calls);
    const cost = calls.reduce((a, c) => a + c.cost_usd, 0);
    results.runs.push({
      design: DESIGN,
      fixture: name,
      limit,
      model: m,
      gateway_model: model,
      at: new Date().toISOString(),
      cost_usd: cost,
      ms: Date.now() - t0,
      prompts_sha256: Object.fromEntries(Object.entries(prompts).map(([k, v]) => [k, sha256(v)])),
      craft_sha256: sha256(craftFull),
      craft_limit_sha256: sha256(craft),
      guard: { verdict: g.text.trim().split('\n')[0], reason: g.text.trim().split('\n').slice(1).join(' ') },
      passages: ps.map((b) => b.id),
      claims: checks,
      expected_world: scored,
      auto_flags: autoFlags(reply, draft, limit),
      calls,
      notes_reply: notes.text,
      claims_reply: claimsReply.text,
      reply,
    });
    writeFileSync(path.join(ROOT, RESULTS), JSON.stringify(results, null, 2) + '\n');
    const last = results.runs.at(-1);
    console.log(`${name} on ${m}: $${cost.toFixed(4)}, ${checks.length} claims, expected answers ${scored.filter((x) => x.ok).length} of ${scored.length}, guard ${last.guard.verdict}, ${last.auto_flags.length} auto flags; design ${DESIGN} total $${spent.toFixed(4)}`);
  }
}

// ---- the report: each design-2 run in full, with a summary per model; the reviewer's notes go in docs/craft/plan-coach-eval-review.md.
type R = { design?: number; fixture: string; limit: number; model?: string; cost_usd: number; ms?: number; guard: { verdict: string; reason: string }; auto_flags: string[]; claims?: { verdict: string }[]; expected_world?: { key: string; expected: string; got: string; ok: boolean }[]; reply: string };
const runs = (results.runs as R[]).filter((r) => r.design === DESIGN);
if (runs.length) {
  const lines = [
    '# Planning coach eval (design 2)',
    '',
    `Generated by \`scripts/plan-coach-eval.ts\` from \`${RESULTS}\`. Test drafts only. Every call through the Vercel AI Gateway with zero data retention, pinned per config/models.json. Guard: ${GUARD} with config/prompts/plan-coach-guard.md. The reviewer's flags are in docs/craft/plan-coach-eval-review.md. Design 1 runs stay in the results file.`,
    '',
    '| Model | Turns | Cost per turn | Time per turn (median) | World errors caught (expected conflicts found) | Expected world answers | Guard VIOLATION (writing for the person) | Turns with code flags | Claims: matches / conflicts / not said / later |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const m of [...new Set(runs.map((r) => r.model ?? 'gpt-oss-120b'))]) {
    const rs = runs.filter((r) => (r.model ?? 'gpt-oss-120b') === m);
    const cl = rs.flatMap((r) => r.claims ?? []);
    const n = (v: string) => cl.filter((c) => c.verdict === v).length;
    const ex = rs.flatMap((r) => r.expected_world ?? []);
    const caught = ex.filter((x) => x.expected === 'conflicts');
    const times = rs.map((r) => r.ms ?? 0).sort((a, b) => a - b);
    lines.push(`| ${m} | ${rs.length} | $${(rs.reduce((a, r) => a + r.cost_usd, 0) / rs.length).toFixed(4)} | ${(times[Math.floor(times.length / 2)] / 1000).toFixed(0)} s | ${caught.filter((x) => x.ok).length} of ${caught.length} | ${ex.filter((x) => x.ok).length} of ${ex.length} | ${rs.filter((r) => /VIOLATION/.test(r.guard.verdict)).length} | ${rs.filter((r) => r.auto_flags.length).length} | ${n('matches')} / ${n('conflicts')} / ${n('not said')} / ${n('later')} |`);
  }
  for (const run of runs) {
    lines.push('', `## ${run.fixture} on ${run.model} (chapter limit ${run.limit}; $${run.cost_usd.toFixed(4)})`, '', `Guard: ${run.guard.verdict} ${run.guard.reason}`, '', `Code flags: ${run.auto_flags.length ? run.auto_flags.join('; ') : 'none'}`, '', `Expected world answers: ${(run.expected_world ?? []).map((x) => `${x.key}: expected ${x.expected}, got ${x.got}${x.ok ? '' : ' (MISS)'}`).join('; ') || 'none set'}`, '', '```text', run.reply.trim(), '```');
  }
  writeFileSync(path.join(ROOT, REPORT), lines.join('\n') + '\n');
}
if (!dry) console.log(`design ${DESIGN} total spent: $${spent.toFixed(4)} of $${CAP_USD}`);
