/**
 * The reading assistant, slice 1 (docs/proposals/chat.md). Fails (exit 1) on any problem.
 *
 *   npm run test:chat
 *
 * Runs migrations 0001–0007 in an in-memory Postgres (PGlite), seeds all 4,322
 * blocks with the real seed script, and talks to it as studio_writer, the app's
 * role. The model is a stand-in that returns whatever each case needs, so no
 * paid call is made. Checks:
 * - The spoiler limit: retrieval never returns a block past the thread's chapter
 *   limit; an attached block past it is refused before a message is spent; a
 *   question only later chapters answer is held back; citations past the limit
 *   are dropped.
 * - Citations that don't exist: dropped and never rendered; every quote shown
 *   is the stored text of a real block, never the model's words.
 * - The daily limit (30) and the spend cap.
 * - chat_calls is append-only for studio_writer and holds no message text.
 * - No cost record can be joined to a person (migration 0007): chat_costs has
 *   no FID, request id, time of day or row per call; chat_calls holds only
 *   questions, with no row number; a cost row written the old way is moved to
 *   the totals.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { ask, AskError, type Complete } from '../src/lib/chat/ask';
import { retrieve } from '../src/lib/chat/retrieve';
import { sanitizeReply } from '../src/lib/chat/sanitize';
import { CHAT } from '../src/lib/config';
import { providerOptions, servedBy, servingAllowed } from '../src/lib/chat/provider';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));

// --- Database: the six migrations, then the real seed, as studio_writer ------
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of ['0001_core.sql', '0002_v5.sql', '0003_likes.sql', '0004_private_ratings_and_likes.sql', '0005_public_prompts_and_consent.sql', '0006_chat.sql', '0007_chat_costs_without_person.sql']) {
  try {
    await pg.exec(await readFile(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
  } catch (e) {
    console.error(`${f} failed to apply: ${(e as Error).message}`);
    process.exit(1);
  }
}
await pg.exec(`insert into studio.works values ('snowmoon', 'Snowmoon', 'GPL-3.0', 'x')`);
await pg.exec(`set role studio_writer`);
const PORT = 54331;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
const URL = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;
await promisify(execFile)('npx', ['tsx', 'scripts/seed-text.ts'], { cwd: ROOT, env: { ...process.env, STUDIO_DATABASE_URL: URL } });
const sql = postgres(URL, { prepare: false, max: 1 });

try {
  // The seed's own connection can reset PGlite's single session; take the app's role again and prove it.
  await sql`set role studio_writer`;
  const [{ u }] = await sql`select current_user as u`;
  check('the tests run as studio_writer', u === 'studio_writer', String(u));

  const [{ n }] = await sql`select count(*)::int as n from studio.text_blocks`;
  check('seed loaded every block', n === 4322, String(n));

  // --- The spoiler limit, at retrieval ---------------------------------------
  for (const limit of [1, 3, 12, 15]) {
    for (const q of ['What happens to Deluin after Redshire is invaded?', 'Who is Delwart really working for?', 'Why is Gladias asked to rate a building?', 'Minpentai walls gliders symbol']) {
      const r = await retrieve(sql, q, limit);
      const past = r.passages.filter((p) => p.chapter > limit).map((p) => p.id);
      check(`retrieve(limit ${limit}) "${q}" stays within the limit`, past.length === 0, past.join(', '));
    }
  }
  {
    // Deluin first appears in chapter 12: up to chapter 3 the book can't answer, later chapters can.
    const r = await retrieve(sql, 'Deluin Redshire invaded', 3);
    check('a question only later chapters answer is held back', r.heldBack, JSON.stringify(r.passages.map((p) => p.id)));
    const r2 = await retrieve(sql, 'Gladias vote building sortition', 1);
    check('a question chapter 1 answers is not held back', !r2.heldBack && r2.passages.length > 0);
    check('a hit brings the block before it', r2.passages.some((p, i) => i > 0 && r2.passages[i - 1].chapter === p.chapter && r2.passages[i - 1].idx === p.idx - 1));
  }
  await retrieve(sql, 'x', 3, ['c14-b97']).then(
    () => failures.push('an attached block past the limit was accepted by retrieve'),
    () => passed++,
  );

  // --- Citations, in the pure sanitizer --------------------------------------
  {
    const allowed = new Set(['c1-b20', 'c1-b21']);
    const s = sanitizeReply('He is chosen at random [c1-b20]. It was hard 【c1-b21】. Later he moves on (c19-b153) [c99-b1] [c1-b999].', allowed);
    check('allowed citations kept, in order', JSON.stringify(s.cites) === JSON.stringify(['c1-b20', 'c1-b21']), JSON.stringify(s.cites));
    check('citations past the limit or not given are dropped', JSON.stringify(s.dropped) === JSON.stringify(['c19-b153', 'c99-b1', 'c1-b999']), JSON.stringify(s.dropped));
    check('no dropped id survives in the text', !s.parts.some((p) => p.type === 'text' && /c\d+-b\d+/.test(p.text)));
    const q = sanitizeReply('He says "the whole point of Dzegoban is that there are only 256 roots" here [c1-b20], and "Sure!" too.', allowed);
    check('a quoted span of six words or more is removed', q.quotesRemoved === 1 && !q.parts.some((p) => p.type === 'text' && p.text.includes('256 roots')));
    const r = sanitizeReply('Ranges count [c1-b20‑c1-b21] and 【c1-b20–b21】 too.', allowed);
    check('a cited range opens into its blocks', JSON.stringify(r.cites) === JSON.stringify(['c1-b20', 'c1-b21']) && r.dropped.length === 0, JSON.stringify(r));
    const far = sanitizeReply('Too wide [c1-b2–c1-b90].', allowed);
    check('a range too wide keeps only its ends, which must be allowed', far.cites.length === 0 && far.dropped.length === 2, JSON.stringify(far));
    check('a short quoted word stays', q.parts.some((p) => p.type === 'text' && p.text.includes('"Sure!"')));
  }

  // --- Whole questions, with a stand-in model --------------------------------
  const calls: { model: string; user: string }[] = [];
  let answerText = '';
  let guardText = 'OK commentary only';
  /** Guard verdicts to give before falling back to guardText (one per guard call). */
  let guardQueue: string[] = [];
  /** What the stand-in returns for the search-words call. */
  let searchText = '';
  /** Verdicts for the support check, one per call (default SUPPORTED), and what it was shown. */
  let supportQueue: string[] = [];
  const supportSeen: string[] = [];
  const complete: Complete = async (model, messages) => {
    calls.push({ model, user: messages[messages.length - 1].content });
    const text =
      messages[0].content === 'SUPPORT' ? (supportQueue.shift() ?? 'SUPPORTED') : model === CHAT.guardModel ? (guardQueue.shift() ?? guardText) : messages[0].content === 'SEARCH' ? searchText : answerText;
    if (messages[0].content === 'SUPPORT') supportSeen.push(messages[1].content);
    return { text, promptTokens: 1000, completionTokens: 200, costUsd: 0.0002, requestId: 'test', provider: 'test', model };
  };
  const deps = (fid: number) => ({ sql, fid, complete, systemPrompt: 'SYSTEM up to {{LIMIT}}', guardPolicy: 'POLICY', reminder: 'REMINDER: {{REASON}}', searchPrompt: 'SEARCH', supportPolicy: 'SUPPORT' });

  {
    calls.length = 0;
    const r1 = await retrieve(sql, 'Why is Gladias asked to rate a building?', 1);
    const real = r1.passages[0].id;
    // The model cites a real passage, a block that does not exist, and one past the limit, and quotes the book itself.
    answerText = `He is chosen at random [${real}]. "As a citizen of Veridia, he had been randomly selected by cryptographic sortition" [c1-b9999]. Much later [c30-b47].`;
    const res = await ask(deps(101), { question: 'Why is Gladias asked to rate a building?', limit: 1 });
    check('ask returns an answer', res.state === 'answer', res.state);
    if (res.state === 'answer') {
      check('the nonexistent and past-limit citations are dropped', res.dropped === 2, String(res.dropped));
      check('only real, allowed blocks are quoted', res.quotes.length === 1 && res.quotes[0].id === real, JSON.stringify(res.quotes.map((q) => q.id)));
      const [{ content }] = await sql`select content from studio.text_blocks where chapter = ${Number(real.slice(1, real.indexOf('-')))} and idx = ${Number(real.split('-b')[1])}`;
      const plain = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\*/g, '').trim();
      check("the quote is the stored text, not the model's words", plain(res.quotes[0].html) === plain(content as string), `${plain(res.quotes[0].html).slice(0, 60)} | ${plain(content as string).slice(0, 60)}`);
      check('the quote carries its ¶ label', typeof res.quotes[0].label === 'number');
      check("the model's own quotation of the book is removed", !res.parts.some((p) => p.type === 'text' && p.text.includes('cryptographic sortition')));
    }
    const sent = calls.find((c) => c.model === CHAT.model && c.user !== 'Why is Gladias asked to rate a building?')!.user;
    const sentPast = [...sent.matchAll(/\[c(\d+)-b\d+\]/g)].filter((m) => Number(m[1]) > 1);
    check('nothing past the limit is sent to the model', sentPast.length === 0, sentPast.map((m) => m[0]).join(', '));
    check('every answer is checked by the guard', calls.some((c) => c.model === CHAT.guardModel));
  }
  {
    const res = await ask(deps(102), { question: 'What happens to Deluin after Redshire is invaded?', limit: 3 });
    check('a held-back question is answered with the held state', res.state === 'held' || (res.state === 'answer' && res.heldBack), res.state);
  }
  {
    const before = (await sql`select count(*)::int as n from studio.chat_calls where fid = 103`)[0].n;
    await ask(deps(103), { question: 'What does Deluin say?', limit: 3, attached: ['c14-b97'] }).then(
      () => failures.push('an attached block past the limit was accepted'),
      (e) => check('an attached block past the limit is refused', e instanceof AskError),
    );
    const after = (await sql`select count(*)::int as n from studio.chat_calls where fid = 103`)[0].n;
    check('a refused question spends no message', before === after);
  }
  {
    calls.length = 0;
    guardText = 'VIOLATION writes a caption';
    answerText = 'Deluin sat there with tea; he waved at Zei, who came running [c14-b102].';
    const res = await ask(deps(104), { question: 'Fix my caption', limit: 15 });
    check('a flagged answer is not shown', res.state === 'declined', res.state);
    guardText = 'OK';
    const answers = calls.filter((c) => c.model === CHAT.model && c.user !== 'Fix my caption');
    check('a flagged answer is regenerated once before it is declined', answers.length === 2, String(answers.length));
    check('the retry carries the reminder with the guard\'s reason', answers[1]?.user === 'REMINDER: writes a caption', answers[1]?.user);
  }
  {
    calls.length = 0;
    guardQueue = ['VIOLATION reads as description', 'OK'];
    answerText = 'The courtyard matters because Deluin chooses it [c14-b102].';
    const res = await ask(deps(107), { question: 'Why the courtyard?', limit: 15 });
    check('a flagged answer that passes on the retry is shown', res.state === 'answer' && res.regenerated, res.state);
    const [{ n }] = await sql`select count(*)::int as n from studio.chat_calls where fid = 107 and kind = 'ask'`;
    check('a regenerated answer counts as one question', n === 1, String(n));
    guardQueue = [];
  }
  {
    // An empty verdict is asked again once; then the answer is shown unchecked ("none").
    calls.length = 0;
    guardQueue = ['', 'OK'];
    const res = await ask(deps(108), { question: 'Gladias vote', limit: 1 });
    check('an empty guard verdict is retried once', res.state === 'answer' && calls.filter((c) => c.model === CHAT.guardModel && c.user.startsWith('USER REQUEST')).length === 2);
    guardQueue = [];
  }

  {
    // The search words: the model sees the question alone (no passages), and its words widen the search.
    calls.length = 0;
    searchText = 'Jahen orphan grandmother';
    answerText = 'Commentary.';
    await ask(deps(109), { question: 'Who raised her?', limit: 9 });
    const search = calls.find((c) => c.user === 'Who raised her?');
    check('the search-words call sees only the question', Boolean(search));
    const answerCall = calls.find((c) => c.model === CHAT.model && c.user.startsWith('Passages'))!;
    check('the search words widen what is sent', /Jahen/.test(answerCall.user));
    const [{ n }] = await sql`select coalesce(sum(calls), 0)::int as n from studio.chat_costs where kind = 'search'`;
    check('the search-words call is counted in the cost totals', n >= 1, String(n));
    searchText = '';
  }

  {
    // The second guard question: an unsupported answer becomes "the passages don't say".
    const r1 = await retrieve(sql, 'Why is Gladias asked to rate a building?', 1);
    const real = r1.passages[0].id;
    answerText = `He is chosen because he is the emperor [${real}].`;
    supportQueue = ['UNSUPPORTED the emperor claim'];
    const res = await ask(deps(110), { question: 'Why is Gladias asked to rate a building?', limit: 1 });
    check('an unsupported answer is not shown', res.state === 'unsupported', res.state);
    const [{ content }] = await sql`select content from studio.text_blocks where chapter = ${Number(real.slice(1, real.indexOf('-')))} and idx = ${Number(real.split('-b')[1])}`;
    const seen = supportSeen[supportSeen.length - 1] ?? '';
    check('the support check sees the stored text of the cited block', seen.includes(String(content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)));
    supportQueue = ['', ''];
    const res2 = await ask(deps(111), { question: 'Why is Gladias asked to rate a building?', limit: 1 });
    check('no verdict from the support check fails closed', res2.state === 'unsupported', res2.state);
    supportQueue = [];
    const res3 = await ask(deps(112), { question: 'Why is Gladias asked to rate a building?', limit: 1 });
    check('a supported answer is shown', res3.state === 'answer', res3.state);
  }

  // --- No answer, safety-check or search cost can be joined to a person ------
  {
    const columns = async (t: string) =>
      (await sql`select column_name, data_type, column_default, is_identity from information_schema.columns where table_schema = 'studio' and table_name = ${t}`) as unknown as {
        column_name: string; data_type: string; column_default: string | null; is_identity: string;
      }[];
    const costs = await columns('chat_costs');
    const names = costs.map((c) => c.column_name);
    check('chat_costs has no column naming a person or a request', !names.some((c) => /fid|person|user|account|request|thread/.test(c)), names.join(', '));
    check('chat_costs has no time finer than a date', costs.every((c) => !/time/.test(c.data_type)) && costs.find((c) => c.column_name === 'day')?.data_type === 'date', costs.map((c) => `${c.column_name}:${c.data_type}`).join(', '));
    const numbered = (cs: typeof costs) => cs.filter((c) => c.is_identity === 'YES' || /nextval/.test(c.column_default ?? '')).map((c) => c.column_name);
    check('chat_costs has no row number', numbered(costs).length === 0, numbered(costs).join(', '));
    const calls = await columns('chat_calls');
    check('chat_calls has no row number to order costs against', numbered(calls).length === 0, numbered(calls).join(', '));

    // Two people ask the same question on the same day: the totals grow, the rows don't.
    const rowsBefore = (await sql`select count(*)::int as n from studio.chat_costs`)[0].n;
    const callsBefore = (await sql`select coalesce(sum(calls), 0)::int as n from studio.chat_costs`)[0].n;
    answerText = 'Commentary.';
    await ask(deps(201), { question: 'Gladias vote', limit: 1 });
    const rowsMid = (await sql`select count(*)::int as n from studio.chat_costs`)[0].n;
    await ask(deps(202), { question: 'Gladias vote', limit: 1 });
    const rowsAfter = (await sql`select count(*)::int as n from studio.chat_costs`)[0].n;
    const callsAfter = (await sql`select coalesce(sum(calls), 0)::int as n from studio.chat_costs`)[0].n;
    check('a second person\'s question adds to the totals without adding a row', rowsAfter === rowsMid && callsAfter > callsBefore, `rows ${rowsBefore}→${rowsMid}→${rowsAfter}, calls ${callsBefore}→${callsAfter}`);

    const kinds = (await sql`select distinct kind from studio.chat_calls`).map((r) => r.kind as string);
    check('chat_calls holds only questions', kinds.length === 1 && kinds[0] === 'ask', kinds.join(', '));

    // Code from before 0007 wrote cost rows into chat_calls under the FID: they go to the totals instead.
    const spentBefore = (await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.chat_costs`)[0].usd;
    await sql`insert into studio.chat_calls (fid, kind, model, provider, request_id, prompt_tokens, completion_tokens, cost_usd, guard)
              values (203, 'answer', ${CHAT.model}, 'groq', 'req_old', 10, 5, 0.001, 'flagged')`;
    const [{ n: kept }] = await sql`select count(*)::int as n from studio.chat_calls where fid = 203`;
    const spentAfter = (await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.chat_costs`)[0].usd;
    check('a cost row written the old way is not kept under the FID', kept === 0, String(kept));
    check('a cost row written the old way is added to the totals', Math.abs(spentAfter - spentBefore - 0.001) < 1e-9, `${spentBefore} → ${spentAfter}`);
    await sql`insert into studio.chat_calls (fid, kind, model, request_id) values (204, 'ask', ${CHAT.model}, 'req_old')`.then(
      () => failures.push('a question row with a request id was accepted'),
      () => check('a question row cannot carry a request id', true),
    );
  }

  // --- Limits ----------------------------------------------------------------
  {
    answerText = 'Commentary.';
    const fid = 105;
    let last = '';
    for (let i = 0; i < CHAT.messagesPerDay + 1; i++) last = (await ask(deps(fid), { question: 'Gladias vote', limit: 1 })).state;
    check(`message ${CHAT.messagesPerDay + 1} in a day is refused`, last === 'limit', last);
    const [{ n }] = await sql`select count(*)::int as n from studio.chat_calls where fid = ${fid} and kind = 'ask'`;
    check(`exactly ${CHAT.messagesPerDay} questions counted`, n === CHAT.messagesPerDay, String(n));
  }
  {
    // Spend is shared by everyone: fill the day close to the cap with one big recorded call.
    await sql`insert into studio.chat_costs (kind, model, provider, calls, cost_usd) values ('answer', 'spend-test', '', 1, ${CHAT.dailySpendCapUsd - 0.0001})`;
    const res = await ask(deps(106), { question: 'Gladias vote', limit: 1 });
    check('the spend cap stops new questions', res.state === 'spend', res.state);
  }

  // --- What the table holds, and who may change it ---------------------------
  {
    const cols = (await sql`select column_name from information_schema.columns where table_schema = 'studio' and table_name = 'chat_calls'`).map((r) => r.column_name as string);
    check('chat_calls has no column for message text', !cols.some((c) => /question|reply|text|content|message|block/.test(c)), cols.join(', '));
  }

} finally {
  await sql.end();
  await server.stop();
}

// The owner's conditions for the hosted model, and logging that can't carry message text.
{
  const o = providerOptions();
  check('every request requires zero data retention', o.gateway.zeroDataRetention === true);
  check('one provider is pinned (Groq, owner 2026-10-07), with no fallback', CHAT.provider === 'groq' && JSON.stringify((o.gateway as { only?: string[] }).only) === '["groq"]');
  check('the assistant serves readers only with the pin and zero retention in place', servingAllowed() === true);
  const reply = { choices: [{ message: { provider_metadata: { gateway: { routing: { resolvedProvider: 'groq', finalProvider: 'groq' } } } } }] };
  check('the serving provider is read from the gateway reply', servedBy(reply) === 'groq');
  for (const f of ['src/app/api/chat/ask/route.ts', 'src/app/api/chat/status/route.ts', 'src/lib/chat/ask.ts', 'src/lib/chat/retrieve.ts']) {
    const src = await readFile(path.join(ROOT, f), 'utf8');
    const raw = [...src.matchAll(/console\.\w+\(([^)]*)\)/g)].filter((m) => /\b(e|err|error|input|question|body|messages)\b(?!\s+as)/.test(m[1].replace(/\(e as [^)]*\)/g, '')));
    check(`${f} logs no raw error or message`, raw.length === 0, raw.map((m) => m[0]).join(' | '));
  }
}

// Who may change the table: on PGlite directly, as studio_writer (the socket's shared session can reset its role).
await pg.exec('reset role');
for (const [what, stmt] of [
  ['update chat_calls', 'update studio.chat_calls set model = \'x\''],
  ['delete from chat_calls', 'delete from studio.chat_calls'],
  ['truncate chat_calls', 'truncate studio.chat_calls'],
  ['delete from chat_costs', 'delete from studio.chat_costs'],
  ['truncate chat_costs', 'truncate studio.chat_costs'],
]) {
  await pg.exec('set role studio_writer');
  try {
    await pg.exec(stmt);
    failures.push(`studio_writer could ${what}`);
  } catch (e) {
    check(`studio_writer cannot ${what}`, /permission denied/.test((e as Error).message), (e as Error).message);
  } finally {
    await pg.exec('reset role');
  }
}

if (failures.length) {
  console.error(`chat tests FAILED (${failures.length}):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`chat tests passed: ${passed} checks`);
