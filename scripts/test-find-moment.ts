/**
 * test:find-moment: "Find a moment", a tab of "Ask for help" (docs/proposals/remix-moments.md §2–§4; branch
 * find-a-moment; the owner's decisions of 2026-11-04). Recorded answers only: every model call goes to a stand-in that
 * plays back answers written here, so no model is called and nothing is spent. The database is an in-memory Postgres
 * (PGlite) with every migration on main and supabase/migrations/NEXT_sheet_help.sql (no migration of its own), and the
 * book's real blocks of chapters 4 and 30. Fails (exit 1) on any problem.
 *
 *   npm run test:find-moment
 *
 * Each rule is also proven to fail on a planted violation ("proof: …" lines).
 *  M1 a changed word: the quote is dropped, never shown (checkMomentQuote, the shared function).
 *  M2 a quote across two blocks: dropped.
 *  M3 a block past the chapter limit: dropped; search past the limit is never sent; with "include later chapters" on,
 *     the limit is 32 and later passages are marked.
 *  M4 a "why" copying the book (a run of 5 words), or in quote marks: the why is dropped, its quote kept; the guard model
 *     (Ask for help's flow) flags a why: one retry, then the whys are left out; no verdict fails closed.
 *  M5 more than 5 picks: only 5 shown; fewer than 3: one retry with a reminder, then filled "From search" (no why).
 *  M6 the opt-in ("include later chapters") off by default, on only when sent as true, off each time the panel opens.
 *  M7 the caps shared with "Ask for help": a search is one of its 20 messages a day and counts against its $1 a day;
 *     no count, table or migration of its own.
 *  M8 the switch: SHEET_HELP.findMoment off; even on, it waits for "Ask for help" to be live and Privacy §5 to describe
 *     it; the route answers 404 first; the form offers the tab only while live.
 *  M9 what is shown: the quote in <q>, its chapter, the why outside it with the AI label; "Make an image here" and
 *     "Read it", and no attaching ("Set in the book" waits: owner, 2026-11-04). Nothing is stored.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail: unknown = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`));
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught, 'the planted violation was not caught');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const prompt = (f: string) => read(`config/prompts/${f}`).replace(/^<!--[\s\S]*?-->\s*/, '');

const { CHAT, SHEET_HELP, CHALLENGE } = await import('../src/lib/config');
const Q = await import('../src/lib/moments/quote');
const PK = await import('../src/lib/moments/picks');
const FM = await import('../src/lib/sheet-help/find-moment');
const H = await import('../src/lib/sheet-help/help');
const FL = await import('../src/lib/sheet-help/flag');
const FX = await import('./lib/find-moment-fixture');
const { PRIVACY } = await import('../src/lib/legal');

const M = SHEET_HELP.moment;
const { within, later } = FX.fixturePassages(ROOT);
const ALL = new Map([...within, later].map((p) => [p.id, p]));
const WITHIN = new Map(within.map((p) => [p.id, p]));
const OPTS = { limit: FX.FIXTURE_LIMIT, upTo: FX.FIXTURE_UP_TO, max: M.max, maxWords: M.whyMaxWords, runWords: M.copyRunWords };
const RULE = { ...OPTS, min: M.min, pastLimit: false };
const b = (id: string) => ALL.get(id)!;

// --- M1 a changed word, M2 a quote across two blocks (the shared function) -----------------------------------------
{
  check('M1 a real sentence of c4-b73 passes, cut from the block', Q.checkMomentQuote(b('c4-b73'), "Bai walked up closer, and put her hand on Zei's shoulder.").ok);
  check('M1 … and speaker-colour spans are removed, nothing else (c4-b75 starts inside a span)', Q.checkMomentQuote(b('c4-b75'), 'She laughed, and slowly walked away.').ok && Q.checkMomentQuote(b('c4-b71'), '"Ah, Zei, we meet again."').ok);
  const changed = Q.checkMomentQuote(b('c4-b74'), 'Zei clenched his hands.');
  check('M1 one changed word is refused (not verbatim)', !changed.ok && changed.reason === 'not-verbatim', changed);
  check('M1 straight quotes for curly, or a changed case, are refused (nothing normalised)', !Q.checkMomentQuote(b('c4-b71'), '“Ah, Zei, we meet again.”').ok && !Q.checkMomentQuote(b('c4-b74'), 'zei clenched his fists.').ok);
  check('M1 half a sentence is refused', (Q.checkMomentQuote(b('c4-b73'), 'put her hand on Zei\'s shoulder.') as { reason?: string }).reason === 'not-whole-sentences');
  check('M1 a heading or other non-sentence block is refused', (Q.checkMomentQuote({ kind: 'heading', content: 'Chapter 4' }, 'Chapter 4') as { reason?: string }).reason === 'not-a-sentence-block');
  const across = Q.checkMomentQuote(b('c4-b74'), 'Zei clenched his fists. "See you in battle!');
  const acrossNext = Q.checkMomentQuote(b('c4-b75'), 'Zei clenched his fists. "See you in battle!');
  check('M2 a quote across two blocks fails against either block', !across.ok && !acrossNext.ok, { across, acrossNext });
  check('M1 the home page uses the same function (one rule)', /checkMomentQuote\(b, m\.text\)/.test(read('src/lib/home.ts')) && /import \{ checkMomentQuote/.test(read('src/lib/home.ts')));
  // Proofs: a check that normalised case and quote marks, or matched words loosely, would let these through.
  const loose = (block: { content: string }, q: string) => Q.momentSource(block.content).toLowerCase().replace(/[“”]/g, '"').includes(q.toLowerCase().replace(/[“”]/g, '"'));
  proof('a loose (normalising) check would pass the curly-quote and case changes the real one refuses', loose(b('c4-b71'), '“Ah, Zei, we meet again.”') && loose(b('c4-b74'), 'zei clenched his fists.'));
  const shown = PK.screenPicks(FX.FIXTURE_REPLY, ALL, OPTS, FX.FIXTURE_MOOD);
  check('M1/M2 through the screen: both planted c4-b74 lines dropped as not verbatim', shown.dropped.filter((d) => d.id === 'c4-b74' && d.reason === 'not-verbatim').length === 2 && !shown.moments.some((m) => m.id === 'c4-b74'));
  check('M1 every shown quote is the block’s own text at the checked offsets', PK.momentResultProblems(shown.moments, ALL, RULE).length === 0, PK.momentResultProblems(shown.moments, ALL, RULE));
  const planted = shown.moments.map((m, i) => (i === 0 ? { ...m, quote: m.quote.replace('closer', 'nearer') } : m));
  proof('a shown quote with one word changed is reported', PK.momentResultProblems(planted, ALL, RULE).some((p) => /exact words/.test(p)));
  const across2 = shown.moments.map((m, i) => (i === 0 ? { ...m, id: 'c4-b74', idx: 74, quote: 'Zei clenched his fists. "See you in battle!' } : m));
  proof('a shown quote across two blocks is reported', PK.momentResultProblems(across2, ALL, RULE).some((p) => /c4-b74: the quote is not the book's exact words/.test(p)));
}

// --- M3 a block past the chapter limit (pure) ----------------------------------------------------------------------
{
  const s = PK.screenPicks(FX.PAST_LIMIT, ALL, OPTS, '');
  check('M3 a pick past the limit is dropped (even if search had wrongly returned it)', s.moments.length === 0 && s.dropped[0]?.reason === 'past-limit', s.dropped);
  const opted = PK.screenPicks(FX.PAST_LIMIT, ALL, { ...OPTS, limit: 32 }, '');
  check('M3 with "include later chapters" (limit 32) it is shown, marked past where they’ve read', opted.moments.length === 1 && opted.moments[0].pastRead === true);
  check('M3 an id search never returned is dropped', PK.screenPicks(FX.NOT_SEARCHED, ALL, OPTS, '').dropped[0]?.reason === 'not-in-search');
  const planted = [{ id: 'c30-b6', chapter: 30, idx: 6, quote: 'Fin responded almost immediately.', why: null, from: 'pick' as const, pastRead: true }];
  proof('a shown c30 passage at limit 5 without the opt-in is reported', PK.momentResultProblems(planted, ALL, RULE).some((p) => /past the chapter limit/.test(p)) && PK.momentResultProblems(planted, ALL, { ...RULE, limit: 32 }).some((p) => /without "include later chapters"/.test(p)));
}

// --- M4 a "why" copying the book (pure) -------------------------------------------------------------------------------
{
  const sent = [...ALL.values()].map((p) => p.content);
  const w = (why: string) => PK.checkWhy(why, sent, FX.FIXTURE_MOOD, { maxWords: M.whyMaxWords, runWords: M.copyRunWords });
  check('M4 a why in its own words passes', w('a friendly hand on the shoulder while needling, smug on the surface').ok);
  const copy = w('another woman walked in about the same age, a rival arriving');
  check('M4 a why sharing 5 words with a passage is refused (copies the book)', !copy.ok && copy.reason === 'copies-book', copy);
  check('M4 … whatever its case or punctuation', !w('ANOTHER woman, walked in; about the same').ok);
  check('M4 four shared words are allowed (the rule is 5)', w('tense, walked in about the room quietly').ok, w('tense, walked in about the room quietly'));
  check('M4 a why in quote marks is refused', (w('the match is "about to begin" for everyone') as { reason?: string }).reason === 'quoted' && (w('a ‘smug’ look') as { reason?: string }).reason === 'quoted');
  check('M4 a why with a line of dialogue or a script is refused', !w('Bai: see you in battle').ok && !w('Narration: the hall goes quiet').ok && !w('INT. HALL - NIGHT').ok);
  check(`M4 a why over ${M.whyMaxWords} words is refused`, (w(Array(M.whyMaxWords + 1).fill('tense').join(' ')) as { reason?: string }).reason === 'too-long');
  check('M4 a pronoun the book doesn’t use for Bai is refused', (w('Bai keeps his hand there') as { reason?: string }).reason === 'pronouns');
  const s = PK.screenPicks(FX.FIXTURE_REPLY, ALL, OPTS, FX.FIXTURE_MOOD);
  const b70 = s.moments.find((m) => m.id === 'c4-b70');
  check('M4 through the screen: the copying why is dropped, its quote (the book’s words) still shown', !!b70 && b70.why === null && s.whyDropped.some((d) => d.id === 'c4-b70' && d.reason === 'copies-book'));
  proof('a shown why that copies six words of c4-b70 is reported', PK.momentResultProblems(s.moments.map((m) => (m.id === 'c4-b70' ? { ...m, why: 'Another woman walked in, about the same age' } : m)), ALL, RULE).some((p) => /copies-book/.test(p)));
  proof('a planted run length of 50 would let the copying why through', PK.checkWhy('another woman walked in about the same age', sent, '', { maxWords: 20, runWords: 50 }).ok);
}

// --- M6 the opt-in (pure and source) -----------------------------------------------------------------------------------
const CAST_STUB = [{ slug: 'bai' }, { slug: 'zei' }];
{
  const v = (raw: Record<string, unknown>) => FM.validateMoment(raw, CAST_STUB, 'bai');
  check('M6 "include later chapters" is off when not sent', v({ mood: 'x', upTo: 5 }).pastLimit === false);
  check('M6 … and on only when sent as true (not "true", 1 or "on")', v({ mood: 'x', upTo: 5, pastLimit: true }).pastLimit === true && [1, 'true', 'on', {}].every((x) => v({ mood: 'x', upTo: 5, pastLimit: x }).pastLimit === false));
  check('M6 the limit is clamped to 1–32', v({ mood: 'x', upTo: 99 }).upTo === 32 && v({ mood: 'x', upTo: -3 }).upTo === 1 && v({ mood: 'x', upTo: 'abc' }).upTo === 1);
  check('M6 no floor at the character’s first chapter (Bai first appears in 4; a reader at 2 stays at 2)', v({ mood: 'x', upTo: 2 }).upTo === 2);
  check('M6 the mood is required and at most moodMax characters; the character must be one of the cast', (() => {
    const bad = [{ mood: '' }, { mood: 'x'.repeat(M.moodMax + 1) }, { mood: 'x', character: 'nobody' }];
    return bad.every((r) => { try { v(r); return false; } catch (e) { return e instanceof FM.MomentError; } });
  })());
  const ui = read('src/components/find-moment.tsx');
  const sh = read('src/components/sheet-help.tsx');
  const startsOff = (src: string) => /export const PAST_LIMIT_DEFAULT = false;/.test(src) && /const \[pastLimit, setPastLimit\] = useState\(PAST_LIMIT_DEFAULT\);/.test(src) && !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(src);
  check('M6 the panel’s switch starts off and is never kept on the device', startsOff(ui));
  check('M6 … and the panel is mounted afresh each time "Ask for help" opens (so the switch is off each time)', /<FindMoment key=\{opened\}/.test(sh) && /onToggle=\{\(e\) => \(e\.currentTarget as HTMLDetailsElement\)\.open && setOpened\(\(n\) => n \+ 1\)\}/.test(sh));
  proof('a planted switch that starts on is caught', !startsOff(ui.replace('export const PAST_LIMIT_DEFAULT = false;', 'export const PAST_LIMIT_DEFAULT = true;')));
  proof('a planted switch remembered in localStorage is caught', !startsOff(ui + "\nlocalStorage.setItem('snowmoon.past-limit', '1');"));
  check('M6 the request sends the device’s furthest chapter and the switch as it is', /body: JSON\.stringify\(\{ from: p\.from, mood: m, character, upTo: upTo\(\), pastLimit \}\)/.test(ui));
}

// --- M8 the switch (pure and source) ---------------------------------------------------------------------------------
{
  check('M8 SHEET_HELP.findMoment is off in the config', SHEET_HELP.findMoment === false);
  check('M8 not live now', FL.findMomentLive() === false);
  const add5 = (p: typeof PRIVACY, words: string) => ({ ...p, sections: p.sections.map((x) => (x.n === 5 ? { ...x, body: [...x.body, words] } : x)) });
  const add6 = (p: typeof PRIVACY, words: string) => ({ ...p, sections: p.sections.map((x) => (x.n === 6 ? { ...x, body: [...x.body, words] } : x)) });
  const helpWords = add6(add5(PRIVACY, "On a character sheet, 'Ask for help' sends your message … to Groq"), "… words it suggested to you in 'Ask for help' …");
  const draft = read('docs/legal/find-a-moment-draft.md');
  const sentence = draft.match(/\*\*The new sentence alone\*\* \(for pasting\):\n\n> (.*)\n/)?.[1] ?? '';
  const both = add5(helpWords, sentence);
  const inWindow = new Date(Date.parse(CHALLENGE.dates.opens) + 3600_000);
  SHEET_HELP.on = true;
  SHEET_HELP.findMoment = true;
  const onNoWords = FL.findMomentLive(inWindow, helpWords);
  const onWords = FL.findMomentLive(inWindow, both);
  SHEET_HELP.on = false;
  const helpOff = FL.findMomentLive(inWindow, both);
  SHEET_HELP.on = true;
  SHEET_HELP.findMoment = false;
  const switchOff = FL.findMomentLive(inWindow, both);
  const plantedLive = (now: Date, privacy: typeof PRIVACY) => SHEET_HELP.findMoment && FL.sheetHelpLive(now, privacy);
  SHEET_HELP.findMoment = true;
  const plantedResult = plantedLive(inWindow, helpWords);
  SHEET_HELP.on = false;
  SHEET_HELP.findMoment = false;
  check('M8 the draft sentence names "Find a moment" and the passages, and is what the live check looks for', /Find a moment/.test(sentence) && /passages/.test(sentence) && FL.privacyDescribesFindMoment(both) && !FL.privacyDescribesFindMoment(PRIVACY), sentence);
  check('M8 switched on, with "Ask for help" live, it still waits for Privacy §5 to describe it', onNoWords === false);
  check('M8 on, with the words and "Ask for help" live: live', onWords === true);
  check('M8 on, with the words, but "Ask for help" off: not live', helpOff === false);
  check('M8 off, with everything else: not live', switchOff === false);
  proof('a planted live check that ignores the Privacy words would be live without them, unlike the real one', plantedResult === true && onNoWords === false);
  const route = read('src/app/api/sheet-help/moment/route.ts');
  check('M8 the route answers 404 first while not live', /export async function POST\(request: Request\) \{\n\s*if \(!findMomentLive\(\)\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\);/.test(route));
  check('M8 the form offers the tab only while live', /moment: character && findMomentLive\(\) \?/.test(read('src/app/references/designs/new/page.tsx')) && /\{p\.moment && tab === 'moment' && opened > 0 && \(/.test(read('src/components/sheet-help.tsx')));
  const p6w = read('scripts/check-principles.ts');
  check('M8 principle check P6w exists and plants the switch on without the Privacy words', /id: 'P6w'/.test(p6w) && /c\.on = true;/.test(p6w.slice(p6w.indexOf("id: 'P6w'"))));
  check('M8 legal.ts is not changed on this branch (the draft is in docs/legal/find-a-moment-draft.md)', !/Find a moment/.test(read('src/lib/legal.ts')) && /Find a moment/.test(draft));
}

// --- M9 what is shown (source) -------------------------------------------------------------------------------------
{
  const ui = read('src/components/find-moment.tsx');
  check('M9 the quote is set in <q>, the why outside the blockquote with the AI label', /<q>\{m\.quote\}<\/q>/.test(ui) && !/<blockquote[^>]*>[\s\S]*?m\.why[\s\S]*?<\/blockquote>/.test(ui) && /data-ai="why"[\s\S]{0,120}<AiTag[^>]*\/> \{m\.why\}/.test(ui));
  proof('a planted why inside the quote is caught', /<blockquote[^>]*>[\s\S]*?m\.why[\s\S]*?<\/blockquote>/.test(ui.replace('<q>{m.quote}</q>', '<q>{m.quote}</q> {m.why}')));
  check('M9 each passage shows its chapter', /\{W\.chapter\(m\.chapter\)\}/.test(ui));
  check('M9 "Make an image here" opens /references/new at that block in a new tab; "Read it" opens the chapter there', /href=\{`\/references\/new\?chapter=\$\{m\.chapter\}&start=\$\{m\.idx\}&end=\$\{m\.idx\}`\} target="_blank"/.test(ui) && /href=\{`\/chapter\/\$\{m\.chapter\}#\$\{m\.id\}`\} target="_blank"/.test(ui));
  check('M9 no attaching: no "Set in the book", no write route', !/Set in the book|set-moment|version_moments/i.test((ui + read('src/lib/sheet-help/find-moment.ts') + read('src/app/api/sheet-help/moment/route.ts')).replace(/^\s*(\*|\/\/|\/\*\*).*$/gm, '')) && !/Set in the book/.test(JSON.stringify((await import('../src/lib/sheet-help/wording')).FIND_MOMENT_WORDING)));
  check('M9 the prompt asks for picks from the passages only, copied exactly, 3 to 5', /Pick only from the passages given/.test(prompt('find-moment.md')) && /EXACTLY as written/.test(prompt('find-moment.md')) && /\{\{MIN\}\} to \{\{MAX\}\}/.test(prompt('find-moment.md')));
  check('M9 its guard policy is its own and judges only the reasons', /judge only the REASONS/.test(prompt('find-moment-guard.md')) && prompt('find-moment-guard.md') !== prompt('sheet-help-guard.md'));
}

// --- The database (M3, M4, M5, M7 through the flow) -------------------------------------------------------------------
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await db.exec(read(`supabase/migrations/${f}`));
await db.exec(read('supabase/migrations/NEXT_sheet_help.sql'));
await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
// A published sheet version of Bai (as test:sheet-help has), so an "Ask for help" message in M7 can be served for it.
await db.exec(`insert into studio.entities (id, work_id, kind, name) values ('00000000-0000-0000-0000-00000000e0e1','snowmoon','character','Bai');
  insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status) values ('00000000-0000-0000-0000-0000000000e1','snowmoon','design',6786,'00000000-0000-0000-0000-00000000e0e1','published');
  insert into studio.element_versions (id, element_id, version_no) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',1);`);
for (const ch of [4, 30]) for (const blk of FX.bookBlocks(ROOT, ch)) await db.query(`insert into studio.text_blocks (work_id, chapter, idx, kind, content, content_hash) values ('snowmoon', $1, $2, $3, $4, $5)`, [ch, blk.idx, blk.kind, blk.content, blk.sha256]);
const PORT = 54393;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://postgres@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
type Sql = Parameters<typeof FM.findMoment>[0]['sql'];
const S = sql as unknown as Sql;
type Call = { model: string; messages: { role: string; content: string }[] };
/** Recorded answers: search terms, picks and guard verdicts, played back in order. Nothing is called. */
function recorded(answers: string[], guards: string[] = []) {
  const calls: Call[] = [];
  const a = [...answers];
  const g = [...guards];
  const complete: Parameters<typeof FM.findMoment>[0]['complete'] = async (model, messages) => {
    calls.push({ model, messages });
    const guard = model === CHAT.guardModel;
    const text = (guard ? g.shift() : a.shift()) ?? (guard ? 'OK plain reasons' : '');
    return { text, promptTokens: guard ? 900 : 3800, completionTokens: guard ? 40 : 420, costUsd: guard ? 0.0000795 : 0.000822, requestId: null, provider: 'recorded', model };
  };
  return { complete, calls };
}
const TERMS = 'smug taunt rival hand shoulder laughed frown';
/** A stand-in for book search: what retrieve() would return (the book's blocks from the database), and what it was asked. */
const searches: { query: string; limit: number }[] = [];
const standIn = (extra: typeof within = []) => async (_s: Sql, query: string, limit: number) => {
  searches.push({ query, limit });
  const rows = (await sql`select chapter, idx, kind, content from studio.text_blocks where (chapter = 4 and idx between 70 and 76) or (chapter = 30 and idx = 6) order by chapter, idx`) as unknown as { chapter: number; idx: number; kind: string; content: string }[];
  const all = rows.map((r) => ({ id: `c${r.chapter}-b${r.idx}`, ...r }));
  // retrieve() keeps to the limit; `extra` plants blocks it should never have returned.
  return { passages: [...all.filter((p) => p.chapter <= limit), ...extra], heldBack: limit < 30 };
};
const deps = (fid: number, complete: Parameters<typeof FM.findMoment>[0]['complete'], retrieve = standIn()) => ({
  sql: S,
  fid,
  complete,
  systemPrompt: prompt('find-moment.md'),
  searchPrompt: prompt('chat-search-terms.md'),
  guardPolicy: prompt('find-moment-guard.md'),
  reminder: prompt('find-moment-reminder.md'),
  retrieve,
  who: { name: 'Bai', firstChapter: 4 },
});
const input = (over: Partial<{ mood: string; upTo: number; pastLimit: unknown }> = {}) => FM.validateMoment({ mood: FX.FIXTURE_MOOD, upTo: FX.FIXTURE_UP_TO, ...over }, CAST_STUB, 'bai');
const resetDb = async () => {
  await sql`delete from studio.sheet_help_calls`;
  await sql`delete from studio.sheet_help_costs`;
  await sql`delete from studio.sheet_help_served`;
};
const shownOk = (o: Awaited<ReturnType<typeof FM.findMoment>>, pastLimit = false) => (o.state === 'moments' ? PK.momentResultProblems(o.moments, ALL, { ...RULE, limit: o.limit, pastLimit }) : ['not moments']);

try {
  // --- The whole flow on the recorded reply -----------------------------------------------------------------------
  {
    await resetDb();
    const r = recorded([TERMS, FX.FIXTURE_REPLY], ['OK plain reasons']);
    const o = await FM.findMoment(deps(900, r.complete), input());
    check('M1–M4 the recorded reply: 5 shown, each the book’s exact words within the limit', o.state === 'moments' && o.moments.length === 5 && shownOk(o).length === 0, o.state === 'moments' ? shownOk(o) : o);
    check('M1/M2/M3 the changed word, the quote across two blocks, the c30 pick and the unsearched id are not shown', o.state === 'moments' && !o.moments.some((m) => ['c4-b74', 'c30-b6', 'c9-b1'].includes(m.id)) && o.dropped === 4, o.state === 'moments' ? o.dropped : o);
    check('M4 the copying why and the quoted why are dropped; their quotes are shown', o.state === 'moments' && o.moments.find((m) => m.id === 'c4-b70')?.why === null && o.moments.find((m) => m.id === 'c4-b76')?.why === null);
    check('M4 the guard model (Ask for help’s) reads the remaining whys only, never the dropped ones', r.calls.length === 3 && r.calls[2].model === CHAT.guardModel && CHAT.guardModel === 'openai/gpt-oss-safeguard-20b' && r.calls[2].messages[1].content.includes('[c4-b73]') && !r.calls[2].messages[1].content.includes('about the same age') && !r.calls[2].messages[1].content.includes('about to begin'));
    check('M3 the search was limited to the furthest chapter opened (5)', searches.at(-1)!.limit === 5 && o.state === 'moments' && o.limit === 5);
    check('M3 the model read passages from chapters 1–5 only', !r.calls[1].messages.some((m) => m.content.includes('[c30-')) && r.calls[1].messages[1].content.includes('[c4-b73]'));
    check('the search-terms step ran first, with the coach’s prompt, and its words were searched (never shown)', r.calls[0].model === CHAT.model && r.calls[0].messages[0].content === prompt('chat-search-terms.md') && searches.at(-1)!.query.includes('smug taunt rival') && o.state === 'moments' && !JSON.stringify(o).includes('smug taunt rival'));
    check('M9 each result carries its chapter and ¶ label from the database', o.state === 'moments' && o.moments.every((m) => m.chapter === 4 && typeof m.label === 'number'));
    check('M5 not regenerated (5 good picks, the guard said OK)', o.state === 'moments' && !o.regenerated && o.whys === 'ok');
    check('nothing about the search is stored except the count and the cost totals', (await sql`select count(*)::int as n from studio.sheet_help_served`)[0].n === 0 && !JSON.stringify(await sql`select * from studio.sheet_help_calls`).includes('smug') && !JSON.stringify(await sql`select * from studio.sheet_help_costs`).includes('smug'));
  }
  // --- M3 search that wrongly returned a later block; and the opt-in ----------------------------------------------
  {
    await resetDb();
    const r = recorded([TERMS, [FX.GOOD_PICKS.join('\n'), FX.PAST_LIMIT].join('\n')], ['OK']);
    const o = await FM.findMoment(deps(901, r.complete, standIn([later])), input());
    check('M3 a later block search should never have returned is not sent to the model and not shown', o.state === 'moments' && !o.moments.some((m) => m.chapter > 5) && !r.calls[1].messages[1].content.includes('[c30-b6]'));
    const r2 = recorded([TERMS, [FX.PAST_LIMIT, ...FX.GOOD_PICKS].join('\n')], ['OK']);
    const o2 = await FM.findMoment(deps(901, r2.complete), input({ pastLimit: true }));
    check('M3 with "include later chapters", the limit is 32 and c30 is shown, marked past where they’ve read', o2.state === 'moments' && o2.limit === 32 && searches.at(-1)!.limit === 32 && o2.moments[0].id === 'c30-b6' && o2.moments[0].pastRead && o2.moments.slice(1).every((m) => !m.pastRead) && shownOk(o2, true).length === 0, o2);
    const r3 = recorded([TERMS, FX.GOOD_PICKS.join('\n')]);
    const o3 = await FM.findMoment(deps(901, r3.complete), input({ upTo: 2 }));
    check('M3 a character first met past the limit: it says so, no floor, no search and no message counted', o3.state === 'not-yet' && o3.firstChapter === 4 && r3.calls.length === 0 && (await sql`select count(*)::int as n from studio.sheet_help_calls where fid = 901`)[0].n === 2);
  }
  // --- M4 the guard flow on the whys --------------------------------------------------------------------------------
  {
    await resetDb();
    const reply = FX.GOOD_PICKS.join('\n');
    const r = recorded([TERMS, reply, reply], ['VIOLATION a line of dialogue', 'VIOLATION still']);
    const o = await FM.findMoment(deps(902, r.complete), input());
    check('M4 the guard flags the whys: one retry with the reminder and its reason, then the whys are left out and the quotes shown', o.state === 'moments' && o.regenerated && o.whys === 'left-out' && o.moments.length === 3 && o.moments.every((m) => m.why === null) && r.calls[3].messages.at(-1)!.content.includes('a line of dialogue'), o);
    const r2 = recorded([TERMS, reply, reply], ['VIOLATION x', 'OK']);
    const o2 = await FM.findMoment(deps(902, r2.complete), input());
    check('M4 the retry passing the guard: its whys are shown', o2.state === 'moments' && o2.regenerated && o2.whys === 'ok' && o2.moments.every((m) => !!m.why));
    const r3 = recorded([TERMS, reply, reply], ['maybe', 'hmm', 'unclear', '...']);
    const o3 = await FM.findMoment(deps(902, r3.complete), input());
    check('M4 a guard with no verdict fails closed (two tries each time, then the whys left out)', o3.state === 'moments' && o3.whys === 'left-out' && r3.calls.filter((c) => c.model === CHAT.guardModel).length === 4);
    const noWhy = FX.GOOD_PICKS.map((l) => l.replace(/\|[^|]*$/, '|')).join('\n');
    const r4 = recorded([TERMS, noWhy]);
    const o4 = await FM.findMoment(deps(902, r4.complete), input());
    check('M4 no whys: no guard call', o4.state === 'moments' && o4.whys === 'none' && !r4.calls.some((c) => c.model === CHAT.guardModel));
    const copying = [FX.WHY_COPIES, ...FX.GOOD_PICKS].join('\n');
    const r5 = recorded([TERMS, copying], ['OK']);
    const o5 = await FM.findMoment(deps(902, r5.complete), input());
    check('M4 a why copying the book is refused before the guard (the guard never sees it)', o5.state === 'moments' && o5.moments[0].id === 'c4-b70' && o5.moments[0].why === null && !r5.calls.find((c) => c.model === CHAT.guardModel)!.messages[1].content.includes('about the same age'));
  }
  // --- M5 more than 5, fewer than 3 --------------------------------------------------------------------------------
  {
    await resetDb();
    const seven = ['c4-b70 | Another woman walked in, about the same age as Zei. | a rival arrives', 'c4-b71 | "Ah, Zei, we meet again." | familiar and cool', ...FX.GOOD_PICKS, 'c4-b74 | Zei clenched his fists. | anger held in', 'c4-b76 | A bell buzzed. | the match is near'].join('\n');
    const r = recorded([TERMS, seven], ['OK']);
    const o = await FM.findMoment(deps(903, r.complete), input());
    check('M5 seven good picks: only the first 5 are shown, no retry', o.state === 'moments' && o.moments.length === 5 && !o.regenerated && o.moments.map((m) => m.id).join() === 'c4-b70,c4-b71,c4-b73,c4-b72,c4-b75', o.state === 'moments' ? o.moments.map((m) => m.id) : o);
    proof('a planted result of 6 is reported', PK.momentResultProblems([...(o.state === 'moments' ? o.moments : []), { id: 'c4-b76', chapter: 4, idx: 76, quote: 'A bell buzzed.', why: null, from: 'pick', pastRead: false }], ALL, RULE).some((p) => /more than 5/.test(p)));
    const two = FX.GOOD_PICKS.slice(0, 2).join('\n');
    const r2 = recorded([TERMS, two, FX.GOOD_PICKS.join('\n')], ['OK', 'OK']);
    const o2 = await FM.findMoment(deps(903, r2.complete), input());
    check('M5 two picks: one retry with the reminder saying how many passed; the retry’s three shown', o2.state === 'moments' && o2.regenerated && o2.moments.length === 3 && /only 2 of your lines/.test(r2.calls[3]?.messages.at(-1)!.content ?? r2.calls[2].messages.at(-1)!.content), r2.calls.map((c) => c.model));
    const r3 = recorded([TERMS, FX.CHANGED_WORD, FX.ACROSS_BLOCKS], []);
    const o3 = await FM.findMoment(deps(903, r3.complete), input());
    check('M5 none pass twice: filled from the top search hits’ first sentence, labelled "From search", with no why', o3.state === 'moments' && o3.moments.length === 3 && o3.moments.every((m) => m.from === 'search' && m.why === null) && shownOk(o3).length === 0, o3);
    check('M5 … and a retry is at most one (search terms, two picks)', r3.calls.length === 3);
    proof('a "From search" result carrying model words is reported', PK.momentResultProblems(o3.state === 'moments' ? o3.moments.map((m, i) => (i === 0 ? { ...m, why: 'a calm before the storm' } : m)) : [], ALL, RULE).some((p) => /From search/.test(p)));
  }
  // --- M7 the caps shared with "Ask for help" ---------------------------------------------------------------------
  {
    await resetDb();
    check('M7 "Find a moment" uses "Ask for help"’s reserve and record, and no table of its own', /reserveHelp\(sql, fid, momentWorstUsd\(\)\)/.test(read('src/lib/sheet-help/find-moment.ts')) && /recordHelp\(/.test(read('src/lib/sheet-help/find-moment.ts')) && !/insert into|create table|studio\.\w+/.test(read('src/lib/sheet-help/find-moment.ts').replace(/^\s*\*.*$/gm, '')));
    check('M7 no migration of its own', !readdirSync(path.join(ROOT, 'supabase/migrations')).some((f) => /moment/i.test(f)));
    // 19 "Ask for help" messages, then one search: that is 20; the next of either is refused.
    for (let i = 0; i < SHEET_HELP.perDay - 1; i++) await sql`insert into studio.sheet_help_calls (fid) values (904)`;
    const r = recorded([TERMS, FX.GOOD_PICKS.join('\n')], ['OK']);
    const o = await FM.findMoment(deps(904, r.complete), input());
    check('M7 the 20th message of the day can be a search; it says 0 left', o.state === 'moments' && o.left === 0);
    const r2 = recorded([TERMS, FX.GOOD_PICKS.join('\n')], ['OK']);
    const o2 = await FM.findMoment(deps(904, r2.complete), input());
    check('M7 the 21st (a search) is refused with "Ask for help"’s limit, before any model call', o2.state === 'limit' && o2.perDay === 20 && r2.calls.length === 0);
    const hr = { complete: recorded(['PART: grey\nCHANGE: storm-blue\nWHY: blue.'], ['OK']).complete };
    const ho = await H.sheetHelp({ sql: S, fid: 904, complete: hr.complete, systemPrompt: prompt('sheet-help.md'), guardPolicy: prompt('sheet-help-guard.md'), reminder: prompt('sheet-help-reminder.md'), from: '00000000-0000-0000-0000-0000000000a1', retrieve: async () => ({ passages: [], heldBack: false }), facts: [], who: { name: 'Bai', firstChapter: 4 } }, H.validateHelp({ message: 'x', draft: 'a grey coat, short hair', recipe: '', upTo: 5 }, 'bai', 4));
    check('M7 … and so is an "Ask for help" message after it (one count)', ho.state === 'limit');
    const saved = SHEET_HELP.perDay;
    SHEET_HELP.perDay = 1000;
    const planted = await FM.findMoment(deps(904, recorded([TERMS, FX.GOOD_PICKS.join('\n')], ['OK']).complete), input());
    SHEET_HELP.perDay = saved;
    proof('a planted separate cap (1000) would let the 21st through, so the shared count is what stops it', planted.state === 'moments');
    await resetDb();
    const [{ n: before }] = await sql`select count(*)::int as n from studio.sheet_help_costs`;
    await FM.findMoment(deps(905, recorded([TERMS, FX.GOOD_PICKS.join('\n')], ['OK']).complete), input());
    const costs = await sql`select kind, model, calls, cost_usd::float8 as usd from studio.sheet_help_costs order by kind`;
    check('M7 its calls land in "Ask for help"’s daily cost totals (answer and guard), with no person', before === 0 && costs.length === 2 && costs.find((c) => c.kind === 'answer')!.calls === 2 && costs.find((c) => c.kind === 'guard')!.calls === 1, costs);
    const worst = FM.momentWorstUsd();
    check('M7 the worst case of a search (search terms, two picks, four guard calls) is reserved, about $0.007', worst > 0.005 && worst < 0.01 && Math.abs(worst - 0.0073) < 0.0005, worst);
    await resetDb();
    await sql`insert into studio.sheet_help_costs (kind, model, provider, cost_usd) values ('answer', ${CHAT.model}, 'groq', ${(SHEET_HELP.dailySpendCapUsd - worst + 0.0001).toFixed(8)})`;
    const r3 = recorded([TERMS, FX.GOOD_PICKS.join('\n')], ['OK']);
    const o3 = await FM.findMoment(deps(906, r3.complete), input());
    check('M7 refused when "Ask for help"’s day spend plus the worst case would pass $1, before any model call, taking no message', o3.state === 'spend' && r3.calls.length === 0 && (await sql`select count(*)::int as n from studio.sheet_help_calls where fid = 906`)[0].n === 0);
    const savedCap = SHEET_HELP.dailySpendCapUsd;
    SHEET_HELP.dailySpendCapUsd = 100;
    const plantedSpend = await FM.findMoment(deps(906, recorded([TERMS, FX.GOOD_PICKS.join('\n')], ['OK']).complete), input());
    SHEET_HELP.dailySpendCapUsd = savedCap;
    proof('a planted separate budget would let it through, so the shared $1 is what stops it', plantedSpend.state === 'moments');
  }
} finally {
  await sql.end();
  await server.stop();
  await db.close();
}
if (failures.length) {
  console.error(`test:find-moment FAILED: ${failures.length} problem(s), ${passed} passed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`test:find-moment passed: ${passed} checks (recorded answers only; no model call, nothing spent)`);
process.exit(0);
