/**
 * Real frame times of the live page's 3D action, in the browser (owner, 2026-11-04: "the 3D feels jerky; measure").
 * A local match (scripts/lib/agents-harness.ts, as the recordings), a turn taken on the live page, and every animation
 * frame's time recorded while its action plays in 3D, at phone settings (390 × 844 at 3x, the CPU slowed 4x, roughly a
 * mid-range phone) and desktop settings (1440 × 900 at 2x). Prints the median, the 95th and 99th percentiles, the
 * share of frames over 20 ms (a dropped frame at 60 Hz) and the longest, for the page and for the scene's own work.
 *
 *   npx next build && npx tsx --conditions=react-server scripts/measure-minpentai-3d-frames.ts
 *
 * Local only. Headless Chrome on this Mac with its GPU (Metal): a guide to where time goes, not a phone's numbers.
 */
import { chromium } from 'playwright-core';

process.env.MINPENTAI_PLAY_TEST = '1';
process.env.MINPENTAI_DRAFTS_TEST_PEOPLE = '-3';
const { startStage, connect, tool } = await import('./lib/agents-harness');

const S = await startStage();
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  return { frames: s.length, median: +q(.5).toFixed(1), p95: +q(.95).toFixed(1), p99: +q(.99).toFixed(1), over20: `${((100 * s.filter((x) => x > 20).length) / Math.max(1, s.length)).toFixed(1)}%`, longest: +(s.at(-1) ?? 0).toFixed(1) };
};
try {
  const a = await connect(S.BASE, S.people.A.token, 'Claude', 'read play');
  for (const size of [{ name: 'phone', width: 390, height: 844, dpr: 3, cpu: 4 }, { name: 'desktop', width: 1440, height: 900, dpr: 2, cpu: 1 }]) {
    const st = await tool(S.BASE, a.access_token, 'minpentai_start_solo', { ruleset: 'book-4', level: 2 });
    const id = st.out.match_id as string, live = st.out.live_url as string;
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr });
    await ctx.addInitScript(([token, address]: readonly [string, string]) => {
      const exp = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp;
      localStorage.setItem('snowmoon.wallet', JSON.stringify({ token, address: address.toLowerCase(), short: address.slice(0, 6), exp }));
      // The scene reports each frame's interval and its own work per frame (replay-scene.ts), when these exist.
      (window as unknown as { __frames: number[] }).__frames = [];
      (window as unknown as { __sceneMs: number[] }).__sceneMs = [];
    }, [S.people.A.token, S.people.A.address] as const);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: size.cpu });
    const results: Record<string, ReturnType<typeof stats>> = {};
    for (let t = 0; t < 3; t++) {
      const v = (await tool(S.BASE, a.access_token, 'minpentai_get_view', { match_id: id })).out as { turn: number; can_place: [number, number][] };
      const east = [...v.can_place].sort((p, q) => q[0] - p[0] || p[1] - q[1]);
      const placements = v.turn === 0 ? east.slice(0, 2).map(([x, y]) => ({ piece: 'tower', x, y })) : east.filter((_, i) => i % 3 === 0).slice(0, 2).map(([x, y]) => ({ piece: 'glider', x, y, dir: 'E' }));
      await tool(S.BASE, a.access_token, 'minpentai_submit_orders', { match_id: id, turn: v.turn, placements, source: 'agent', final: false });
      if (t === 0) await page.goto(live, { waitUntil: 'networkidle' });
      await page.locator('.mb-take-button').waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      await page.getByRole('button', { name: 'Take turn' }).click();
      await page.getByRole('button', { name: 'Pause' }).waitFor({ timeout: 40_000 });
      await page.evaluate(() => { (window as unknown as { __frames: number[] }).__frames = []; (window as unknown as { __sceneMs: number[] }).__sceneMs = []; });
      await page.getByRole('button', { name: /^Watch turn \d+ again in 2D/ }).waitFor({ timeout: 60_000 });
      if (t === 0) continue; // the first turn loads three.js; measure the next two
      const [fr, sc] = await page.evaluate(() => [(window as unknown as { __frames: number[] }).__frames, (window as unknown as { __sceneMs: number[] }).__sceneMs]);
      results[`turn ${t} frame`] = stats(fr);
      if (sc.length) results[`turn ${t} scene`] = stats(sc);
    }
    console.log(`\n${size.name} (${size.width}×${size.height} @${size.dpr}x, CPU ÷${size.cpu}):`);
    console.table(results);
    await tool(S.BASE, a.access_token, 'minpentai_resign', { match_id: id });
    await ctx.close();
  }
} finally {
  await browser.close();
  await S.stop();
  process.exit(0);
}
