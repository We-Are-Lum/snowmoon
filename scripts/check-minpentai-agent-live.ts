/**
 * Agent play against a live deployment (owner, 2026-11-01): a whole Rocks and Mirrors match played through the real
 * /mcp by a scripted agent, as the production test account (AGENTS.people.wallets; its key and session are kept on
 * the agent's machine in ~/.snowmoon-test, never in the repo), then the fog review's probes, against what production
 * actually answers. Read-only in the database: each match's real state is read in a read-only transaction and the
 * answers are checked against it; nothing is planted in production.
 *
 *   npm run check:minpentai-agent-live -- --url=https://snowmoon.party
 *
 * Checks, every turn: the view production sends is exactly the side's fog view of the real board and shows no enemy
 * piece out of sight; the sandbox answers the same as from the real board with every hidden enemy piece removed; a
 * refused placement says the same with them removed; a final submit takes the fixed time. At the end: the record
 * opens (not before), every commitment matches its orders and salt, the computer's random value matches its
 * commitment and recomputes every computer move, and the record names neither the person nor the agent.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import postgres from 'postgres';
import { requireTarget } from './lib/target';
import { checkComputer, ordersText, rulesOf, simulate, viewFor, type SoloMatch } from '../src/lib/minpentai/agent-play/solo';

const BASE = requireTarget('check:minpentai-agent-live');
const HOME = process.env.HOME + '/.snowmoon-test';
const session = readFileSync(`${HOME}/prod-test-session.txt`, 'utf8').trim();
const sql = postgres(process.env.STUDIO_DATABASE_URL!, { prepare: false, max: 1 });
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => { if (ok) passed++; else failures.push(`${label}${detail ? `: ${detail}` : ''}`); console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}${!ok && detail ? ` (${detail})` : ''}`); };
const real = async (id: string) => (await sql.begin('read only', (tx) => tx<{ state: SoloMatch }[]>`select state from studio.mp_agent_matches where id = ${id}`))[0]?.state;

/** The OAuth dance a connector does, against the live site, as the test account. */
async function connect(): Promise<string> {
  const { randomBytes } = await import('node:crypto');
  const redirect = 'http://127.0.0.1:53682/callback';
  const client = await (await fetch(`${BASE}/api/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Snowmoon live check', redirect_uris: [redirect], token_endpoint_auth_method: 'none' }) })).json() as { client_id: string };
  const verifier = randomBytes(32).toString('base64url'), challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: 'live', scope: 'read drafts images notes', resource: `${BASE}/mcp` });
  const ap = await fetch(`${BASE}/api/oauth/approve`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` }, body: JSON.stringify({ query: q.toString(), allow: true }) });
  const to = new URL(((await ap.json()) as { to: string }).to);
  const tok = await (await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: to.searchParams.get('code')!, code_verifier: verifier, client_id: client.client_id, redirect_uri: redirect, resource: `${BASE}/mcp` }) })).json() as { access_token: string };
  return tok.access_token;
}
let token = '';
const rpc = async (method: string, params: Record<string, unknown> = {}) => (await (await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json()) as { result?: { structuredContent?: Record<string, unknown>; isError?: boolean; content?: { text: string }[]; tools?: { name: string }[] } };
const tool = async (name: string, args: Record<string, unknown> = {}) => { const r = (await rpc('tools/call', { name, arguments: args })).result; return { ok: r?.isError === false, out: (r?.structuredContent ?? {}) as Record<string, any>, error: r?.isError ? r.content?.[0]?.text ?? '' : null }; };

/** The real board with every enemy piece the person's side can't see taken away (the "twin" the fog review compared with). */
function withoutHidden(m: SoloMatch): SoloMatch {
  const t = JSON.parse(JSON.stringify(m)) as SoloMatch, { s, e } = rulesOf(t), see = e.lit(t.w, 'C', s.sight);
  for (const k of Object.keys(t.w.tw)) if (t.w.tw[+k] === 'A' && !see.has(+k)) delete t.w.tw[+k];
  for (const k of Object.keys(t.w.sq)) if (t.w.sq[+k].o === 'A' && !see.has(+k)) delete t.w.sq[+k];
  t.w.gl = t.w.gl.filter((g) => g.o !== 'A' || see.has(e.K(g.x, g.y)));
  for (const f of ['mir', 'fa', 'fs'] as const) { const o = t.w[f] as Record<number, { o: string }> | undefined; if (o) for (const k of Object.keys(o)) if (o[+k].o === 'A' && !see.has(+k)) delete o[+k]; }
  if (t.w.sd) for (const k of Object.keys(t.w.sd)) if (t.w.sd[+k] === 'A' && !see.has(+k)) delete t.w.sd[+k];
  if (t.w.mw) t.w.mw = t.w.mw.filter((w) => w.o !== 'A' || e.wallCells(w).some(([x, y], i) => w.c[i] && e.inb(x, y) && see.has(e.K(x, y))));
  return t;
}

try {
  token = await connect();
  const names = ((await rpc('tools/list')).result?.tools ?? []).map((t) => t.name);
  check('the test account\'s agent gets the Minpentai tools (play added for invited people)', names.includes('minpentai_start_solo'), names.join(','));
  const st = await tool('minpentai_start_solo', { ruleset: 'book', level: Number(process.argv.find((a) => a.startsWith('--level='))?.slice(8) ?? 1), model: { name: 'Live check script', maker: 'snowmoon.party', weights: 'open' } });
  check('start a Rocks and Mirrors match', st.ok, st.error ?? '');
  const id = st.out.match_id as string, live = st.out.live_url as string;
  console.log(`  match ${id}`);
  await tool('minpentai_set_standing_order', { match_id: id, text: 'Play defensively; keep the towers walled.', preset: 'defend' });
  const early = await tool('minpentai_get_record', { match_id: id }), none = await tool('minpentai_get_record', { match_id: 'zzzzzzzzzzzz' });
  check('no record before the end, in the same words as for no match', !early.ok && early.error === none.error);
  const page = await fetch(live), bad = await fetch(live.replace(/k=.*/, 'k=wrongwrongwrongwrongwr'));
  check('the live link opens with its secret, and a wrong secret opens nothing', page.ok && bad.status === 404, `${page.status}/${bad.status}`);
  const finals: number[] = [], plain: number[] = [];
  let turns = 0, viewOk = 0, simOk = 0, refOk = 0;
  for (;;) {
    const tg = Date.now();
    const g = await tool('minpentai_get_view', { match_id: id });
    plain.push(Date.now() - tg);
    const v = g.out;
    if (!g.ok || v.phase === 'over') break;
    const m = await real(id);
    // The view is exactly the fog view of the real board, and the same with every hidden enemy piece removed.
    const strip = (x: Record<string, unknown>) => ({ ...x, opponent_commitment: null, my_orders: null });
    if (isDeepStrictEqual(strip(JSON.parse(JSON.stringify(viewFor(m)))), strip(v)) && isDeepStrictEqual(strip(JSON.parse(JSON.stringify(viewFor(withoutHidden(m))))), strip(v))) viewOk++;
    else check(`turn ${v.turn}: the view is the side's fog view, whatever is hidden`, false);
    // The sandbox: production's answer equals the answer from the real board with the hidden pieces removed.
    const east = [...(v.can_place as [number, number][])].sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    const sc = { scenarios: [{ name: 'tower', placements: east.length ? [{ piece: 'tower', x: east[0][0], y: east[0][1] }] : [] }, { name: 'symbols', placements: east.length > 2 ? [0, 1, 2].map((i) => ({ piece: 'symbol_glider', x: east[i][0], y: east[i][1], dir: 'E' })) : [] }, { name: 'mirror', placements: east.length ? [{ piece: 'mirror', x: east[0][0], y: east[0][1], slant: '/' }] : [] }], steps: Math.min(24, (v.max_steps as number) - (v.step as number)) };
    const sim = await tool('minpentai_simulate', { match_id: id, ...sc });
    if (sim.ok && isDeepStrictEqual(JSON.parse(JSON.stringify(simulate(withoutHidden(m), sc as never))), sim.out)) simOk++;
    else check(`turn ${v.turn}: the sandbox doesn't depend on hidden pieces`, false, sim.error ?? '');
    // A refusal: a square at the far edge (out of reach). Same words with the hidden pieces removed.
    const far = await tool('minpentai_submit_orders', { match_id: id, turn: v.turn, placements: [{ piece: 'square', x: 22, y: 7 }], source: 'agent' });
    const { e, s } = rulesOf(m), tw = withoutHidden(m);
    const localWhy = e.refuse(tw.w, s, 'C', e.towers(tw.w, 'C'), v.points as number, [{ t: 's', o: 'C', x: 22, y: 7, dx: 0, dy: 0 }]);
    if (!far.ok && far.error === `not accepted: ${localWhy}`) refOk++;
    else check(`turn ${v.turn}: a refusal reads the same whatever is hidden`, false, `${far.error} vs ${localWhy}`);
    if (turns === 2) {
      const sp = await tool('minpentai_let_site_play_turn', { match_id: id, turn: v.turn });
      check('the site computer plays a turn for the person, under the standing order', sp.ok, sp.error ?? '');
    } else {
      const sc2 = (sim.out.scenarios ?? []) as { name: string; legal: boolean; result?: { my_towers: { now: number } } }[];
      const best = sc2.filter((x) => x.legal).sort((a, b) => b.result!.my_towers.now - a.result!.my_towers.now)[0];
      const pick = best ? sc.scenarios.find((x) => x.name === best.name)!.placements : [];
      const t0 = Date.now();
      const sub = await tool('minpentai_submit_orders', { match_id: id, turn: v.turn, placements: pick, source: 'agent', final: true });
      finals.push(Date.now() - t0);
      if (!sub.ok) { check(`turn ${v.turn} accepted`, false, sub.error ?? ''); break; }
    }
    turns++;
    if (turns > 40) break;
  }
  check(`every turn's view was the side's fog view, whatever was hidden (${viewOk} of ${turns})`, viewOk === turns && turns > 3);
  check(`every turn's sandbox answer was the same without the hidden pieces (${simOk} of ${turns})`, simOk === turns);
  check(`every turn's refusal read the same without the hidden pieces (${refOk} of ${turns})`, refOk === turns);
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
  console.log(`  get_view (plans nothing): ${plain.join(', ')} ms; final submits: ${finals.join(', ')} ms`);
  check(`final submits take the fixed time, over the network (${finals.join(', ')} ms)`, finals.length > 2 && Math.min(...finals) >= 395);
  // The padding hides planning only if every final submit's time above the network's is the same: spread within the
  // spread of calls that plan nothing.
  const spreadF = Math.max(...finals) - Math.min(...finals), spreadP = Math.max(...plain) - Math.min(...plain);
  check(`final submits vary no more than calls that plan nothing (final spread ${spreadF} ms, plain ${spreadP} ms, medians ${med(finals)} / ${med(plain)} ms)`, spreadF <= Math.max(150, spreadP * 1.5));
  const rec = await tool('minpentai_get_record', { match_id: id });
  check('at the end the record opens', rec.ok, rec.error ?? '');
  const m = await real(id);
  check('every commitment in the record matches its orders and salt', m.history.every((h) => (['C', 'A'] as const).every((o) => createHash('sha256').update(ordersText(h[o].placements) + h[o].salt).digest('hex') === h[o].commitment)));
  check('the computer\'s random value matches its commitment and recomputes every computer move', rec.out.computer_random_commitment === createHash('sha256').update(String(rec.out.computer_random)).digest('hex') && checkComputer(m).length === 0, checkComputer(m).join('; '));
  const body = JSON.stringify(rec.out);
  check('the record names neither the person nor the agent', !/"agent":/.test(body) && !body.includes('Snowmoon live check') && !/[:\[,]-23[,\]}]/.test(body) && !body.toLowerCase().includes('0xe86987cc'));
  console.log(`  ${turns} turns; ended ${JSON.stringify(m.end)}; pieces placed by Cyan: ${JSON.stringify(m.history.flatMap((h) => h.C.placements.map((p) => p.t)).reduce((a: Record<string, number>, t) => ((a[t] = (a[t] ?? 0) + 1), a), {}))}; by Amber: ${JSON.stringify(m.history.flatMap((h) => h.A.placements.map((p) => p.t)).reduce((a: Record<string, number>, t) => ((a[t] = (a[t] ?? 0) + 1), a), {}))}`);
} finally {
  await sql.end();
}
console.log(`\nagent play live: ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log('  - ' + f); process.exit(1); }
