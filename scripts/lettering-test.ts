/**
 * Decision C's test (owner, 2026-11-18; branch closed-lettering): may a closed model draw words the person puts in
 * quotation marks, and does a read-back model tell when it got them right? DRAFT, written by the coding agent (Claude, a
 * closed model by Anthropic). Nothing here is built into the site: the quote parser, the lettering line and the guard's
 * lettering policy below are this test's drafts of decision C, for the owner to judge from the results.
 *
 * Ten pictures with GPT Image 2.5 Sunburst (a closed model by OpenAI), made as the challenge makes a closed picture: the
 * site's own remixPrompt (src/lib/challenge/make.ts) with the no-lettering line swapped for the drafted lettering line, a
 * setting drawn as for every closed picture, Zei's first base as the single reference picture, 1536 x 1024, then cropped
 * to 16:9 with the site's own toWide (src/lib/images/closed.ts). Each prompt is first checked by the site's guard model
 * (gpt-oss-safeguard-20b on Groq) against the drafted lettering policy, through the gateway only: never the Groq-direct
 * route, never GROQ_API_KEY. Each picture, as made and as cropped, is then read blind (only the picture and a fixed
 * instruction) by GPT-6.1 Sol and GPT-6 Luna (OpenAI) and Gemini 3.8 Flash (Google, Vertex), each pinned to one provider
 * with zero data retention and no training (scripts/lib/batch-model.ts readText), and by Apple Vision on this Mac (free,
 * no network; scripts/ocr.swift), including the strips the crop removes. The comparison is made in code (rule v1 below).
 *
 * Every paid call goes through the Vercel AI Gateway with AI_GATEWAY_API_KEY, read in place from the env file and never
 * printed (CLAUDE.md: batch jobs only through the gateway). Spending is capped: before each call, what has been spent
 * plus that call's worst case must stay within --max-usd (at most $1.15, the owner's cap); otherwise the run stops there.
 *
 *   npx tsx --conditions=react-server scripts/lettering-test.ts                         estimate only: no call, nothing sent
 *   npx tsx --conditions=react-server --env-file=/Users/nathan/snowmoon/.env.local \
 *     scripts/lettering-test.ts --spend --max-usd=1.15 [--run=NAME] [--no-gemini]       the paid run
 *
 * Output: private/lettering-test/<run>/ (gitignored): each picture (original PNG, cropped JPEG), results.json (every call,
 * its cost and request id, every reading, every verdict) and the ledger. A rerun with the same --run skips the pictures
 * already made and counts what they cost.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { IMAGES } from '../src/lib/config';
import { remixPrompt } from '../src/lib/challenge/make';
import { lookForBase } from '../src/lib/challenge/looks';
import { drawSetting, settingLine, settingRecord } from '../src/lib/challenge/settings';
import { CROP_FROM_TOP, toWide } from '../src/lib/images/closed';
import { compare, letteringLine, letteringPolicy, parseQuotes, phraseSource, CAP } from './lib/lettering-draft';
import { CLOSED_IMAGE_MODELS, closedImage, readText, readWorstUsd, TEXT_READERS, type TextReader } from './lib/batch-model';

const ROOT = process.cwd();
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const flag = (n: string) => process.argv.includes(`--${n}`);
const OWNER_CAP = 1.15;
const maxUsd = Number(arg('max-usd') ?? OWNER_CAP);
if (!(maxUsd > 0) || maxUsd > OWNER_CAP) throw new Error(`--max-usd must be above 0 and at most ${OWNER_CAP} (the owner's cap)`);
const spend = flag('spend');
const run = arg('run') ?? new Date().toISOString().slice(0, 10);
const readers: TextReader[] = ['openai/gpt-6.1-sol', 'openai/gpt-6-luna', ...(flag('no-gemini') ? [] : (['google/gemini-3.8-flash'] as const))];

// ---------------------------------------------------------------------------------------------------------------------
// The reference picture: Zei's first base (CHALLENGE.bases.zei[0], version bffc7b6a), its front view as published.
// ---------------------------------------------------------------------------------------------------------------------
const REFERENCE = {
  version: 'bffc7b6a-edc7-4fd7-8922-bcab5f8c4c2d',
  url: 'https://pictures.snowmoon.party/images/readers/131f235227a54b06f6f11253f37a09b5.jpg',
  sha256: '131f235227a54b06f6f11253f37a09b5001bf5f72326a6c9949a21800990dc7c',
};
const NAME = 'Zei';

// ---------------------------------------------------------------------------------------------------------------------
// The ten change texts (the person's words). Half are typed with straight quotes, half with curly ones (a phone's).
// ---------------------------------------------------------------------------------------------------------------------
export const CASES: { n: number; words: string; why: string }[] = [
  { n: 1, words: 'a banner above him reading “Embrace the competition”', why: 'book phrase, curly quotes' },
  { n: 2, words: 'a poster on the wall behind him that says "the Path of Strength"', why: 'book phrase, lowercase start' },
  { n: 3, words: 'he holds up a sign: “the Path of Strength” on top, “Embrace the competition” below', why: 'both book phrases, 7 words' },
  { n: 4, words: 'his T-shirt says "Embrace the competition"', why: 'on cloth, with folds' },
  { n: 5, words: 'he stands under a shop sign that says “Night Market”', why: 'own words' },
  { n: 6, words: 'he holds a mug that says "we don’t stop"', why: 'curly apostrophe inside straight quotes' },
  { n: 7, words: 'a hand-painted wooden sign beside him: “Snow tonight”', why: 'own words, painted' },
  { n: 8, words: 'a chalkboard behind him with "Lesson 4: Gliders"', why: 'a digit and a colon' },
  { n: 9, words: 'he unrolls a scroll that reads “the first step is always the hardest one”', why: '8 words, at the cap' },
  { n: 10, words: 'a doormat at his feet that says "Welcome home"', why: 'placed low on purpose: the crop' },
];

const GUARD = { model: 'openai/gpt-oss-safeguard-20b', provider: 'groq', input: 0.075e-6, output: 0.3e-6, maxTokens: IMAGES.designs.guardMaxTokens };
const guardWorstUsd = (system: string, prompt: string) => (system.length + prompt.length + 100) * GUARD.input + GUARD.maxTokens * GUARD.output;

async function guard(system: string, prompt: string, key: string) {
  const res = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: GUARD.model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_tokens: GUARD.maxTokens, temperature: 0, providerOptions: { gateway: { zeroDataRetention: true, only: [GUARD.provider] } } }),
  });
  const j = (await res.json().catch(() => ({}))) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const u = j.usage ?? {};
  const cost = Number.isFinite(Number(u.cost)) ? Number(u.cost) : (u.prompt_tokens ?? 0) * GUARD.input + (u.completion_tokens ?? 0) * GUARD.output;
  const text = String(j.choices?.[0]?.message?.content ?? '');
  const line = text.trim().split('\n').reverse().find((l) => l.trim().startsWith('{')) ?? '';
  let v: { allow?: unknown; category?: unknown } = {};
  try { v = JSON.parse(line); } catch { v = {}; }
  const servedBy = j.choices?.[0]?.message?.provider_metadata?.gateway?.routing?.finalProvider ?? null;
  return { ok: res.ok, status: res.status, allow: v.allow === true && res.ok, category: typeof v.category === 'string' ? v.category : v.allow === true ? null : 'unclear', costUsd: res.ok ? cost : 0, requestId: j.id ?? null, servedBy };
}

// ---------------------------------------------------------------------------------------------------------------------
// Apple Vision on this Mac (no network, no cost): the whole picture, and on the original the strips the crop removes.
// ---------------------------------------------------------------------------------------------------------------------
function vision(file: string, box?: [number, number, number, number]): string[] {
  try {
    const out = execFileSync('swift', [path.join(ROOT, 'scripts/ocr.swift'), file, ...(box ?? []).map(String)], { encoding: 'utf8', timeout: 120_000 });
    return out.split('\n').filter(Boolean).map((l) => String((JSON.parse(l) as { text: string }).text));
  } catch (e) {
    return [`(apple vision failed: ${(e as Error).message.slice(0, 80)})`];
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------------------------------------------------
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const OUT = path.join(ROOT, 'private/lettering-test', run);
const resultsFile = path.join(OUT, 'results.json');
type Result = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const earlier: Result[] = existsSync(resultsFile) ? (JSON.parse(readFileSync(resultsFile, 'utf8')).results as Result[]) : [];
const results: Result[] = [...earlier];
const ledger: { at: string; case: number; kind: string; model: string; provider: string | null; costUsd: number; reported: boolean; requestId: string | null }[] = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')).ledger : [];
let spent = ledger.reduce((t, l) => t + l.costUsd, 0);

const prepared = CASES.map((c) => {
  const parsed = parseQuotes(c.words);
  if (!parsed.ok) throw new Error(`case ${c.n}: ${parsed.error}`);
  const setting = drawSetting();
  const base = remixPrompt({ words: c.words, name: NAME, look: lookForBase('zei', REFERENCE.sha256), style: '', setting: settingLine(setting) });
  if (!base.endsWith(IMAGES.suffix)) throw new Error('remixPrompt no longer ends with IMAGES.suffix: redraft the test');
  const prompt = base.slice(0, -IMAGES.suffix.length) + letteringLine(parsed.phrases);
  return { ...c, phrases: parsed.phrases.map((p) => ({ text: p, ...phraseSource(p) })), words_count: parsed.words, chars: parsed.chars, setting: settingRecord(setting), prompt, policy: letteringPolicy(parsed.phrases) };
});

const imageWorst = CLOSED_IMAGE_MODELS['gpt-image-2.5-sunburst'].worstUsd;
const perCaseWorst = (p: (typeof prepared)[number]) => guardWorstUsd(p.policy, p.prompt) + imageWorst + 2 * readers.reduce((t, r) => t + readWorstUsd(r), 0);
const worstAll = prepared.reduce((t, p) => t + perCaseWorst(p), 0);
const expected = 10 * (0.0479 + 0.0002) + 20 * readers.reduce((t, r) => t + (TEXT_READERS[r].imageTokens + 300) * TEXT_READERS[r].input + 300 * TEXT_READERS[r].output, 0);
console.log(`lettering test, run ${run}: ${prepared.length} pictures, readers ${readers.join(', ')} + Apple Vision`);
console.log(`worst case if every call cost its most: $${worstAll.toFixed(4)}; expected about $${expected.toFixed(2)}; cap $${maxUsd.toFixed(2)} (calls stop before the cap)`);
for (const p of prepared) console.log(`  ${p.n}. ${p.phrases.map((x) => `"${x.text}" (${x.source === 'book' ? x.block : 'own'})`).join(' + ')} · ${p.words_count} words, ${p.chars} chars · setting ${p.setting.id}`);
if (!spend) {
  console.log('\nestimate only: nothing was sent. Add --spend (with --env-file) to run.');
  console.log(`\nexample prompt (case 1):\n${prepared[0].prompt}`);
  process.exit(0);
}

const key = process.env.AI_GATEWAY_API_KEY;
if (!key) throw new Error('AI_GATEWAY_API_KEY is not set: stop and tell the owner');
delete process.env.GROQ_API_KEY; // never the Groq-direct route
mkdirSync(OUT, { recursive: true });
const save = () => writeFileSync(resultsFile, JSON.stringify({ run, at: new Date().toISOString(), cap_usd: maxUsd, spent_usd: Number(spent.toFixed(6)), reference: REFERENCE, readers, cap: CAP, crop: { from_top_share: CROP_FROM_TOP }, results, ledger }, null, 1) + '\n');
const may = (worst: number, what: string) => {
  if (spent + worst > maxUsd) {
    console.log(`STOP before ${what}: spent $${spent.toFixed(4)} + worst $${worst.toFixed(4)} would pass the cap $${maxUsd}`);
    save();
    process.exit(2);
  }
};
const book = (kind: string, c: number, model: string, provider: string | null, costUsd: number, reported: boolean, requestId: string | null) => {
  spent += costUsd;
  ledger.push({ at: new Date().toISOString(), case: c, kind, model, provider, costUsd: Number(costUsd.toFixed(6)), reported, requestId });
};

const refRes = await fetch(REFERENCE.url);
const ref = Buffer.from(await refRes.arrayBuffer());
if (sha(ref) !== REFERENCE.sha256) throw new Error('the reference picture does not match its sha256');

for (const p of prepared) {
  // A rerun picks up where the last one stopped: a finished case is skipped, a made picture is not made again.
  const prev = results.find((x) => x.n === p.n);
  if (prev && (prev.done || prev.guard?.allow === false || prev.image_error)) { console.log(`${p.n}: done earlier`); continue; }
  const r: Result = prev ?? { n: p.n, words: p.words, why: p.why, phrases: p.phrases, setting: p.setting, prompt: p.prompt, prompt_sha256: sha(Buffer.from(p.prompt)), policy_sha256: sha(Buffer.from(p.policy)) };
  if (!prev) results.push(r);
  // The prompt recorded first is the one used, even on a rerun (its setting was drawn then).
  const prompt = String(r.prompt);
  const policy = letteringPolicy(p.phrases.map((x) => x.text));
  const origFile = path.join(OUT, `${p.n}-original.png`);
  const cropFile = path.join(OUT, `${p.n}-crop.jpg`);
  if (!r.image) {
    if (!r.guard) {
      may(guardWorstUsd(policy, prompt), `case ${p.n}'s prompt check`);
      const g = await guard(policy, prompt, key);
      book('guard', p.n, GUARD.model, g.servedBy, g.costUsd, true, g.requestId);
      r.guard = g;
      save();
      console.log(`${p.n}: guard ${g.allow ? 'allow' : `refuse ${g.category}`} ($${g.costUsd.toFixed(5)})`);
      if (!g.allow) continue;
    }
    may(imageWorst, `case ${p.n}'s picture`);
    let made;
    try {
      made = await closedImage('gpt-image-2.5-sunburst', prompt, { bytes: ref, contentType: 'image/jpeg' }, { key, aspect: '3:2' });
    } catch (e) {
      // A failed call may still be billed: count the worst case, as the site does when no cost comes back.
      book('image', p.n, 'gpt-image-2.5-sunburst', 'openai', imageWorst, false, null);
      r.image_error = String((e as Error).message).slice(0, 300);
      console.log(`${p.n}: picture failed (${r.image_error.slice(0, 80)}); counted $${imageWorst}`);
      save();
      continue;
    }
    book('image', p.n, 'gpt-image-2.5-sunburst', 'openai', made.costUsd, made.meta?.providerMetadata?.gateway?.cost !== undefined, made.requestId);
    writeFileSync(origFile, made.bytes);
    const w = await toWide(made.bytes, IMAGES.size);
    writeFileSync(cropFile, w.bytes);
    r.image = { model: 'gpt-image-2.5-sunburst', settings: made.settings, request_id: made.requestId, cost_usd: made.costUsd, original: { file: path.basename(origFile), sha256: sha(made.bytes) }, crop: { file: path.basename(cropFile), sha256: sha(w.bytes), ...w.crop, words: w.words } };
    save();
    console.log(`${p.n}: picture $${made.costUsd.toFixed(4)} (spent $${spent.toFixed(4)})`);
  }
  const made = { bytes: readFileSync(origFile) };
  const wide = { bytes: readFileSync(cropFile) };
  if (sha(made.bytes) !== r.image.original.sha256 || sha(wide.bytes) !== r.image.crop.sha256) throw new Error(`case ${p.n}: a saved picture changed`);

  r.reads = r.reads ?? {};
  for (const which of ['original', 'crop'] as const) {
    const img = which === 'original' ? { bytes: made.bytes, contentType: 'image/png' } : { bytes: wide.bytes, contentType: 'image/jpeg' };
    for (const reader of readers) {
      if (r.reads[`${which}|${reader}`]) continue;
      may(readWorstUsd(reader), `case ${p.n}'s ${which} read by ${reader}`);
      let t;
      try {
        t = await readText(reader, img, { key });
      } catch (e) {
        t = { texts: [], costUsd: 0, costReported: false, requestId: null, servedBy: null, usage: null, error: String((e as Error).message).slice(0, 200) };
      }
      book(`read-${which}`, p.n, reader, t.servedBy, t.costUsd, t.costReported, t.requestId);
      const texts = t.texts.map((x) => x.text);
      r.reads[`${which}|${reader}`] = { ...t, verdict: t.error ? 'not checked' : compare(p.phrases.map((x) => x.text), texts).match ? 'match' : 'mismatch', detail: compare(p.phrases.map((x) => x.text), texts), caseless: compare(p.phrases.map((x) => x.text), texts, true).match };
      save();
    }
    const file = which === 'original' ? origFile : cropFile;
    const av = vision(file);
    r.reads[`${which}|apple-vision`] = { texts: av.map((text) => ({ text, cut_off: false })), costUsd: 0, verdict: compare(p.phrases.map((x) => x.text), av).match ? 'match' : 'mismatch', detail: compare(p.phrases.map((x) => x.text), av), caseless: compare(p.phrases.map((x) => x.text), av, true).match };
  }
  // The strips the crop removes, on the original: 40 rows at the top, 120 at the bottom (of 1024).
  const H = 1024, top = Math.round(160 * CROP_FROM_TOP);
  r.strips = { top_rows: top, bottom_rows: 160 - top, top: vision(origFile, [0, 0, 1, top / H]), bottom: vision(origFile, [0, (H - (160 - top)) / H, 1, (160 - top) / H]) };
  console.log(`${p.n}: ${Object.entries(r.reads).map(([k, v]) => `${k.replace('openai/', '').replace('google/', '')} ${(v as Result).verdict}`).join(' · ')}`);
  r.done = true;
  save();
}
save();
console.log(`\ndone: spent $${spent.toFixed(4)} of the $${maxUsd} cap; results in ${path.relative(ROOT, OUT)}/`);
