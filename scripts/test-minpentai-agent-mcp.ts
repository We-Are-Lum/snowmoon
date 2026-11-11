/**
 * Agent play over the real connector (draft, 2026-10-31): the built site under `next start` with every migration
 * (0032_minpentai_agent_matches.sql included) in PGlite, the "play" scope switched on for the test only
 * (MINPENTAI_PLAY_TEST, never on Vercel), and a scripted agent that signs in through OAuth and plays a whole
 * book-edition match against the site computer through /mcp, as an MCP client does (JSON-RPC over HTTP).
 *
 *   npm run build && npm run test:minpentai-agent-mcp
 *
 * Checks: the scope is granted only when asked for; tools/list shows the Minpentai tools only to an agent that has
 * it; a whole match (view, simulate, standing order, orders with commitments, one turn played by the site
 * computer) to the end; the record opens only at the end and its commitments check; another person's agent can't
 * see or touch the match and is told the same as for a match that doesn't exist; the live link shows only the
 * side's view while the match is on.
 */
import { createHash } from 'node:crypto';
import { startStage, connect, mcp, tool } from './lib/agents-harness';
import { AGENTS } from '../src/lib/config';
import { QUIET_MS, fromRows } from '../src/lib/minpentai/agent-play/solo';

process.env.MINPENTAI_PLAY_TEST = '1';
// Play is opened to A and B only (as production opens it to the owner only); C is someone it isn't open to.
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++; else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}${!ok && detail ? ` (${detail})` : ''}`);
};

// The wallet people A, B, C, D are -3, -4, -5, -6 in the harness's fresh database (M29 checks A and B).
process.env.MINPENTAI_PLAY_TEST_PEOPLE = '-3,-4';
const S = await startStage();
const { BASE, people } = S;
type View = { turn: number; phase: string; step: number; can_place: string[]; board: { towers: { x: number; y: number; side: string }[]; squares: { side: string; x: number; y: number }[]; gliders: { side: string; x: number; y: number }[] }; opponent_commitment: string | null; end: { win: string } | null };

try {
  // Scopes: "play" only when asked for, and only then are the tools listed.
  // An app that asks only for the scopes /mcp names (as Claude does): someone agent play is open to gets "play" too.
  const plain = await connect(BASE, people.A.token, 'Claude');
  const listPlain = ((await mcp(BASE, plain.access_token, 'tools/list')).body?.result?.tools ?? []).map((t) => t.name);
  check('M1 a person agent play is open to gets the Minpentai tools even when the app asked only for the usual scopes', listPlain.includes('minpentai_start_solo'), listPlain.join(','));
  const dPlain = await connect(BASE, people.C.token, 'Claude');
  const refused = await tool(BASE, dPlain.access_token, 'minpentai_start_solo', {});
  check('M2 someone else connecting the same way gets none, and can\'t call one', !refused.ok && /"play" scope/.test(refused.error ?? ''), refused.error ?? '');
  const a = await connect(BASE, people.A.token, 'Claude', 'read play');
  const init = await mcp(BASE, a.access_token, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'scripted-agent', version: '1' } });
  check('M3 initialize answers as an MCP server', !!(init.body?.result as { serverInfo?: unknown })?.serverInfo);
  const names = ((await mcp(BASE, a.access_token, 'tools/list')).body?.result?.tools ?? []).map((t) => t.name);
  const want = ['minpentai_start_solo', 'minpentai_list_my_matches', 'minpentai_get_view', 'minpentai_simulate', 'minpentai_symbol_launches', 'minpentai_submit_orders', 'minpentai_let_site_play_turn', 'minpentai_set_standing_order', 'minpentai_resign', 'minpentai_new_live_link', 'minpentai_get_record'];
  check('M4 an agent given "play" sees the Minpentai tools', want.every((n) => names.includes(n)), names.join(','));

  // Someone agent play isn't open to: asking for "play" gets them nothing.
  const c = await connect(BASE, people.C.token, 'Claude', 'read play');
  const cList = ((await mcp(BASE, c.access_token, 'tools/list')).body?.result?.tools ?? []).map((t) => t.name);
  const cTry = await tool(BASE, c.access_token, 'minpentai_start_solo', {});
  check('M28 a person agent play isn\'t open to: no "play" scope granted, no tool listed, none runs', !cList.some((n) => n.startsWith('minpentai_')) && !cTry.ok, `${cList.join(',')} / ${cTry.error}`);
  check('M29 the people it is open to are the ones set (A and B here)', [people.A.person, people.B.person].join(',') === process.env.MINPENTAI_PLAY_TEST_PEOPLE, `${people.A.person},${people.B.person}`);

  const d3 = await tool(BASE, a.access_token, 'minpentai_start_solo', { ruleset: 'book-3', level: 2 });
  check('M30 a draft ruleset (book-3) starts only for the people it is opened to (the owner): A has play, not drafts', !d3.ok && /ruleset must be/.test(d3.error ?? '') && !AGENTS.minpentaiPlay.drafts.includes(people.A.person), d3.error ?? '');

  // A whole match.
  const st = await tool(BASE, a.access_token, 'minpentai_start_solo', { ruleset: 'book', level: 2, model: { name: 'Scripted', maker: 'This test', weights: 'open' } });
  check('M5 start a book-edition match', st.ok && typeof st.out.match_id === 'string', st.error ?? '');
  const id = st.out.match_id as string, live = st.out.live_url as string;
  check('M6 the live link is this site\'s, with a secret', live.startsWith(`${BASE}/minpentai/m/${id}?k=`), live);
  const so = await tool(BASE, a.access_token, 'minpentai_set_standing_order', { match_id: id, text: 'Build forward, keep towers covered.', preset: 'expand' });
  check('M7 a standing order with its preset', so.ok, so.error ?? '');

  // The other person's agent: the match reads as missing, in the same words as a made-up id.
  const b = await connect(BASE, people.B.token, 'Claude', 'read play');
  const theirs = await tool(BASE, b.access_token, 'minpentai_get_view', { match_id: id });
  const made = await tool(BASE, b.access_token, 'minpentai_get_view', { match_id: 'zzzzzzzzzzzz' });
  check('M8 another person\'s agent can\'t see the match, and is told what it\'s told for no match', !theirs.ok && theirs.error === made.error, `${theirs.error} / ${made.error}`);
  const theirsLaunch = await tool(BASE, b.access_token, 'minpentai_symbol_launches', { match_id: id, x: 9, y: 3 });
  check('M31 nor ask it for converging symbol-glider launches', !theirsLaunch.ok && theirsLaunch.error === made.error, `${theirsLaunch.error} / ${made.error}`);
  const cLaunch = await tool(BASE, c.access_token, 'minpentai_symbol_launches', { match_id: id, x: 9, y: 3 });
  check('M32 someone agent play isn\'t open to can\'t call the launches helper', !cLaunch.ok && !cList.includes('minpentai_symbol_launches'), cLaunch.error ?? '');
  const ownLaunch = await tool(BASE, a.access_token, 'minpentai_symbol_launches', { match_id: id, x: 9, y: 3 });
  const tools = (await mcp(BASE, a.access_token, 'tools/list')).body?.result?.tools as { name: string; description?: string }[] | undefined;
  const desc = (n: string) => tools?.find((x) => x.name === n)?.description ?? '';
  check('M33 the person\'s own agent gets launches (or why none) for its match, and the view carries the rules and the pieces page', ownLaunch.ok && Array.isArray(ownLaunch.out.options) && (ownLaunch.out.options.length > 0 || typeof ownLaunch.out.why_none === 'string') && Array.isArray((st.out.view as { rules?: unknown }).rules) && /\/minpentai\/book$/.test(String((st.out.view as { how_the_pieces_work?: unknown }).how_the_pieces_work)), ownLaunch.error ?? JSON.stringify(ownLaunch.out).slice(0, 200));
  check('M34 the tool descriptions say the launch directions, own pieces blocking launch cells, bounce and chip, head-on, convergence with an example, and sight', ['minpentai_start_solo', 'minpentai_get_view', 'minpentai_simulate', 'minpentai_submit_orders'].every((n) => /N, E, S or W only/.test(desc(n)) && /your own squares and pieces take away your own launch cells/.test(desc(n)) && /chip your own squares/.test(desc(n)) && /head-on/.test(desc(n))) && /rows 4, 5, 6/.test(desc('minpentai_simulate')) && /rows 4, 5, 6/.test(desc('minpentai_symbol_launches')) && /Sight: you see within/.test(desc('minpentai_get_view')));
  const theirsSubmit = await tool(BASE, b.access_token, 'minpentai_submit_orders', { match_id: id, turn: 0, placements: [], source: 'agent', final: true });
  check('M9 nor submit to it', !theirsSubmit.ok && theirsSubmit.error === made.error);
  const early = await tool(BASE, b.access_token, 'minpentai_get_record', { match_id: id });
  const none = await tool(BASE, b.access_token, 'minpentai_get_record', { match_id: 'zzzzzzzzzzzz' });
  check('M10 no record before the end, in the same words as for no match', !early.ok && early.error === none.error, `${early.error} / ${none.error}`);

  let turns = 0, simulated = 0, sitePlayed = false;
  const firsts: number[] = [];
  let opened = 0;
  for (;;) {
    const g = await tool(BASE, a.access_token, 'minpentai_get_view', { match_id: id });
    const t1 = Date.now();
    const v = g.out as unknown as View;
    if (!g.ok || v.phase === 'over') break; // an ended match answers at once: its record is public
    if (opened) firsts.push(t1 - opened);
    if (turns === 0) {
      const page = await (await fetch(live)).text();
      check('M11 the live link opens with its secret, and says it shows one side only', /your side/.test(page) && /Only your side is shown/.test(page));
      const bad = await fetch(live.replace(/k=.*/, 'k=wrongwrongwrongwrong'));
      check('M12 a wrong secret opens nothing', bad.status === 404);
    }
    // The scripted agent: two plans, compared in the sandbox against a guess, then the better one sent.
    const east = [...fromRows(v.can_place)].sort((p, q) => q[0] - p[0] || p[1] - q[1]);
    const plans = { tower: east.length ? [{ piece: 'tower', x: east[0][0], y: east[0][1] }] : [], glider: east.length ? [{ piece: 'glider', x: east[0][0], y: east[0][1], dir: 'E' }] : [] };
    const sim = await tool(BASE, a.access_token, 'minpentai_simulate', { match_id: id, scenarios: Object.entries(plans).map(([name, placements]) => ({ name, placements })) });
    if (sim.ok) simulated++;
    const sc = (sim.out.scenarios ?? []) as { name: 'tower' | 'glider'; legal: boolean; result?: { my_towers: { now: number } } }[];
    const best = sc.filter((s) => s.legal).sort((p, q) => q.result!.my_towers.now - p.result!.my_towers.now)[0];
    if (turns === 3) {
      opened = Date.now(); // timed from sending: this call opens the next turn, then plans the person's side before answering
      const sp = await tool(BASE, a.access_token, 'minpentai_let_site_play_turn', { match_id: id, turn: v.turn });
      sitePlayed = sp.ok;
      check('M13 the site computer plays a turn for the person when asked', sp.ok, sp.error ?? '');
    } else {
      const wrong = turns === 1 ? await tool(BASE, a.access_token, 'minpentai_submit_orders', { match_id: id, turn: v.turn + 1, placements: [], source: 'agent' }) : null;
      if (wrong) check('M14 orders for a turn that isn\'t open are refused', !wrong.ok && /is not open/.test(wrong.error ?? ''), wrong.error ?? '');
      const sub = await tool(BASE, a.access_token, 'minpentai_submit_orders', { match_id: id, turn: v.turn, placements: best ? plans[best.name] : [], source: 'agent', final: true });
      opened = Date.now(); // a final submit opens the next turn a few ms before it answers: timed from its answer
      if (!sub.ok) { check(`M15 turn ${v.turn} accepted`, false, sub.error ?? ''); break; }
      if (turns === 0) check('M15 orders accepted with a commitment', /^[0-9a-f]{64}$/.test(String(sub.out.commitment)));
      // Small replies (owner, 2026-11-04): accepted, commitment, points left, and how the turn resolved; no view echo.
      if (turns === 0) check('M15b submit_orders answers in a few fields, not the view', Object.keys(sub.out as object).every((k) => ['accepted', 'commitment', 'points_left', 'resolved'].includes(k)) && JSON.stringify(sub.out).length < 600, JSON.stringify(sub.out).slice(0, 200));
    }
    turns++;
    if (turns > 30) break;
  }
  check('M22 each turn\'s first call answers at the quiet time after the turn opened, the same every turn, so it says nothing about the computer\'s planning', firsts.length > 2 && Math.min(...firsts) >= QUIET_MS - 100 && Math.max(...firsts) - Math.min(...firsts) < 150, firsts.join(','));
  check('M16 the match is played to the end through the tools', turns >= 3 && simulated >= 3 && sitePlayed, `${turns} turns, ${simulated} simulations`);
  const rec = await tool(BASE, b.access_token, 'minpentai_get_record', { match_id: id });
  check('M17 at the end the record opens, to anyone', rec.ok, rec.error ?? '');
  const recTurns = (rec.out.turns ?? []) as { turn: number; C: { placements: { piece: string; x: number; y: number; dir?: string; slant?: string }[]; salt: string; commitment: string; source: string }; A: { salt: string; commitment: string } }[];
  check('M18 the record shows who chose each turn, the site computer\'s turn included', recTurns.some((t) => t.C.source === 'site-computer') && recTurns.some((t) => t.C.source === 'agent'));
  const committed = (st.out.view as { opponent: { random_commitment: string } }).opponent.random_commitment;
  check('M23 the record reveals the computer\'s random value, matching the commitment shown at the start', /^[0-9a-f]{64}$/.test(String(rec.out.computer_random)) && rec.out.computer_random_commitment === committed && createHash('sha256').update(String(rec.out.computer_random)).digest('hex') === committed);
  check('M19 every commitment in the record has its salt', recTurns.length > 0 && recTurns.every((t) => /^[0-9a-f]{64}$/.test(t.C.salt) && /^[0-9a-f]{64}$/.test(t.A.salt) && /^[0-9a-f]{64}$/.test(t.C.commitment)));
  const after = await (await fetch(live)).text();
  // The page as #107 left it: the whole board at the end; the end says why (owner, 2026-11-04; worded 2026-11-12: "Over at step 144: you won, 3 towers standing to their 1.", header "Standing 3–1 · Destroyed 3–3").
  check('M20 after the end the live link shows the whole board and why it ended', /Over at step \d+: [^<]*\./.test(after) && /The whole board at the end/.test(after), (after.match(/Over at step [^<]{0,120}/) ?? ['no "Over at step"'])[0]);
  // The table (0032_minpentai_agent_matches.sql v2): the exact ruleset, updated_at stamped on every save, nobody but the server reads it, and the server can't delete.
  const row = (await S.pg.query<{ ruleset: string; level: number; stamped: boolean }>(`select ruleset, level, updated_at > created_at as stamped from studio.mp_agent_matches where id = $1`, [id])).rows[0];
  check('M24 the match is stored under its exact ruleset and level', row?.ruleset === 'book-2' && row.level === 2, JSON.stringify(row));
  check('M25 every save stamps updated_at', row?.stamped === true);
  const priv = (await S.pg.query<Record<string, boolean>>(`select has_table_privilege('anon', 'studio.mp_agent_matches', 'select') as a, has_table_privilege('authenticated', 'studio.mp_agent_matches', 'select') as b, has_table_privilege('studio_writer', 'studio.mp_agent_matches', 'delete') as c, has_table_privilege('service_role', 'studio.mp_agent_matches', 'delete') as d, has_table_privilege('service_role', 'studio.mp_agent_matches', 'truncate') as e`)).rows[0];
  check('M26 anon and authenticated can\'t read the table; neither the server nor the service_role key can delete from it', priv && !priv.a && !priv.b && !priv.c && !priv.d && !priv.e, JSON.stringify(priv));
  const recBody = JSON.stringify(rec.out);
  // The person's id as a whole JSON value (it is -3 here, which also appears inside timestamps), their address, their agent's name.
  const idAsValue = new RegExp(`[:\\[,]${people.A.person}[,\\]}]`);
  check('M27 the public record names neither the person nor their agent', !recBody.includes('Claude') && !idAsValue.test(recBody) && !recBody.toLowerCase().includes(people.A.address.toLowerCase()) && !/"agent":/.test(recBody), JSON.stringify({ claude: recBody.includes('Claude'), id: idAsValue.test(recBody), addr: recBody.toLowerCase().includes(people.A.address.toLowerCase()), agentKey: /"agent":/.test(recBody) }));
  const lst = await tool(BASE, a.access_token, 'minpentai_list_my_matches', {});
  check('M21 the person\'s matches list it as over', ((lst.out.matches ?? []) as { match_id: string; over: boolean }[]).some((x) => x.match_id === id && x.over));

  // The live page's Take turn (owner, 2026-11-03): the AI drafts, the person approves on the page, signed in.
  {
    const st2 = await tool(BASE, a.access_token, 'minpentai_start_solo', { ruleset: 'book', level: 1 });
    const id2 = st2.out.match_id as string, live2 = st2.out.live_url as string;
    const v0 = st2.out.view as unknown as View, cell = fromRows(v0.can_place)[0];
    const draft = await tool(BASE, a.access_token, 'minpentai_submit_orders', { match_id: id2, turn: 0, placements: [{ piece: 'tower', x: cell[0], y: cell[1] }], source: 'agent', final: false });
    check('M35 the AI drafts without final', draft.ok, draft.error ?? '');
    const page0 = await (await fetch(live2)).text();
    check('M36 the live page shows the draft with its cost and the Take turn control', /drafted this turn/.test(page0) && /of \d+ points/.test(page0));
    const take = (token: string | null, turn = 0) => fetch(`${BASE}/api/minpentai/m/${id2}/take-turn`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ turn }) });
    const noAuth = await take(null), other = await take(people.B.token), stranger = await take(people.C.token);
    check('M37 the link alone can\'t take a turn; another invited person or a stranger is told there is no such match', noAuth.status === 401 && other.status === 404 && stranger.status === 404, `${noAuth.status}/${other.status}/${stranger.status}`);
    const still = await tool(BASE, a.access_token, 'minpentai_get_view', { match_id: id2 });
    check('M38 nothing was taken by them', (still.out as unknown as View).turn === 0);
    const t0 = Date.now(), mine = await take(people.A.token), body = (await mine.json()) as { ok?: boolean; error?: string };
    check('M39 the match\'s person, signed in, takes the turn on the page', mine.ok && body.ok === true, body.error ?? String(mine.status));
    const after = await tool(BASE, a.access_token, 'minpentai_get_view', { match_id: id2 });
    const turns2 = (after.out.my_turns ?? []) as { turn: number; source: string; taken_on_the_live_page?: boolean; drafted_by?: string }[];
    const sum2 = after.out.last_turn_summary as { turn: number; lines: string[] } | null;
    check('M40 get_view shows the AI the turn was taken on the page, as the person\'s, drafted by the AI, and its summary', (after.out as unknown as View).turn === 1 && turns2[0]?.source === 'person' && turns2[0]?.taken_on_the_live_page === true && turns2[0]?.drafted_by === 'agent' && !!sum2 && /took this turn on the live page/.test(sum2.lines[0] ?? ''), JSON.stringify({ t: turns2[0], s: sum2?.lines?.[0] }));
    const again = await take(people.A.token, 0), againBody = (await again.json()) as { error?: string };
    check('M41 a second Take turn for a turn already played is refused in the engine\'s words', again.status === 400 && /is not open/.test(againBody.error ?? ''), againBody.error ?? '');
    const nodraft = await take(people.A.token, 1), nodraftBody = (await nodraft.json()) as { error?: string };
    check('M42 with no draft there is nothing to take', nodraft.status === 400 && /no draft/.test(nodraftBody.error ?? ''), nodraftBody.error ?? '');
    const page1 = await (await fetch(live2)).text();
    // The page's own wording (2026-11-11): "You took this turn here, approving your AI's draft.", never the AI's "Your person took this turn…", and not as a lead line.
    check('M43 the live page shows the turn just played, ready to replay in place, with its summary in the page\'s words', /Watch turn 0 again in 2D/.test(page1) && /what your side saw/.test(page1) && /You took this turn here, approving your AI/.test(page1) && !/Your person took this turn|you \(their AI\)/.test(page1));
    void t0;
  }
} finally {
  await S.stop();
}

console.log(`\nminpentai agent play over the connector: ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log('  - ' + f); process.exit(1); }
