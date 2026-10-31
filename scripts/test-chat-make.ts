/**
 * Routing C: the assistant's routing call and make mode (src/lib/chat/router.ts, make.ts, turn.ts, limits.ts).
 * Fails (exit 1) on any problem.
 *
 *   npm run test:chat-make
 *
 * Runs migrations 0001–0007 in an in-memory Postgres (PGlite), seeds the book with the real seed script, and talks
 * to it as studio_writer. Every model is a stand-in, and the make route's fetch is a stand-in too: no call leaves the
 * machine and nothing is spent. Each rule below is a check over what the run observed, and each is proven: a
 * planted violation of that observation must make the check fail (as check:principles does).
 *
 * Rules:
 * - R1 routing: the routing call sees only its two lines of instructions and the person's latest message, is forced
 *   to call `route`, runs on gpt-oss-120b; "question about the book" goes to the book answer, "make something" to
 *   Kimi K3, and an unreadable route counts as a book question.
 * - R2 sticky: once a conversation is "make", later turns stay on Kimi K3 with no routing call, even for a question;
 *   a token for another FID, or forged, is not honoured.
 * - R3 pin: every make request asks for Kimi K3, Baseten only, zero data retention, and names nothing to fall back to.
 * - R4 no fallback: a Baseten error, a reply served by another provider, or one without zero retention confirmed,
 *   gives the make-unavailable reply after exactly one request, and the conversation isn't counted.
 * - R5 the make cap: about $3 a day site-wide; refused before a call that could pass it; the chat's $2 doesn't stop it.
 * - R6 ten a person: the eleventh new make conversation of the day is refused; a conversation already counted goes
 *   on; another person isn't affected; make conversations don't use the 30 book questions.
 * - R7 book questions count against the chat's $2 (with the routing call) and never against make's $3; make calls
 *   count against make's $3 and never against the $2.
 * - R8 make mode off: no routing call, today's answer.
 * - R9 the spoiler limit holds in make mode's book tools.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';

process.env.IMAGES_TICKET_SECRET = 'test-secret-for-make-tokens-only-0123456789';

const { CHAT } = await import('../src/lib/config');
const { turn } = await import('../src/lib/chat/turn');
const { completeMake, makeProviderOptions, signMakeToken, readMakeToken } = await import('../src/lib/chat/make');
const { ROUTE_SYS } = await import('../src/lib/chat/router');
const { makeSpentToday, spentToday, usedToday, makeStartedToday } = await import('../src/lib/chat/limits');
const { makeTools } = await import('../src/lib/chat/make-tools');
type Complete = import('../src/lib/chat/ask').Complete;
type RouteComplete = import('../src/lib/chat/router').RouteComplete;

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));

/** A rule: problems in what was observed, and a planted violation that must be caught. */
interface Rule<O> {
  id: string;
  name: string;
  run: (o: O) => string[];
  plant: (o: O) => void;
}
const proven: string[] = [];
function rule<O>(r: Rule<O>, observed: O) {
  const problems = r.run(observed);
  check(`${r.id} ${r.name}`, problems.length === 0, problems.join('; '));
  const planted = structuredClone(observed);
  r.plant(planted);
  const caught = r.run(planted);
  check(`${r.id} catches its planted violation`, caught.length > 0, 'the check passed a planted violation');
  if (caught.length) proven.push(`${r.id}: planted → ${caught[0]}`);
}

// --- Database ---------------------------------------------------------------------
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of ['0001_core.sql', '0002_v5.sql', '0003_likes.sql', '0004_private_ratings_and_likes.sql', '0005_public_prompts_and_consent.sql', '0006_chat.sql', '0007_chat_costs_without_person.sql']) {
  await pg.exec(await readFile(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
}
await pg.exec(`insert into studio.works values ('snowmoon', 'Snowmoon', 'GPL-3.0', 'x')`);
await pg.exec(`set role studio_writer`);
const PORT = 54347;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
const URL = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;
await promisify(execFile)('npx', ['tsx', 'scripts/seed-text.ts'], { cwd: ROOT, env: { ...process.env, STUDIO_DATABASE_URL: URL } });
const sql = postgres(URL, { prepare: false, max: 1 });
await sql`set role studio_writer`;

// --- Stand-ins ----------------------------------------------------------------------
/** Every model call, in order: the book side (answer, guard, search, support), the routing call, and make requests. */
type Seen = { kind: 'book' | 'route' | 'make'; model: string; messages: { role: string; content?: string }[]; toolChoice?: unknown; body?: Record<string, unknown> };
let seen: Seen[] = [];

const bookComplete: Complete = async (model, messages) => {
  seen.push({ kind: 'book', model, messages });
  const user = messages[messages.length - 1].content;
  const first = user.match(/\[(c\d+-b\d+)\]/)?.[1];
  const text = messages[0].content === 'SUPPORT' ? 'SUPPORTED' : model === CHAT.guardModel ? 'OK commentary only' : messages[0].content === 'SEARCH' ? 'keeper' : `It is explained here [${first}].`;
  return { text, promptTokens: 1000, completionTokens: 200, costUsd: 0.0002, requestId: 'test', provider: 'groq', model };
};

/** What the routing stand-in answers next; 'garbled' gives arguments that aren't JSON. */
let routeAnswer: 'question about the book' | 'make something' | 'garbled' = 'question about the book';
const routeComplete: RouteComplete = async (model, messages, opts) => {
  seen.push({ kind: 'route', model, messages, toolChoice: opts.toolChoice });
  const args = routeAnswer === 'garbled' ? '{kind: make' : JSON.stringify({ kind: routeAnswer });
  return { toolCalls: [{ name: 'route', arguments: args }], promptTokens: 120, completionTokens: 20, costUsd: 0.0001, provider: 'groq', model };
};

/** The gateway, for make requests. Each answer is a function of the request; default: Baseten, zero retention, a reply. */
type GatewayAnswer = (body: Record<string, unknown>) => Response;
const served = (provider: string, opts: { zdr?: boolean | undefined; toolCall?: boolean; cost?: number } = {}) => () =>
  Response.json({
    model: 'moonshotai/kimi-k3',
    choices: [
      {
        message: {
          content: opts.toolCall ? '' : 'Here is a plan from the book.',
          ...(opts.toolCall ? { tool_calls: [{ id: 't1', function: { name: 'search_book', arguments: '{"query":"Bai"}' } }] } : {}),
          provider_metadata: { gateway: { routing: { finalProvider: provider }, ...('zdr' in opts ? (opts.zdr === undefined ? {} : { enabledZeroDataRetention: opts.zdr }) : { enabledZeroDataRetention: true }) } },
        },
      },
    ],
    usage: { prompt_tokens: 2000, completion_tokens: 300, cost: opts.cost ?? 0.0105 },
  });
let gateway: GatewayAnswer[] = [];
const fakeFetch = (async (_url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  seen.push({ kind: 'make', model: String(body.model), messages: body.messages as Seen['messages'], body });
  return (gateway.shift() ?? served('baseten'))(body);
}) as typeof fetch;

const tools = [{ name: 'search_book', description: 'Find words', parameters: { type: 'object', properties: {} }, run: async () => ({ hits: [] }) }];
const deps = (fid: number, makeOn = true) => ({
  ask: { sql, fid, complete: bookComplete, systemPrompt: 'SYSTEM up to {{LIMIT}}', guardPolicy: 'POLICY', reminder: 'REMINDER: {{REASON}}', searchPrompt: 'SEARCH', supportPolicy: 'SUPPORT' },
  route: routeComplete,
  make: makeOn ? { call: completeMake('test-gateway-token', fakeFetch), tools, systemPrompt: 'MAKE up to {{LIMIT}}' } : null,
});
const ask = (fid: number, question: string, extra: Record<string, unknown> = {}, makeOn = true) => turn(deps(fid, makeOn), { question, limit: 15, ...extra });

try {
  // --- R1 routing ------------------------------------------------------------------
  {
    seen = [];
    routeAnswer = 'question about the book';
    const book = await ask(201, 'Why is Gladias asked to rate a building?', { history: [{ role: 'user', text: 'Earlier I asked about Bai.' }, { role: 'assistant', text: 'Bai is a player.' }] });
    const bookSeen = seen;
    seen = [];
    routeAnswer = 'make something';
    const make = await ask(202, "I'd like to make a reference picture of Bai.");
    const makeSeen = seen;
    seen = [];
    routeAnswer = 'garbled';
    const garbled = await ask(203, 'Why is Gladias asked to rate a building, really?');
    const garbledSeen = seen;
    const routeCall = (s: Seen[]) => s.filter((x) => x.kind === 'route');
    const observed = {
      latest: ['Why is Gladias asked to rate a building?', "I'd like to make a reference picture of Bai.", 'Why is Gladias asked to rate a building, really?'],
      routes: [bookSeen, makeSeen, garbledSeen].map((s) => routeCall(s).map((r) => ({ model: r.model, messages: r.messages, toolChoice: r.toolChoice }))),
      states: [book.state, make.state, garbled.state],
      makeCalls: [bookSeen, makeSeen, garbledSeen].map((s) => s.filter((x) => x.kind === 'make').length),
      bookAnswers: [bookSeen, makeSeen, garbledSeen].map((s) => s.filter((x) => x.kind === 'book' && x.model === CHAT.model).length),
    };
    rule(
      {
        id: 'R1',
        name: 'routing: two lines and the latest message, forced, on gpt-oss-120b; book → book answer, make → Kimi K3, unreadable → book',
        run: (o) => {
          const p: string[] = [];
          o.routes.forEach((rs, i) => {
            if (rs.length !== 1) return p.push(`turn ${i + 1}: ${rs.length} routing calls`);
            const r = rs[0];
            if (r.model !== 'openai/gpt-oss-120b') p.push(`turn ${i + 1}: routing on ${r.model}`);
            if (r.messages.length !== 2 || r.messages[0].role !== 'system' || r.messages[0].content !== ROUTE_SYS || r.messages[1].role !== 'user' || r.messages[1].content !== o.latest[i])
              p.push(`turn ${i + 1}: the routing call saw more than its instructions and the latest message`);
            if (JSON.stringify(r.toolChoice) !== JSON.stringify({ type: 'function', function: { name: 'route' } })) p.push(`turn ${i + 1}: the route tool is not forced`);
          });
          if (o.states[0] !== 'answer' || o.makeCalls[0] !== 0 || o.bookAnswers[0] < 1) p.push(`a book question went ${o.states[0]} with ${o.makeCalls[0]} make calls`);
          if (o.states[1] !== 'made' || o.makeCalls[1] < 1 || o.bookAnswers[1] !== 0) p.push(`a make request went ${o.states[1]} with ${o.bookAnswers[1]} book answers`);
          if (o.states[2] !== 'answer' || o.makeCalls[2] !== 0) p.push(`an unreadable route went ${o.states[2]}`);
          return p;
        },
        plant: (o) => {
          // Variant B: the routing call also shown the conversation.
          o.routes[0][0].messages.splice(1, 0, { role: 'user', content: 'Earlier I asked about Bai.' });
        },
      },
      observed,
    );
    rule(
      {
        id: 'R1b',
        name: 'a make request is answered by Kimi K3, not the book side',
        run: (o) => (o.states[1] === 'made' && o.makeCalls[1] > 0 ? [] : ['a make request did not reach Kimi K3']),
        plant: (o) => {
          o.states[1] = 'answer';
          o.makeCalls[1] = 0;
        },
      },
      observed,
    );
  }

  // --- R2 sticky -----------------------------------------------------------------------
  {
    seen = [];
    routeAnswer = 'make something';
    const first = await ask(211, 'Help me plan a short comic of the Minpentai match in chapter 4.');
    const token = first.state === 'made' ? first.make : '';
    seen = [];
    routeAnswer = 'question about the book';
    const second = await ask(211, 'Why is Gladias asked to rate a building?', { make: token });
    const secondSeen = seen;
    seen = [];
    const other = await ask(212, 'Why is Gladias asked to rate a building?', { make: token });
    const otherSeen = seen;
    seen = [];
    const forged = await ask(211, 'Why is Gladias asked to rate a building?', { make: token.slice(0, -4) + 'AAAA' });
    const forgedSeen = seen;
    const yesterday = signMakeToken(211, '2026-01-01');
    const startedBefore = await makeStartedToday(sql, 211);
    seen = [];
    const old = await ask(211, 'Why is Gladias asked to rate a building?', { make: yesterday });
    const oldSeen = seen;
    const startedAfter = await makeStartedToday(sql, 211);
    const observed = {
      sticky: { state: second.state, routeCalls: secondSeen.filter((x) => x.kind === 'route').length, makeCalls: secondSeen.filter((x) => x.kind === 'make').length, sameToken: second.state === 'made' && second.make === token },
      otherFid: { state: other.state, routeCalls: otherSeen.filter((x) => x.kind === 'route').length },
      forged: { state: forged.state, routeCalls: forgedSeen.filter((x) => x.kind === 'route').length },
      earlierDay: { state: old.state, routeCalls: oldSeen.filter((x) => x.kind === 'route').length, counted: startedAfter - startedBefore, newToken: old.state === 'made' && readMakeToken(old.make, 211)?.day === new Date().toISOString().slice(0, 10) },
    };
    rule(
      {
        id: 'R2',
        name: 'once make, the conversation stays on Kimi K3 with no routing call; another FID or a forged token is routed afresh',
        run: (o) => {
          const p: string[] = [];
          if (o.sticky.state !== 'made' || o.sticky.routeCalls !== 0 || o.sticky.makeCalls < 1 || !o.sticky.sameToken) p.push(`a make conversation's next turn went ${o.sticky.state} with ${o.sticky.routeCalls} routing calls`);
          if (o.otherFid.state !== 'answer' || o.otherFid.routeCalls !== 1) p.push(`another FID's copy of the token was honoured (${o.otherFid.state})`);
          if (o.forged.state !== 'answer' || o.forged.routeCalls !== 1) p.push(`a forged token was honoured (${o.forged.state})`);
          if (o.earlierDay.state !== 'made' || o.earlierDay.routeCalls !== 0 || o.earlierDay.counted !== 1 || !o.earlierDay.newToken) p.push(`a make conversation from an earlier day: ${JSON.stringify(o.earlierDay)}`);
          return p;
        },
        plant: (o) => {
          o.sticky.routeCalls = 1;
          o.sticky.state = 'answer';
        },
      },
      observed,
    );
  }

  // --- R3 pin (every make request so far, and more below) ---------------------------
  const pinRule: Rule<{ bodies: Record<string, unknown>[] }> = {
    id: 'R3',
    name: 'every make request: Kimi K3, Baseten only, zero data retention, nothing to fall back to',
    run: (o) => {
      const p: string[] = [];
      if (!o.bodies.length) p.push('no make request was observed');
      for (const b of o.bodies) {
        const g = (b.providerOptions as { gateway?: Record<string, unknown> } | undefined)?.gateway ?? {};
        if (b.model !== 'moonshotai/kimi-k3') p.push(`a make request asked for ${String(b.model)}`);
        if (JSON.stringify(g.only) !== '["baseten"]') p.push(`a make request's providers: ${JSON.stringify(g.only)}`);
        if (g.zeroDataRetention !== true) p.push('a make request without zeroDataRetention: true');
        for (const k of ['order', 'models']) if (k in g || k in b) p.push(`a make request names ${k}, something to fall back to`);
      }
      return p;
    },
    plant: (o) => {
      o.bodies.push({ model: 'moonshotai/kimi-k3', providerOptions: { gateway: { only: ['baseten', 'moonshotai'], zeroDataRetention: true } } });
    },
  };
  const allBodies: Record<string, unknown>[] = [];
  const keepBodies = () => allBodies.push(...seen.filter((x) => x.kind === 'make').map((x) => x.body!));
  check('makeProviderOptions is exactly Baseten only with zero data retention', JSON.stringify(makeProviderOptions()) === JSON.stringify({ gateway: { only: ['baseten'], zeroDataRetention: true } }), JSON.stringify(makeProviderOptions()));

  // --- R4 no fallback ------------------------------------------------------------------
  {
    routeAnswer = 'make something';
    const cases: [string, GatewayAnswer][] = [
      ['Baseten answers 503', () => new Response('{"error":"unavailable"}', { status: 503 })],
      ['no ZDR provider (400)', () => Response.json({ error: 'No ZDR providers available', type: 'no_providers_available' }, { status: 400 })],
      ['served by another provider', served('moonshotai')],
      ['zero retention not confirmed', served('baseten', { zdr: undefined })],
      ['zero retention false', served('baseten', { zdr: false })],
    ];
    const observed: { case: string; state: string; requests: number; providers: unknown[]; counted: number }[] = [];
    let fid = 221;
    for (const [name, answer] of cases) {
      seen = [];
      gateway = [answer];
      const r = await ask(fid, 'Make a picture of the Minpentai arena for the glossary.');
      const reqs = seen.filter((x) => x.kind === 'make');
      keepBodies();
      observed.push({ case: name, state: r.state, requests: reqs.length, providers: reqs.map((x) => (x.body!.providerOptions as { gateway: { only: unknown } }).gateway.only), counted: await makeStartedToday(sql, fid) });
      fid++;
    }
    gateway = [];
    rule(
      {
        id: 'R4',
        name: 'no fallback: a Baseten failure is the make-unavailable reply after one request, to Baseten only, and costs nobody a conversation',
        run: (o) =>
          o.flatMap((c) => [
            ...(c.state === 'make-unavailable' ? [] : [`${c.case}: ${c.state}`]),
            ...(c.requests === 1 ? [] : [`${c.case}: ${c.requests} requests (a retry or fallback)`]),
            ...(c.providers.every((p) => JSON.stringify(p) === '["baseten"]') ? [] : [`${c.case}: sent to ${JSON.stringify(c.providers)}`]),
            ...(c.counted === 0 ? [] : [`${c.case}: counted as a make conversation`]),
          ]),
        plant: (o) => {
          o[0].requests = 2;
          o[0].providers.push(['moonshotai']);
        },
      },
      observed,
    );
  }

  // --- R5 the make cap -------------------------------------------------------------
  {
    routeAnswer = 'make something';
    // Make spend today up to just under the cap: the next call's worst case can't fit.
    const room = CHAT.make.dailySpendCapUsd - (await makeSpentToday(sql)) - 0.01;
    await sql`insert into studio.chat_costs (kind, model, provider, guard, calls, cost_usd) values ('answer', ${CHAT.make.model}, 'baseten', '', 1, ${room})
              on conflict (day, kind, model, provider, guard) do update set cost_usd = studio.chat_costs.cost_usd + excluded.cost_usd`;
    seen = [];
    const capped = await ask(231, 'Make me a new style: soft ink wash.');
    const cappedReqs = seen.filter((x) => x.kind === 'make').length;
    const spentAtCap = await makeSpentToday(sql);
    seen = [];
    routeAnswer = 'question about the book';
    const book = await ask(232, 'Why is Gladias asked to rate a building?');
    const observed = { capped: capped.state, cappedReqs, spentAtCap, cap: CHAT.make.dailySpendCapUsd, bookState: book.state };
    rule(
      {
        id: 'R5',
        name: 'the make cap ($3 a day site-wide) refuses a call that could pass it, sends nothing, and leaves book questions working',
        run: (o) => [
          ...(o.cap === 3 ? [] : [`the make cap is $${o.cap}, not $3`]),
          ...(o.capped === 'make-spend' ? [] : [`at the cap a make request went ${o.capped}`]),
          ...(o.cappedReqs === 0 ? [] : [`at the cap ${o.cappedReqs} make requests were sent`]),
          ...(o.spentAtCap <= o.cap ? [] : [`make spend ${o.spentAtCap} passed the cap`]),
          ...(o.bookState === 'answer' ? [] : [`with make at its cap a book question went ${o.bookState}`]),
        ],
        plant: (o) => {
          o.capped = 'made';
          o.cappedReqs = 1;
        },
      },
      observed,
    );
    // Back under the cap for the rest, by a negative-free route: a new day isn't possible, so later rules use their own room.
    await pg.exec('reset role');
    await pg.exec(`update studio.chat_costs set cost_usd = 0 where model = '${CHAT.make.model}'`);
    await pg.exec('set role studio_writer');
    await sql`set role studio_writer`;
  }

  // --- R6 ten a person -------------------------------------------------------------------
  {
    routeAnswer = 'make something';
    const fid = 241;
    const tokens: string[] = [];
    const states: string[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await ask(fid, `Make a picture of moment ${i}.`);
      states.push(r.state);
      if (r.state === 'made') tokens.push(r.make);
    }
    seen = [];
    keepBodies();
    const goOn = await ask(fid, 'And make it darker.', { make: tokens[0] });
    const other = await ask(242, 'Make a picture of Zei.');
    const usedBook = await usedToday(sql, fid);
    const observed = { perDay: CHAT.make.conversationsPerDay, states, started: await makeStartedToday(sql, fid), goOn: goOn.state, other: other.state, usedBook };
    rule(
      {
        id: 'R6',
        name: 'ten new make conversations a person a day; the eleventh is refused; a counted one goes on; others unaffected; the 30 book questions untouched',
        run: (o) => [
          ...(o.perDay === 10 ? [] : [`the per-person limit is ${o.perDay}, not 10`]),
          ...(o.states.slice(0, 10).every((s) => s === 'made') ? [] : [`the first ten went ${o.states.slice(0, 10).join(',')}`]),
          ...(o.states[10] === 'make-limit' ? [] : [`the eleventh went ${o.states[10]}`]),
          ...(o.started === 10 ? [] : [`${o.started} make conversations counted`]),
          ...(o.goOn === 'made' ? [] : [`a counted conversation's next turn went ${o.goOn}`]),
          ...(o.other === 'made' ? [] : [`another person went ${o.other}`]),
          ...(o.usedBook === 0 ? [] : [`make conversations used ${o.usedBook} of the 30 book questions`]),
        ],
        plant: (o) => {
          o.states[10] = 'made';
          o.started = 11;
        },
      },
      observed,
    );
  }

  // --- R7 which cap each side counts against -------------------------------------------
  {
    const snap = async () => ({ chat: await spentToday(sql), make: await makeSpentToday(sql) });
    routeAnswer = 'question about the book';
    const b0 = await snap();
    seen = [];
    const book = await ask(251, 'Why is Gladias asked to rate a building at all?');
    const bookCalls = seen.filter((x) => x.kind !== 'make').length;
    const b1 = await snap();
    const [{ n: bookRows }] = await sql`select count(*)::int as n from studio.chat_calls where fid = 251 and model = ${CHAT.model}`;
    routeAnswer = 'make something';
    seen = [];
    gateway = [served('baseten', { toolCall: true, cost: 0.02 }), served('baseten', { cost: 0.01 })];
    const make = await ask(252, 'Make a picture of Bai at the window.');
    keepBodies();
    const b2 = await snap();
    // A sticky make turn spends only make's money: no routing call.
    seen = [];
    const sticky = await ask(252, 'Lighter, please.', { make: make.state === 'made' ? make.make : '' });
    keepBodies();
    const b3 = await snap();
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
    const observed = {
      book: book.state,
      bookCalls,
      bookChat: b1.chat - b0.chat,
      bookMake: b1.make - b0.make,
      bookRows,
      make: make.state,
      makeChat: b2.chat - b1.chat,
      makeMake: b2.make - b1.make,
      sticky: sticky.state,
      stickyChat: b3.chat - b2.chat,
      stickyMake: b3.make - b2.make,
      chatCap: CHAT.dailySpendCapUsd,
    };
    rule(
      {
        id: 'R7',
        name: "book questions (and the routing call) count against the chat's $2, never make's $3; make calls the other way round",
        run: (o) => [
          ...(o.chatCap === 2 ? [] : [`the chat cap is $${o.chatCap}, not $2`]),
          ...(o.book === 'answer' && o.bookRows === 1 ? [] : [`the book question went ${o.book}, ${o.bookRows} question rows`]),
          ...(near(o.bookChat, o.bookCalls * 0.0002 - 0.0001) ? [] : [`the book turn added $${o.bookChat} to the chat's spend for ${o.bookCalls} calls`]),
          ...(near(o.bookMake, 0) ? [] : [`the book turn added $${o.bookMake} to make's spend`]),
          ...(o.make === 'made' ? [] : [`the make request went ${o.make}`]),
          ...(near(o.makeChat, 0.0001) ? [] : [`a new make turn added $${o.makeChat} to the chat's spend (only its routing call, $0.0001, belongs there)`]),
          ...(near(o.makeMake, 0.03) ? [] : [`a new make turn added $${o.makeMake} to make's spend (two calls, $0.03)`]),
          ...(o.sticky === 'made' && near(o.stickyChat, 0) && near(o.stickyMake, 0.0105) ? [] : [`a sticky make turn: ${o.sticky}, chat +$${o.stickyChat}, make +$${o.stickyMake}`]),
        ],
        plant: (o) => {
          o.bookMake = 0.0011;
          o.makeChat = 0.03;
        },
      },
      observed,
    );
  }

  // Now R3, over every make request this run sent.
  rule(pinRule, { bodies: allBodies.concat(seen.filter((x) => x.kind === 'make').map((x) => x.body!)) });

  // --- R8 make mode off ------------------------------------------------------------------
  {
    routeAnswer = 'make something';
    seen = [];
    const r = await ask(261, 'Make a picture of Bai.', {}, false);
    const observed = { state: r.state, routeCalls: seen.filter((x) => x.kind === 'route').length, makeCalls: seen.filter((x) => x.kind === 'make').length, enabled: CHAT.make.enabled };
    rule(
      {
        id: 'R8',
        name: 'make mode off: no routing call, no make call, today\'s book answer; off in the committed settings',
        run: (o) => [
          ...(o.routeCalls === 0 && o.makeCalls === 0 ? [] : [`with make off: ${o.routeCalls} routing and ${o.makeCalls} make calls`]),
          ...(o.state === 'answer' ? [] : [`with make off the reply was ${o.state}`]),
          ...(o.enabled === false ? [] : ['CHAT.make.enabled is on before the owner\'s reread']),
        ],
        plant: (o) => {
          o.routeCalls = 1;
        },
      },
      observed,
    );
  }

  // --- R9 the spoiler limit in make mode's book tools ---------------------------------------
  {
    const t = makeTools(3);
    const run = (name: string, args: Record<string, unknown>) => t.find((x) => x.name === name)!.run(args).then((o) => ({ ok: true as const, o }), (e: Error) => ({ ok: false as const, e: e.message }));
    const search = await run('search_book', { query: 'Deluin' });
    const passage = await run('get_passage', { chapter: 14, from: 1, to: 3 });
    const glossary = await run('get_glossary', {});
    const sheet = await run('get_sheet', { kind: 'character', slug: 'zei' });
    const chapterOf = (id: string) => Number(id.match(/^c(\d+)-/)?.[1] ?? 0);
    const observed = {
      searchPast: search.ok ? (search.o as { hits: { chapter: number }[] }).hits.filter((h) => h.chapter > 3).length : 0,
      passageRefused: !passage.ok,
      glossaryThrough: glossary.ok ? (glossary.o as { through: number }).through : -1,
      sheetPast: sheet.ok ? (sheet.o as { book_facts: { block: string }[] }).book_facts.filter((f) => chapterOf(f.block) > 3).length : -1,
      tools: t.map((x) => x.name),
    };
    rule(
      {
        id: 'R9',
        name: "make mode's book tools stay within the thread's chapter limit",
        run: (o) => [
          ...(o.searchPast === 0 ? [] : [`search_book gave ${o.searchPast} hits past chapter 3`]),
          ...(o.passageRefused ? [] : ['get_passage read chapter 14 for a chapter-3 thread']),
          ...(o.glossaryThrough === 3 ? [] : [`get_glossary read through chapter ${o.glossaryThrough}`]),
          ...(o.sheetPast === 0 ? [] : [`get_sheet gave ${o.sheetPast} facts past chapter 3`]),
          ...(o.tools.every((n) => ['search_book', 'get_passage', 'get_glossary', 'get_sheet', 'get_references'].includes(n)) ? [] : [`make mode offers ${o.tools.join(', ')}`]),
        ],
        plant: (o) => {
          o.searchPast = 2;
          o.passageRefused = false;
        },
      },
      observed,
    );
  }
} finally {
  await sql.end();
  await server.stop();
}

if (failures.length) {
  console.error(`chat make tests FAILED (${failures.length}):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`chat make tests passed: ${passed} checks; every rule caught its planted violation:\n  ${proven.join('\n  ')}`);
