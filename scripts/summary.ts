/**
 * A spoken summary of the whole book, 30–40 minutes, with its full recipe
 * (owner's brief, 2026-10-09; branch summary-35min).
 *
 *   npx tsx --conditions=react-server --env-file=.env.summary.local scripts/summary.ts <step>
 *
 * Steps, each resumable (state lives in the recipe as it grows):
 *   notes    pass 1: story notes for each chapter, every claim with block ids
 *   write    pass 2: the summary, part by part, from those notes
 *   check    every id exists, every name is spelled as the book spells it, and
 *            every paragraph is read against its cited blocks; unsupported claims
 *            are fixed by re-prompting the model with the correction, then read
 *            again, until none are left (or the round limit, reported)
 *   status   word count, cost and check results so far
 *
 * The model is called exactly as the reading assistant calls it
 * (src/lib/chat/model.ts complete(): Groq directly with the project's key,
 * Vercel AI Gateway pinned to Groq with zero data retention when Groq is busy).
 * Spending stops at $1 (BUDGET_USD) including the worst case of the next call.
 *
 * Writes content/snowmoon/recipes/summary/summary-35min.json (the recipe) and
 * content/snowmoon/recipes/summary/calls.jsonl (every prompt word for word,
 * every reply, tokens, cost, request id, route and timing).
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CHAT } from '../src/lib/config';
import { complete, gatewayToken, promptFile, ModelUnavailable, type ModelReply } from '../src/lib/chat/model';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'content/snowmoon/recipes/summary');
const RECIPE = path.join(OUT, 'summary-35min.json');
const CALLS = path.join(OUT, 'calls.jsonl'); // compressed to calls.jsonl.gz when the run is finished (owner, 2026-10-10)
const MODEL = 'openai/gpt-oss-120b';
/** Owner: $1 (2026-10-09), raised to $2 in all (2026-10-10). */
const BUDGET_USD = 2;
const WORDS = { min: 5000, max: 5800, target: 5400 };
/** Owner's draft wording for the spoken opening (2026-10-09). */
const OPENING =
  'This is a summary of Snowmoon by Vitalik Buterin. It was written by an AI model, gpt-oss-120b, not by the author, and is read by an AI voice. It gives away the whole story, including the ending.';
/** Pass 2 parts: chapters per part. */
const PARTS: [number, number][] = [[1, 4], [5, 8], [9, 12], [13, 16], [17, 20], [21, 24], [25, 28], [29, 32]];
/** Owner (2026-10-10): what still fails after three fix rounds goes to the owner; no hand edit without their OK. */
const MAX_FIX_ROUNDS = 3;

const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

// --- The book -----------------------------------------------------------------
type Block = { id: string; chapter: number; idx: number; kind: string; text: string };
const book: Block[] = [];
const sources: { file: string; sha256: string }[] = [];
for (let n = 1; n <= 32; n++) {
  const file = `content/snowmoon/text/chapter-${n}.json`;
  const raw = readFileSync(path.join(ROOT, file));
  sources.push({ file, sha256: sha256(raw) });
  const j = JSON.parse(raw.toString()) as { blocks: { idx: number; kind: string; content: string }[] };
  for (const b of j.blocks) {
    const text = b.content.replace(/<[^>]+>/g, ' ').replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
    if (b.kind === 'break' || !text) continue;
    book.push({ id: `c${n}-b${b.idx}`, chapter: n, idx: b.idx, kind: b.kind, text });
  }
}
const byId = new Map(book.map((b) => [b.id, b]));
const chapterBlocks = (n: number) => book.filter((b) => b.chapter === n);
/** Every word as the book spells it (case kept), for the name check. */
const bookWords = new Set(book.flatMap((b) => b.text.match(/[\p{L}][\p{L}'’-]*/gu) ?? []));

// --- Prompts ------------------------------------------------------------------
const PROMPTS = ['summary-notes.md', 'summary-spine.md', 'summary-write.md', 'summary-tighten.md', 'summary-check.md', 'summary-fix.md'];
const prompt = (f: string) => promptFile(f);

// --- Recipe state ---------------------------------------------------------------
type Para = { n: number; part: number; text: string; notes: string[]; sources: string[]; passed?: boolean; history: { round: number; text: string; notes: string[]; why: string; call: number | null; by: string }[] };
type Check = { round: number; para: number; verdict: 'supported' | 'unsupported' | 'error'; unsupported: string[]; call: number | null };
type Recipe = {
  work_id: 'snowmoon';
  what: string;
  status: string;
  generated_at: string;
  inputs: { sources: typeof sources; prompts: { file: string; sha256: string }[]; opening: { text: string; wording: string } };
  model: Record<string, unknown>;
  notes: Record<string, { text: string; ids: string[]; invalid_ids: string[]; call: number }>;
  parts: { part: number; chapters: [number, number]; target_words: number; call: number; drafts?: { call: number; words: number; text: string }[] }[];
  script: { opening: string; paragraphs: Para[] };
  checks: { ids: Record<string, unknown>; names: Record<string, unknown>; support: Check[]; rounds: number; unsupported_left: number };
  edits: { para: number; round: number; by: string; how: string; diff: string; call: number | null; outcome?: string }[];
  usage: { calls: number; prompt_tokens: number; completion_tokens: number; cost_usd: number; budget_usd: number; seconds: number; by_step: Record<string, { calls: number; cost_usd: number; seconds: number }> };
  spine?: { text: string; ids: number; invalid_ids: string[]; call: number };
  [k: string]: unknown;
};

mkdirSync(OUT, { recursive: true });
const recipe: Recipe = existsSync(RECIPE)
  ? JSON.parse(readFileSync(RECIPE, 'utf8'))
  : {
      work_id: 'snowmoon',
      what: 'A spoken summary of the whole book, about 35 minutes: story notes per chapter (pass 1), the summary written from them (pass 2), every paragraph read against its cited blocks and fixed by re-prompting, then narrated.',
      status: 'draft: not published (the owner publishes with "publish")',
      generated_at: new Date().toISOString(),
      inputs: { sources, prompts: [], opening: { text: OPENING, wording: "the owner's draft wording (2026-10-09)" } },
      model: {
        name: MODEL,
        open_weights: true,
        license: 'Apache-2.0',
        route: 'as the reading assistant: Groq directly with the project key; Vercel AI Gateway pinned to Groq when Groq is busy',
        provider: CHAT.providerName,
        host_when_busy: CHAT.host,
        zero_data_retention: 'gateway: asked on every request (providerOptions.gateway.zeroDataRetention); Groq: Global ZDR and Inference APIs ZDR enabled in the "Lum" organization (owner, 2026-10-08)',
        prices_usd_per_token: CHAT.prices[MODEL],
      },
      notes: {},
      parts: [],
      script: { opening: OPENING, paragraphs: [] },
      checks: { ids: {}, names: {}, support: [], rounds: 0, unsupported_left: -1 },
      edits: [],
      usage: { calls: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0, budget_usd: BUDGET_USD, seconds: 0, by_step: {} },
    };
recipe.inputs.prompts = PROMPTS.map((f) => ({ file: `config/prompts/${f}`, sha256: sha256(readFileSync(path.join(ROOT, 'config/prompts', f))) }));
// Every version of every prompt that was ever sent, word for word (the calls log has each message too).
{
  const versions = ((recipe.inputs as Record<string, unknown>).prompt_versions ??= []) as { file: string; sha256: string; text: string; recorded_at: string }[];
  for (const f of PROMPTS) {
    const text = readFileSync(path.join(ROOT, 'config/prompts', f), 'utf8');
    const h = sha256(text);
    if (!versions.some((v) => v.sha256 === h)) versions.push({ file: `config/prompts/${f}`, sha256: h, text, recorded_at: new Date().toISOString() });
  }
}
const save = () => writeFileSync(RECIPE, JSON.stringify(recipe, null, 2) + '\n');

// --- One model call, logged word for word ---------------------------------------
type Msg = { role: 'system' | 'user'; content: string };
async function call(step: string, label: string, messages: Msg[], maxTokens: number, temperature: number): Promise<{ text: string; n: number }> {
  const price = CHAT.prices[MODEL];
  const inputEst = Math.ceil(messages.reduce((a, m) => a + m.content.length, 0) / 3);
  const worst = inputEst * price.input + maxTokens * price.output;
  if (recipe.usage.cost_usd + worst > BUDGET_USD) throw new Error(`budget: $${recipe.usage.cost_usd.toFixed(4)} spent; the next call could cost $${worst.toFixed(4)}, over $${BUDGET_USD}`);
  const token = gatewayToken();
  let reply: ModelReply | null = null;
  let error = '';
  const started = Date.now();
  for (let attempt = 1; attempt <= 4 && !reply; attempt++) {
    try {
      reply = await complete(token, MODEL, messages, { maxTokens, temperature });
      if (!reply.text.trim()) {
        error = 'empty reply';
        logCall(step, label, messages, reply, Date.now() - started, attempt, 'empty reply; asked again');
        reply = null;
      }
    } catch (e) {
      error = e instanceof ModelUnavailable ? e.message : String(e);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
  if (!reply) throw new Error(`${label}: the model did not answer (${error})`);
  const n = logCall(step, label, messages, reply, Date.now() - started, 0, '');
  return { text: reply.text, n };
}
function logCall(step: string, label: string, messages: Msg[], r: ModelReply, ms: number, attempt: number, note: string): number {
  const n = recipe.usage.calls + 1;
  recipe.usage.calls = n;
  recipe.usage.prompt_tokens += r.promptTokens;
  recipe.usage.completion_tokens += r.completionTokens;
  recipe.usage.cost_usd += r.costUsd;
  recipe.usage.seconds += ms / 1000;
  const s = (recipe.usage.by_step[step] ??= { calls: 0, cost_usd: 0, seconds: 0 });
  s.calls++;
  s.cost_usd += r.costUsd;
  s.seconds += ms / 1000;
  appendFileSync(
    CALLS,
    JSON.stringify({
      n, step, label, at: new Date().toISOString(), model: r.model, route: r.route, provider: r.provider, request_id: r.requestId,
      prompt_tokens: r.promptTokens, completion_tokens: r.completionTokens, cost_usd: r.costUsd, ms, note: note || undefined,
      messages, reply: r.text,
    }) + '\n',
  );
  save();
  return n;
}

const ID_RE = /c\d+-b\d+/g;
const fmtBlocks = (bs: Block[]) => bs.map((b) => `[${b.id}] ${b.text}`).join('\n');

// --- Pass 1 ---------------------------------------------------------------------
async function notes() {
  for (let n = 1; n <= Number(process.env.SUMMARY_LAST_CHAPTER ?? 32); n++) {
    if (recipe.notes[n]) continue;
    const user = `Chapter ${n} of 32.\n\n${fmtBlocks(chapterBlocks(n))}`;
    const { text, n: c } = await call('notes', `notes chapter ${n}`, [{ role: 'system', content: prompt('summary-notes.md') }, { role: 'user', content: user }], 6000, 0.2);
    const ids = [...new Set(text.match(ID_RE) ?? [])];
    recipe.notes[n] = { text: text.trim(), ids, invalid_ids: ids.filter((id) => !byId.has(id) || byId.get(id)!.chapter !== n), call: c };
    save();
    console.log(`notes ${n}: ${words(text)} words, ${ids.length} ids, ${recipe.notes[n].invalid_ids.length} invalid; $${recipe.usage.cost_usd.toFixed(4)}`);
  }
}
// --- Note lines, labelled: the writer cites labels; ids come only from those lines ---
type NoteLine = { label: string; chapter: number; text: string; ids: string[] };
const noteLines: NoteLine[] = [];
for (let n = 1; n <= 32; n++) {
  if (!recipe.notes[n]) continue;
  let k = 0;
  for (const raw of recipe.notes[n].text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('-')) continue;
    k++;
    noteLines.push({ label: `${n}.${k}`, chapter: n, text: line.replace(/^-\s*/, '').replace(/\s*(\[c\d+-b\d+\]\s*)+$/, '').trim(), ids: [...new Set(line.match(ID_RE) ?? [])] });
  }
}
const byLabel = new Map(noteLines.map((l) => [l.label, l]));
const labelled = (ls: NoteLine[]) => ls.map((l) => `[${l.label}] ${l.text}`).join('\n');
const notesFor = (a: number, b: number) =>
  Array.from({ length: b - a + 1 }, (_, i) => `CHAPTER ${a + i}\n${labelled(noteLines.filter((l) => l.chapter === a + i))}`).join('\n\n');
const allNotes = () => Array.from({ length: 32 }, (_, i) => `CHAPTER ${i + 1}\n${recipe.notes[i + 1].text}`).join('\n\n');
const idOrder = (id: string) => { const [c, b] = id.slice(1).split('-b').map(Number); return c * 10000 + b; };
const idsFor = (labels: string[]) => [...new Set(labels.flatMap((l) => byLabel.get(l)?.ids ?? []))].sort((x, y) => idOrder(x) - idOrder(y));

async function spine() {
  if (recipe.spine) return;
  const { text, n } = await call('spine', 'spine of the whole book', [{ role: 'system', content: prompt('summary-spine.md') }, { role: 'user', content: `STORY NOTES FOR THE WHOLE BOOK:\n\n${allNotes()}` }], 9000, 0.2);
  const ids = [...new Set(text.match(ID_RE) ?? [])];
  recipe.spine = { text: text.trim(), ids: ids.length, invalid_ids: ids.filter((id) => !byId.has(id)), call: n };
  save();
}

// --- Pass 2 ---------------------------------------------------------------------
const LABEL_RE = /\d+\.\d+/g;
function parseParas(text: string): { text: string; notes: string[] }[] {
  // gpt-oss writes non-breaking hyphens and narrow spaces; spoken text uses plain ones.
  const clean = text.replace(/[‐‑]/g, '-').replace(/[  ]/g, ' ');
  const out: { text: string; notes: string[] }[] = [];
  const re = /([\s\S]*?)\**NOTES\**:\s*((?:\d+\.\d+[\s,;]*)+)/gi;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(clean))) {
    const body = m[1].replace(/\s+/g, ' ').trim();
    if (body) out.push({ text: body, notes: [...new Set(m[2].match(LABEL_RE) ?? [])] });
    last = re.lastIndex;
  }
  const rest = clean.slice(last).replace(/\s+/g, ' ').trim();
  if (rest) out.push({ text: rest, notes: [] });
  return out;
}
const scriptText = (paras: Para[]) => paras.map((p) => p.text).join('\n\n');
const withNotes = (ps: { text: string; notes: string[] }[]) => ps.map((p) => `${p.text}\nNOTES: ${p.notes.join(', ')}`).join('\n\n');

async function write() {
  await spine();
  const bookWordsIn = (a: number, b: number) => book.filter((x) => x.chapter >= a && x.chapter <= b).reduce((s, x) => s + words(x.text), 0);
  const total = bookWordsIn(1, 32);
  const budget = WORDS.target - words(OPENING);
  for (let i = 0; i < Math.min(PARTS.length, Number(process.env.SUMMARY_LAST_PART ?? PARTS.length)); i++) {
    if (recipe.parts.find((p) => p.part === i + 1)) continue;
    const [a, b] = PARTS[i];
    const target = Math.round((budget * bookWordsIn(a, b)) / total / 10) * 10;
    // Paragraphs of four to six short sentences run about sixty-five words; the model keeps to a paragraph count, not a word count.
    const paragraphs = Math.max(3, Math.round(target / 65));
    const sofar = recipe.script.paragraphs.length ? `${OPENING}\n\n${scriptText(recipe.script.paragraphs)}` : `${OPENING}\n\n(Nothing yet after the spoken opening above. This part begins the story.)`;
    const place = i === 0 ? 'This is the first part.' : i === PARTS.length - 1 ? 'This is the last part: it ends with the end of the book.' : `This is part ${i + 1} of ${PARTS.length}.`;
    const user = `Chapters this part covers: ${a} to ${b}. ${place}\nLength of this part: exactly ${paragraphs} paragraphs, about ${target} words in all.\n\nTHE STORY'S SPINE, WHOLE BOOK (a guide to what matters, never a source of facts):\n\n${recipe.spine!.text}\n\nNOTES FOR CHAPTERS ${a} TO ${b}, ONE LABELLED LINE PER CLAIM:\n\n${notesFor(a, b)}\n\nTHE SUMMARY SO FAR:\n\n${sofar}`;
    let { text, n: c } = await call('write', `write part ${i + 1} (chapters ${a}–${b})`, [{ role: 'system', content: prompt('summary-write.md') }, { role: 'user', content: user }], 9000, 0.4);
    let paras = parseParas(text);
    const drafts = [{ call: c, words: words(paras.map((x) => x.text).join(' ')), text }];
    // Length is fixed before checking: a part more than fifteen percent over is shortened, cutting only.
    for (let t = 1; t <= 2 && drafts[drafts.length - 1].words > target * 1.15; t++) {
      const allowed = new Set(paras.flatMap((x) => x.notes));
      const tight = await call('tighten', `tighten part ${i + 1} (to ${target} words, try ${t})`, [
        { role: 'system', content: prompt('summary-tighten.md') },
        { role: 'user', content: `Words for this part: about ${target}. It has ${drafts[drafts.length - 1].words} now.\n\nTHE PART:\n\n${withNotes(paras)}` },
      ], 9000, 0.2);
      const next = parseParas(tight.text);
      const strays = next.flatMap((x) => x.notes).filter((l) => !allowed.has(l));
      drafts.push({ call: tight.n, words: words(next.map((x) => x.text).join(' ')), text: tight.text, ...(strays.length ? { rejected: `cites note lines the part did not use: ${strays.join(', ')}` } : {}) } as (typeof drafts)[number]);
      if (strays.length) continue;
      paras = next;
      text = tight.text;
      c = tight.n;
    }
    for (const p of paras) {
      recipe.script.paragraphs.push({
        n: recipe.script.paragraphs.length + 1, part: i + 1, text: p.text, notes: p.notes, sources: idsFor(p.notes),
        history: [{ round: 0, text: p.text, notes: p.notes, why: drafts.length > 1 ? `written in pass 2, then shortened` : 'written in pass 2', call: c, by: MODEL }],
      });
    }
    recipe.parts.push({ part: i + 1, chapters: [a, b], target_words: target, call: c, drafts });
    save();
    console.log(`part ${i + 1}: ${paras.length} paragraphs (asked ${paragraphs}), ${drafts.map((d) => d.words).join(' → ')} words (target ${target}); $${recipe.usage.cost_usd.toFixed(4)}`);
  }
}

// --- Checks -----------------------------------------------------------------------
const COMMON_CAPS = new Set(['AI', 'I', 'English']);
function nameProblems(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/[\p{Lu}][\p{L}'’-]*/gu)) {
    const w = m[0].replace(/['’](s|m|re|ll|ve|d)$/, '').replace(/[-’']$/, '');
    if (COMMON_CAPS.has(w) || bookWords.has(w) || bookWords.has(w.toLowerCase())) continue;
    out.add(w);
  }
  return [...out];
}
/** The brief's spoken style: no parentheses, digits, symbols or ids read aloud; sentences a listener can follow. */
function styleProblems(text: string): string[] {
  const out: string[] = [];
  if (/[()[\]]/.test(text)) out.push('style: parentheses or brackets; say it in a sentence instead');
  if (/\d/.test(text)) out.push(`style: digits (${[...new Set(text.match(/\S*\d\S*/g))].slice(0, 5).join(', ')}); write numbers as words, or leave out figures the story doesn't need`);
  if (/[#%&@*_/\\]/.test(text)) out.push('style: symbols such as # or %; say them as words or leave them out');
  if (/NOTES|SOURCES|c\d+-b\d+/i.test(text)) out.push('style: a label, id or NOTES in the spoken text');
  const long = text.split(/(?<=[.!?…][”"’']?)\s+/).filter((x) => words(x) > 30);
  if (long.length) out.push(`style: ${long.length} sentence(s) over thirty words, which a listener can't follow; split them (first: "${long[0].slice(0, 80)}…")`);
  return out;
}
function citeProblems(p: Para): string[] {
  const out = p.notes.filter((l) => !byLabel.has(l)).map((l) => `cites note line ${l}, which does not exist`);
  if (!p.notes.length && !p.sources.length) out.push('cites nothing');
  out.push(...p.sources.filter((id) => !byId.has(id)).map((id) => `cites ${id}, which is not a block of the book`));
  return out;
}

async function checkPara(p: Para, round: number): Promise<Check> {
  const cited = p.sources.map((id) => byId.get(id)).filter(Boolean) as Block[];
  const user = `PARAGRAPH:\n${p.text}\n\nCITED BLOCKS:\n${fmtBlocks(cited)}`;
  const { text, n } = await call('check', `check paragraph ${p.n} (round ${round})`, [{ role: 'system', content: prompt('summary-check.md') }, { role: 'user', content: user }], 4000, 0);
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => /^UNSUPPORTED:/i.test(l)).map((l) => 'UNSUPPORTED: ' + l.replace(/^UNSUPPORTED:\s*/i, ''));
  const verdict = lines.length ? 'unsupported' : /^\s*SUPPORTED\s*$/im.test(text) ? 'supported' : 'error';
  return { round, para: p.n, verdict, unsupported: lines, call: n };
}

function lineDiff(a: string, b: string): string {
  const sa = a.split(/(?<=[.!?])\s+/), sb = b.split(/(?<=[.!?])\s+/);
  const setA = new Set(sa), setB = new Set(sb);
  return [...sa.filter((s) => !setB.has(s)).map((s) => `- ${s}`), ...sb.filter((s) => !setA.has(s)).map((s) => `+ ${s}`)].join('\n');
}

/** Fixes may only cut (owner, 2026-10-10): a revision longer than the paragraph, or citing note lines it didn't use, is refused. */
async function fixPara(p: Para, problems: string[], round: number) {
  const paras = recipe.script.paragraphs;
  const i = paras.findIndex((x) => x.n === p.n);
  const before = i > 0 ? paras[i - 1].text : OPENING;
  const after = i < paras.length - 1 ? paras[i + 1].text : '(This is the last paragraph written so far.)';
  const cited = p.sources.map((id) => byId.get(id)).filter(Boolean) as Block[];
  const lines = p.notes.map((l) => byLabel.get(l)).filter(Boolean) as NoteLine[];
  let ask = `PARAGRAPH BEFORE:\n${before}\n\nPARAGRAPH AFTER:\n${after}\n\nPARAGRAPH TO CORRECT (${words(p.text)} words):\n${p.text}\nNOTES: ${p.notes.join(', ')}\n\nTHE NOTE LINES IT RESTS ON:\n${labelled(lines)}\n\nTHE BLOCKS THOSE LINES CITE:\n${fmtBlocks(cited)}\n\nPROBLEMS:\n${problems.map((x) => `- ${x}`).join('\n')}`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { text, n } = await call('fix', `fix paragraph ${p.n} (round ${round}${attempt > 1 ? ', asked again' : ''})`, [{ role: 'system', content: prompt('summary-fix.md') }, { role: 'user', content: ask }], 6000, 0.2);
    const [rev] = parseParas(text);
    const why: string[] = [];
    if (!rev || !rev.notes.length) why.push('no paragraph or no NOTES line');
    else {
      if (words(rev.text) > words(p.text)) why.push(`longer than the paragraph (${words(rev.text)} words against ${words(p.text)})`);
      const strays = rev.notes.filter((l) => !p.notes.includes(l));
      if (strays.length) why.push(`cites note lines the paragraph did not use (${strays.join(', ')})`);
    }
    if (why.length) {
      recipe.edits.push({ para: p.n, round, by: MODEL, how: 'refused: fixes may only cut', diff: why.join('; '), call: n, outcome: 'refused' });
      save();
      ask += `\n\nYOUR LAST ANSWER WAS REFUSED: ${why.join('; ')}. Cut only, and cite only labels the paragraph has now.`;
      continue;
    }
    recipe.edits.push({ para: p.n, round, by: MODEL, how: "re-prompted with the checker's list (config/prompts/summary-fix.md)", diff: lineDiff(p.text, rev!.text), call: n, outcome: 'applied' });
    p.text = rev!.text;
    p.notes = rev!.notes;
    p.sources = idsFor(rev!.notes);
    p.history.push({ round, text: rev!.text, notes: rev!.notes, why: problems.join(' / '), call: n, by: MODEL });
    save();
    return;
  }
}

async function check() {
  const paras = recipe.script.paragraphs;
  const left = (recipe.checks as Record<string, unknown>);
  for (let r = 0; r <= MAX_FIX_ROUNDS; r++) {
    const pending = paras.filter((p) => !p.passed);
    if (!pending.length) break;
    const round = ++recipe.checks.rounds;
    const failed: { p: Para; problems: string[] }[] = [];
    for (const p of pending) {
      const problems = [...citeProblems(p), ...nameProblems(p.text).map((w) => `"${w}" is not spelled this way anywhere in the book`), ...styleProblems(p.text)];
      const c = await checkPara(p, round);
      if (c.verdict === 'error') c.unsupported.push('the checker did not answer in the expected form');
      recipe.checks.support.push(c);
      problems.push(...c.unsupported);
      if (problems.length) failed.push({ p, problems });
      else p.passed = true;
      save();
    }
    console.log(`round ${round}: ${pending.length} read, ${failed.length} with problems; $${recipe.usage.cost_usd.toFixed(4)}`);
    left.left = failed.map((f) => ({ para: f.p.n, problems: f.problems }));
    recipe.checks.unsupported_left = failed.reduce((a, f) => a + f.problems.length, 0);
    save();
    if (!failed.length || r === MAX_FIX_ROUNDS) break;
    for (const f of failed) await fixPara(f.p, f.problems, round);
  }
  recipe.checks.ids = { cited: [...new Set(paras.flatMap((p) => p.sources))].length, missing: paras.flatMap((p) => citeProblems(p).map((x) => ({ para: p.n, problem: x }))) };
  recipe.checks.names = { not_in_book: paras.flatMap((p) => nameProblems(p.text).map((w) => ({ para: p.n, word: w }))).concat(nameProblems(OPENING).map((w) => ({ para: 0, word: w }))) };
  save();
}

/**
 * Owner (2026-10-10): pass 2 is written by the coding agent. gpt-oss-120b reads each
 * paragraph once against its cited blocks as an independent second check; it
 * fixes nothing. Its findings, and the code checks, go to the coding agent, who
 * reads every paragraph against its blocks and records any edit as a diff.
 */
async function verify() {
  const paras = recipe.script.paragraphs;
  const round = ++recipe.checks.rounds;
  const found: { para: number; code: string[]; model: string[] }[] = [];
  const only = process.env.SUMMARY_PARAS ? new Set(process.env.SUMMARY_PARAS.split(',').map(Number)) : null;
  for (const p of paras.filter((x) => !only || only.has(x.n))) {
    const code = [...citeProblems(p), ...nameProblems(p.text).map((w) => `"${w}" is not spelled this way anywhere in the book`), ...styleProblems(p.text)];
    const c = await checkPara(p, round);
    if (c.verdict === 'error') c.unsupported.push('the checker did not answer in the expected form');
    recipe.checks.support.push(c);
    found.push({ para: p.n, code, model: c.unsupported });
    save();
    process.stdout.write(`${p.n}:${code.length + c.unsupported.length} `);
  }
  (recipe.checks as Record<string, unknown>)[`independent_round_${round}`] = found;
  recipe.checks.ids = { cited: [...new Set(paras.flatMap((p) => p.sources))].length, missing: paras.flatMap((p) => citeProblems(p).map((x) => ({ para: p.n, problem: x }))) };
  recipe.checks.names = { not_in_book: paras.flatMap((p) => nameProblems(p.text).map((w) => ({ para: p.n, word: w }))).concat(nameProblems(recipe.script.opening).map((w) => ({ para: 0, word: w }))) };
  save();
  console.log(`\nround ${round}: ${found.filter((f) => f.code.length + f.model.length).length} of ${paras.length} paragraphs flagged; $${recipe.usage.cost_usd.toFixed(4)}`);
}

function status() {
  const paras = recipe.script.paragraphs;
  const total = words(OPENING) + words(scriptText(paras));
  console.log(JSON.stringify({
    parts: recipe.parts.map((p) => ({ part: p.part, target: p.target_words, words: words(paras.filter((x) => x.part === p.part).map((x) => x.text).join(' ')) })),
    paragraphs: paras.length, passed: paras.filter((p) => p.passed).length, words: total, minutes_at_160: +(total / 160).toFixed(1),
    rounds: recipe.checks.rounds, problems_left: recipe.checks.unsupported_left, left: (recipe.checks as Record<string, unknown>).left,
    edits: { applied: recipe.edits.filter((e) => e.outcome === 'applied').length, refused: recipe.edits.filter((e) => e.outcome === 'refused').length },
    names: recipe.checks.names, usage: { cost_usd: +recipe.usage.cost_usd.toFixed(4), calls: recipe.usage.calls, by_step: recipe.usage.by_step },
  }, null, 1));
}

const step = process.argv[2];
if (step === 'notes') await notes();
else if (step === 'write') await write();
else if (step === 'check') await check();
else if (step === 'verify') await verify();
else if (step === 'status') status();
else throw new Error('step: notes | write | check | status');
