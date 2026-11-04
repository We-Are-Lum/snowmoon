/**
 * A recording of the 3D replay (owner, 2026-11-03: "show me a recording before asking to merge"), from a local match as
 * in record-minpentai-live-flow.ts: on a phone (3D by default, one tap to 2D and back) and on a desktop (2D and 3D side
 * by side), then the end: resign, and the last turn on the whole board in 3D with no cloud.
 *
 *   npx next build && npx tsx --conditions=react-server scripts/record-minpentai-replay-3d.ts [out-dir]
 *
 * Local only: it needs the agent tests' switches, which are never on on Vercel.
 */
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';

process.env.MINPENTAI_PLAY_TEST = '1';
process.env.MINPENTAI_DRAFTS_TEST_PEOPLE = '-3';
const { startStage, connect, tool } = await import('./lib/agents-harness');
const OUT = process.argv[2] ?? '/tmp/minpentai-replay-3d';
mkdirSync(OUT, { recursive: true });

const S = await startStage();
const { BASE, people } = S;
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
try {
  const a = await connect(BASE, people.A.token, 'Claude', 'read play');
  type V = { turn: number; phase: string; can_place: [number, number][] };
  const draft = async (id: string) => {
    const v = (await tool(BASE, a.access_token, 'minpentai_get_view', { match_id: id })).out as unknown as V;
    const east = [...v.can_place].sort((p, q) => q[0] - p[0] || p[1] - q[1]);
    const placements = v.turn === 0 ? east.slice(0, 2).map(([x, y]) => ({ piece: 'tower', x, y })) : east.filter((_, i) => i % 3 === 0).slice(0, 2).map(([x, y]) => ({ piece: 'glider', x, y, dir: 'E' }));
    const d = await tool(BASE, a.access_token, 'minpentai_submit_orders', { match_id: id, turn: v.turn, placements, source: 'agent', final: false });
    if (!d.ok) throw new Error(`draft turn ${v.turn}: ${d.error}`);
  };
  const run = async (name: string, width: number, height: number, turns: number, extra: (page: Page, t: number) => Promise<void>, end: boolean) => {
    const st = await tool(BASE, a.access_token, 'minpentai_start_solo', { ruleset: 'book-4', level: 2, model: { name: 'Scripted AI', maker: 'this recording', weights: 'open' } });
    if (!st.ok) throw new Error(`start: ${st.error}`);
    const id = st.out.match_id as string, live = st.out.live_url as string;
    const dir = path.join(OUT, name);
    mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: name === 'phone' ? 2 : 1, recordVideo: { dir, size: { width, height } } });
    await ctx.addInitScript(([token, address]: readonly [string, string]) => {
      const exp = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp;
      localStorage.setItem('snowmoon.wallet', JSON.stringify({ token, address: address.toLowerCase(), short: address.slice(0, 6), exp }));
    }, [people.A.token, people.A.address] as const);
    const page = await ctx.newPage();
    for (let t = 0; t < turns; t++) {
      await draft(id);
      if (t === 0) await page.goto(live, { waitUntil: 'networkidle' });
      await page.locator('.mb-take-button').waitFor({ timeout: 20_000 });
      await page.waitForTimeout(2000);
      await page.getByRole('button', { name: 'Take turn' }).click();
      await page.getByRole('button', { name: 'Pause' }).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(OUT, `${name}-turn${t}-replay.png`) });
      await extra(page, t);
      await page.getByRole('button', { name: /^Replay turn/ }).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1500);
    }
    if (end) {
      await tool(BASE, a.access_token, 'minpentai_resign', { match_id: id });
      await page.goto(live, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await page.getByRole('button', { name: /^Replay turn/ }).click();
      await page.waitForTimeout(8000);
      await page.screenshot({ path: path.join(OUT, `${name}-end-whole-board.png`) });
    }
    await ctx.close();
    const vid = readdirSync(dir).find((f) => f.endsWith('.webm'));
    if (vid) renameSync(path.join(dir, vid), path.join(OUT, `${name}.webm`));
    console.log(`recorded: ${OUT}/${name}.webm`);
  };
  // Phone: 3D by default; on the second turn, 2D for a moment, then back to 3D.
  await run('phone', 390, 844, 3, async (page, t) => {
    if (t !== 1) return;
    await page.getByRole('button', { name: '2D', exact: true }).click();
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: '3D', exact: true }).click();
  }, true);
  await run('desktop', 1440, 900, 3, async () => {}, true);
} catch (e) {
  console.error('recording failed:', e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await S.stop?.();
  process.exit(process.exitCode ?? 0);
}
