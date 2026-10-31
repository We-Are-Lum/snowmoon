/**
 * Agent play over the real connector (draft, 2026-10-31): the built site under `next start` with every migration
 * (NEXT_minpentai_agent_matches.sql included) in PGlite, the "play" scope switched on for the test only
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

process.env.MINPENTAI_PLAY_TEST = '1';
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++; else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}${!ok && detail ? ` (${detail})` : ''}`);
};

const S = await startStage();
const { BASE, people } = S;
type View = { turn: number; phase: string; step: number; can_place: [number, number][]; board: { towers: { x: number; y: number; side: string }[]; squares: { side: string; x: number; y: number }[]; gliders: { side: string; x: number; y: number }[] }; opponent_commitment: string | null; end: { win: string } | null };

try {
  // Scopes: "play" only when asked for, and only then are the tools listed.
  const plain = await connect(BASE, people.A.token, 'Claude');
  const listPlain = await mcp(BASE, plain.access_token, 'tools/list');
  check('M1 an agent connected without "play" sees no Minpentai tool', !(listPlain.body?.result?.tools ?? []).some((t) => t.name.startsWith('minpentai_')), JSON.stringify(listPlain.body).slice(0, 200));
  const refused = await tool(BASE, plain.access_token, 'minpentai_start_solo', {});
  check('M2 and can\'t call one', !refused.ok && /"play" scope/.test(refused.error ?? ''), refused.error ?? '');
  const a = await connect(BASE, people.A.token, 'Claude', 'read play');
  const init = await mcp(BASE, a.access_token, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'scripted-agent', version: '1' } });
  check('M3 initialize answers as an MCP server', !!(init.body?.result as { serverInfo?: unknown })?.serverInfo);
  const names = ((await mcp(BASE, a.access_token, 'tools/list')).body?.result?.tools ?? []).map((t) => t.name);
  const want = ['minpentai_start_solo', 'minpentai_list_my_matches', 'minpentai_get_view', 'minpentai_simulate', 'minpentai_submit_orders', 'minpentai_let_site_play_turn', 'minpentai_set_standing_order', 'minpentai_resign', 'minpentai_new_live_link', 'minpentai_get_record'];
  check('M4 an agent given "play" sees the Minpentai tools', want.every((n) => names.includes(n)), names.join(','));

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
  const theirsSubmit = await tool(BASE, b.access_token, 'minpentai_submit_orders', { match_id: id, turn: 0, placements: [], source: 'agent', final: true });
  check('M9 nor submit to it', !theirsSubmit.ok && theirsSubmit.error === made.error);
  const early = await tool(BASE, b.access_token, 'minpentai_get_record', { match_id: id });
  const none = await tool(BASE, b.access_token, 'minpentai_get_record', { match_id: 'zzzzzzzzzzzz' });
  check('M10 no record before the end, in the same words as for no match', !early.ok && early.error === none.error, `${early.error} / ${none.error}`);

  let turns = 0, simulated = 0, sitePlayed = false;
  const finals: number[] = [];
  for (;;) {
    const g = await tool(BASE, a.access_token, 'minpentai_get_view', { match_id: id });
    const v = g.out as unknown as View;
    if (!g.ok || v.phase === 'over') break;
    if (turns === 0) {
      const page = await (await fetch(live)).text();
      check('M11 the live link opens with its secret, and says it shows one side only', /Minpentai: your side/.test(page) && /Only your side is shown/.test(page));
      const bad = await fetch(live.replace(/k=.*/, 'k=wrongwrongwrongwrong'));
      check('M12 a wrong secret opens nothing', bad.status === 404);
    }
    // The scripted agent: two plans, compared in the sandbox against a guess, then the better one sent.
    const east = [...v.can_place].sort((p, q) => q[0] - p[0] || p[1] - q[1]);
    const plans = { tower: east.length ? [{ piece: 'tower', x: east[0][0], y: east[0][1] }] : [], glider: east.length ? [{ piece: 'glider', x: east[0][0], y: east[0][1], dir: 'E' }] : [] };
    const sim = await tool(BASE, a.access_token, 'minpentai_simulate', { match_id: id, scenarios: Object.entries(plans).map(([name, placements]) => ({ name, placements })) });
    if (sim.ok) simulated++;
    const sc = (sim.out.scenarios ?? []) as { name: 'tower' | 'glider'; legal: boolean; result?: { my_towers: { now: number } } }[];
    const best = sc.filter((s) => s.legal).sort((p, q) => q.result!.my_towers.now - p.result!.my_towers.now)[0];
    if (turns === 3) {
      const sp = await tool(BASE, a.access_token, 'minpentai_let_site_play_turn', { match_id: id, turn: v.turn });
      sitePlayed = sp.ok;
      check('M13 the site computer plays a turn for the person when asked', sp.ok, sp.error ?? '');
    } else {
      const wrong = turns === 1 ? await tool(BASE, a.access_token, 'minpentai_submit_orders', { match_id: id, turn: v.turn + 1, placements: [], source: 'agent' }) : null;
      if (wrong) check('M14 orders for a turn that isn\'t open are refused', !wrong.ok && /is not open/.test(wrong.error ?? ''), wrong.error ?? '');
      const t0 = Date.now();
      const sub = await tool(BASE, a.access_token, 'minpentai_submit_orders', { match_id: id, turn: v.turn, placements: best ? plans[best.name] : [], source: 'agent', final: true });
      finals.push(Date.now() - t0);
      if (!sub.ok) { check(`M15 turn ${v.turn} accepted`, false, sub.error ?? ''); break; }
      if (turns === 0) check('M15 orders accepted with a commitment', /^[0-9a-f]{64}$/.test(String(sub.out.commitment)));
    }
    turns++;
    if (turns > 30) break;
  }
  check('M22 every final submit takes at least the fixed time, so its time says nothing about the computer\'s hidden pieces', finals.length > 2 && Math.min(...finals) >= 390 && Math.max(...finals) - Math.min(...finals) < 150, finals.join(','));
  check('M16 the match is played to the end through the tools', turns >= 3 && simulated >= 3 && sitePlayed, `${turns} turns, ${simulated} simulations`);
  const rec = await tool(BASE, b.access_token, 'minpentai_get_record', { match_id: id });
  check('M17 at the end the record opens, to anyone', rec.ok, rec.error ?? '');
  const recTurns = (rec.out.turns ?? []) as { turn: number; C: { placements: { piece: string; x: number; y: number; dir?: string; slant?: string }[]; salt: string; commitment: string; source: string }; A: { salt: string; commitment: string } }[];
  check('M18 the record shows who chose each turn, the site computer\'s turn included', recTurns.some((t) => t.C.source === 'site-computer') && recTurns.some((t) => t.C.source === 'agent'));
  const committed = (st.out.view as { opponent: { random_commitment: string } }).opponent.random_commitment;
  check('M23 the record reveals the computer\'s random value, matching the commitment shown at the start', /^[0-9a-f]{64}$/.test(String(rec.out.computer_random)) && rec.out.computer_random_commitment === committed && createHash('sha256').update(String(rec.out.computer_random)).digest('hex') === committed);
  check('M19 every commitment in the record has its salt', recTurns.length > 0 && recTurns.every((t) => /^[0-9a-f]{64}$/.test(t.C.salt) && /^[0-9a-f]{64}$/.test(t.A.salt) && /^[0-9a-f]{64}$/.test(t.C.commitment)));
  const after = await (await fetch(live)).text();
  check('M20 after the end the live link shows the whole board', /The whole board at the end/.test(after));
  // The table (NEXT_minpentai_agent_matches.sql v2): the exact ruleset, updated_at stamped on every save, nobody but the server reads it, and the server can't delete.
  const row = (await S.pg.query<{ ruleset: string; level: number; stamped: boolean }>(`select ruleset, level, updated_at > created_at as stamped from studio.mp_agent_matches where id = $1`, [id])).rows[0];
  check('M24 the match is stored under its exact ruleset and level', row?.ruleset === 'book-1' && row.level === 2, JSON.stringify(row));
  check('M25 every save stamps updated_at', row?.stamped === true);
  const priv = (await S.pg.query<Record<string, boolean>>(`select has_table_privilege('anon', 'studio.mp_agent_matches', 'select') as a, has_table_privilege('authenticated', 'studio.mp_agent_matches', 'select') as b, has_table_privilege('studio_writer', 'studio.mp_agent_matches', 'delete') as c, has_table_privilege('service_role', 'studio.mp_agent_matches', 'delete') as d, has_table_privilege('service_role', 'studio.mp_agent_matches', 'truncate') as e`)).rows[0];
  check('M26 anon and authenticated can\'t read the table; neither the server nor the service_role key can delete from it', priv && !priv.a && !priv.b && !priv.c && !priv.d && !priv.e, JSON.stringify(priv));
  const recBody = JSON.stringify(rec.out);
  // The person's id as a whole JSON value (it is -3 here, which also appears inside timestamps), their address, their agent's name.
  const idAsValue = new RegExp(`[:\\[,]${people.A.person}[,\\]}]`);
  check('M27 the public record names neither the person nor their agent', !recBody.includes('Claude') && !idAsValue.test(recBody) && !recBody.toLowerCase().includes(people.A.address.toLowerCase()) && !/"agent":/.test(recBody), JSON.stringify({ claude: recBody.includes('Claude'), id: idAsValue.test(recBody), addr: recBody.toLowerCase().includes(people.A.address.toLowerCase()), agentKey: /"agent":/.test(recBody) }));
  const lst = await tool(BASE, a.access_token, 'minpentai_list_my_matches', {});
  check('M21 the person\'s matches list it as over', ((lst.out.matches ?? []) as { match_id: string; over: boolean }[]).some((x) => x.match_id === id && x.over));
} finally {
  await S.stop();
}

console.log(`\nminpentai agent play over the connector: ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log('  - ' + f); process.exit(1); }
