/**
 * The live page's layout (owner, 2026-11-03): at 390 × 844 and on a desktop, the board, the Take turn button and the
 * replay's controls are all in view without scrolling, before and after taking a turn, and taking a turn plays the
 * replay in place (no scroll). A live match page needs a match, a signed-in player and an AI drafting, so this starts its
 * own local stage from the local build (scripts/lib/agents-harness.ts: a fresh database, the real /mcp), as the
 * recording does. Used by check:ui and scripts/record-minpentai-live-flow.ts.
 */
import type { Browser, Page } from 'playwright-core';

type Fail = (msg: string) => void;
const SIZES = [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }] as const;

/** Every element in view: fully inside the window, with the page not scrolled. */
async function inView(page: Page, at: string, fail: Fail, sels: [string, string][]) {
  const scrolled = await page.evaluate(() => window.scrollY);
  if (scrolled > 0) fail(`${at}: the page scrolled (${scrolled}px)`);
  const vh = page.viewportSize()!.height, vw = page.viewportSize()!.width;
  for (const [name, sel] of sels) {
    const b = await page.locator(sel).first().boundingBox();
    if (!b) { fail(`${at}: no ${name}`); continue; }
    if (b.y < 0 || b.y + b.height > vh + 1 || b.x < 0 || b.x + b.width > vw + 1) fail(`${at}: ${name} isn't all in view (${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}×${Math.round(b.height)} in ${vw}×${vh})`);
  }
}

/**
 * On a desktop the 3D view stays beside the 2D board the whole time (owner, 2026-11-03), and the 2D board is the one you
 * plan on; on a phone, only one board. Skipped where this machine's 3D couldn't hold the frame target (the page says so).
 */
async function besideCheck(page: Page, size: string, at: string, fail: Fail) {
  const slow = await page.getByText(/couldn’t keep up|didn’t start here/).count();
  const n3 = await page.locator('.mb-top-board .mb-board3d').count(), n2 = await page.locator('.mb-top-board .mb-board').count();
  if (size === 'desktop' && !slow && (n3 !== 1 || n2 !== 1)) fail(`${at}: the 2D board and the 3D view aren't both there (2D ${n2}, 3D ${n3})`);
  if (size === 'phone' && n2 + n3 !== 1) fail(`${at}: a phone shows one board (2D ${n2}, 3D ${n3})`);
}

/**
 * Starts a stage, plays a book-4 match's first turns through it at each size, and checks the layout. `record`, if given,
 * keeps a video of the phone run in that directory.
 */
export async function liveLayoutCheck(browser: Browser, fail: Fail, opts: { record?: string; shots?: (page: Page, name: string) => Promise<void> } = {}) {
  process.env.MINPENTAI_PLAY_TEST = '1';
  process.env.MINPENTAI_DRAFTS_TEST_PEOPLE = '-3'; // the harness's person A, so book-4 (a draft) can be started
  const { startStage, connect, tool } = await import('./agents-harness');
  const S = await startStage();
  try {
    const a = await connect(S.BASE, S.people.A.token, 'Claude', 'read play');
    for (const size of SIZES) {
      const st = await tool(S.BASE, a.access_token, 'minpentai_start_solo', { ruleset: 'book-4', level: 2 });
      if (!st.ok) { fail(`live page layout: couldn't start a match (${st.error})`); return; }
      const id = st.out.match_id as string, live = st.out.live_url as string;
      const draft = async () => {
        const v = (await tool(S.BASE, a.access_token, 'minpentai_get_view', { match_id: id })).out as { turn: number; can_place: [number, number][] };
        const east = [...v.can_place].sort((p, q) => q[0] - p[0] || p[1] - q[1]);
        const placements = v.turn === 0 ? east.slice(0, 2).map(([x, y]) => ({ piece: 'tower', x, y })) : east.slice(0, 2).map(([x, y]) => ({ piece: 'glider', x, y, dir: 'E' }));
        await tool(S.BASE, a.access_token, 'minpentai_submit_orders', { match_id: id, turn: v.turn, placements, source: 'agent', final: false });
      };
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, ...(opts.record && size.name === 'phone' ? { recordVideo: { dir: opts.record, size: { width: size.width, height: size.height } } } : {}) });
      await ctx.addInitScript(([token, address]: readonly [string, string]) => {
        const exp = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp;
        localStorage.setItem('snowmoon.wallet', JSON.stringify({ token, address: address.toLowerCase(), short: address.slice(0, 6), exp }));
      }, [S.people.A.token, S.people.A.address] as const);
      const page = await ctx.newPage();
      const top: [string, string][] = [['the board', '.mb-top-board .mb-board, .mb-top-board .mb-board3d'], ['the replay controls', '.mb-top-controls'], ['the Take turn button', '.mb-take-button']];
      for (let turn = 0; turn < 3; turn++) {
        await draft();
        if (turn === 0) await page.goto(live, { waitUntil: 'networkidle' });
        await page.locator('.mb-take-button').waitFor({ timeout: 20_000 }); // the draft arrives with the page's refresh
        const at = `/minpentai/m/… @${size.width}×${size.height}, turn ${turn}`;
        // After the last turn's replay, the board is back on this turn, showing the AI's draft (not a replay frame).
        await page.waitForTimeout(1500);
        if (!(await page.locator('.mb-top-board .mb-ghost').count())) fail(`${at}: the board doesn't show the AI's draft (still on the replay?)`);
        await inView(page, `${at}, before taking it`, fail, turn === 0 ? top.filter(([n]) => n !== 'the replay controls').concat([['the controls row', '.mb-top-controls']]) : top);
        await opts.shots?.(page, `live-${size.name}-turn${turn}-draft`);
        await page.locator('.mb-take-button').click();
        // The replay plays in place on the same board.
        await page.getByRole('button', { name: 'Pause' }).waitFor({ timeout: 30_000 });
        await inView(page, `${at}, while its replay plays`, fail, top.filter(([n]) => n !== 'the Take turn button'));
        await besideCheck(page, size.name, `${at}, while its action plays`, fail);
        await page.waitForTimeout(3500);
        await opts.shots?.(page, `live-${size.name}-turn${turn}-replay`);
        await page.getByRole('button', { name: /^Watch turn \d+ again in 2D/ }).waitFor({ timeout: 45_000 }); // finished: back to this turn
        await inView(page, `${at}, after its replay`, fail, top.filter(([n]) => n !== 'the Take turn button'));
        await besideCheck(page, size.name, `${at}, after its action`, fail);
      }
      // After the last turn taken, the next draft: everything in view again.
      await draft();
      await page.locator('.mb-take-button').waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      if (!(await page.locator('.mb-top-board .mb-ghost').count())) fail(`/minpentai/m/… @${size.width}×${size.height}: after taking turns, the board doesn't show the next draft`);
      await inView(page, `/minpentai/m/… @${size.width}×${size.height}, the next turn's draft after taking turns`, fail, top);
      // Past turns sit below, one line each, and open in place.
      const rows = await page.locator('.mb-past-row').count();
      if (rows < 2) fail(`/minpentai/m/… @${size.width}×${size.height}: past turns aren't listed (${rows})`);
      await page.locator('.mb-past-row').first().click();
      await page.getByRole('button', { name: /^Watch turn \d+ in 2D/ }).click({ timeout: 15_000 });
      await page.locator('.mb-past-body .mb-board').waitFor({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Skip' }).last().click();
      await opts.shots?.(page, `live-${size.name}-past-open`);
      await tool(S.BASE, a.access_token, 'minpentai_resign', { match_id: id });
      await ctx.close();
    }
  } finally {
    await S.stop();
  }
}
