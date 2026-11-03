/**
 * A recording of the live-page flow (owner, 2026-11-03: "talk to the AI about the move, go to the page to see the move,
 * then click take turn to see the next move play out, and see the other player's gliders fly"), from a local match:
 * the harness's local server and database (scripts/lib/agents-harness.ts), a scripted AI drafting through the real
 * /mcp, and a browser signed in as the match's person taking each turn on the live page.
 *
 *   npx next build && npx tsx --conditions=react-server scripts/record-minpentai-live-flow.ts [out-dir]
 *
 * Local only: it needs the agent tests' switches, which are never on on Vercel.
 */
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

process.env.MINPENTAI_PLAY_TEST = '1';
// The harness's person A is -3 in its fresh database (test-minpentai-agent-mcp.ts M29); the server it starts inherits this.
process.env.MINPENTAI_DRAFTS_TEST_PEOPLE = '-3';
const { startStage, connect, tool } = await import('./lib/agents-harness');
const OUT = process.argv[2] ?? '/tmp/minpentai-live-flow';
mkdirSync(OUT, { recursive: true });

const S = await startStage();
if (S.people.A.person !== -3) throw new Error(`person A is ${S.people.A.person}, not -3`);
const { BASE, people } = S;
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const a = await connect(BASE, people.A.token, 'Claude', 'read play');
  const st = await tool(BASE, a.access_token, 'minpentai_start_solo', { ruleset: 'book-4', level: 2, model: { name: 'Scripted AI', maker: 'this recording', weights: 'open' } });
  if (!st.ok) throw new Error(`start: ${st.error}`);
  const id = st.out.match_id as string, live = st.out.live_url as string;
  console.log(`match ${id}`);

  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, recordVideo: { dir: OUT, size: { width: 820, height: 1180 } } });
  // Signed in as the match's person (a wallet sign-in, as the site keeps it).
  await ctx.addInitScript(([token, address]: readonly [string, string]) => {
    const exp = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp;
    localStorage.setItem('snowmoon.wallet', JSON.stringify({ token, address: address.toLowerCase(), short: address.slice(0, 6), exp }));
  }, [people.A.token, people.A.address] as const);
  const page = await ctx.newPage();

  type V = { turn: number; phase: string; can_place: [number, number][] };
  for (let t = 0; t < 5; t++) {
    const v = (await tool(BASE, a.access_token, 'minpentai_get_view', { match_id: id })).out as unknown as V;
    if (v.phase === 'over') break;
    // The scripted AI: towers at setup, then three symbol gliders from the helper, then gliders east.
    const east = [...v.can_place].sort((p, q) => q[0] - p[0] || p[1] - q[1]);
    let placements: Record<string, unknown>[] = [];
    if (t === 0) placements = east.slice(0, 2).map(([x, y]) => ({ piece: 'tower', x, y }));
    else if (t === 1) {
      // Ask the helper for three launches that form a symbol, trying squares beside rocks until one works.
      let opt: { launches: Record<string, unknown>[] } | undefined;
      for (const [x, y] of [[8, 2], [4, 6], [4, 7], [8, 11], [6, 9], [10, 4], [9, 3]]) {
        const help = await tool(BASE, a.access_token, 'minpentai_symbol_launches', { match_id: id, x, y });
        opt = ((help.out.options ?? []) as { launches: Record<string, unknown>[] }[])[0];
        if (opt) { console.log(`  the helper's launches for (${x}, ${y})`); break; }
      }
      placements = opt ? opt.launches : east.slice(0, 1).map(([x, y]) => ({ piece: 'glider', x, y, dir: 'E' }));
    } else placements = east.filter((_, i) => i % 3 === 0).slice(0, 2).map(([x, y]) => ({ piece: 'glider', x, y, dir: 'E' }));
    const d = await tool(BASE, a.access_token, 'minpentai_submit_orders', { match_id: id, turn: v.turn, placements, source: 'agent', final: false });
    if (!d.ok) throw new Error(`draft turn ${v.turn}: ${d.error}`);
    console.log(`turn ${v.turn}: the AI drafted ${placements.length} placements`);

    await page.goto(live, { waitUntil: 'networkidle' });
    await page.getByText('drafted these orders').scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500); // the draft on the board, its cost and any warnings
    await page.screenshot({ path: path.join(OUT, `turn-${v.turn}-draft.png`), fullPage: true });
    await page.getByRole('button', { name: 'Take turn' }).click();
    await page.getByText('Last turn, step by step').waitFor({ timeout: 30_000 });
    await page.getByText('Last turn, step by step').scrollIntoViewIfNeeded();
    await page.waitForTimeout(7000); // the replay plays its 13 frames
    await page.screenshot({ path: path.join(OUT, `turn-${v.turn}-replay.png`), fullPage: true });
    const after = (await tool(BASE, a.access_token, 'minpentai_get_view', { match_id: id })).out as Record<string, any>;
    console.log(`  back in chat, get_view: turn ${after.turn}; ${after.my_turns.at(-1)?.taken_on_the_live_page ? 'taken on the live page' : '?'}; summary: ${after.last_turn_summary?.lines?.[0]}`);
  }
  // The end: resign, then the whole board's replay.
  await tool(BASE, a.access_token, 'minpentai_resign', { match_id: id });
  await page.goto(live, { waitUntil: 'networkidle' });
  await page.getByText('the whole board').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(7000);
  await page.screenshot({ path: path.join(OUT, 'end-whole-board.png'), fullPage: true });
  await ctx.close();
  const vid = readdirSync(OUT).find((f) => f.endsWith('.webm') && f !== 'live-flow.webm');
  if (vid) renameSync(path.join(OUT, vid), path.join(OUT, 'live-flow.webm'));
  console.log(`recorded: ${OUT}/live-flow.webm`);
} catch (e) {
  console.error('recording failed:', e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await S.stop?.();
  process.exit(process.exitCode ?? 0);
}
