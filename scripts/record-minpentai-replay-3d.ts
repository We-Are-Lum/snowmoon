/**
 * A recording of the 3D action (owner, 2026-11-04), filmed frame by frame: the page's clock (timers, animation frames,
 * performance.now) is Playwright's fake clock, stepped 1/60 s at a time with a screenshot after each step, and the
 * frames are encoded at 60 fps. So the video shows the motion as it is, not the recorder's dropped frames. Waiting
 * between the parts filmed (a turn being taken, the server answering) advances the clock without screenshots.
 *
 * From a local match as in record-minpentai-live-flow.ts. On a phone: turns whose action plays in 3D in the board's
 * place with their instant replays, Watch again in 2D at 2x, "Animate action in 3D" off for a turn played in 2D, a past
 * turn watched in 3D. On a desktop, the 3D view beside the 2D board: turns with their replays, then turns taken unfilmed
 * until the match ends, and the last turn's action and its final replay on the whole board.
 *
 *   npx next build && npx tsx --conditions=react-server scripts/record-minpentai-replay-3d.ts [out-dir]
 *
 * Local only: it needs the agent tests' switches, which are never on on Vercel. Needs ffmpeg.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Locator, type Page } from 'playwright-core';
import { fromRows } from '../src/lib/minpentai/agent-play/solo';

process.env.MINPENTAI_PLAY_TEST = '1';
process.env.MINPENTAI_DRAFTS_TEST_PEOPLE = '-3';
const { startStage, connect, tool } = await import('./lib/agents-harness');
const OUT = process.argv[2] ?? '/tmp/minpentai-replay-3d';
mkdirSync(OUT, { recursive: true });
const FRAME = 1000 / 60;

const S = await startStage();
const { BASE, people } = S;
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
try {
  const a = await connect(BASE, people.A.token, 'Claude', 'read play');
  type V = { turn: number; phase: string; can_place: string[] };
  const draft = async (id: string, t: number, passive = false) => {
    const v = (await tool(BASE, a.access_token, 'minpentai_get_view', { match_id: id })).out as unknown as V;
    if (v.phase === 'over') return -1;
    const east = [...fromRows(v.can_place)].sort((p, q) => q[0] - p[0] || p[1] - q[1]);
    // Towers at setup; then gliders east from rows that change each turn, so they reach the enemy's side.
    const placements = passive ? [] : v.turn === 0 ? east.slice(0, 2).map(([x, y]) => ({ piece: 'tower', x, y })) : east.filter((_, i) => (i + t) % 3 === 0).slice(0, 2).map(([x, y]) => ({ piece: 'glider', x, y, dir: 'E' }));
    const d = await tool(BASE, a.access_token, 'minpentai_submit_orders', { match_id: id, turn: v.turn, placements, source: 'agent', final: false });
    if (!d.ok) throw new Error(`draft turn ${v.turn}: ${d.error}`);
    return v.turn;
  };
  const film = async (name: string, width: number, height: number, script: (f: Filmer) => Promise<void>) => {
    const st = await tool(BASE, a.access_token, 'minpentai_start_solo', { ruleset: 'book-4', level: 3, model: { name: 'Scripted AI', maker: 'this recording', weights: 'open' } });
    if (!st.ok) throw new Error(`start: ${st.error}`);
    const id = st.out.match_id as string, live = st.out.live_url as string;
    const dir = path.join(OUT, `${name}-frames`);
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: name === 'phone' ? 2 : 1 });
    await ctx.addInitScript(([token, address]: readonly [string, string]) => {
      const exp = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp;
      localStorage.setItem('snowmoon.wallet', JSON.stringify({ token, address: address.toLowerCase(), short: address.slice(0, 6), exp }));
    }, [people.A.token, people.A.address] as const);
    const page = await ctx.newPage();
    await page.clock.install();
    let n = 0;
    const f: Filmer = {
      page, id, live,
      mark: () => n,
      cut(from) { for (let k = from; k < n; k++) unlinkSync(path.join(dir, `${String(k).padStart(6, '0')}.jpg`)); n = from; },
      async shoot(ms) { for (let k = 0; k < Math.round(ms / FRAME); k++) { await page.clock.runFor(FRAME); await page.screenshot({ path: path.join(dir, `${String(n++).padStart(6, '0')}.jpg`), type: 'jpeg', quality: 88 }); } },
      async until(loc, max = 60_000, shoot = true) {
        for (let waited = 0; waited < max; waited += shoot ? FRAME * 6 : 250) {
          if (await loc.isVisible().catch(() => false)) return;
          if (shoot) await f.shoot(FRAME * 6); else await page.clock.runFor(250);
          if (!shoot) await page.waitForTimeout(20);
        }
        throw new Error(`not seen in ${max} ms: ${loc}`);
      },
      async turn(t, shoot = true, passive = false) {
        const turn = await draft(id, t, passive);
        if (turn < 0) return false;
        await f.until(page.locator('.mb-take-button'), 60_000, shoot);
        if (shoot) await f.shoot(1500); // the plan, on the 2D board
        await page.getByRole('button', { name: 'Take turn' }).click();
        // Done when this turn's own Watch again shows (the last turn's shows until the new one arrives).
        await f.until(page.getByRole('button', { name: `Watch turn ${turn} again in 2D` }), 90_000, shoot);
        if (shoot) await f.shoot(800);
        return true;
      },
    };
    await draft(id, 0);
    await page.goto(live, { waitUntil: 'networkidle' });
    await page.clock.runFor(1000);
    await script(f);
    await ctx.close();
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60', '-i', path.join(dir, '%06d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', path.join(OUT, `${name}.mp4`)]);
    console.log(`recorded: ${OUT}/${name}.mp4 (${n} frames, ${(n / 60).toFixed(1)} s)`);
  };

  await film('phone', 390, 844, async (f) => {
    const { page } = f;
    for (let t = 0; t < 3; t++) await f.turn(t);
    // Watch again in 2D at 2x.
    await page.getByRole('button', { name: /^Watch turn \d+ again in 2D/ }).click();
    await page.getByRole('button', { name: '2x' }).click();
    await f.until(page.getByRole('button', { name: /^Watch turn \d+ again in 2D/ }));
    await f.shoot(600);
    // "Animate action in 3D" off: the next turn's action plays in 2D. Then back on.
    await page.getByLabel('Animate action in 3D').uncheck();
    await f.shoot(600);
    await f.turn(3);
    await page.getByLabel('Animate action in 3D').check();
    await f.shoot(400);
    // A past turn, watched in 3D in place.
    await page.locator('.mb-past-row').first().scrollIntoViewIfNeeded();
    await page.locator('.mb-past-row').first().click();
    await f.shoot(400);
    await page.getByRole('button', { name: /^Watch turn \d+ in 3D/ }).click();
    await f.shoot(4000);
  });

  await film('desktop', 1440, 900, async (f) => {
    const { page } = f;
    for (let t = 0; t < 3; t++) await f.turn(t);
    // Turns until the match is over; each filmed, and kept only if the match ended in it.
    let t = 3;
    for (; t < 40; t++) {
      const at = f.mark();
      // Placing nothing from here, so the computer can take the last tower: the match ends on a tower, not the clock.
      if (!(await f.turn(t, true, true))) break;
      if (await page.getByText(/^Over[: ]/).isVisible()) break;
      f.cut(at);
    }
    await f.until(page.getByText(/^Over[: ]/), 30_000);
    await f.shoot(1200);
    console.log(`  desktop: the match ended after ${t} turns`);
  });
} catch (e) {
  console.error('recording failed:', e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await S.stop?.();
  process.exit(process.exitCode ?? 0);
}

interface Filmer {
  page: Page; id: string; live: string;
  mark(): number;
  /** Drop the frames shot since `mark()`. */
  cut(from: number): void;
  /** Step the clock `ms`, a screenshot a frame. */
  shoot(ms: number): Promise<void>;
  /** Step until `loc` shows (filmed, or fast without screenshots). */
  until(loc: Locator, max?: number, shoot?: boolean): Promise<void>;
  /** Draft and take a turn on the page, through its action and replays. False once the match is over. */
  turn(t: number, shoot?: boolean, passive?: boolean): Promise<boolean>;
}
