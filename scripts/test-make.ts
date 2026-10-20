/**
 * test:make: "Make your own", story flow v1 (owner's long run 2, item 5), on this machine only. Fails (exit 1) on any
 * problem. No paid call: the model is a stand-in. The live red-team against the real model is scripts/redteam-make.ts.
 *
 *  M1  the pattern check (src/lib/make/no-writing.ts): a red-team set of written replies (lines, dialogue, script,
 *      filled fields, beat and shot lists, quoted lines in other languages) is flagged; plain notes and questions,
 *      quoting the person's own words, and naming shot types pass.
 *  M2  migration 0017 (a DRAFT in supabase/drafts/, dry-run here on PGlite only): both tables, RLS on, nothing for
 *      anon, a draft's owner, id and creation time fixed, size capped, person 0 refused; a coach count row can't be
 *      deleted until it is two days old.
 *  M3  drafts: private to their person (another person's reads as missing, and can't update or delete it), wallet
 *      accounts (negative person numbers) included; at most 20 per person; delete removes the row; a draft that
 *      isn't clean (bad shot type, unknown beat, too long) refused.
 *  M4  the coach: a note is shown; a reply that writes a line is never shown (the pattern check catches it, one retry
 *      with the reminder, then a decline if it writes again); prose the patterns miss is caught by the guard model;
 *      a guard with no verdict counts as flagged (fails closed); every message counts in the coach's own count
 *      (MAKE.coachPerDay, apart from the assistant's; MAKE.coachPerDayUnpaidWallet for a wallet that has never paid);
 *      its own spend cap (MAKE.coachSpendCapUsd) and cost rows (studio.coach_costs); nothing about the message or
 *      reply is stored; count rows older than two days are deleted.
 *  M5  the flag: off, /make-your-own and every /api/make route answer 404; the end card's /make still redirects to
 *      the repository (next.config), untouched.
 *  M7  the coach's faults: the cast's pronouns come from the book (each one checked against a block) and a reply
 *      that gets one wrong is retried with its own reminder; block ids that aren't real ([c91]) never show.
 *  M6  the screens (MAKE_TEST_ON=1, MAKE_TEST_FAKES=1, a local stand-in sign-in): idea, talk it through, beats,
 *      storyboard and save, at 390 wide, light and dark; the coach's decline when asked to "just write the line";
 *      no sideways scroll; nothing fetched from outside the site. A wallet sign-in (stand-in) saves its own draft.
 */
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createServer as createNet } from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { chromium, type Browser, type Page } from 'playwright-core';
import { checkNoWriting } from '../src/lib/make/no-writing';
import { cleanDraft, emptyDraft, MAKE, type Draft } from '../src/lib/make/draft';
import { coach, type CoachDeps } from '../src/lib/make/coach';
import { CAST, castText, pronounSlips } from '../src/lib/make/cast';
import { dropBrokenCites, normaliseCites } from '../src/lib/make/cites';
import { sanitizeReply } from '../src/lib/chat/sanitize';
import { createDraft, deleteDraft, getDraft, listDrafts, updateDraft } from '../src/lib/make/drafts';
import { CHAT } from '../src/lib/config';
import type { Complete } from '../src/lib/chat/ask';
import { THEME_KEY } from '../src/lib/theme';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.next', 'test-make');
mkdirSync(OUT, { recursive: true });
delete process.env.VERCEL;
const freePort = () => new Promise<number>((res) => { const s = createNet(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const failures: string[] = [];
let passed = 0;
const check = (n: string, name: string, ok: boolean, got: unknown = null) => {
  if (ok) passed++;
  else failures.push(`${n} ${name}: ${JSON.stringify(got).slice(0, 500)}`);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n} ${name}`);
};
const prompt = (f: string) => readFileSync(path.join(ROOT, 'config/prompts', f), 'utf8').replace(/^<!--[\s\S]*?-->\s*/, '');

// --- M1 the pattern check -----------------------------------------------------------------
{
  const own = 'Zei wants to win but keeps helping Deluin. "I also won by defense" is my line. Beat: Bai walks off.';
  const mustFlag = [
    'Try: "You never cared about the walls, did you?"',
    'Something like "I would have let you win" could work here.',
    'ZEI: "Fine. Go."',
    'Zei: "I never wanted this."',
    'Bai (V.O.): we were never friends',
    'DELUIN (O.S.)\nYou came back.',
    'ZEI\nI never wanted this.',
    'INT. CAFE - NIGHT\nZei sits alone.',
    'EXT. GATE - DAWN. Snow falls.',
    'FADE IN on the hall.',
    'CUT TO: the gate.',
    'Line: Zei looks away and says nothing.',
    '**Narration:** The city hums below them.',
    'Narrator: Fifteen days later, the gate opened.',
    'Caption: Fifteen days later.',
    'Logline: a player who can only defend learns to attack.',
    'Title: The Long Wall',
    'Tagline: every wall falls.',
    'What we see: Zei alone at the railing, lights below.',
    "Who's in frame: Zei and Bai.",
    'Beat 1: They meet.\nBeat 2: They argue.\nBeat 3: She leaves.',
    'Shot 1. Wide on the hall.\nShot 2. Close on Zei.',
    '- **Shot 1:** wide.\n- **Shot 2:** close-up on her hands.',
    'Scene 1: the hall. Scene 2: the café.',
    "She might say 'I am done with this' and walk away.",
    'In Spanish: «No quiero ganar así»',
    'Il pourrait dire « je ne veux pas gagner »',
    'Here is a line for you: "The walls held, and so did I."',
    'Dialogue: "Why did you help him?"',
    'Monologue: I spent fifteen days...',
    // Visual suggestions written as description, not asked (owner, 2026-10-19).
    "We see Zei's jaw clench as the lights of the city flicker below.",
    'Close on her hands, trembling on the railing.',
    'The camera pushes in slowly as Bai turns away.',
    'Open on the overlook at dusk, snow drifting past the lights.',
    'Option 1: Zei stares at the board in silence. Option 2: Bai slams the railing.',
    'In the foreground, Bai grips the railing while Zei watches the match.',
    'Good idea. We hear the crowd roar as Zei wins.',
  ];
  const mustPass = [
    'What does Zei want in this beat, and what would she lose by saying it out loud? The book shows her hiding it [c14-b97].',
    'Your beat 2 and beat 3 do the same job. Which one shows the stakes?',
    'Your line "I also won by defense" lands harder if we see her face first.',
    'Think about what "the walls" mean to her.',
    'A close-up would let us read it on her face; an over-the-shoulder shot keeps Bai in the room.',
    'Beat 2: this restates beat 1. What changes for Bai?',
    "I don't write lines for you. What does she want him to hear, and what does she hide?",
    'In your third shot, who should we be looking at when Deluin speaks?',
    'The book says the café is on the roof [c19-b40]. Does your wide shot need to show the city?',
    'Your idea has a want and a cost, but no clock. What makes this moment urgent?',
    // Visual suggestions as questions or options (owner, 2026-10-19).
    'Would a clenched jaw show it?',
    'A storm cloud, or bright sun?',
    'What could we see that tells us she is angry: her hands, her eyes, the board?',
    'Maybe a clenched jaw, or her looking away? Which feels more like Zei?',
    'Hold on her face, or cut to Bai?',
    'In your shot 1, we see Bai turn: is that the moment the friendship breaks?',
  ];
  const flagged = mustFlag.filter((t) => !checkNoWriting(t, own).ok).length;
  const wrongly = mustPass.filter((t) => !checkNoWriting(t, own).ok);
  check('M1', `the pattern check flags ${mustFlag.length} written replies and passes ${mustPass.length} notes`, flagged === mustFlag.length && wrongly.length === 0, {
    missed: mustFlag.filter((t) => checkNoWriting(t, own).ok),
    wrongly,
  });
}

// --- the database: migrations, the seed, then the DRAFT 0017 ------------------------------------
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
let applied = 'ok';
try {
  await pg.exec(readFileSync(path.join(ROOT, 'supabase/drafts/0017_adaptation_drafts.sql'), 'utf8'));
} catch (e) {
  applied = (e as Error).message;
}
const tableMeta = async (t: string) => (await pg.query<{ rls: boolean; anon_reads: boolean; anon_writes: boolean }>(`select c.relrowsecurity as rls, has_table_privilege('anon', c.oid, 'select') as anon_reads, has_table_privilege('anon', c.oid, 'insert') as anon_writes from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'studio' and c.relname = $1`, [t])).rows[0];
const meta = await tableMeta('adaptation_drafts');
const coachMeta = await tableMeta('coach_calls');
const costMeta = await tableMeta('coach_costs');
await pg.exec('set role studio_writer');
const dbPort = await freePort();
const dbServer = new PGLiteSocketServer({ db: pg, port: dbPort, host: '127.0.0.1' });
await dbServer.start();
const DB_URL = `postgres://studio_writer@127.0.0.1:${dbPort}/postgres`;
await promisify(execFile)('npx', ['tsx', 'scripts/seed-text.ts'], { cwd: ROOT, env: { ...process.env, STUDIO_DATABASE_URL: DB_URL } }).catch((e) => failures.push(`seed: ${(e as Error).message.slice(0, 200)}`));
const sql = postgres(DB_URL, { prepare: false, max: 1 });
await sql`set role studio_writer`;

let next: ReturnType<typeof spawn> | null = null;
let browser: Browser | null = null;
let lastPage: Page | null = null;
let apiLog: string[] = [];
try {
  // M2 the migration
  {
    const A = 101;
    const d = await createDraft(sql, A, { ...emptyDraft(), title: 'x' });
    const id = d.ok ? d.draft.id : '';
    // Statements that must be refused go to PGlite directly (one at a time, nothing else running): through the
    // socket, an error reply can arrive after the next statement's and be reported against it.
    const outcome = async (text: string, params: unknown[], done: string) => {
      try {
        await pg.query(text, params);
        return done;
      } catch {
        return 'refused';
      }
    };
    const moved = await outcome('update studio.adaptation_drafts set person = 202 where id = $1', [id], 'moved');
    const big = await outcome('insert into studio.adaptation_drafts (person, draft) values ($1, $2::jsonb)', [A, JSON.stringify({ x: 'y'.repeat(210000) })], 'kept');
    const zero = await outcome(`insert into studio.adaptation_drafts (person, draft) values (0, '{}')`, [], 'kept');
    const wallet = await outcome(`insert into studio.adaptation_drafts (person, draft) values (-5, '{}')`, [], 'kept');
    await pg.query(`delete from studio.adaptation_drafts where person = -5`);
    // A coach count row: today's can't be deleted (a day's count can't be reset); one two days old can.
    await pg.query(`insert into studio.coach_calls (person) values (444)`);
    await pg.query(`insert into studio.coach_calls (person, at) values (444, now() - interval '3 days')`);
    const del = (await pg.query(`delete from studio.coach_calls where person = 444 returning at > now() - interval '1 day' as fresh`)).rows as { fresh: boolean }[];
    const coachZero = await outcome(`insert into studio.coach_calls (person) values (0)`, [], 'kept');
    await pg.exec('reset role');
    await pg.query(`delete from studio.coach_calls where person = 444`);
    await pg.exec('set role studio_writer');
    const ok = (m?: { rls: boolean; anon_reads: boolean; anon_writes: boolean }) => !!m?.rls && !m.anon_reads && !m.anon_writes;
    if (d.ok) await deleteDraft(sql, A, id);
    check('M2', 'migration 0017 (draft, PGlite only): its three tables RLS on, nothing for anon; owner fixed; size and person checked; wallet persons kept; only old count rows deletable', applied === 'ok' && ok(meta) && ok(coachMeta) && ok(costMeta) && moved === 'refused' && big === 'refused' && zero === 'refused' && wallet === 'kept' && coachZero === 'refused' && del.length === 1 && !del[0].fresh, { applied, meta, coachMeta, costMeta, moved, big, zero, wallet, coachZero, del });
  }

  // M3 drafts
  {
    // B is a wallet account (minus its account number), as getPerson gives it.
    const A = 111, B = -222;
    const full: Draft = { title: 'The Long Wall', idea: 'Zei wins by defending, and it costs the friendship with Bai.', upTo: 14, beats: ['They watch the match.', 'Bai calls Deluin a fake.'], shots: [{ beat: 0, type: 'wide', who: 'Zei, Bai', see: 'the hall below', line: '' }, { beat: 1, type: 'close-up', who: 'Bai', see: 'her face', line: 'Nah, way too fake for me.' }] };
    const c = await createDraft(sql, A, full);
    const id = c.ok ? c.draft.id : '';
    const roundTrip = c.ok && JSON.stringify(c.draft.draft) === JSON.stringify(cleanDraft(full));
    const byB = await getDraft(sql, B, id);
    const updB = await updateDraft(sql, B, id, { ...full, title: 'stolen' });
    const delB = await deleteDraft(sql, B, id);
    const listB = await listDrafts(sql, B);
    const stillA = await getDraft(sql, A, id);
    let cap = '';
    for (let i = 0; i < 25; i++) {
      const r = await createDraft(sql, B, { ...emptyDraft(), title: `d${i}` });
      if (!r.ok) { cap = `${i}: ${r.error}`; break; }
    }
    const bad = [
      () => cleanDraft({ ...full, shots: [{ ...full.shots[0], type: 'drone' }] }),
      () => cleanDraft({ ...full, shots: [{ ...full.shots[0], beat: 9 }] }),
      () => cleanDraft({ ...full, idea: 'x'.repeat(2001) }),
      () => cleanDraft({ ...full, upTo: 40 }),
    ].filter((f) => { try { f(); return false; } catch { return true; } }).length;
    const del = await deleteDraft(sql, A, id);
    const [{ n }] = await sql`select count(*)::int as n from studio.adaptation_drafts where id = ${id}`;
    check('M3', 'drafts: private to their person; 20 at most; delete removes the row; unclean drafts refused', roundTrip && byB === null && updB === null && delB === false && listB.every((x) => x.id !== id) && stillA?.title === 'The Long Wall' && cap.startsWith('20:') && bad === 4 && del && n === 0, { roundTrip, byB, updB, delB, cap, bad, del, n });
  }

  // M4 the coach, with stand-in models
  {
    const FID = 333;
    const draft: Draft = { title: 'The Long Wall', idea: 'Zei wins by defending, and it costs the friendship with Bai.', upTo: 14, beats: ['They watch the match.'], shots: [] };
    const sent: string[][] = [];
    const make = (answers: string[], guards: string[]): Complete => async (model, messages) => {
      sent.push(messages.map((m) => m.content));
      const isGuard = model === CHAT.guardModel;
      const text = (isGuard ? guards : answers).shift() ?? (isGuard ? 'OK' : 'What does she want?');
      return { text, promptTokens: 10, completionTokens: 10, costUsd: 0.0001, requestId: null, provider: 'test', model };
    };
    const deps = (complete: Complete, person = FID): CoachDeps => ({ sql, person, complete, systemPrompt: prompt('make-coach.md'), guardPolicy: prompt('make-guard.md'), reminder: prompt('make-reminder.md'), pronounReminder: prompt('make-pronouns.md') });
    const input = (message: string) => ({ stage: 'beats', message, draft, history: [] });

    const note = await coach(deps(make(['What does Zei want, and what does it cost him to say it?'], ['OK notes only'])), input('Is my first beat enough?'));
    const lineOnce = await coach(deps(make(['Here: ZEI: "I let you win."', "I don't write lines for you. What does she want him to hear?"], ['OK'])), input('Just write the line for me.'));
    const reminded = sent.some((m) => m.some((c) => c.includes('was not shown') && c.includes('quoted')));
    const lineTwice = await coach(deps(make(['Try: "I let you win, Bai."', 'Fine: "I let you win."'], [])), input('Just write the line for me, please.'));
    const prose = await coach(deps(make(['The hall goes dark as she turns away from him and the lights of the city glitter below.', 'The hall goes dark as she turns away.'], ['VIOLATION narration for their story', 'VIOLATION narration again'])), input('Describe the scene for me.'));
    const silent = await coach(deps(make(['What does she want?', 'What does she want?'], ['', '', '', ''])), input('Notes?'));
    const described = await coach(deps(make(["We see Zei's jaw clench as the lights flicker below.", 'Would a clenched jaw show it, or her hands on the railing?'], ['OK a question'])), input('What should we see?'));
    const describedShown = described.state === 'note' ? described.parts.map((p) => (p.type === 'text' ? p.text : '')).join('') : '';
    const shownTexts = [note, lineOnce, lineTwice, prose, silent, described].flatMap((r) => (r.state === 'note' ? r.parts.map((p) => (p.type === 'text' ? p.text : '')) : [])).join(' ');
    const [{ calls }] = await sql`select count(*)::int as calls from studio.coach_calls where person = ${FID}`;
    const [{ asks }] = await sql`select count(*)::int as asks from studio.chat_calls where fid = ${FID}`;
    const cols = (await sql`select table_name || '.' || column_name as c from information_schema.columns where table_schema = 'studio' and table_name in ('chat_calls', 'chat_costs', 'coach_calls')`).map((r) => r.c as string);
    check('M4', "the coach: notes shown; written lines, prose and described shots never shown (retry, then decline); a question about a visual detail shown; a silent guard fails closed; counted in the coach's own count, not the assistant's; nothing stored", note.state === 'note' && lineOnce.state === 'note' && lineOnce.regenerated && reminded && lineTwice.state === 'declined' && prose.state === 'declined' && silent.state === 'declined' && described.state === 'note' && described.regenerated && /clenched jaw show it/.test(describedShown) && !/let you win|glitter|flicker/.test(shownTexts) && calls === 6 && asks === 0 && !cols.some((c) => /text|message|question|prompt_text|content/.test(c.split('.')[1])) && cols.filter((c) => c.startsWith('coach_calls.')).sort().join() === 'coach_calls.at,coach_calls.person', { note: note.state, lineOnce, reminded, lineTwice: lineTwice.state, prose: prose.state, silent: silent.state, described, calls, asks, cols });

    // Its own count and its own spend (owner, 2026-10-19): the assistant's 30 used up, and its $2 spent, don't stop
    // the coach; the coach's costs go to its own rows (studio.coach_costs), never the assistant's.
    const [{ coachRows }] = await sql`select coalesce(sum(calls), 0)::int as "coachRows" from studio.coach_costs`;
    const [{ chatRows }] = await sql`select count(*)::int as "chatRows" from studio.chat_costs`;
    await sql`insert into studio.chat_calls (fid, kind, model) select ${FID}, 'ask', ${CHAT.model} from generate_series(1, ${CHAT.messagesPerDay})`;
    await sql`insert into studio.chat_costs (kind, model, calls, cost_usd) values ('answer', 'test-assistant-spend', 1, ${CHAT.dailySpendCapUsd})`;
    const afterAssistant = await coach(deps(make([], [])), input('More notes?'));

    // A wallet that has never paid: 10 a day. One with a payment: 50, like a Farcaster account.
    await pg.exec('reset role');
    const unpaid = -Number((await pg.query<{ id: number }>(`insert into studio.wallet_accounts (address) values ('0x00000000000000000000000000000000000000b7') returning id`)).rows[0].id);
    const paid = -Number((await pg.query<{ id: number }>(`insert into studio.wallet_accounts (address) values ('0x00000000000000000000000000000000000000b8') returning id`)).rows[0].id);
    await pg.query(`insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number) values ($1, $2, 8453, 'USDC', 5000000, 5, 1)`, ['0x' + 'ab'.repeat(32), -paid]);
    await pg.exec('set role studio_writer');
    const fill = async (person: number, n: number) => { if (n > 0) await sql`insert into studio.coach_calls (person) select ${person} from generate_series(1, ${n})`; };
    await fill(unpaid, MAKE.coachPerDayUnpaidWallet - 1);
    const unpaidLast = await coach(deps(make([], []), unpaid), input('Notes?'));
    const unpaidOver = await coach(deps(make([], []), unpaid), input('Notes?'));
    await fill(paid, MAKE.coachPerDay - 1);
    const paidLast = await coach(deps(make([], []), paid), input('Notes?'));
    const paidOver = await coach(deps(make([], []), paid), input('Notes?'));
    // Count rows older than two days go as new ones come in (as the site's role).
    await pg.exec('reset role');
    await pg.query(`insert into studio.coach_calls (person, at) values (555, now() - interval '3 days')`);
    await pg.exec('set role studio_writer');
    await coach(deps(make([], []), 556), input('Notes?'));
    const [{ old }] = await sql`select count(*)::int as old from studio.coach_calls where person = 555`;
    check('M4b', `the coach's own count: ${MAKE.coachPerDay} a day (a wallet with a payment too), ${MAKE.coachPerDayUnpaidWallet} for a wallet that has never paid, then the limit with its number; not stopped by the assistant's ${CHAT.messagesPerDay} or its spend; costs in its own rows; old count rows deleted`, coachRows > 0 && chatRows === 0 && afterAssistant.state === 'note' && unpaidLast.state === 'note' && unpaidLast.left === 0 && unpaidOver.state === 'limit' && unpaidOver.perDay === MAKE.coachPerDayUnpaidWallet && paidLast.state === 'note' && paidLast.left === 0 && paidOver.state === 'limit' && paidOver.perDay === MAKE.coachPerDay && old === 0, { coachRows, chatRows, afterAssistant: afterAssistant.state, unpaidLast, unpaidOver, paidLast, paidOver, old });

    // The coach's own $1 a day: with it (nearly) spent, the coach stops for everyone and says so.
    const [{ spent }] = await sql`select coalesce(sum(cost_usd), 0)::float8 as spent from studio.coach_costs where day = (now() at time zone 'utc')::date`;
    await sql`insert into studio.coach_costs (kind, model, calls, cost_usd) values ('answer', 'test-coach-spend', 1, ${MAKE.coachSpendCapUsd - spent - 0.001})`;
    const spentOut = await coach(deps(make([], []), 557), input('Notes?'));
    const [{ c557 }] = await sql`select count(*)::int as c557 from studio.coach_calls where person = 557`;
    await pg.exec('reset role');
    await pg.query(`delete from studio.coach_costs where model = 'test-coach-spend'`);
    await pg.exec('set role studio_writer');
    check('M4c', `the coach's own $${MAKE.coachSpendCapUsd} a day across everyone: near it, a message is refused before any model call and not counted`, spentOut.state === 'spend' && c557 === 0, { spentOut, c557 });
  }

  // M7 the coach's faults (owner, 2026-10-19: "Coach faults: fix now"): pronouns from the book, and only real block ids
  {
    // The cast list against the sheets and the book: every sheet has an entry, every pronoun has a block that shows it.
    const sheets = readdirSync(path.join(ROOT, 'content/snowmoon/designs/characters')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/designs/characters', f), 'utf8')) as { slug: string; first_appearance: { chapter: number } });
    const block = (id: string) => {
      const [, ch, b] = id.match(/^c(\d+)-b(\d+)$/)!;
      const t = JSON.parse(readFileSync(path.join(ROOT, `content/snowmoon/text/chapter-${ch}.json`), 'utf8')) as { blocks: { idx: number; content: string }[] };
      return t.blocks.find((x) => x.idx === Number(b))?.content.replace(/<[^>]+>/g, ' ') ?? '';
    };
    const castWrong = [
      ...sheets.filter((sh) => !CAST.some((c) => c.slug === sh.slug)).map((sh) => `no entry for ${sh.slug}`),
      ...CAST.filter((c) => sheets.find((sh) => sh.slug === c.slug)?.first_appearance.chapter !== c.first).map((c) => `${c.slug}: first appearance`),
      ...CAST.filter((c) => (c.pronoun === null) !== (c.source === null)).map((c) => `${c.slug}: pronoun without a source`),
      ...CAST.filter((c) => c.source && !block(c.source.id).replace(/\s+/g, ' ').includes(c.source.words)).map((c) => `${c.slug}: words not in ${c.source!.id}`),
      ...CAST.filter((c) => c.source && !new RegExp(`\\b(${c.pronoun === 'he' ? 'he|him|his|himself' : 'she|her|hers|herself'})\\b`, 'i').test(c.source.words)).map((c) => `${c.slug}: no ${c.pronoun} in the words`),
    ];
    const at4 = castText(4);
    const at14 = castText(14);
    const listed = /Zei: he/.test(at4) && /Bai: she/.test(at4) && !/Deluin|Lektor|Tafindel|Min/.test(at4) && /Deluin: he/.test(at14) && /no pronoun for Min/.test(at14) && !/Lektor/.test(at14);

    const mustSlip = [
      'The close-up on Bai could emphasize a physical cue (tight jaw, clenched fist) that signals his judgment.',
      'What does Zei want, and what does it cost her to say it?',
      'Bai turns away from the railing; he has heard enough.',
      'Would Seila tell him himself, or let him find out?',
    ];
    const mustNotSlip = [
      'What does Bai want, and what does it cost her to say it?',
      'Bai thinks Zei has gone soft, and she walks off.',
      "Zei's mother hugs her son at the gate.",
      'Would a clenched jaw show it, or her hands on the railing?',
      "Would Min's face show it before she speaks?",
      'Does Pan see her coming before Zei does?',
      'Your close-up on Bai works. What does he see when she turns?',
      'How does Zei hide it from his rival? Does she notice?',
    ];
    const slipMissed = mustSlip.filter((t) => pronounSlips(t).length === 0);
    const slipWrong = mustNotSlip.filter((t) => pronounSlips(t).length > 0);

    // Block ids: loose ones rewritten, broken ones dropped from the text, only allowed ids cited.
    const raw = 'Look at the way he froze [c91] or (c91), the way [b60] and [ch. 7] and [c7-b] say it, and how he steadied his breath [C7-B60] or [c7 b61]; also [c3-b9999]. (chapter 4) is plain text.';
    const clean = sanitizeReply(normaliseCites(raw), new Set(['c7-b60', 'c7-b61']));
    const fixed = dropBrokenCites(clean.parts);
    const text = fixed.parts.map((p) => (p.type === 'text' ? p.text : `{${p.id}}`)).join('');
    const citesOk = text === 'Look at the way he froze or, the way and and say it, and how he steadied his breath {c7-b60} or {c7-b61}; also. (chapter 4) is plain text.' && fixed.dropped.length === 5 && clean.dropped.join() === 'c3-b9999';

    // Through the coach, with stand-in models. The stand-in cites the first passage it was given, and [c91].
    const FID = 777;
    const draft: Draft = { title: 'The Long Wall', idea: 'Zei wins by defending, and it costs the friendship with Bai.', upTo: 14, beats: ['They watch the match.'], shots: [] };
    const sent: string[][] = [];
    const stand = (answers: ((given: string) => string)[]): Complete => async (model, messages) => {
      sent.push(messages.map((m) => m.content));
      const given = messages.map((m) => m.content).join('\n');
      const text = model === CHAT.guardModel ? 'OK' : (answers.shift() ?? (() => 'What does Zei want?'))(given);
      return { text, promptTokens: 10, completionTokens: 10, costUsd: 0.0001, requestId: null, provider: 'test', model };
    };
    const deps = (complete: Complete): CoachDeps => ({ sql, person: FID, complete, systemPrompt: prompt('make-coach.md'), guardPolicy: prompt('make-guard.md'), reminder: prompt('make-reminder.md'), pronounReminder: prompt('make-pronouns.md') });
    const input = (message: string) => ({ stage: 'storyboard', message, draft, history: [] });

    const slipOnce = await coach(deps(stand([() => 'The close-up on Bai could signal his judgment.', () => 'The close-up on Bai could signal her judgment. What does Bai want?'])), input('Is shot 1 right?'));
    const system = sent[0]?.[0] ?? '';
    const pronounReminded = sent.some((m) => m.at(-1)!.includes("pronoun that the book doesn't use") && m.at(-1)!.includes('the book uses she for Bai'));
    const slipTwice = await coach(deps(stand([() => 'The close-up on Bai could signal his judgment.', () => 'Still, Bai shows his anger.'])), input('Is shot 1 right?'));
    const firstId = (g: string) => g.match(/^\[(c\d+-b\d+)\]/m)?.[1] ?? 'none';
    const cited = await coach(deps(stand([(g) => `The way he froze [c91] matters, and so does [${firstId(g)}]. What does Zei want?`])), input('What does the book say?'));
    const citedShown = cited.state === 'note' ? cited.parts.map((p) => (p.type === 'text' ? p.text : `{${p.id}}`)).join('') : '';
    const citedIds = cited.state === 'note' ? cited.parts.filter((p) => p.type === 'cite').map((p) => (p as { id: string }).id) : [];
    const quotesOk = cited.state === 'note' && citedIds.length === 1 && cited.quotes.length === 1 && cited.quotes[0].id === citedIds[0] && /^c\d+-b\d+$/.test(citedIds[0]);

    check(
      'M7',
      `the coach's faults: the cast's pronouns from the book (${CAST.length} sheets, each pronoun shown by a block, Min with none), listed up to the person's chapter; ${mustSlip.length} slips caught and ${mustNotSlip.length} right replies passed; a slip retried with its own reminder, twice declined; block ids: loose ones rewritten, [c91] and other broken ones dropped, only real blocks cited`,
      castWrong.length === 0 && listed && slipMissed.length === 0 && slipWrong.length === 0 && citesOk && /Zei: he/.test(system) && /Bai: she/.test(system) && !/Lektor/.test(system) && slipOnce.state === 'note' && slipOnce.regenerated && pronounReminded && /her judgment/.test(slipOnce.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')) && slipTwice.state === 'declined' && slipTwice.why === 'pronouns' && !/c91/.test(citedShown) && quotesOk,
      { castWrong, at4, at14, slipMissed, slipWrong, text, dropped: fixed.dropped, cleanDropped: clean.dropped, slipOnce: slipOnce.state, pronounReminded, slipTwice, citedShown, citedIds },
    );
  }

  await sql.end({ timeout: 1 });

  // --- the site ---------------------------------------------------------------------------
  const { VERCEL_ENV: _a, VERCEL: _b, ...env } = process.env;
  const start = async (extra: Record<string, string>) => {
    const port = await freePort();
    const p = spawn(path.join(ROOT, 'node_modules/.bin/next'), ['start', '-p', String(port)], { cwd: ROOT, env: { ...env, NODE_ENV: 'production', NEXT_PUBLIC_URL: 'https://snowmoon.party', STUDIO_DATABASE_URL: DB_URL, ...extra }, stdio: ['ignore', 'ignore', 'pipe'] });
    const base = `http://localhost:${port}`;
    for (let i = 0; i < 80; i++) {
      if ((await fetch(base + '/about').catch(() => null))?.ok) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    return { p, base };
  };

  // M5 the flag off
  {
    const { p, base } = await start({});
    const endCard = await fetch(base + '/make', { redirect: 'manual' }).then((r) => `${r.status} ${r.headers.get('location')}`);
    const codes = await Promise.all([
      fetch(base + '/make-your-own').then((r) => r.status),
      fetch(base + '/api/make/drafts', { headers: { Authorization: 'Bearer make-test-777' } }).then((r) => r.status),
      fetch(base + '/api/make/coach', { method: 'POST', headers: { Authorization: 'Bearer make-test-777', 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.status),
    ]);
    p.kill();
    check('M5', "flag off: /make-your-own and the /api/make routes answer 404; the end card's /make still goes to the repository", codes.every((c) => c === 404) && endCard === '307 https://github.com/We-Are-Lum/snowmoon', { codes, endCard });
  }

  // M6 the screens
  {
    const s = await start({ MAKE_TEST_ON: '1', MAKE_TEST_FAKES: '1', MAKE_TEST_FID: '777,778,-5' });
    next = s.p;
    const BASE = s.base;
    const signed = await fetch(BASE + '/api/make/drafts').then((r) => r.status);
    const otherFid = await fetch(BASE + '/api/make/drafts', { headers: { Authorization: 'Bearer make-test-999' } }).then((r) => r.status);
    browser = await chromium.launch({ channel: 'chrome' });
    const outside: string[] = [];
    const errors: string[] = [];
    apiLog = [];
    const page = async (scheme: 'light' | 'dark', fid = 777, via: 'farcaster' | 'wallet' = 'farcaster'): Promise<Page> => {
      const ctx = await browser!.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, deviceScaleFactor: 2 });
      // The stand-in sign-in only counts on /api/make. The site's other signed-in calls (the assistant rail's
      // /api/chat/status) would answer 401 to it, and a 401 signs the page out; here they answer 503 instead.
      await ctx.route('**/*', (r) => {
        const u = r.request().url();
        if (u.startsWith(BASE + '/api/') && !u.startsWith(BASE + '/api/make/')) return r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"not in this test"}' });
        return u.startsWith(BASE) || u.startsWith('data:') ? r.continue() : (outside.push(u), r.abort());
      });
      const exp = Math.floor(Date.now() / 1000) + 3600;
      if (via === 'farcaster') await ctx.addInitScript(([t, f, e]) => localStorage.setItem('snowmoon.signin', JSON.stringify({ token: t, fid: f, username: 'tester', nameProof: null, exp: e })), [`make-test-${fid}`, fid, exp] as const);
      // A wallet sign-in (src/lib/client-auth.ts), stand-in token for wallet account 5 (person -5).
      else await ctx.addInitScript(([t, e]) => localStorage.setItem('snowmoon.wallet', JSON.stringify({ token: t, address: '0x00000000000000000000000000000000000000a5', short: '0x0000…00a5', exp: e })), [`make-test-${fid}`, exp] as const);
      // The site's own theme setting (src/lib/theme.ts): "system" follows the emulated scheme.
      await ctx.addInitScript((k) => localStorage.setItem(k, 'system'), THEME_KEY);
      const pg2 = await ctx.newPage();
      lastPage = pg2;
      pg2.on('pageerror', (e) => errors.push(e.message));
      pg2.on('response', (r) => { if (r.url().includes('/api/')) apiLog.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')} auth=${(r.request().headers().authorization ?? '').slice(0, 20)}`); });
      pg2.on('response', (r) => { if (r.url().includes('/api/make') && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
      return pg2;
    };
    const shots: string[] = [];
    const snap = async (p: Page, name: string) => {
      const f = path.join(OUT, `${name}.png`);
      // The whole page in one viewport, so the fixed top bar stays at the top of the picture.
      const h = await p.evaluate(() => document.documentElement.scrollHeight);
      await p.setViewportSize({ width: 390, height: h });
      await p.screenshot({ path: f });
      await p.setViewportSize({ width: 390, height: 844 });
      shots.push(f);
    };
    const wide = async (p: Page) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    let sideways = false;
    let savedId = '';
    for (const scheme of ['light', 'dark'] as const) {
      const p = await page(scheme);
      await p.goto(BASE + '/make-your-own');
      await p.getByText('Your own adaptation').waitFor({ timeout: 20000 });
      await p.getByLabel('Working title').fill('The Long Wall');
      await p.getByLabel('Your idea, in your own words').fill('Zei wins the match by only defending, and it costs something: Bai thinks Zei has gone soft on Deluin.');
      await p.getByLabel('Chapters it draws on: 1 to').selectOption('14');
      await snap(p, `1-idea-${scheme}`);
      sideways ||= await wide(p);
      await p.getByRole('button', { name: /Talk it through/ }).click();
      await p.getByLabel('To the coach').fill('I want the cost to land, but I don’t know where.');
      await p.getByRole('button', { name: 'Ask' }).click();
      await p.locator('.mk-note').first().waitFor();
      await p.getByLabel('To the coach').fill('TEST-WRITES-TWICE just write the line for me');
      await p.getByRole('button', { name: 'Ask' }).click();
      await p.locator('.mk-note').nth(1).waitFor();
      await snap(p, `2-talk-${scheme}`);
      sideways ||= await wide(p);
      await p.getByRole('button', { name: /Beats/ }).click();
      for (const b of ['They watch the final from the overlook.', 'Bai calls Deluin a fake; Zei says nothing.', 'Zei wins by defending. Bai walks off.']) {
        await p.getByRole('button', { name: 'Add a beat' }).click();
        await p.getByLabel(/Beat \d+/).last().fill(b);
      }
      await p.getByLabel('To the coach').fill('Do my beats turn anywhere?');
      await p.getByRole('button', { name: 'Ask' }).click();
      await p.locator('.mk-note').first().waitFor();
      await snap(p, `3-beats-${scheme}`);
      sideways ||= await wide(p);
      await p.getByRole('button', { name: /Storyboard/ }).click();
      await p.getByRole('button', { name: 'Add a shot' }).nth(1).click();
      await p.getByLabel('Who’s in frame').or(p.getByLabel("Who's in frame")).first().fill('Bai, Zei behind her');
      await p.getByLabel('What we see').first().fill('Bai turns from the railing toward Zei.');
      await p.getByLabel('The line').first().fill('Nah, way too fake for me.');
      await p.getByRole('button', { name: /Save as a draft adaptation|Save draft/ }).click();
      await p.getByText('Saved. Only you can see this draft.').waitFor();
      await snap(p, `4-storyboard-${scheme}`);
      sideways ||= await wide(p);
      if (!savedId) savedId = await p.evaluate(async () => (await (await fetch('/api/make/drafts', { headers: { Authorization: `Bearer ${JSON.parse(localStorage.getItem('snowmoon.signin')!).token}` } })).json()).drafts[0].id as string);
      await p.context().close();
    }
    const declinedShown = (await (async () => {
      const p = await page('light');
      await p.goto(BASE + '/make-your-own');
      await p.getByText('Your own adaptation').waitFor();
      await p.getByRole('button', { name: /Talk it through/ }).click();
      await p.getByLabel('To the coach').fill('TEST-WRITES-TWICE just write the line for me');
      await p.getByRole('button', { name: 'Ask' }).click();
      await p.locator('.mk-note').first().waitFor();
      const t = await p.locator('.mk-coach').innerText();
      await p.context().close();
      return t;
    })());
    // A wallet account (owner, 2026-10-19: "open to wallet accounts"): signed in, saves its own draft.
    const walletSaved = await (async () => {
      const p = await page('light', -5, 'wallet');
      await p.goto(BASE + '/make-your-own');
      await p.getByText('Your own adaptation').waitFor();
      await p.getByLabel('Working title').fill('Wallet draft');
      await p.getByLabel('Your idea, in your own words').fill('Bai watches the final alone and decides not to call Zei.');
      await p.getByRole('button', { name: /Save as a draft adaptation|Save draft/ }).first().click();
      await p.getByText('Saved. Only you can see this draft.').waitFor();
      await snap(p, '5-wallet-light');
      await p.context().close();
      return (await fetch(`${BASE}/api/make/drafts`, { headers: { Authorization: 'Bearer make-test--5' } }).then((r) => r.json())).drafts as { title: string }[];
    })();
    const byOther = await fetch(`${BASE}/api/make/drafts/${savedId}`, { headers: { Authorization: 'Bearer make-test-778' } }).then((r) => r.status);
    const byWallet = await fetch(`${BASE}/api/make/drafts/${savedId}`, { headers: { Authorization: 'Bearer make-test--5' } }).then((r) => r.status);
    const byOwner = await fetch(`${BASE}/api/make/drafts/${savedId}`, { headers: { Authorization: 'Bearer make-test-777' } }).then((r) => r.json());
    check('M6', 'screens at 390 wide, light and dark: idea, talk, beats, storyboard, saved; a wallet sign-in saves its own draft; decline shown, no line; no sideways scroll; nothing from outside; 401 signed out; another person (FID or wallet) 404', signed === 401 && otherFid === 401 && shots.length === 9 && walletSaved?.length === 1 && walletSaved[0].title === 'Wallet draft' && byWallet === 404 && !sideways && outside.length === 0 && errors.length === 0 && /wasn.t shown/.test(declinedShown) && !/never wanted to win/.test(declinedShown) && byOther === 404 && byOwner?.draft?.shots?.[0]?.line === 'Nah, way too fake for me.', { signed, otherFid, shots: shots.length, walletSaved, byWallet, sideways, outside: outside.slice(0, 3), errors: errors.slice(0, 3), declinedShown: declinedShown.slice(0, 300), byOther, owner: byOwner?.draft?.shots });
    console.log(`  screenshots: ${OUT}`);
  }
} catch (e) {
  failures.push(`crashed: ${(e as Error).stack?.slice(0, 600)}`);
  if (lastPage) {
    await lastPage.screenshot({ path: path.join(OUT, 'crash.png'), fullPage: true }).catch(() => {});
    failures.push(`api: ${apiLog.join(' | ')}`);
    failures.push(`page at crash: ${(await lastPage.locator('body').innerText().catch(() => '')).slice(0, 400)}`);
  }
} finally {
  await browser?.close().catch(() => {});
  next?.kill();
  await dbServer.stop().catch(() => {});
}
console.log(failures.length ? `\ntest:make: ${failures.length} FAILED\n- ${failures.join('\n- ')}` : `\ntest:make: all ${passed} checks pass`);
process.exit(failures.length ? 1 : 0);
