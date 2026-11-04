/**
 * test:sheet-help: "Ask for help" beside a character sheet's prompt box (docs/proposals/sheet-help.md, branch
 * sheet-help). Recorded answers only: every model call goes to a stand-in that plays back answers written here, so no
 * model is called and nothing is spent. The database is an in-memory Postgres (PGlite) with every migration on main
 * and supabase/migrations/NEXT_sheet_help.sql. Fails (exit 1) on any problem.
 *
 *   npm run test:sheet-help
 *
 * Each rule is also proven to fail on a planted violation ("proof: …" lines): the rule, run on a bad input or a broken
 * copy, must report it.
 *  H1 one part at a time: a change names exact words inside one part, replaces them with one part, or adds one part;
 *     the result differs from the draft in exactly one part.
 *  H2 refusals: a whole-prompt rewrite, more than one part, adding to an empty prompt, and story lines (dialogue,
 *     narration, captions, events) are never offered; asking for a whole prompt gets a note, not a prompt.
 *  H3 accept and reject: Accept applies the one change; Reject leaves the text as it was; a stale suggestion (the
 *     text changed since) applies nothing.
 *  H4 the caps: 20 messages a day per person, $1 a day across everyone (the worst case reserved before any call, so
 *     the cap is never overshot); a refused message makes no model call; cost rows carry no person.
 *  H5 the guard flow: flagged, one retry with the reminder, then a decline; a guard with no verdict fails closed; the
 *     guard runs after the pattern checks; what the model reads (message, book facts up to the chapter limit, draft and
 *     recipe text; never later chapters, never pictures).
 *  H6 the label in the recipe, set by the server (owner, 2026-11-03): a published sheet whose text holds words the
 *     server served that person for that sheet, within SHEET_HELP.servedDays (case and spaces normalised), says
 *     "includes words from AI suggestions" on its page and in each picture's recipe; another person's, another sheet's
 *     or an expired suggestion doesn't label it; nothing from the browser is read (a browser that drops everything is
 *     still labelled); only a fingerprint of the served words is kept, never the message. Old rows are deleted.
 *     Whole-prompt marking until per-phrase marking is built.
 *  H7 the switch: off in the config; even on, it waits for Privacy §5 and §6 and the challenge's window; the route
 *     answers 404 first.
 *  H9 no floor (principle 9, P9d; owner, 2026-11-04): the chapter limit is the number the device sends (its furthest
 *     chapter opened, or later chapters chosen for that thread), never raised to the character's first chapter; a
 *     request with no limit is refused; a reader before the character's first chapter sends the model none of its
 *     facts. Farcaster only: a wallet account (a negative number) is refused before anything is reserved or sent.
 *  H8 the migration: safe twice; the dry run keeps nothing and is the same SQL; the two-part read-back passes, and
 *     catches a planted bad grant, a planted extra column and a planted missing check.
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

const { CHAT, IMAGES, SHEET_HELP, CHALLENGE } = await import('../src/lib/config');
const P = await import('../src/lib/sheet-help/part');
const NS = await import('../src/lib/sheet-help/no-story');
const H = await import('../src/lib/sheet-help/help');
const SV = await import('../src/lib/sheet-help/served');
const M = await import('../src/lib/sheet-help/mark');
const F = await import('../src/lib/sheet-help/flag');
const O = await import('../src/lib/challenge/open-sheets');
const RL = await import('../src/lib/images/recipe-lines');
const { SHEET_HELP_WORDING } = await import('../src/lib/sheet-help/wording');
const { PRIVACY } = await import('../src/lib/legal');
const { bookCharacter } = await import('../src/lib/images/designs');

const LIM = { partMaxChars: SHEET_HELP.partMaxChars, partMaxWords: SHEET_HELP.partMaxWords, textMaxChars: IMAGES.designs.textMaxChars };
const DRAFT = 'eighteen, sharp dark eyes, short black hair tied back, a long grey coat with brass buttons';

// --- H1 one part at a time ----------------------------------------------------------------------------------------
{
  check('H1 the draft has four parts', P.promptParts(DRAFT).length === 4, P.promptParts(DRAFT));
  const ok = [
    { before: 'grey', after: 'storm-blue' },
    { before: 'short black hair tied back', after: 'short black hair cut close at the sides' },
    { before: '', after: 'a thin silver ring on her left hand' },
  ];
  for (const p of ok) {
    const r = P.refuseProposal(DRAFT, p, LIM);
    const next = P.applyProposal(DRAFT, p, LIM);
    const d = next ? P.partsChanged(DRAFT, next) : null;
    check(`H1 offered and applied: ${p.before || 'NEW'} → ${p.after}`, r === null && !!next && !!d && d.added.length === 1 && d.removed.length === (p.before ? 1 : 0), { r, next, d });
  }
  const bad: [string, { before: string; after: string }, string][] = [
    ['crosses a comma', { before: 'eyes, short', after: 'eyes and short' }, 'crosses-parts'],
    ['adds two parts at once', { before: '', after: 'a red scarf, gloves' }, 'more-than-one-part'],
    ['replaces one part with two', { before: 'grey', after: 'grey; a hood' }, 'more-than-one-part'],
    ['a change ending in a full stop', { before: 'grey', after: 'grey wool.' }, 'more-than-one-part'],
    ['too long for one part', { before: 'grey', after: Array(30).fill('word').join(' ') }, 'too-long'],
    ['words not in the draft', { before: 'green hat', after: 'red hat' }, 'not-found'],
    ['the same change twice', { before: 'grey', after: 'grey' }, 'unchanged'],
  ];
  for (const [label, p, want] of bad) check(`H1 refused: ${label}`, P.refuseProposal(DRAFT, p, LIM) === want, P.refuseProposal(DRAFT, p, LIM));
  check('H1 refused: words that appear twice (ambiguous)', P.refuseProposal('a grey coat, grey eyes', { before: 'grey', after: 'blue' }, LIM) === 'ambiguous');
  check('H1 refused: a result longer than a sheet may be', P.refuseProposal('x'.repeat(IMAGES.designs.textMaxChars - 5), { before: '', after: 'a long red scarf' }, LIM) === 'result-too-long');
  // Proof: a two-part change slipped past the rule shows up as two parts changed.
  const planted = DRAFT.replace('grey coat with brass buttons', 'red coat, a hood');
  proof('a result that changes two parts is seen as more than one part', P.partsChanged(DRAFT, planted).added.length === 2);
}

// --- H2 whole-prompt rewrites and story lines ---------------------------------------------------------------------
{
  check('H2 refused: adding to an empty prompt (the person writes first)', P.refuseProposal('', { before: '', after: 'eighteen' }, LIM) === 'empty-draft' && P.refuseProposal('  \n ', { before: '', after: 'eighteen' }, LIM) === 'empty-draft');
  check('H2 refused: replacing a one-part prompt whole', P.refuseProposal('a tall girl in grey', { before: 'a tall girl in grey', after: 'a short girl in red' }, LIM) === 'whole-prompt');
  check('H2 refused: a whole multi-part prompt as the words to change', P.refuseProposal(DRAFT, { before: DRAFT, after: 'someone new' }, LIM) === 'crosses-parts');
  const mustFlag = [
    'she says hello to Zei',
    'whispering that she is not afraid',
    '"So, you afraid of me?"',
    "with a speech bubble reading 'fight me'",
    'a caption under her feet',
    'narrated by her brother',
    'then she walks away from the board',
    'remembers the match with Zei',
    'a sign reading REDSHIRE',
    'BAI: fight me',
    'INT. HALL - NIGHT',
    'Line: I win',
    'fifteen days later in the south islands',
  ];
  const mustPass = ['storm-blue', 'a long grey coat with brass buttons', 'short black hair cut close at the sides', 'a level, unhurried gaze'.replace(',', ''), 'scuffed boots', 'a thin silver ring on her left hand', 'eighteen years old', 'standing with her arms folded', 'a faded scar over one eyebrow'];
  const missed = mustFlag.filter((t) => NS.checkPromptWords(t).ok);
  const wrongly = mustPass.filter((t) => !NS.checkPromptWords(t).ok);
  check(`H2 the pattern check flags ${mustFlag.length} story lines and passes ${mustPass.length} visual parts`, missed.length === 0 && wrongly.length === 0, { missed, wrongly });
  check('H2 the note may quote the person’s own words, not a line', NS.checkNote('“grey” is vague next to the book [c4-b73].', DRAFT).ok && !NS.checkNote('Try: "You never cared about the walls, did you?"', DRAFT).ok);
  proof('a planted story line in the change is caught', !NS.checkPromptWords('a grey coat as she says goodbye').ok);
  proof('a planted quoted line is caught', !NS.checkPromptWords('a coat stitched with “never again”').ok);
  check('H2 the system prompt forbids the whole prompt, more than one part, and story lines', /never do:[\s\S]*write the whole prompt[\s\S]*more than one part[\s\S]*dialogue/.test(prompt('sheet-help.md')));
  check('H2 the guard policy flags a whole-prompt rewrite and story text', /rewrite of the whole prompt/.test(prompt('sheet-help-guard.md')) && /story text/.test(prompt('sheet-help-guard.md')) && /dialogue/.test(prompt('sheet-help-guard.md')));
  check('H2 the guard policy is its own, not the coach’s', prompt('sheet-help-guard.md') !== prompt('make-guard.md') && !/story coach/.test(prompt('sheet-help-guard.md')));
}

// --- H3 accept and reject -----------------------------------------------------------------------------------------
{
  const p = { before: 'grey', after: 'storm-blue' };
  const accepted = P.applyProposal(DRAFT, p, LIM);
  check('H3 Accept changes exactly that part', accepted === DRAFT.replace('grey', 'storm-blue'), accepted);
  const edited = DRAFT.replace('grey', 'charcoal');
  check('H3 a stale suggestion (the text changed since) applies nothing', P.applyProposal(edited, p, LIM) === null);
  const ui = read('src/components/sheet-help.tsx');
  const decide = ui.slice(ui.indexOf('const decide'), ui.indexOf('return (', ui.indexOf('const decide')));
  const acceptOnly = (src: string) => /if \(accept\) \{[\s\S]*applyProposal\([\s\S]*p\.onAccept\(/.test(src) && (src.match(/p\.onAccept\(/g) ?? []).length === 1 && /let decided[^\n]*= 'rejected'/.test(src);
  check('H3 the page changes the text only in Accept; Reject marks the suggestion rejected and changes nothing', acceptOnly(decide));
  proof('a planted Reject that also applies the change is caught', !acceptOnly(decide.replace("let decided: 'accepted' | 'rejected' | 'stale' = 'rejected';", "let decided: 'accepted' | 'rejected' | 'stale' = 'rejected';\n    p.onAccept(p.text, null, '');")));
  check('H3 the form sends nothing about suggestions at publish (the server labels it)', !/help:|helpReceipts|receipt/.test(read('src/components/design-form.tsx').slice(read('src/components/design-form.tsx').indexOf('const publish'), read('src/components/design-form.tsx').indexOf('const startConsent'))));
}

// --- The database --------------------------------------------------------------------------------------------------
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await db.exec(read(`supabase/migrations/${f}`));
await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
// Two published sheet versions (Bai's, as the challenge's sheets are): help is served for a version being remixed.
const SHEET_A = '00000000-0000-0000-0000-0000000000a1';
const SHEET_B = '00000000-0000-0000-0000-0000000000b1';
await db.exec(`insert into studio.entities (id, work_id, kind, name) values ('00000000-0000-0000-0000-00000000e0e1','snowmoon','character','Bai');
  insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status) values ('00000000-0000-0000-0000-0000000000e1','snowmoon','design',6786,'00000000-0000-0000-0000-00000000e0e1','published'), ('00000000-0000-0000-0000-0000000000e2','snowmoon','design',6852,'00000000-0000-0000-0000-00000000e0e1','published');
  insert into studio.element_versions (id, element_id, version_no) values ('${SHEET_A}','00000000-0000-0000-0000-0000000000e1',1), ('${SHEET_B}','00000000-0000-0000-0000-0000000000e2',1);`);

// --- H8 the migration and its read-back ---------------------------------------------------------------------------
const MIG = read('supabase/migrations/NEXT_sheet_help.sql');
const DRY = read('supabase/drafts/NEXT_sheet_help.DRY-RUN.sql');
const RB = read('supabase/drafts/READ-BACK-sheet_help.sql');
const body = (s: string) => s.replace(/^(--[^\n]*\n|\s*\n)*/, '').replace(/\n(commit|rollback);\s*$/, '').trim();
{
  check('H8 the dry run is the migration’s SQL, ending in rollback', body(MIG) === body(DRY) && /\nrollback;\s*$/.test(DRY) && /\ncommit;\s*$/.test(MIG), { mig: body(MIG).length, dry: body(DRY).length });
  check('H8 the migration says who runs it, and is unnumbered until merge', /MUST RUN AS postgres/.test(MIG) && /NOT APPLIED/.test(MIG) && !readdirSync(path.join(ROOT, 'supabase/migrations')).some((f) => /^\d{4}_sheet_help/.test(f)));
  const fresh = new PGlite();
  await fresh.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await fresh.exec(read(`supabase/migrations/${f}`));
  await fresh.exec(DRY);
  const left = await fresh.query<{ n: number }>(`select count(*)::int as n from pg_class where relname in ('sheet_help_calls', 'sheet_help_costs')`);
  check('H8 the dry run keeps nothing', left.rows[0].n === 0);
  await fresh.close();
  await db.exec(MIG);
  await db.exec(MIG);
  check('H8 the migration is safe to run twice', true);
  const [partA, partB] = [RB.slice(RB.indexOf('-- (a) ---'), RB.indexOf('-- (b) ---')), RB.slice(RB.indexOf('-- (b) ---'))];
  const selectA = partA.replace(/^--[^\n]*\n/gm, '').trim().replace(/;\s*$/, '');
  check('H8 read-back (a) is one read-only SELECT', /^select /i.test(selectA) && !/;/.test(selectA) && !/\b(insert|update|delete|drop|alter|grant|revoke|set role|create)\b/i.test(selectA.replace(/'[^']*'/g, "''")));
  check('H8 read-back (b) is one do block with no set role and no temp table', /^do \$\$[\s\S]*end \$\$;\s*$/.test(partB.replace(/^--[^\n]*\n/gm, '').trim()) && !/set role|temp(orary)? table/i.test(partB) && /READ-BACK FAILED/.test(partB) && /insert into studio\.sheet_help_calls/.test(partB) && /delete from studio\.sheet_help_calls/.test(partB));
  const runA = async () => (await db.query<{ what: string; ok: boolean }>(selectA)).rows;
  const a = await runA();
  check('H8 read-back (a): every row true', a.length === 21 && a.every((r) => r.ok === true), a.filter((r) => !r.ok));
  let bErr = '';
  try {
    await db.exec(partB);
  } catch (e) {
    bErr = (e as Error).message;
  }
  check('H8 read-back (b) passes and leaves nothing', bErr === '' && (await db.query<{ n: number }>(`select (select count(*) from studio.sheet_help_calls) + (select count(*) from studio.sheet_help_costs) + (select count(*) from studio.sheet_help_served) as n`)).rows[0].n == 0, bErr);
  await db.exec(`grant update on studio.sheet_help_calls to studio_writer`);
  const a2 = await runA();
  await db.exec(`revoke update on studio.sheet_help_calls from studio_writer`);
  proof('read-back (a) catches a planted update grant on the count', a2.some((r) => !r.ok && /update/.test(r.what)));
  await db.exec(`alter table studio.sheet_help_calls add column message text`);
  const a3 = await runA();
  await db.exec(`alter table studio.sheet_help_calls drop column message`);
  proof('read-back (a) catches a planted message column', a3.some((r) => !r.ok && /only the FID/.test(r.what)));
  await db.exec(`alter table studio.sheet_help_calls drop constraint sheet_help_calls_fid_check`);
  let b2 = '';
  try {
    await db.exec(partB);
  } catch (e) {
    b2 = (e as Error).message;
  }
  await db.exec(`delete from studio.sheet_help_calls; delete from studio.sheet_help_costs; alter table studio.sheet_help_calls add constraint sheet_help_calls_fid_check check (fid > 0)`);
  proof('read-back (b) catches a planted missing FID check', /READ-BACK FAILED/.test(b2));
  await db.exec(`grant update on studio.sheet_help_served to studio_writer`);
  const a4 = await runA();
  await db.exec(`revoke update on studio.sheet_help_served from studio_writer`);
  proof('read-back (a) catches a planted update grant on served suggestions', a4.some((r) => !r.ok && /sheet_help_served/.test(r.what)));
  await db.exec(`alter table studio.sheet_help_served drop constraint sheet_help_served_words_sha256_check`);
  let b3 = '';
  try {
    await db.exec(partB);
  } catch (e) {
    b3 = (e as Error).message;
  }
  await db.exec(`delete from studio.sheet_help_served; delete from studio.sheet_help_calls; delete from studio.sheet_help_costs; alter table studio.sheet_help_served add constraint sheet_help_served_words_sha256_check check (words_sha256 ~ '^[0-9a-f]{64}$')`);
  proof('read-back (b) catches served words kept as plain text (the fingerprint check removed)', /READ-BACK FAILED: served words kept as plain text/.test(b3));
  check('H8 the read-back’s fingerprint (computed in SQL) is the one the site computes', RB.includes(SV.fingerprint(SV.words('storm-blue wool coat'))));
  check('H8 the code writes the columns the migration makes', /insert into studio\.sheet_help_calls \(fid\)/.test(read('src/lib/sheet-help/limits.ts')) && /fid bigint not null check \(fid > 0\)/.test(MIG));
}

// Bai's c4-b73 (a fact on her sheet) as a real block, so a citation reads back the book's words from the database.
const ch4 = JSON.parse(read('content/snowmoon/text/chapter-4.json')) as { blocks: { idx: number; kind: string; content: string; sha256: string }[] };
const b73 = ch4.blocks.find((b) => b.idx === 73)!;
await db.query(`insert into studio.text_blocks (work_id, chapter, idx, kind, content, content_hash) values ('snowmoon', 4, 73, $1, $2, $3)`, [b73.kind, b73.content, b73.sha256]);

const PORT = 54391;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://postgres@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
type Sql = Parameters<typeof H.sheetHelp>[0]['sql'];
const S = sql as unknown as Sql;

/** Recorded answers: the model's replies and the guard's verdicts, played back in order. Nothing is called. */
type Call = { model: string; messages: { role: string; content: string }[] };
function recorded(answers: string[], guards: string[] = []) {
  const calls: Call[] = [];
  const a = [...answers];
  const g = [...guards];
  const complete: Parameters<typeof H.sheetHelp>[0]['complete'] = async (model, messages) => {
    calls.push({ model, messages });
    const guard = model === CHAT.guardModel;
    const text = (guard ? g.shift() : a.shift()) ?? (guard ? 'OK visual only' : 'NONE: nothing recorded for this call?');
    return { text, promptTokens: guard ? 1290 : 4012, completionTokens: guard ? 61 : 388, costUsd: guard ? 0.00011505 : 0.0008346, requestId: null, provider: 'recorded', model };
  };
  return { complete, calls };
}
const bai = bookCharacter('bai')!;
const deps = (fid: number, complete: Parameters<typeof H.sheetHelp>[0]['complete']) => ({
  sql: S,
  fid,
  complete,
  systemPrompt: prompt('sheet-help.md'),
  guardPolicy: prompt('sheet-help-guard.md'),
  reminder: prompt('sheet-help-reminder.md'),
  from: SHEET_A,
  retrieve: async () => ({ passages: [{ id: 'c4-b70', chapter: 4, idx: 70, kind: 'paragraph', content: 'A recorded passage about Bai.' }], heldBack: false }),
  facts: bai.quotes,
  who: { name: bai.name, firstChapter: bai.firstChapter },
});
const input = (message: string, draft = DRAFT, upTo = 5) => H.validateHelp({ message, draft, recipe: 'The style’s text: soft ink lines\nFront view: full body, facing us\nAdded to every prompt: no text', upTo }, 'bai');
const resetDb = async () => {
  await sql`delete from studio.sheet_help_calls`;
  await sql`delete from studio.sheet_help_costs`;
  await sql`delete from studio.sheet_help_served`;
};

try {
  // --- H5 the guard flow, and what the model reads --------------------------------------------------------------
  {
    await resetDb();
    const good = 'PART: grey\nCHANGE: storm-blue\nWHY: The book puts her by the sea [c4-b73], and blue keeps that.';
    const r1 = recorded([good], ['OK visual only']);
    const out = await H.sheetHelp(deps(500, r1.complete), input('her coat feels too plain'));
    check('H5 a proposal that passes every check is shown, and the book’s words', out.state === 'proposal' && out.before === 'grey' && out.after === 'storm-blue' && out.quotes.length === 1 && out.quotes[0].id === 'c4-b73' && /Bai walked up closer/.test(out.quotes[0].html) && !out.regenerated, out);
    const u = r1.calls[0].messages.map((m) => m.content).join('\n');
    check('H5 the model reads the message, the draft, the recipe text and the book’s facts up to the chapter limit', u.includes('her coat feels too plain') && u.includes(DRAFT) && u.includes('soft ink lines') && u.includes('[c4-b73]') && u.includes('[c4-b70]') && /the book uses "she" for Bai/.test(u));
    check('H5 … and nothing from later chapters (the reader is at chapter 5: Bai’s chapter 9 and 24 facts are left out)', !u.includes('[c9-') && !u.includes('[c24-'));
    check('H5 … and text only: no picture, image address or data', !/data:image|https?:\/\/[^\s]*\.(jpe?g|png|webp)/i.test(u));
    check('H5 the answer model is gpt-oss-120b and the guard gpt-oss-safeguard-20b, the coach’s', r1.calls[0].model === CHAT.model && r1.calls[1].model === CHAT.guardModel && CHAT.model === 'openai/gpt-oss-120b');
    check('H5 the guard reads the change and the person’s draft', /replace: grey\nwith: storm-blue/.test(r1.calls[1].messages[1].content) && r1.calls[1].messages[1].content.includes(DRAFT));

    const r2 = recorded([good, good], ['VIOLATION names a film', 'OK visual only']);
    const o2 = await H.sheetHelp(deps(500, r2.complete), input('make it cooler'));
    check('H5 flagged by the guard: one retry with the reminder, shown if the retry passes', o2.state === 'proposal' && o2.regenerated && r2.calls.length === 4 && r2.calls[2].messages.at(-1)!.content.includes('names a film') && !r2.calls[2].messages.some((m) => m.role === 'assistant' && m.content === good), r2.calls.length);

    const r3 = recorded([good, good], ['VIOLATION x', 'VIOLATION y']);
    const o3 = await H.sheetHelp(deps(500, r3.complete), input('again'));
    check('H5 flagged twice: declined, never shown', o3.state === 'declined' && r3.calls.length === 4, o3);

    const r4 = recorded([good, good], ['maybe', 'hmm', 'unclear', '...']);
    const o4 = await H.sheetHelp(deps(500, r4.complete), input('again'));
    check('H5 a guard with no verdict fails closed (two tries each time, then declined)', o4.state === 'declined' && r4.calls.filter((c) => c.model === CHAT.guardModel).length === 4, r4.calls.length);

    const story = 'PART: grey\nCHANGE: grey as she says goodbye\nWHY: drama';
    const r5 = recorded([story, story], ['OK']);
    const o5 = await H.sheetHelp(deps(500, r5.complete), input('add a moment'));
    check('H5 a story line is caught by the pattern check before the guard is asked (no guard call), retried, then declined', o5.state === 'declined' && r5.calls.every((c) => c.model === CHAT.model) && r5.calls.length === 2 && r5.calls[1].messages.at(-1)!.content.includes('not visual prompt text'), r5.calls.map((c) => c.model));
    proof('a guard that would pass a story line does not get to (the pattern check ran first)', r5.calls.length === 2);

    const slip = 'PART: grey\nCHANGE: grey wool on Bai and his shoulders\nWHY: Bai likes his grey.';
    const r6 = recorded([slip, good], ['OK']);
    const o6 = await H.sheetHelp(deps(500, r6.complete), input('warmer'));
    check('H5 a pronoun the book doesn’t use for Bai is retried with its reason', o6.state === 'proposal' && o6.regenerated && r6.calls[1].messages.at(-1)!.content.includes('the book uses she for Bai'), r6.calls.map((c) => c.messages.at(-1)!.content.slice(0, 80)));

    const r7b = recorded(['Sure! Here is a better prompt', 'still not the format'], []);
    const o7 = await H.sheetHelp(deps(500, r7b.complete), input('better'));
    check('H5 a reply that isn’t one change or one note is never shown (retry, then decline)', o7.state === 'declined' && r7b.calls.length === 2);

    const [{ n: costRows }] = await sql`select count(*)::int as n from studio.sheet_help_costs`;
    const cols = await sql`select column_name from information_schema.columns where table_schema = 'studio' and table_name = 'sheet_help_costs'`;
    check('H5 every call is in the day’s cost totals, with no person', costRows > 0 && !cols.some((c) => ['fid', 'person', 'request_id'].includes(c.column_name as string)));
  }

  // --- H2 (through the flow): whole-prompt requests and rewrites ------------------------------------------------
  {
    await resetDb();
    const whole = `PART: ${DRAFT}\nCHANGE: a whole new Bai\nWHY: fresher`;
    const r1 = recorded([whole, whole], []);
    const o1 = await H.sheetHelp(deps(501, r1.complete), input('rewrite the whole prompt for me'));
    check('H2 a whole-prompt rewrite is never offered (retried with the reason, then declined)', o1.state === 'declined' && r1.calls.length === 2 && /more than one part/.test(r1.calls[1].messages.at(-1)!.content), r1.calls.length);
    const single = 'PART: a tall girl in grey\nCHANGE: a short girl in red\nWHY: x';
    const r1b = recorded([single, single], []);
    const o1b = await H.sheetHelp(deps(501, r1b.complete), input('change everything', 'a tall girl in grey'));
    check('H2 a one-part prompt replaced whole is refused through the flow', o1b.state === 'declined' && /whole prompt/.test(r1b.calls[1].messages.at(-1)!.content));
    const empty = 'PART: NEW\nCHANGE: eighteen with sharp eyes\nWHY: a start';
    const r2 = recorded([empty, empty], []);
    const o2 = await H.sheetHelp(deps(501, r2.complete), input('write Bai for me', ''));
    check('H2 adding to an empty prompt is refused through the flow (the person writes first)', o2.state === 'declined' && /empty/.test(r2.calls[1].messages.at(-1)!.content));
    const note = 'NONE: I change one part of your text at a time. Which part would you like to start with: the coat, or her hair?';
    const r3 = recorded([note], ['OK']);
    const o3 = await H.sheetHelp(deps(501, r3.complete), input('write the whole thing'));
    check('H2 asked for a whole prompt: a note, with no prompt', o3.state === 'note' && /one part/.test(o3.text) && !('after' in o3), o3);
    const line = 'NONE: Try: "You afraid of me, Zei?" as her line.';
    const r4 = recorded([line, line], ['OK']);
    const o4 = await H.sheetHelp(deps(501, r4.complete), input('give her a line'));
    check('H2 a note that writes a line is never shown', o4.state === 'declined');
  }

  // --- H4 the caps ----------------------------------------------------------------------------------------------
  {
    await resetDb();
    const ok = 'PART: grey\nCHANGE: storm-blue\nWHY: blue.';
    const results: string[] = [];
    let modelCalls = 0;
    for (let i = 0; i < SHEET_HELP.perDay + 1; i++) {
      const r = recorded([ok], ['OK']);
      const o = await H.sheetHelp(deps(600, r.complete), input(`message ${i}`));
      modelCalls += r.calls.length;
      results.push(o.state);
    }
    check('H4 20 messages a day per person: the 21st is refused', SHEET_HELP.perDay === 20 && results.slice(0, 20).every((s) => s === 'proposal') && results[20] === 'limit', results.slice(18));
    check('H4 a refused message makes no model call', modelCalls === 40, modelCalls);
    const other = recorded([ok], ['OK']);
    check('H4 another person still has their own 20', (await H.sheetHelp(deps(601, other.complete), input('hi'))).state === 'proposal');
    await sql`update studio.sheet_help_calls set at = at - interval '1 day' where fid = 600`;
    check('H4 yesterday’s messages don’t count today', (await H.sheetHelp(deps(600, recorded([ok], ['OK']).complete), input('next day'))).state === 'proposal');
    // Proof: the same 21 messages under a planted cap of 1000 would all pass, so the check above is what holds them.
    const saved = SHEET_HELP.perDay;
    SHEET_HELP.perDay = 1000;
    const planted = await H.sheetHelp(deps(602, recorded([ok], ['OK']).complete), input('x'));
    for (let i = 0; i < 20; i++) await sql`insert into studio.sheet_help_calls (fid) values (603)`;
    const plantedOver = await H.sheetHelp(deps(603, recorded([ok], ['OK']).complete), input('x'));
    SHEET_HELP.perDay = saved;
    const realOver = await H.sheetHelp(deps(603, recorded([ok], ['OK']).complete), input('x'));
    proof('a planted cap other than 20 lets a 21st message through, and the real cap stops it', planted.state === 'proposal' && plantedOver.state === 'proposal' && realOver.state === 'limit');

    await resetDb();
    check('H4 $1 a day across everyone', SHEET_HELP.dailySpendCapUsd === 1);
    const worst = H.helpWorstUsd();
    check('H4 the worst case of one message is reserved (two answers, four guard calls), about $0.007', worst > 0.005 && worst < 0.01, worst);
    await sql`insert into studio.sheet_help_costs (kind, model, provider, cost_usd) values ('answer', ${CHAT.model}, 'groq', ${(SHEET_HELP.dailySpendCapUsd - worst + 0.0001).toFixed(8)})`;
    const r = recorded([ok], ['OK']);
    const o = await H.sheetHelp(deps(700, r.complete), input('hi'));
    check('H4 refused when the day’s spend plus the worst case would pass $1, before any model call', o.state === 'spend' && r.calls.length === 0, o);
    const [{ n: counted }] = await sql`select count(*)::int as n from studio.sheet_help_calls where fid = 700`;
    check('H4 … and a spend refusal takes none of the person’s messages', counted === 0);
    await sql`update studio.sheet_help_costs set cost_usd = ${(SHEET_HELP.dailySpendCapUsd - worst - 0.0001).toFixed(8)}`;
    check('H4 just under the cap with the worst case, a message goes through', (await H.sheetHelp(deps(700, recorded([ok], ['OK']).complete), input('hi'))).state === 'proposal');
    const [{ usd }] = await sql`select sum(cost_usd)::float8 as usd from studio.sheet_help_costs`;
    check('H4 the cap is never overshot (spend after it stays at or under $1)', (usd as number) <= SHEET_HELP.dailySpendCapUsd, usd);
    proof('a planted spend that already passed $1 is refused', await (async () => {
      await sql`update studio.sheet_help_costs set cost_usd = 2`;
      return (await H.sheetHelp(deps(701, recorded([ok], ['OK']).complete), input('x'))).state === 'spend';
    })());
    check('H4 its caps are its own: its own tables, not the assistant’s or the coach’s', !/chat_calls|chat_costs|coach_calls|coach_costs/.test(read('src/lib/sheet-help/limits.ts').replace(/^\s*\*.*$/gm, '')));
  }

  // --- H6 the label in the recipe -------------------------------------------------------------------------------
  {
    const base = { model: 'z-image-turbo', endpoint: 'fal-ai/z-image/turbo', host: 'fal.ai', settings: {}, references: [], checks: { prompt: { model: 'openai/gpt-oss-safeguard-20b', verdict: 'ok' as const }, host_safety_checker: 'passed' as const }, assist: { model: 'claude-coding-agent', drafted: ['sample subject or view line'] }, seed: 7, request_id: 'req', cost_usd: 0.003, made_at: '2026-11-12T10:00:00Z' };
    const mark = M.helpMark([{ model: CHAT.model }])!;
    const withHelp = RL.howMade({ ...base, help: mark }, 'a'.repeat(64), null, true).map((r) => r.text).join('');
    const without = RL.howMade(base, 'a'.repeat(64), null, true).map((r) => r.text).join('');
    check('H6 the recipe line says the prompt includes words from AI suggestions, naming the model', withHelp.includes('includes words from AI suggestions') && withHelp.includes('gpt-oss-120b') && SHEET_HELP_WORDING.label === 'includes words from AI suggestions');
    check('H6 without help, the recipe line is exactly as before', without === withHelp.replace(`${RL.helpLine({ ...base, help: mark })} `, '') && !without.includes('AI suggestions'));
    check('H6 whole-prompt marking (agent-pictures part 2 has not merged)', mark.marking === 'whole-prompt' && SHEET_HELP.marking === 'whole-prompt' && M.helpMark([]) === null);
    const saved = SHEET_HELP.marking;
    SHEET_HELP.marking = 'per-phrase';
    let threw = false;
    try {
      M.helpMark([{ model: CHAT.model }]);
    } catch {
      threw = true;
    }
    SHEET_HELP.marking = saved;
    proof('per-phrase marking, switched on before it is built, is refused rather than mislabelled', threw);

    // The server's record: a suggestion served to FID 800 for sheet A.
    await resetDb();
    const served = 'PART: grey\nCHANGE: storm-blue wool\nWHY: blue keeps the sea.';
    const msg = 'my secret idea about her coat';
    const sv = await H.sheetHelp(deps(800, recorded([served], ['OK']).complete), input(msg));
    const rows = await sql`select * from studio.sheet_help_served`;
    check('H6 serving a suggestion records one row: the FID, the sheet, a fingerprint and a word count, and the time', sv.state === 'proposal' && rows.length === 1 && Number(rows[0].fid) === 800 && rows[0].version_id === SHEET_A && rows[0].words_sha256 === SV.fingerprint(['storm-blue', 'wool']) && rows[0].words_count === 2 && Object.keys(rows[0]).sort().join() === 'at,fid,version_id,words_count,words_sha256', rows);
    check('H6 … never the words in plain text, the message or the draft', !JSON.stringify(rows).includes('storm-blue') && !JSON.stringify(rows).includes(msg) && !JSON.stringify(rows).includes('grey'));
    const declinedBefore = (await sql`select count(*)::int as n from studio.sheet_help_served`)[0].n;
    await H.sheetHelp(deps(800, recorded(['PART: grey\nCHANGE: grey as she says goodbye\nWHY: x', 'PART: grey\nCHANGE: grey as she says goodbye\nWHY: x']).complete), input('x'));
    await H.sheetHelp(deps(800, recorded(['NONE: Which part first?'], ['OK']).complete), input('x'));
    check('H6 a declined reply or a note records nothing', (await sql`select count(*)::int as n from studio.sheet_help_served`)[0].n === declinedBefore);
    const label = (fid: number, from: string, text: string, mode = 'fork') => SV.helpLabelFor(S, { fid, mode, kind: 'character', from, text });
    const published = DRAFT.replace('grey', 'Storm-Blue   \n WOOL');
    const yes = await label(800, SHEET_A, published);
    check('H6 a published prompt holding a served suggestion is labelled (case and spaces normalised)', yes?.marking === 'whole-prompt' && yes.model === CHAT.model && yes.tool === 'ask-for-help', yes);
    check('H6 one without it is not', (await label(800, SHEET_A, DRAFT)) === null && (await label(800, SHEET_A, DRAFT.replace('grey', 'storm-blue'))) === null);
    check('H6 another person’s suggestion doesn’t label yours', (await label(801, SHEET_A, published)) === null);
    check('H6 a suggestion for another sheet doesn’t label this one', (await label(800, SHEET_B, published)) === null);
    check('H6 a new sheet from nothing or a style is never labelled', (await label(800, SHEET_A, published, 'create')) === null && (await SV.helpLabelFor(S, { fid: 800, mode: 'fork', kind: 'style', from: SHEET_A, text: published })) === null);
    // A browser that drops everything: publishing reads no help field at all; the label comes from the server's record.
    const route = read('src/app/api/designs/route.ts');
    const fromServer = /const help = await helpLabelFor\(sql, \{ fid, mode, kind, from: body\.from, text \}\);/.test(route) && !/body\.help|receipt|acceptedIn/.test(route);
    check('H6 a browser that drops the receipt (sends nothing about help) is still labelled: the route reads only the server’s record', fromServer && (await label(800, SHEET_A, published)) !== null);
    proof('a planted route that reads the label from the browser is caught', !(/const help = await helpLabelFor\(sql, \{ fid, mode, kind, from: body\.from, text \}\);/.test(route.replace('const help = await helpLabelFor(sql, { fid, mode, kind, from: body.from, text });', 'const help = body.help ? helpMark([{ model: CHAT.model }]) : null;'))));
    check('H6 publishing labels the body and every picture’s recipe', /recipe: recipeOf\(p\.t, help\)/.test(route) && /\.\.\.\(help \? \{ help \} : \{\}\),\n\s*\.\.\.\(views\.front/.test(route));
    proof('normalising matters: the raw words’ fingerprint would miss "Storm-Blue WOOL"', SV.fingerprint(['Storm-Blue', 'WOOL']) !== SV.fingerprint(SV.words('Storm-Blue WOOL')) && SV.runs(published, 2).has(SV.fingerprint(['storm-blue', 'wool'])));
    await sql`insert into studio.sheet_help_served (fid, version_id, words_sha256, words_count) values (801, ${SHEET_A}, ${SV.fingerprint(['storm-blue', 'wool'])}, 2)`;
    proof('a planted row for that other person does label theirs (so the FID is what kept it out)', (await label(801, SHEET_A, published)) !== null);
    await sql`update studio.sheet_help_served set at = now() - make_interval(days => ${SHEET_HELP.servedDays}) - interval '1 minute'`;
    check(`H6 an expired suggestion (older than ${SHEET_HELP.servedDays} days) doesn’t label`, SHEET_HELP.servedDays === 2 && (await label(800, SHEET_A, published)) === null);
    const savedDays = SHEET_HELP.servedDays;
    SHEET_HELP.servedDays = 10;
    const plantedWindow = await label(800, SHEET_A, published);
    SHEET_HELP.servedDays = savedDays;
    proof('a planted longer window would label with the expired suggestion (so the window is what kept it out)', plantedWindow !== null);
    await SV.recordServed(S, 802, SHEET_A, 'scuffed boots');
    const left = await sql`select fid from studio.sheet_help_served`;
    check('H6 rows past the window are deleted as new ones come in', left.length === 1 && Number(left[0].fid) === 802, left);
    check('H6 the receipt mechanism is gone', !readdirSync(path.join(ROOT, 'src/lib/sheet-help')).includes('receipt.ts') && !/receipt/i.test(read('src/components/sheet-help.tsx') + read('src/lib/sheet-help/help.ts') + read('src/app/api/sheet-help/route.ts')));
    const page = read('src/app/references/designs/[id]/page.tsx');
    check('H6 the sheet’s page shows the label', /\{body\.help && <p className="dz-meta dz-drafted">\{SHEET_HELP_WORDING\.pageLine\}<\/p>\}/.test(page) && /includes words from AI suggestions/i.test(SHEET_HELP_WORDING.pageLine));
    check('H6 the design page reads the recipe line from recipe-lines.ts', /howMade\(p\.recipe/.test(page) && /helpLine\(r\)/.test(read('src/lib/images/recipe-lines.ts')));
    proof('a recipe with help but no line printed is caught', RL.howMade({ ...base, help: mark }, 'a'.repeat(64), null, true).map((r) => r.text).join('') !== without);
  }

  // --- H9 no floor, and Farcaster only ----------------------------------------------------------------------------
  {
    await resetDb();
    check('H9 Bai first appears in chapter 4 (the case below is a reader before that)', bai.firstChapter === 4, bai.firstChapter);
    const early = input('her coat', DRAFT, 2);
    check('H9 a reader at chapter 2 keeps limit 2: no floor at the character’s first chapter', early.upTo === 2, early.upTo);
    const noFloor = (v: typeof H.validateHelp) => {
      const got = [1, 2, 3].map((n) => v({ message: 'x', draft: DRAFT, upTo: n }, 'bai').upTo);
      return got.every((g, i) => g === i + 1) ? [] : [`limits ${JSON.stringify(got)} for a device at chapters 1–3`];
    };
    check('H9 the limit is the device’s number for every chapter before Bai’s first', noFloor(H.validateHelp).length === 0, noFloor(H.validateHelp));
    const floored: typeof H.validateHelp = (raw, c) => {
      const i = H.validateHelp(raw, c);
      return { ...i, upTo: Math.max(bai.firstChapter, i.upTo) };
    };
    proof('a planted floor at the character’s first chapter is caught', noFloor(floored).length > 0);
    check('H9 a later choice for that one thread is kept as sent', input('her coat', DRAFT, 24).upTo === 24);
    for (const bad of [undefined, null, '5', 0, 33, 2.5, NaN])
      check(`H9 no whole-number limit 1–32 (${String(bad)}): refused, never defaulted`, (() => {
        try {
          H.validateHelp({ message: 'x', draft: DRAFT, upTo: bad }, 'bai');
          return false;
        } catch (e) {
          return e instanceof H.HelpError && e.message === 'No chapter limit.';
        }
      })());
    const r = recorded(['NONE: The book has not shown Bai yet, so start from your own idea.'], ['OK visual only']);
    let asked = 0;
    const within = async (_s: unknown, _q: string, limit: number) => {
      asked = limit;
      const all = [{ id: 'c1-b5', chapter: 1, idx: 5, kind: 'paragraph', content: 'A recorded chapter 1 passage.' }, { id: 'c4-b70', chapter: 4, idx: 70, kind: 'paragraph', content: 'A recorded passage about Bai.' }];
      return { passages: all.filter((x) => x.chapter <= limit), heldBack: all.some((x) => x.chapter > limit) };
    };
    const o = await H.sheetHelp({ ...deps(501, r.complete), retrieve: within }, early);
    const u = r.calls[0]?.messages.at(-1)?.content ?? '';
    check('H9 a reader at chapter 2 sends the model no facts about Bai (all are from chapter 4 on)', o.state === 'note' && !/\[c(4|5|7|9|24)-b/.test(u) && u.includes('(chapters 1–2)') && u.includes('(nothing yet)') && u.includes('[c1-b5]'), { state: o.state, u: u.slice(0, 300) });
    check('H9 … and the book search is asked for chapters 1–2 only', asked === 2 && /Passages from chapters 1–2:/.test(u), asked);

    const before = r.calls.length;
    const w = await H.sheetHelp(deps(-7, r.complete), input('her coat')).then(() => 'answered', (e) => (e instanceof H.HelpError && e.status === 401 ? 'refused' : String(e)));
    const rows = await sql`select count(*)::int as n from studio.sheet_help_calls where fid = -7`.catch(() => [{ n: 0 }]);
    check('H9 a wallet account (a negative number) is refused, with no model call and no row', w === 'refused' && r.calls.length === before && rows[0].n === 0, w);
    const route = read('src/app/api/sheet-help/route.ts');
    check('H9 the route reads a Farcaster sign-in only (getFid), never getPerson or a wallet session, and refuses anything but a positive FID', /const fid = await getFid\(request\);\n\s*if \(fid === null \|\| !Number\.isInteger\(fid\) \|\| fid <= 0\) return/.test(route) && !/getPerson|getWallet/.test(route));
    check('H9 the device sends its furthest chapter opened, with no floor', /upTo: Math\.max\(1, \.\.\.openedChapters\(\)\)/.test(read('src/components/sheet-help.tsx')) && !/firstChapter/.test(read('src/components/sheet-help.tsx')));
  }

  // --- H7 the switch --------------------------------------------------------------------------------------------
  {
    check('H7 SHEET_HELP.on is off in the config', SHEET_HELP.on === false);
    check('H7 not live now', F.sheetHelpLive() === false);
    const said = { ...PRIVACY, sections: PRIVACY.sections.map((x) => (x.n === 5 ? { ...x, body: [...x.body, "On a character sheet, 'Ask for help' sends your message … to Groq"] } : x.n === 6 ? { ...x, body: [...x.body, "… words it suggested to you in 'Ask for help' …"] } : x)) } as typeof PRIVACY;
    const inWindow = new Date(Date.parse(CHALLENGE.dates.opens) + 3600_000);
    const after = new Date(Date.parse(CHALLENGE.dates.closes) + 1);
    SHEET_HELP.on = true;
    const onNoWords = F.sheetHelpLive(inWindow, PRIVACY);
    const onWords = F.sheetHelpLive(inWindow, said);
    const onAfter = F.sheetHelpLive(after, said);
    SHEET_HELP.on = false;
    const offWords = F.sheetHelpLive(inWindow, said);
    check('H7 switched on, it still waits for Privacy §5 and §6', onNoWords === false && F.privacyDescribesSheetHelp(PRIVACY) === false);
    check('H7 on, with the words, inside the window: live; after the window: not', onWords === true && onAfter === false, { onWords, onAfter });
    check('H7 off, with the words: not live', offWords === false);
    SHEET_HELP.on = true;
    const plantedLive = (now: Date, privacy: typeof PRIVACY) => SHEET_HELP.on && O.challengeSheetsOpen(now, privacy);
    proof('a planted live check that ignores the Privacy words would be live without them, unlike the real one', plantedLive(inWindow, PRIVACY) === true && F.sheetHelpLive(inWindow, PRIVACY) === false);
    SHEET_HELP.on = false;
    const route = read('src/app/api/sheet-help/route.ts');
    check('H7 the route answers 404 first while not live', /export async function POST\(request: Request\) \{\n\s*if \(!sheetHelpLive\(\)\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\);/.test(route));
    check('H7 the form shows the chat only while live, on a challenge character', /const help = challengeOpen && sheetHelpLive\(\) \?/.test(read('src/app/references/designs/new/page.tsx')) && /\{p\.help && p\.source && \(\n\s*<SheetHelp/.test(read('src/components/design-form.tsx')));
    const p6r = read('scripts/check-principles.ts');
    check('H7 principle check P6r exists and plants a switch on without the Privacy words', /id: 'P6r'/.test(p6r) && /c\.on = true;/.test(p6r.slice(p6r.indexOf("id: 'P6r'"))));
    check('H7 legal.ts is not changed on this branch (the drafts are in docs/legal/sheet-help-draft.md)', !/Ask for help/.test(read('src/lib/legal.ts')) && /Ask for help/.test(read('docs/legal/sheet-help-draft.md')));
  }
} finally {
  await sql.end();
  await server.stop();
  await db.close();
}

if (failures.length) {
  console.error(`test:sheet-help FAILED: ${failures.length} problem(s), ${passed} passed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`test:sheet-help passed: ${passed} checks (recorded answers only; no model call, nothing spent)`);
process.exit(0);
