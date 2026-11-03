// Probe 8: over the real /mcp (next start + PGlite, as scripts/test-minpentai-agent-mcp.ts), time each
// submit_orders with final:true (the site computer plans its next turn inside that call), then after resigning
// read the record, replay it, and compare each call's time with the hidden state the computer planned from.
// Also: another person's agent on a live match, get_record before the end, the live page with a wrong secret.
import { startStage, connect, tool } from '/Users/nathan/snowmoon-book-edition/scripts/lib/agents-harness';
import { rulesOf, type SoloMatch } from '/Users/nathan/snowmoon-book-edition/src/lib/minpentai/agent-play/solo';
import { engine, verdict } from '/Users/nathan/snowmoon-book-edition/src/lib/minpentai/versions/engine';
process.env.MINPENTAI_PLAY_TEST = '1';
const S = await startStage();
const { BASE, people } = S;
try {
  const a = await connect(BASE, people.A.token, 'Claude', 'read play');
  const b = await connect(BASE, people.B.token, 'Claude', 'read play');
  const level = Number(process.env.LEVEL ?? 5);
  const st = await tool(BASE, a.access_token, 'minpentai_start_solo', { ruleset: 'book', level });
  const id = st.out.match_id as string;
  const other = await tool(BASE, b.access_token, 'minpentai_get_view', { match_id: id });
  const otherSim = await tool(BASE, b.access_token, 'minpentai_simulate', { match_id: id, scenarios: [{ name: 'x', placements: [] }] });
  const rec = await tool(BASE, b.access_token, 'minpentai_get_record', { match_id: id });
  const recMine = await tool(BASE, a.access_token, 'minpentai_get_record', { match_id: id });
  console.log('other person get_view:', other.error, '| simulate:', otherSim.error, '| record (other):', rec.error, '| record (own, live):', recMine.error);
  // Baseline: a read that doesn't plan (get_view) and a non-final submit, for network/DB noise.
  const t = async (f: () => Promise<unknown>) => { const s0 = performance.now(); await f(); return performance.now() - s0; };
  const noise: number[] = [];
  for (let i = 0; i < 10; i++) noise.push(await t(() => tool(BASE, a.access_token, 'minpentai_submit_orders', { match_id: id, turn: 0, placements: [], source: 'agent' })));
  noise.sort((x, y) => x - y);
  console.log(`non-final submit (no planning): median ${noise[5].toFixed(0)} ms, min ${noise[0].toFixed(0)}, max ${noise[9].toFixed(0)}`);
  const lat: number[] = [];
  for (let turn = 0; turn < 9; turn++) {
    const v = (await tool(BASE, a.access_token, 'minpentai_get_view', { match_id: id })).out as { phase: string; turn: number; can_place: [number, number][] };
    if (v.phase === 'over') break;
    // Cyan: a tower when it can at setup, then nothing (so the timing reflects the computer's side).
    const ps = turn === 0 && v.can_place.length ? [{ piece: 'tower', x: v.can_place[v.can_place.length - 1][0], y: v.can_place[v.can_place.length - 1][1] }] : [];
    lat.push(await t(() => tool(BASE, a.access_token, 'minpentai_submit_orders', { match_id: id, turn: v.turn, placements: ps, source: 'agent', final: true })));
  }
  const v = (await tool(BASE, a.access_token, 'minpentai_get_view', { match_id: id })).out as { phase: string };
  if (v.phase !== 'over') await tool(BASE, a.access_token, 'minpentai_resign', { match_id: id });
  const r = (await tool(BASE, a.access_token, 'minpentai_get_record', { match_id: id })).out as { seed: number; turns: { step: number }[] };
  // Replay with the engine to learn the computer's hidden state after each resolve (what it planned from).
  const { s, e } = rulesOf({ ruleset: 'book', seed: r.seed } as SoloMatch);
  const PIECE: Record<string, string> = { glider: 'g', square: 's', tower: 't', mirror: 'm', symbol_glider: 'e', moving_wall: 'w', factory: 'f' };
  const D: Record<string, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0], NE: [1, -1], SE: [1, 1], SW: [-1, 1], NW: [-1, -1] };
  const conv = (o: 'C' | 'A', ps: { piece: string; x: number; y: number; dir?: string; slant?: string }[]) => ps.map((p) => ({ t: PIECE[p.piece], o, x: p.x, y: p.y, dx: p.dir ? D[p.dir][0] : p.slant ? (p.slant === '/' ? 1 : -1) : 0, dy: p.dir ? D[p.dir][1] : 0 })) as never;
  const w = e.world(s);
  const rows: string[] = [];
  (r as any).turns.forEach((h: any, i: number) => {
    e.apply(w, s, { C: conv('C', h.C.placements), A: conv('A', h.A.placements) });
    const from = w.step; do { e.step(w, s); if (verdict(e, w, s)) break; } while (w.step - from < s.every);
    const view = e.fog(w, s, 'A');
    const opts = e.legal(view, s, 'A', e.towers(w, 'A'), s.points).length;
    if (lat[i] !== undefined) rows.push(`turn ${h.turn}: ${lat[i].toFixed(0)} ms; computer then had ${e.towers(w, 'A').length} towers, ${opts} legal single placements, ${w.gl.length} gliders on the board`);
  });
  console.log(rows.join('\n'));
} finally { await S.stop?.(); process.exit(0); }
