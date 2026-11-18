/**
 * How many of the assistant's citations support the sentence they're attached to (owner, 2026-11-17): every
 * (sentence, cited block) pair in eval-chat.ts answers, graded against the block's own text alone, with no notes, no
 * other passages and no knowledge of the book. A sentence that cites a reviewed note by its label (branch chat-cites) is
 * graded against each block the note rests on, which the reader is shown, and counts as backed if any one backs it.
 *
 *   npx tsx scripts/grade-cites.ts <eval.json> [<eval.json> …] [--out=<grades.json>]
 *
 * The grader is gpt-oss-120b on Groq through the Vercel AI Gateway, pinned like the assistant (zero retention), at
 * temperature 0. It sees only the book's text and the model's answers, nothing about any person. Spend is capped at
 * $0.50 (GRADE_SPEND_CAP).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sanitizeAnswer } from '../src/lib/chat/sanitize';
import { routeQuestion } from '../src/lib/chat/notes';
import { providerOptions, servedBy } from '../src/lib/chat/provider';
import { CHAT } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const out = args.find((a) => a.startsWith('--out='))?.slice(6);
const CAP = Number(process.env.GRADE_SPEND_CAP ?? 0.5);
const MODEL = CHAT.model;

const chapters = new Map<number, Map<number, string>>();
function blockText(id: string): string | null {
  const m = id.match(/^c(\d+)-b(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!chapters.has(n)) {
    const j = JSON.parse(readFileSync(path.join(ROOT, `content/snowmoon/text/chapter-${n}.json`), 'utf8')) as { blocks: { idx: number; content: string }[] };
    chapters.set(n, new Map(j.blocks.map((b) => [b.idx, b.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()])));
  }
  return chapters.get(n)!.get(Number(m[2])) ?? null;
}

/** A sentence ends at . ! or ?, after any closing quote and the citations that follow it. */
const SENTENCE_END = /(?<=[.!?][”’"')\]】]*(?:\s*\[(?:c\d+-b\d+|summary c\d+ §\d+|learn-more [a-z-]+ [a-z]+)\])*)\s+(?!\s)(?!\[(?:c\d|summary|learn-more))/u;

const LABEL = /\[(summary c\d+ §\d+|learn-more [a-z-]+ [a-z]+)\]/g;

/** The answer as shown, split into sentences, each with the block ids and the note labels cited in it. */
function sentences(raw: string, allowed: Set<string>, notes: Set<string>) {
  const clean = sanitizeAnswer(raw, allowed, { notes });
  const shown = clean.parts.map((p) => (p.type === 'text' ? p.text : p.type === 'cite' ? ` [${p.id}]` : ` [${p.label}]`)).join('');
  return shown
    .split(/\n+/)
    .flatMap((para) => para.split(SENTENCE_END))
    .map((s) => ({
      text: s.replace(/\s*\[c\d+-b\d+\]/g, '').replace(LABEL, '').replace(/\s+/g, ' ').trim(),
      cites: [...new Set([...s.matchAll(/\[(c\d+-b\d+)\]/g)].map((m) => m[1]))],
      notes: [...new Set([...s.matchAll(LABEL)].map((m) => m[1]))],
    }))
    .filter((s) => (s.cites.length || s.notes.length) && s.text.length > 3);
}

const GRADER = `You check one citation in an answer about a novel. You get one sentence from the answer and one passage from the novel that the sentence cites.

A sentence often makes several claims and cites several passages, one for each. Pick the claim in the sentence this passage is closest to, and grade the passage against that one claim.

Judge the passage ALONE: use no other knowledge of the novel, no other passages, and no guesses about what happens elsewhere.

BACKS: the passage states or plainly shows that claim (in other words is fine).
PART: the passage shows the same event, act or fact, but not all of the claim (for example it shows a tied vote but not who it was for, or what came of it). Nothing in it contradicts the claim.
NO: the passage is about something else, only shares a name, place or topic, or contradicts the claim.

Reply in exactly two lines:
BACKS, PART or NO
Claim: <the words of the sentence you graded against, or "none">`;

let spend = 0;
async function grade(sentence: string, passage: string): Promise<{ ok: boolean | null; part: boolean; why: string }> {
  if (spend > CAP) throw new Error(`spend cap $${CAP} reached`);
  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!token) throw new Error('no gateway token');
  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: GRADER },
      { role: 'user', content: `Sentence: ${sentence}\n\nPassage: ${passage}` },
    ],
    max_tokens: 800,
    temperature: 0,
    providerOptions: providerOptions(),
  });
  for (let wait = 2000; ; wait *= 2) {
    const res = await fetch(CHAT.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body });
    if ([429, 498, 503].includes(res.status) && wait <= 32000) {
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } };
    if (!res.ok) throw new Error(`gateway ${res.status} ${JSON.stringify(j).slice(0, 200)}`);
    if (servedBy(j as never) && !/groq/i.test(String(servedBy(j as never)))) throw new Error(`served by ${servedBy(j as never)}`);
    const p = CHAT.prices[MODEL];
    spend += typeof j.usage?.cost === 'number' ? j.usage.cost : (j.usage?.prompt_tokens ?? 0) * p.input + (j.usage?.completion_tokens ?? 0) * p.output;
    const text = (j.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const first = text.split('\n')[0].trim().toUpperCase();
    return { ok: first.startsWith('BACKS') || first.startsWith('PART') ? true : first.startsWith('NO') ? false : null, part: first.startsWith('PART'), why: text.split('\n').slice(1).join(' ').replace(/^Claim:\s*/i, '').trim() };
  }
}

type Pair = { file: string; id: string; question: string; shown: boolean; sentence: string; cite: string; note?: boolean; ok: boolean | null; part?: boolean; why: string };
const pairs: Pair[] = [];
const jobs: (() => Promise<void>)[] = [];
let answers = 0;
for (const f of files) {
  const results = JSON.parse(readFileSync(f, 'utf8')).results as { id: string; question: string; position?: number; result: { state: string }; calls: { model: string; text: string }[] }[];
  for (const r of results) {
    const answerCalls = r.calls.filter((c) => c.model === MODEL).slice(1);
    if (!answerCalls.length || r.result.state === 'book') continue;
    answers++;
    const raw = answerCalls[answerCalls.length - 1].text;
    const allowed = new Set(raw.match(/c\d+[-‐‑‒–—]b\d+/g)?.map((x) => x.replace(/[‐‑‒–—]/, '-')) ?? []);
    const notes = new Map(routeQuestion(r.question, r.position ?? null).notes.map((n) => [n.label, n]));
    const base = { file: path.basename(f), id: r.id, question: r.question, shown: r.result.state === 'answer' };
    for (const s of sentences(raw, allowed, new Set(notes.keys()))) {
      for (const cite of s.cites) {
        const passage = blockText(cite);
        const pair: Pair = { ...base, sentence: s.text, cite, ok: null, why: '' };
        pairs.push(pair);
        if (!passage) Object.assign(pair, { ok: false, why: 'no such block' });
        else jobs.push(async () => void Object.assign(pair, await grade(s.text, passage)));
      }
      // A note citation shows the reader the note's own source blocks: backed if any one of them backs the sentence.
      for (const label of s.notes) {
        const pair: Pair = { ...base, sentence: s.text, cite: label, note: true, ok: null, why: '' };
        pairs.push(pair);
        const sources = (notes.get(label)?.sources ?? []).map((id) => [id, blockText(id)] as const).filter((x): x is readonly [string, string] => !!x[1]);
        jobs.push(async () => {
          const gs = await Promise.all(sources.map(async ([id, t]) => ({ id, ...(await grade(s.text, t)) })));
          const best = gs.find((g) => g.ok && !g.part) ?? gs.find((g) => g.ok) ?? gs.find((g) => g.ok === false);
          Object.assign(pair, best ? { ok: best.ok, part: best.part, why: `${best.id}: ${best.why}` } : { ok: false, why: 'no sources' });
        });
      }
    }
  }
}
for (let i = 0; i < jobs.length; i += 6) await Promise.all(jobs.slice(i, i + 6).map((j) => j()));

const tally = (ps: Pair[]) => {
  const no = ps.filter((p) => p.ok === false).length;
  const unknown = ps.filter((p) => p.ok === null).length;
  const part = ps.filter((p) => p.ok && p.part).length;
  const byAnswer = new Map<string, Pair[]>();
  for (const p of ps) byAnswer.set(`${p.file} ${p.id}`, [...(byAnswer.get(`${p.file} ${p.id}`) ?? []), p]);
  const withNo = [...byAnswer.values()].filter((v) => v.some((p) => p.ok === false)).length;
  return `${ps.length} citations: ${ps.length - no - part - unknown} back their sentence, ${part} back part of it, ${no} don't (${ps.length ? Math.round((100 * no) / ps.length) : 0}%)${unknown ? `, ${unknown} ungraded` : ''}; ${withNo} of ${byAnswer.size} answers have at least one`;
};
console.log(`answers graded: ${answers}`);
console.log(`all answers: ${tally(pairs)}`);
console.log(`shown answers: ${tally(pairs.filter((p) => p.shown))}`);
console.log(`block ids the model picked: ${tally(pairs.filter((p) => !p.note))}`);
if (pairs.some((p) => p.note)) console.log(`note citations (graded by the note's own blocks): ${tally(pairs.filter((p) => p.note))}`);
console.log(`grading spend: $${spend.toFixed(4)}`);
if (out) writeFileSync(out, JSON.stringify({ spend, pairs }, null, 1));
