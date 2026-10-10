/**
 * Reader UI floors, checked in a real browser at phone width (390px), light and dark.
 * Fails (exit 1) on any problem. Uses the locally installed Chrome (playwright-core).
 *
 *   npm run check:ui -- --url=http://localhost:3000
 *   npm run check:ui -- --url=… --inject-css='…'   plant an error; must fail
 *
 * - Text is at least 12px everywhere, including SVG text at its rendered scale.
 * - Touch targets are at least 44×44 on touch screens (pointer: coarse), counting the invisible
 *   hit area each control gets there (src/styles/shell.css); controls keep the prototype's visual
 *   size (owner, 2026-10-08). With a mouse there is no floor. Phone pages and the 1024 tablet run
 *   as touch screens. Exempt: links inside running text (WCAG 2.5.8's inline exception) and
 *   disabled controls drawn inside source screens.
 * - App chrome uses Crimson Pro or DM Mono only; source screens, lyric cards, SVGs,
 *   and in-world templates may use their own faces.
 * - Paper is #F4F2ED in light mode in every chapter. Datelines take the accent of
 *   their setting: #2E5A3A Veridia, #B3306E Dzego, ink otherwise.
 * - The first screen says: independent adaptation, not affiliated with the author, no token; on the home
 *   page it says so in the dark hero (checkHome, with the home's other checks: How this works, Read from
 *   here, Just made, the Minpentai board).
 * - The live voting screens (c1-b18, c1-b31, c7-b6) start where the book shows them, move by
 *   keyboard, and Reset returns them, with no request made and no storage changed.
 * - The assistant (/assistant) meets the same floors signed out (9d), the reader's "Ask about this" (1a), its home (1d),
 *   the first-time notice (2), a thread with an answer and quote cards (3), a held-back
 *   question (9b) and the daily limit (9c). The API is replayed from results recorded
 *   live (scripts/fixtures/chat-live-2026-10-07.json); quotes are checked against the
 *   stored text by test:chat. --shots=DIR also saves a screenshot of each.
 * - Learn Minpentai's screens are full screen at 390 and in the 424 × 695 Farcaster frame (the frame
 *   fills the viewport, no site top bar, a × back to the site), and Design's centred phone beside the rail at 1024
 *   and up. ?s= opens /minpentai/rule, the book's rule, tagged FROM THE BOOK, citing c4-b5 and c4-b7, with its
 *   GitHub write-up.
 * - Minpentai Play (Design's "Minpentai Play", owner 2026-10-09): ?mode=play opens the hub with Learn, Play and
 *   Free play; ?mode=free opens free play; a practice match starts, takes a glider and ends its turn; ⤢ makes it
 *   full screen (the site's top bar hidden, the board upright) at 390 and in the Farcaster frame; every Play screen is
 *   labelled RULES INVENTED FOR THIS EDITION; /minpentai/rules is Design's rules page. No sideways scroll.
 * - AI labels as rendered (owner, 2026-10-09): on the chapter (seeded images, the readers' strip,
 *   the narration credit), the listen view's player, the feed, an image's page, the composer's draft
 *   and preview, and the moderators' queue, every AI image and the narration control carry the label
 *   button (button.ai-label, aria-haspopup="dialog", shown) whose visible text says "AI" and names who
 *   made it (" · by …"). An AI image is any rendered <img> at least 64×64 CSS px: every picture on
 *   these screens is generated, and UI marks are SVG or smaller. Its label is looked for in its own
 *   figure, list item or section. Readers' images come from local data: check:ui starts this
 *   checkout's production build a second time (.next, so build first) on a free port against an
 *   in-memory database with two published readers' images (scripts/fixtures/reader-images-db.ts);
 *   sign-in, the composer's status and the queue are mocked in the browser.
 */
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const BASE = (arg('url') ?? 'http://localhost:3000').replace(/\/$/, '');
const INJECT = arg('inject-css');
const SHOTS = arg('shots');
const MIN_TEXT = 12;
const MIN_TAP = 44;
const PAPER = 'rgb(244, 242, 237)';
const ACCENT: Record<string, string> = { veridia: 'rgb(46, 90, 58)', dzego: 'rgb(179, 48, 110)' };
const INK = 'rgb(29, 29, 27)';
const IN_WORLD = '.device-view, .dz-card, svg, [data-template]';
/** Learn screens at /minpentai (src/app/minpentai/learn.tsx: 8 watch, 7 lessons, under the hood, practice). */
const MINPENTAI_LESSONS = 17;
/** Under the hood runs the book's rule (c4-b5); every other Learn screen is the game invented for this edition. */
const MINPENTAI_HOOD = 16;

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);

async function open(page: Page, path: string) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  if (INJECT) await page.addStyleTag({ content: INJECT });
  await page.evaluate(() => document.fonts.ready);
}

const LIVE = JSON.parse(readFileSync(new URL('./fixtures/chat-live-2026-10-07.json', import.meta.url), 'utf8')) as {
  results: { question: string; limit: number; result: { state: string; left?: number } }[];
};

async function shot(page: Page, name: string, scheme: string) {
  if (!SHOTS) return;
  // Let opening animations finish (not endless ones, like the "reading" pulse).
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished)));
  await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png`, fullPage: false });
}

/** Learn's lessons and practice on a phone or in the Farcaster frame: full screen, with a way back to the site. */
async function checkLearnFullScreen(page: Page, where: string) {
  const box = await page.locator('.ml-learn').boundingBox();
  const vp = page.viewportSize()!;
  if (!box || Math.abs(box.x) > 1 || Math.abs(box.y) > 1 || Math.abs(box.width - vp.width) > 1 || Math.abs(box.height - vp.height) > 1) {
    fail(`${where}: Learn is not full screen (${box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}` : 'no frame'} in ${vp.width}×${vp.height})`);
  }
  if (await page.locator('.topbar').isVisible()) fail(`${where}: the site's top bar shows above Learn`);
  const exit = page.locator('.ml-exit');
  if (!(await exit.isVisible()) || (await exit.getAttribute('href')) !== '/') fail(`${where}: no visible × back to the site`);
}

/** The selection's options are all inside the viewport (owner, 2026-10-10: they went off the side on a phone). */
async function checkSelectionFits(page: Page, where: string) {
  const out = await page.$$eval('.selection-actions > *', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent ?? '').trim(), l: r.left, r: r.right, w: innerWidth }; }));
  if (!out.length) fail(`${where}: no selection options shown`);
  for (const o of out) if (o.l < 0 || o.r > o.w + 0.5) fail(`${where}: "${o.t}" is off the side of the screen (${Math.round(o.l)}–${Math.round(o.r)} of ${o.w}px)`);
  return out.length;
}

/** Screens 1a, 1b, 9d, 1d, 2, 3, 9b and 9c, with the chat API replayed from the live run. */
async function checkAssistant(page: Page, scheme: string) {
  // 1a: select a passage in the reader; "Ask about this" appears beside "Share quote".
  await open(page, '/chapter/1');
  await page.evaluate(() => {
    const p = document.querySelector('#c1-b19')!;
    p.scrollIntoView({ block: 'center' });
    const r = document.createRange();
    r.selectNodeContents(p);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  const ask = await page.waitForSelector('.selection-actions a');
  if ((await ask.getAttribute('href')) !== '/assistant?block=c1-b19') fail(`/chapter/1: "Ask about this" points to ${await ask.getAttribute('href')}`);
  await checkFloors(page, '/chapter/1 (1a selection)', scheme);
  await checkSelectionFits(page, `/chapter/1 (${scheme}, selection, signed out)`);
  await shot(page, '1a-selection', scheme);
  await page.evaluate(() => getSelection()!.removeAllRanges());
  // 1b: the chapter's own link.
  await page.evaluate(() => document.querySelector('.ask-chapter')!.scrollIntoView({ block: 'center' }));
  await shot(page, '1b-chapter-link', scheme);
  // The chapter sheet: opens on the current chapter, closes on Escape, gives focus back.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('.chapter-bar-button');
  await page.waitForSelector('.chapter-sheet');
  const focused = await page.evaluate(() => Boolean(document.activeElement?.closest('.chapter-sheet')));
  if (!focused) fail('/chapter/1: opening the chapter sheet does not move focus into it');
  if (!(await page.locator('.cs-current-name').textContent())?.includes('Chapter 1')) fail('/chapter/1: the chapter sheet does not lead with the current chapter');
  await checkFloors(page, '/chapter/1 (chapter sheet)', scheme);
  await shot(page, '1b-chapter-sheet', scheme);
  await page.keyboard.press('Escape');
  if (await page.locator('.chapter-sheet').count()) fail('/chapter/1: Escape does not close the chapter sheet');
  if (!(await page.evaluate(() => document.activeElement?.classList.contains('chapter-bar-button')))) fail('/chapter/1: focus does not return to the chapter button');

  await page.evaluate(() => localStorage.clear());
  await open(page, '/assistant');
  await page.waitForSelector('.as-signed-out');
  await checkFloors(page, '/assistant (9d signed out)', scheme);
  await shot(page, '9d-signed-out', scheme);

  let left = 30;
  const replies: { state: string; left?: number; heldBack?: boolean }[] = [
    LIVE.results[0].result,
    { state: 'unsupported', heldBack: false, left: 2 },
    { state: 'held', heldBack: true, left: 1 },
    { state: 'limit', left: 0 },
  ];
  await page.route('**/api/chat/status', (r) =>
    r.fulfill({ json: { available: true, model: 'gpt-oss-120b', host: 'Vercel AI Gateway', provider: 'Groq', perDay: 30, left } }),
  );
  await page.route('**/api/chat/ask', (r) => {
    const next = replies.shift()!;
    left = typeof next.left === 'number' ? next.left : left;
    return r.fulfill({ json: next });
  });
  await page.evaluate(() => localStorage.setItem('snowmoon.read-to', '3'));
  await open(page, '/assistant');
  await page.waitForSelector('.as-start');
  await checkFloors(page, '/assistant (1d home)', scheme);
  await shot(page, '1d-home', scheme);

  // 1a, in the assistant: the passage card (the stored text) and starter questions.
  await open(page, '/assistant?block=c1-b19');
  await page.waitForSelector('.as-passage blockquote');
  const card = await page.textContent('.as-passage blockquote');
  if (!card?.includes('cryptographic sortition')) fail(`/assistant?block=c1-b19: the passage card is not the stored text (${card?.slice(0, 60)})`);
  if ((await page.locator('.as-starter').count()) !== 3) fail('/assistant?block=: no starter questions in an empty thread');
  await checkFloors(page, '/assistant (1a thread)', scheme);
  await shot(page, '1a-thread', scheme);
  await page.evaluate(() => localStorage.removeItem('snowmoon.ask.threads.v1'));
  await open(page, '/assistant');
  await page.waitForSelector('.as-start');

  await page.click('.as-start');
  await page.fill('#as-q', LIVE.results[0].question);
  await page.click('.as-send');
  await page.waitForSelector('.as-sheet');
  await checkFloors(page, '/assistant (2 notice)', scheme);
  await shot(page, '2-notice', scheme);
  await page.click('.as-check input');
  await page.click('.as-primary');
  await page.waitForSelector('.as-quote');
  const host = await page.textContent('.as-foot');
  if (!host?.includes('Vercel AI Gateway')) fail(`/assistant: the footer does not name the host (${host})`);
  await checkFloors(page, '/assistant (3 thread)', scheme);
  await shot(page, '3-thread', scheme);

  if (!(await page.locator('.as-testing').isVisible())) fail('/assistant: no "Testing" label');
  await page.fill('#as-q', LIVE.results[1].question);
  await page.click('.as-send');
  await page.waitForSelector('text=the passages don’t say');
  await checkFloors(page, '/assistant (unsupported)', scheme);
  await shot(page, '3b-unsupported', scheme);

  await page.fill('#as-q', LIVE.results[4].question);
  await page.click('.as-send');
  await page.waitForSelector('.as-held');
  await page.evaluate(() => document.querySelector('.as-held')?.scrollIntoView({ block: 'center' }));
  await checkFloors(page, '/assistant (9b held back)', scheme);
  await shot(page, '9b-held', scheme);
  await page.fill('#as-q', LIVE.results[3].question);
  await page.click('.as-send');
  await page.waitForSelector('.as-stop');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await checkFloors(page, '/assistant (9c limit)', scheme);
  const zeroLeft = await page.locator('.as-label', { hasText: /left today/ }).count();
  if (zeroLeft !== 1) fail(`/assistant (9c): "left today" shown ${zeroLeft} times, not once`);
  await shot(page, '9c-limit', scheme);

  await page.unroute('**/api/chat/status');
  await page.unroute('**/api/chat/ask');
  await page.evaluate(() => localStorage.clear());
}

async function checkFloors(page: Page, path: string, scheme: string) {
  const r = await page.evaluate(
    ({ MIN_TEXT, MIN_TAP, IN_WORLD }) => {
      const small: string[] = [];
      const taps: string[] = [];
      const fonts: string[] = [];
      const describe = (el: Element) => (el.id ? `#${el.id}` : '') || `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`;
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (!hasText || !visible(el)) continue;
        const s = getComputedStyle(el);
        let px = parseFloat(s.fontSize);
        if (el instanceof SVGElement) {
          const ctm = (el as SVGGraphicsElement).getScreenCTM?.();
          if (ctm) px *= Math.hypot(ctm.a, ctm.b);
        }
        if (px < MIN_TEXT - 0.05) small.push(`${describe(el.closest('[id]') ?? el)} ${el.tagName.toLowerCase()} ${px.toFixed(1)}px "${el.textContent!.trim().slice(0, 24)}"`);
        if (!el.closest(IN_WORLD)) {
          const first = s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
          if (!/^(__)?(Crimson[ _]Pro|DM[ _]Mono)/i.test(first)) fonts.push(`${describe(el)} uses ${first}`);
        }
      }
      const touch = matchMedia('(pointer: coarse)').matches;
      for (const el of Array.from(document.querySelectorAll('a, button, input, select, summary, [role="button"], [role="slider"]'))) {
        if (!touch || !visible(el)) continue;
        if ((el as HTMLButtonElement).disabled && el.closest('.device-view')) continue;
        if (el.tagName === 'A' && el.closest('p, li') && !el.closest('.chapter-list, nav, .gl-index')) continue; // inline in running text
        const r = el.getBoundingClientRect();
        // The hit area: the control, or the invisible ::after drawn around it on touch screens.
        const hit = getComputedStyle(el, '::after');
        const extra = hit.content !== 'none' && hit.content !== 'normal' && hit.position === 'absolute';
        const w = Math.max(r.width, extra ? parseFloat(hit.width) : 0);
        const h = Math.max(r.height, extra ? parseFloat(hit.height) : 0);
        if (w < MIN_TAP - 0.5 || h < MIN_TAP - 0.5) taps.push(`${describe(el)} "${(el.textContent ?? '').trim().slice(0, 20)}" ${Math.round(w)}×${Math.round(h)}`);
      }
      // One "Draft wording" line per screen or panel (owner, 2026-10-08), not a tag per sentence.
      const drafts = new Map<Element, number>();
      for (const el of Array.from(document.querySelectorAll('.as-draft'))) {
        if (!visible(el)) continue;
        const root = el.closest('[role="dialog"], .panel, .shell-main') ?? document.body;
        drafts.set(root, (drafts.get(root) ?? 0) + 1);
      }
      const draftDup = [...drafts.entries()].filter(([, n]) => n > 1).map(([root, n]) => `${describe(root)} has ${n}`);
      // No hyphenation in the book (owner, 2026-10-08).
      const hyph = Array.from(document.querySelectorAll('.chapter .block')).filter((el) => getComputedStyle(el).hyphens === 'auto').length;
      return { small, taps, fonts, draftDup, hyph, overflow: document.documentElement.scrollWidth - innerWidth };
    },
    { MIN_TEXT, MIN_TAP, IN_WORLD },
  );
  const where = `${path} (${scheme})`;
  if (r.small.length) fail(`${where}: ${r.small.length} text below ${MIN_TEXT}px, e.g. ${r.small.slice(0, 3).join('; ')}`);
  if (r.taps.length) fail(`${where}: ${r.taps.length} tap targets below ${MIN_TAP}px, e.g. ${r.taps.slice(0, 3).join('; ')}`);
  if (r.fonts.length) fail(`${where}: ${r.fonts.length} chrome elements in other fonts, e.g. ${r.fonts.slice(0, 3).join('; ')}`);
  if (r.overflow > 0) fail(`${where}: page scrolls sideways by ${r.overflow}px`);
  if (r.draftDup.length) fail(`${where}: more than one "Draft wording" line on a screen: ${r.draftDup.join('; ')}`);
  if (r.hyph) fail(`${where}: ${r.hyph} book blocks are hyphenated`);
}

/**
 * The home page (src/app/page.tsx, from Design's HomeWindow), at 390 × 844 with the intro seen:
 * - the first screen (elements in the viewport, their own text nodes) says independent adaptation,
 *   not affiliated with the author, no token, and says it in the dark hero (principle 7; owner, 2026-10-10);
 * - "How this works" opens the intro; "Read from here" lands on the quoted block;
 * - "Just made" shows each image with its AI label, or the empty state;
 * - the Minpentai board steps on its own, and starts paused under reduced motion until Play;
 * - a reader who opened a chapter before (the reading record on the device) gets Continue · Chapter n.
 */
async function checkHome(page: Page, scheme: 'light' | 'dark') {
  const own = (sel: string) =>
    page.evaluate(
      (sel) =>
        Array.from(document.querySelectorAll(sel))
          .filter((e) => e.getBoundingClientRect().top < innerHeight && e.getBoundingClientRect().bottom > 0)
          .map((e) => Array.from(e.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '))
          .join(' ')
          .replace(/\s+/g, ' ')
          .toLowerCase(),
      sel,
    );
  await page.evaluate(() => scrollTo(0, 0));
  const first = await own('body *');
  const hero = await own('.home-hero *');
  for (const phrase of ['independent adaptation', 'not affiliated with the author', 'no token']) {
    if (!first.includes(phrase)) fail(`/ (${scheme}): first screen does not say "${phrase}"`);
    else if (!hero.includes(phrase)) fail(`/ (${scheme}): "${phrase}" is on the first screen but not in the hero`);
  }
  if (!(await page.locator('.home-hero .home-disclaimer a[href="/about"]').isVisible())) fail(`/ (${scheme}): the hero does not link About (licence and sources)`);
  if ((await page.locator('.home-chapters .chapter-list a').count()) !== 32) fail(`/ (${scheme}): the chapter list does not link all 32 chapters`);

  // How this works: the intro, opened again.
  await page.locator('.home-how').click();
  if (!(await page.locator('.intro-card').isVisible())) fail(`/ (${scheme}): "How this works" does not open the intro`);
  else await page.locator('.intro-skip').click();

  // Just made.
  const rows = await page.locator('.home-feed-list li').count();
  if (rows) {
    for (const li of await page.locator('.home-feed-list li').all()) {
      const label = li.locator('button.ai-label');
      if (!(await label.count()) || !/\bAI\b.* · by \S/.test((await label.innerText()) ?? '')) fail(`/ (${scheme}): a "Just made" image has no AI label naming who made it`);
    }
  } else if (!(await page.locator('.home-feed-empty').isVisible())) fail(`/ (${scheme}): "Just made" shows neither images nor its empty state`);

  // The board plays itself, once it is on screen.
  await page.locator('.home-board').scrollIntoViewIfNeeded();
  const turn = async () => Number(await page.locator('.home-turn').getAttribute('data-turn'));
  const t0 = await turn();
  await page.waitForTimeout(1600);
  if ((await turn()) === t0) fail(`/ (${scheme}): the Minpentai board does not step (turn ${t0})`);
  if (!(await page.locator('.home-game .info-label[data-label="invented"]').isVisible())) fail(`/ (${scheme}): the board has no "Invented ⓘ" label`);

  // A moment: the link lands on its block.
  await page.evaluate(() => scrollTo(0, 0));
  const block = await page.locator('.home-quote').getAttribute('data-block');
  await page.locator('.home-moment-read').click();
  await page.waitForURL(/\/chapter\/\d+#c\d+-b\d+$/, { timeout: 10000 }).catch(() => {});
  if (!page.url().endsWith(`#${block}`)) fail(`/ (${scheme}): "Read from here" goes to ${page.url()}, not #${block}`);
  else {
    await page.waitForTimeout(500);
    const at = await page.evaluate((id) => document.getElementById(id)?.getBoundingClientRect().top ?? null, block!);
    if (at === null || at < 0 || at > 844) fail(`/ (${scheme}): "Read from here" does not show block ${block} (top ${at})`);
  }

  // Reduced motion: still until Play. This reader has opened chapter 3 before: Continue · Chapter 3.
  const still = await newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme, hasTouch: true, reducedMotion: 'reduce' });
  await still.addInitScript(`try{localStorage.setItem('snowmoon.intro-seen',${JSON.stringify(JSON.parse(readFileSync('config/intro.json', 'utf8')).version)})}catch(e){}`);
  await still.addInitScript(`try{localStorage.setItem('snowmoon.last-chapter','3')}catch(e){}`);
  await still.goto(BASE + '/', { waitUntil: 'networkidle' });
  const cont = still.locator('.home-hero-actions a[href="/chapter/3"]');
  if (!(await cont.isVisible()) || !/Continue · Chapter 3/i.test((await cont.textContent()) ?? '')) fail(`/ (${scheme}): a returning reader (chapter 3 opened last) is not offered Continue · Chapter 3`);
  await still.locator('.home-board').scrollIntoViewIfNeeded();
  const r0 = await still.locator('.home-turn').getAttribute('data-turn');
  await still.waitForTimeout(1200);
  if ((await still.locator('.home-turn').getAttribute('data-turn')) !== r0) fail(`/ (${scheme}): the board moves under prefers-reduced-motion`);
  await still.locator('.home-board-toggle').click();
  await still.waitForTimeout(1200);
  if ((await still.locator('.home-turn').getAttribute('data-turn')) === r0) fail(`/ (${scheme}): Play does not start the board under reduced motion`);
  await still.close();
}
/**
 * The glossary (src/components/glossary.tsx): the index and a word's page meet the floors; later
 * chapters are covered until "Show anyway"; "Back" returns to the reading place, whether it came
 * in the URL or from the menu's Glossary link in the reader.
 */
/** Minpentai Play at phone width: the hub, free play, a practice match, full screen and the rules page. */
async function checkPlay(page: Page, scheme: string) {
  const where = (q: string) => `/minpentai?${q} (${scheme})`;
  const noSideways = async (w: string) => { if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail(`${w}: the page scrolls sideways at 390px`); };
  await open(page, '/minpentai?mode=play');
  await page.waitForSelector('.mp-play .mp-tabs', { timeout: 10000 }).catch(() => fail(`${where('mode=play')}: no Play hub`));
  await checkFloors(page, '/minpentai?mode=play', scheme);
  await noSideways(where('mode=play'));
  const tabs = (await page.locator('.mp-tabs button').allTextContents()).join(' | ');
  if (tabs !== 'LEARN | PLAY | FREE PLAY') fail(`${where('mode=play')}: tabs are ${tabs}`);
  for (const t of ['Practice match', 'The computer ladder', 'Play a person']) if (!(await page.locator('.mp-card-title', { hasText: t }).count())) fail(`${where('mode=play')}: no "${t}"`);
  if (!((await page.locator('.mp-hub').textContent()) ?? '').includes('RULES INVENTED FOR THIS EDITION')) fail(`${where('mode=play')}: not labelled as invented rules`);
  // Free play.
  await open(page, '/minpentai?mode=free');
  await page.waitForSelector('.mp-play [role="grid"]', { timeout: 10000 }).catch(() => fail(`${where('mode=free')}: no board`));
  await checkFloors(page, '/minpentai?mode=free', scheme);
  await noSideways(where('mode=free'));
  if (!((await page.locator('.mp-strip').textContent()) ?? '').startsWith('STEP 0')) fail(`${where('mode=free')}: the strip does not read STEP 0`);
  if ((await page.locator('.mp-tag', { hasText: "THE BOOK'S CELL RULE" }).getAttribute('href')) !== '/minpentai/rule') fail(`${where('mode=free')}: no link to the book's cell rule`);
  // A practice match: start, place a glider, end the turn; the turn's run plays.
  await open(page, '/minpentai?mode=play');
  await page.locator('.mp-card', { hasText: 'Practice match' }).click();
  await page.getByRole('button', { name: 'START MATCH' }).click();
  await checkFloors(page, '/minpentai practice match', scheme);
  await noSideways(`/minpentai practice match (${scheme})`);
  await page.locator('[role="gridcell"]').nth(2 * 15 + 3).click();
  // The match draws one new rule; under "Gliders cost 3 points." a glider spends 3 (as check:minpentai-live, 4fb3c16).
  const cost3 = (await page.getByText('Gliders cost 3 points.').count()) > 0;
  const left = cost3 ? '5 OF 8' : '4 OF 8';
  if (!((await page.locator('.mp-pts').textContent()) ?? '').startsWith(left)) fail(`/minpentai practice match (${scheme}): placing a glider did not spend ${cost3 ? 3 : 4} points`);
  const foot = await page.locator('.mp-foot').boundingBox();
  if (!foot || foot.y + foot.height > (await page.evaluate(() => innerHeight)) + 1) fail(`/minpentai practice match (${scheme}): END TURN is cut off`);
  await page.getByRole('button', { name: 'END TURN' }).click();
  await page.waitForTimeout(600);
  if (!/^STEP [1-9]/.test((await page.locator('.mp-strip').textContent()) ?? '')) fail(`/minpentai practice match (${scheme}): the run does not play`);
  await checkPlayFullScreen(page, `(${scheme})`, await page.evaluate(() => innerHeight));
  // The rules page.
  await open(page, '/minpentai/rules');
  await checkFloors(page, '/minpentai/rules', scheme);
  await noSideways(`/minpentai/rules (${scheme})`);
  const words = (await page.locator('.mp-rules').textContent()) ?? '';
  if (!words.includes('RULES, DRAFT 1') || !words.includes('c4-b84')) fail(`/minpentai/rules (${scheme}): not Design's rules page`);
}
/** ⤢ on a match: the frame covers the site (no top bar), the board upright, END TURN in view. */
async function checkPlayFullScreen(page: Page, where: string, tall: number) {
  if (!(await page.locator('.mp-play .mp-boardscr').count())) {
    await open(page, '/minpentai?mode=play');
    await page.locator('.mp-card', { hasText: 'Practice match' }).click();
    await page.getByRole('button', { name: 'START MATCH' }).click();
  }
  await page.waitForFunction(() => !!document.querySelector('.mp-fsgo'), null, { timeout: 15000 }).catch(() => {});
  await page.locator('.mp-fsgo').click().catch(() => fail(`/minpentai Play ${where}: no full screen button`));
  await page.waitForTimeout(200);
  if (await page.locator('.topbar').isVisible()) fail(`/minpentai Play full screen ${where}: the site's top bar shows`);
  const grid = await page.locator('.mp-port [role="grid"]').boundingBox();
  if (!grid || grid.height <= grid.width) fail(`/minpentai Play full screen ${where}: the board is not upright`);
  const ctl = await page.locator('.mp-port-ctl').boundingBox();
  if (!ctl || ctl.y + ctl.height > tall + 1) fail(`/minpentai Play full screen ${where}: the controls are cut off`);
  await page.getByRole('button', { name: 'Exit full screen' }).click();
}

async function checkGlossary(page: Page, scheme: string) {
  await open(page, '/glossary');
  await checkFloors(page, '/glossary', scheme);
  await shot(page, 'glossary-index', scheme);
  const rows = await page.locator('.gl-index li').count();
  if (!(await page.locator('.gl-cover').isVisible())) fail('/glossary: words from later chapters are not covered');
  await page.locator('.gl-cover button').click();
  if ((await page.locator('.gl-index li').count()) <= rows) fail('/glossary: "Show them anyway" shows nothing more');
  await checkFloors(page, '/glossary (all)', scheme);

  await open(page, '/glossary/zei?from=c1-b19');
  await checkFloors(page, '/glossary/zei', scheme);
  if ((await page.locator('.gl-back').getAttribute('href')) !== '/chapter/1#c1-b19') fail(`/glossary/zei?from=c1-b19: Back goes to ${await page.locator('.gl-back').getAttribute('href')}`);
  if ((await page.locator('a', { hasText: 'All words' }).getAttribute('href')) !== '/glossary?from=c1-b19') fail('/glossary/zei: "All words" drops the reading place');
  // Zei first appears in chapter 2: covered for a reader at chapter 1.
  if (!(await page.locator('.gl-cover').isVisible())) fail('/glossary/zei: a word from chapter 2 is not covered at chapter 1');
  await shot(page, 'glossary-covered', scheme);
  await page.locator('.gl-cover button').click();
  await page.waitForSelector('.gl-quote, .gl-none');
  // "First appears": the sentence of the first block, linked to that block.
  if ((await page.locator('.gl-first .gl-cite').getAttribute('href').catch(() => null)) !== '/chapter/2#c2-b2') fail('/glossary/zei: "First appears" is missing or not linked to c2-b2');
  await checkFloors(page, '/glossary/zei (shown)', scheme);
  await shot(page, 'glossary-term', scheme);

  // From the reader: the menu's Glossary link carries the block at the top of the screen.
  await open(page, '/chapter/1');
  await page.evaluate(() => document.querySelector('#c1-b19')!.scrollIntoView({ block: 'start' }));
  await page.click('.topbar-icon[aria-label="Menu"]');
  await page.locator('.menu-sheet a', { hasText: 'Glossary' }).click();
  await page.waitForURL(/\/glossary\?from=c1-b\d+/, { timeout: 10000 }).catch(() => fail(`/chapter/1 menu → Glossary: no reading place in ${page.url()}`));
  await page.waitForSelector('.gl-back');
  const back = await page.locator('.gl-back').getAttribute('href');
  if (!/^\/chapter\/1#c1-b(1[89]|20)$/.test(back ?? '')) fail(`glossary from the reader: Back goes to ${back}, not near c1-b19`);
  await page.locator('.gl-back').focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/chapter\/1#c1-b/, { timeout: 10000 }).catch(() => fail('glossary: Enter on Back does not return to the chapter'));
}

/** A page in the given theme: Light is the default, so a dark run chooses Dark (src/lib/theme.ts). */
/**
 * Live voting screens (src/components/live-screen.tsx): each starts where the book shows it,
 * moves by keyboard, and Reset returns it; no request is made and no storage changes.
 */
async function checkLiveScreens(page: Page, scheme: string) {
  const cases = [
    { path: '/chapter/1', id: 'c1-b18', keys: ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight'], start: '0', moved: '+0.5' },
    { path: '/chapter/1', id: 'c1-b31', keys: ['Home'], start: '0', moved: '-5.0' },
    { path: '/chapter/7', id: 'c7-b6', keys: ['End'], start: '😐', moved: '😊2' },
  ];
  for (const c of cases) {
    const where = `${c.path} #${c.id} live (${scheme})`;
    if (!(await page.url()).endsWith(c.path)) await open(page, c.path);
    const range = page.locator(`#${c.id} .live-range`);
    await range.waitFor({ state: 'attached', timeout: 5000 }).catch(() => fail(`${where}: the slider never went live`));
    if (!(await range.count())) continue;
    const state = () =>
      page.evaluate((id) => {
        const root = document.getElementById(id)!;
        const thumb = root.querySelector('.vv-thumb, .dv-thumb')!.getBoundingClientRect();
        const input = root.querySelector<HTMLInputElement>('.live-range')!;
        return {
          value: input.value,
          text: input.getAttribute('aria-valuetext'),
          name: input.getAttribute('aria-label'),
          shown: root.querySelector('.live-value')!.textContent,
          thumb: Math.round(thumb.left),
          storage: JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]),
        };
      }, c.id);
    const requests: string[] = [];
    // The page's own lazy images may load while the screen is in view: they are not the slider's.
    await range.scrollIntoViewIfNeeded();
    await page.waitForLoadState('networkidle');
    const lazy = new Set(await page.evaluate(() => Array.from(document.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')).map((i) => i.src)));
    const onRequest = (r: { url(): string }) => {
      if (!lazy.has(r.url())) requests.push(r.url());
    };
    page.on('request', onRequest);
    const s0 = await state();
    if (s0.value !== '50' || s0.text !== c.start || s0.shown !== c.start) fail(`${where}: starts at ${s0.value} "${s0.shown}", not 50 "${c.start}"`);
    if (!s0.name) fail(`${where}: the slider has no name`);
    await range.focus();
    for (const k of c.keys) await page.keyboard.press(k);
    await page.waitForTimeout(150);
    const s1 = await state();
    if (s1.text !== c.moved || s1.shown !== c.moved) fail(`${where}: after ${c.keys.join(' ')} reads "${s1.shown}", not "${c.moved}"`);
    if (s1.thumb === s0.thumb) fail(`${where}: the drawn thumb did not move`);
    await page.locator(`#${c.id} .live-reset`).click();
    await page.waitForTimeout(150);
    const s2 = await state();
    if (s2.value !== '50' || s2.shown !== c.start || s2.thumb !== s0.thumb) fail(`${where}: Reset leaves it at ${s2.value} "${s2.shown}"`);
    if (s2.storage !== s0.storage) fail(`${where}: storage changed`);
    page.off('request', onRequest);
    if (requests.length) fail(`${where}: made requests: ${requests.slice(0, 3).join(', ')}`);
    await checkFloors(page, `${c.path} (live ${c.id})`, scheme);
  }
}

async function newPage(opts: Parameters<Browser['newPage']>[0] = {}) {
  const p = await browser.newPage(opts);
  // tsx keeps function names with a __name helper that the page does not have.
  await p.addInitScript('window.__name = (f) => f');
  await p.addInitScript(`try{localStorage.setItem('snowmoon.theme','${opts?.colorScheme === 'dark' ? 'dark' : 'light'}')}catch(e){}`);
  return p;
}
// ---------------------------------------------------------------------------
// AI labels as rendered (owner, 2026-10-09).
// ---------------------------------------------------------------------------
const PICTURE_MIN = 64;
const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

/** Every rendered picture carries a label; at least `min` pictures are on the screen. */
async function checkPictureLabels(page: Page, where: string, min: number) {
  const r = await page.evaluate((MIN) => {
    const shown = (el: Element) => {
      const b = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
    };
    const problems: string[] = [];
    let pictures = 0;
    for (const img of Array.from(document.querySelectorAll('img'))) {
      const b = img.getBoundingClientRect();
      if (!shown(img) || b.width < MIN || b.height < MIN) continue; // not drawn, or a UI mark
      pictures++;
      const unit = img.closest('figure, li, section');
      const label = unit?.querySelector<HTMLElement>('.ai-label') ?? null;
      const name = (img.getAttribute('src') ?? '').split('/').pop()?.slice(0, 40);
      if (!unit) problems.push(`${name}: not inside a figure, list item or section`);
      else if (!label || !shown(label)) problems.push(`${name}: no AI label (button.ai-label) shown with it`);
      else {
        const copy = label.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('.sr-only').forEach((n) => n.remove());
        const visible = (copy.textContent ?? '').trim();
        if (label.tagName !== 'BUTTON' || label.getAttribute('aria-haspopup') !== 'dialog') problems.push(`${name}: its label is not a button that opens a dialog`);
        if (!/\bAI\b/.test(visible)) problems.push(`${name}: its label's visible text does not say AI: "${visible}"`);
        if (!/ · by \S/.test(visible)) problems.push(`${name}: its label does not name who made it: "${visible}"`);
      }
    }
    return { problems, pictures };
  }, PICTURE_MIN);
  if (r.pictures < min) fail(`${where}: ${r.pictures} AI images rendered, expected at least ${min}`);
  for (const p of r.problems) fail(`${where}: ${p}`);
}

/** The narration control: the voice label, shown, a dialog button, saying AI and who made it. */
async function checkVoiceLabel(page: Page, where: string, scope: string) {
  const label = page.locator(`${scope} button.ai-label[data-ai="voice"]`).first();
  if (!(await label.count()) || !(await label.isVisible())) return fail(`${where}: the narration control has no AI label shown`);
  const visible = await label.evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('.sr-only').forEach((n) => n.remove());
    return (copy.textContent ?? '').trim();
  });
  if ((await label.getAttribute('aria-haspopup')) !== 'dialog') fail(`${where}: the narration label is not a button that opens a dialog`);
  if (!/\bAI\b/.test(visible)) fail(`${where}: the narration label's visible text does not say AI: "${visible}"`);
  if (!/ · by \S/.test(visible)) fail(`${where}: the narration label does not name who made it: "${visible}"`);
}

async function checkAiLabels() {
  const { startReaderImagesDb, FIXTURE_IMAGES } = await import('./fixtures/reader-images-db');
  const data = await startReaderImagesDb(await freePort());
  const port = await freePort();
  // This checkout's production build, a second time, reading the local data.
  const server = spawn(process.execPath, [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)], {
    env: { ...process.env, STUDIO_DATABASE_URL: data.url },
    stdio: 'ignore',
  });
  const LOCAL = `http://localhost:${port}`;
  try {
    for (let i = 0; ; i++) {
      if (await fetch(LOCAL).then((r) => r.ok, () => false)) break;
      if (i > 120) throw new Error('the local build did not start (run next build first)');
      await new Promise((r) => setTimeout(r, 500));
    }
    // The local build must be this checkout's commit, or the readers' screens would be checked on old code.
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const built = ((await (await fetch(`${LOCAL}/api/version`)).json()) as { commit?: string }).commit ?? 'unknown';
    if (built !== head) {
      fail(`AI labels: the local build is from ${built.slice(0, 7)}, but this checkout is at ${head.slice(0, 7)}; run next build first`);
      return;
    }
    const IMG = FIXTURE_IMAGES[0].url;
    for (const [w, h, touch] of [
      [390, 844, true],
      [1440, 900, false],
    ] as const) {
      const page = await newPage({ viewport: { width: w, height: h }, colorScheme: 'light', hasTouch: touch });
      const exp = Math.floor(Date.now() / 1000) + 86400;
      const token = `a.${Buffer.from(JSON.stringify({ sub: 6786, exp })).toString('base64url')}.c`;
      // Signed in as an invited moderator, in the browser only (the token is not a real one), and read to the end.
      await page.addInitScript(
        `try{localStorage.setItem('snowmoon.read-to','32');localStorage.setItem('snowmoon.signin',${JSON.stringify(JSON.stringify({ token, fid: 6786, username: 'naaate', nameProof: null, exp }))})}catch(e){}`,
      );
      await page.route('**/api/chat/status**', (r) => r.abort());
      await page.route('**/api/images/status**', async (r) => {
        const real = (await (await r.fetch()).json()) as Record<string, unknown>;
        await r.fulfill({ json: { ...real, ready: true, signedIn: true, fid: 6786, invited: true, consented: true, left: 9, publishesLeft: 3 } });
      });
      await page.route('**/api/consent', (r) => r.fulfill({ json: { wording: { sha256: 'x', title: 'x', text: 'x' }, agreed: true } }));
      await page.route('**/api/moderate', (r) =>
        r.fulfill({
          json: {
            items: [
              { version_id: FIXTURE_IMAGES[0].version, element_id: 'e', asset_url: IMG, asset_sha256: 'a', status: 'published', created_by_fid: 6786, created_at: '2026-10-09T10:00:00Z', prompt: 'A footbridge. No text, no lettering, no signs with words.', model: 'z-image-turbo', params: {}, chapter: 1, start_idx: 3, end_idx: 5, last_step: 'reported', last_role: 'reader', reasons: [{ reason: 'spam', n: 1 }], notes: [] },
            ],
          },
        }),
      );
      const at = async (p: string) => {
        await page.goto(LOCAL + p, { waitUntil: 'networkidle' });
        if (INJECT) await page.addStyleTag({ content: INJECT });
      };
      const tag = `@${w}`;

      await at('/chapter/1');
      await page.waitForSelector('.ri-toggle');
      for (const t of await page.locator('.ri-toggle').all()) await t.click();
      await checkPictureLabels(page, `/chapter/1 ${tag} (seeded images and readers' strip)`, 3);
      if ((await page.locator('.ri-list img').count()) < FIXTURE_IMAGES.length) fail(`/chapter/1 ${tag}: the readers' strip shows fewer than ${FIXTURE_IMAGES.length} images`);
      await checkVoiceLabel(page, `/chapter/1 ${tag} (narration credit)`, '.narration-credit');

      await at('/chapter/1?view=listen');
      await page.waitForSelector('.listen-pane');
      await checkVoiceLabel(page, `/chapter/1?view=listen ${tag} (player)`, '.player-label');
      await checkPictureLabels(page, `/chapter/1?view=listen ${tag}`, 0);

      // The glossary's "Hear it" clip is the narration too (read to 32 here, so nothing is covered).
      await at('/glossary/heralds');
      await page.waitForSelector('.gl-clip', { timeout: 10000 }).catch(() => fail(`/glossary/heralds ${tag}: the clip did not show`));
      await checkVoiceLabel(page, `/glossary/heralds ${tag} (clip)`, '.gl-clip');
      if (!/no word timings/.test((await page.locator('.gl-clip-note').textContent().catch(() => '')) ?? '')) fail(`/glossary/heralds ${tag}: the clip note does not say there are no word timings`);

      await at('/images');
      await checkPictureLabels(page, `/images ${tag}`, FIXTURE_IMAGES.length);

      // Home's "Just made": the fixture's images, newest first, each labelled. With the intro seen: its
      // card images (a seeded image with its recipe written out, not the label button) are not this check's.
      await page.evaluate((v) => localStorage.setItem('snowmoon.intro-seen', v), JSON.parse(readFileSync('config/intro.json', 'utf8')).version as string);
      await at('/');
      await checkPictureLabels(page, `/ ${tag}`, FIXTURE_IMAGES.length);

      await at(`/image/${FIXTURE_IMAGES[0].version}`);
      await checkPictureLabels(page, `/image ${tag}`, 1);

      await at('/moderate');
      await page.waitForSelector('.mq-media', { timeout: 10000 }).catch(() => fail(`/moderate ${tag}: the queue did not show`));
      await checkPictureLabels(page, `/moderate ${tag}`, 1);

      // The composer: a draft kept on this device, then the preview before publishing.
      await at('/chapter/1');
      await page.evaluate(
        async ({ IMG }) => {
          await new Promise<void>((resolve) => {
            const req = indexedDB.open('snowmoon', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('image-drafts', { keyPath: 'key' });
            req.onsuccess = () => {
              const tx = req.result.transaction('image-drafts', 'readwrite');
              tx.objectStore('image-drafts').put({ key: 'c1-b3-b5', chapter: 1, start: 3, end: 5, prompt: 'A footbridge at dawn.', style: null, ticket: 't', image: IMG, savedAt: new Date().toISOString() });
              tx.oncomplete = () => resolve();
            };
          });
          window.dispatchEvent(new CustomEvent('snowmoon:add-image', { detail: { chapter: 1, start: 3, end: 5 } }));
        },
        { IMG },
      );
      await page.waitForSelector('.ic-draft', { timeout: 10000 }).catch(() => fail(`composer ${tag}: the draft did not show`));
      // Only the composer's own pictures: the chapter behind it is checked above.
      await page.evaluate(() => document.querySelectorAll('.chapter-read img').forEach((i) => ((i as HTMLElement).style.display = 'none')));
      await checkPictureLabels(page, `composer draft ${tag}`, 1);
      await page.locator('.publish-start').click();
      await page.waitForSelector('.ic-preview', { timeout: 10000 }).catch(() => fail(`composer ${tag}: the preview did not show`));
      await checkPictureLabels(page, `composer preview ${tag}`, 1);
      await page.close();
    }
  } finally {
    server.kill();
    await data.stop();
  }
}

// A local server must be serving this checkout's commit; otherwise the check would pass old code.
if (/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const served = await fetch(`${BASE}/api/version`).then((r) => r.json() as Promise<{ commit?: string }>, () => ({ commit: undefined }));
  if (served.commit !== head) {
    console.error(`UI CHECK FAILED (1):\n- ${BASE} serves a build of ${(served.commit ?? 'unknown').slice(0, 7)}, but this checkout is at ${head.slice(0, 7)}; run next build, then next start`);
    process.exit(1);
  }
}
const browser = await chromium.launch({ channel: 'chrome' });
try {
  await checkAiLabels();
  // First-visit intro (config/intro.json): once, home page only, Skip on every
  // card, remembered on the device without cookies; deep links go straight in.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const cards = (JSON.parse(readFileSync('config/intro.json', 'utf8')).cards as { id: string }[]).map((c) => c.id);
    for (let i = 0; i < cards.length; i++) {
      const card = page.locator('.intro-card');
      if (!(await card.isVisible())) { fail(`intro: card ${i + 1} is not showing on a first visit to /`); break; }
      if ((await card.getAttribute('data-card')) !== cards[i]) fail(`intro: card ${i + 1} is ${await card.getAttribute('data-card')}, not ${cards[i]}`);
      if (!(await page.locator('.intro-skip').isVisible())) fail(`intro: card ${i + 1} has no Skip`);
      if (i < cards.length - 1) await page.getByRole('button', { name: 'Next' }).click();
    }
    await page.locator('.intro-skip').click();
    await page.reload({ waitUntil: 'networkidle' });
    if (await page.locator('.intro-card').isVisible()) fail('intro: shown again after it was skipped');
    const cookies = await ctx.cookies(BASE);
    if (cookies.length) fail(`intro: the site set cookies: ${cookies.map((c) => c.name).join(', ')}`);
    await page.goto(BASE + '/chapter/1', { waitUntil: 'networkidle' });
    if (await page.locator('.what-is-this').isVisible()) fail('intro: "What is this?" still shown after the intro was seen');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE + '/chapter/1', { waitUntil: 'networkidle' });
    if (await page.locator('.intro-card').count()) fail('intro: shown on a deep link (/chapter/1)');
    const link = page.locator('.what-is-this');
    if (!(await link.isVisible())) fail('intro: a first visit to /chapter/1 has no "What is this?" link');
    else {
      await link.click();
      if (!(await page.locator('.intro-card').isVisible())) fail('intro: "What is this?" does not open the intro screens');
      else await page.locator('.intro-skip').click();
    }
    await page.goto(BASE + '/about', { waitUntil: 'networkidle' });
    if (await page.locator('.intro-card').count()) fail('intro: shown on /about without asking');
    const replay = page.locator('.replay-intro');
    const top = await replay.evaluate((e) => {
      const first = document.querySelector('main')?.querySelector('*');
      return first === e || !!first?.contains(e);
    }).catch(() => false);
    if (!(await replay.isVisible())) fail('intro: /about has no "Replay intro screens" link');
    else {
      if (!top) fail('intro: "Replay intro screens" is not at the top of /about');
      await replay.click();
      let n = 0;
      while (await page.locator('.intro-card').isVisible()) {
        n++;
        const next = page.getByRole('button', { name: 'Next' });
        if (await next.count()) await next.click();
        else break;
      }
      if (n !== 5) fail(`intro: replay on /about showed ${n} cards, not 5`);
    }
    await ctx.close();
  }

  for (const scheme of ['light', 'dark'] as const) {
    const page = await newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme, hasTouch: true });
    // tsx keeps function names with a __name helper that the page does not have.
    await page.addInitScript('window.__name = (f) => f');

    // Home (src/app/page.tsx): first as a first visit (the intro over it), then with the intro seen.
    await open(page, '/');
    await checkFloors(page, '/ (first visit, intro)', scheme);
    await page.evaluate((v) => localStorage.setItem('snowmoon.intro-seen', v), JSON.parse(readFileSync('config/intro.json', 'utf8')).version as string);
    await open(page, '/');
    if (await page.locator('.intro-card').count()) fail(`/ (${scheme}): the intro shows after it was seen`);
    await checkFloors(page, '/', scheme);
    await checkHome(page, scheme);
    await open(page, '/about');
    if (!(await page.locator('a[href="https://open.spotify.com/show/0J9O3tKC3BI4buQ8Hry3YN"]').count())) fail(`/about (${scheme}): no link to the podcast on Spotify`);
    await checkFloors(page, '/about', scheme);
    await checkAssistant(page, scheme);
    await checkLiveScreens(page, scheme);
    await open(page, '/cards');
    await checkFloors(page, '/cards', scheme);
    // Readers' images (slice 1): the feed for everyone; "Add an image" only for a signed-in, invited FID.
    await open(page, '/images');
    await checkFloors(page, '/images', scheme);
    if (!(await page.getByText('Most liked').isVisible())) fail('/images: no "Most liked" order');
    await checkGlossary(page, scheme);
    await open(page, '/chapter/1');
    if (await page.locator('.add-image').count()) fail('/chapter/1: "Add an image" shows to a signed-out reader');
    {
      // Labels (owner ruling, 2026-10-09). Scene lines are hidden: nothing of them shows but the add-image button.
      const scene = await page.locator('.scene-label').evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.trim()).filter(Boolean));
      if (scene.length) fail(`/chapter/1 (${scheme}): scene lines still show: ${scene.slice(0, 2).join(' | ')}`);
      // A screen redrawn from a template says "Redrawn ⓘ", which opens its details; the book's own drawings carry no marker.
      const redrawn = page.locator('figure[data-source="template"] .info-label[data-label="redrawn"]');
      if (!(await redrawn.count())) fail(`/chapter/1 (${scheme}): no "Redrawn" label on a screen redrawn from a template`);
      else {
        if (!(await redrawn.first().locator('.info-word').isVisible()) || (await redrawn.first().locator('.info-word').innerText()) !== 'Redrawn') fail(`/chapter/1 (${scheme}): the redrawn label's word is not "Redrawn"`);
        await redrawn.first().click();
        const sheet = page.locator('.info-sheet');
        if (!/Every word on it is the book/.test((await sheet.textContent().catch(() => '')) ?? '')) fail(`/chapter/1 (${scheme}): "Redrawn" does not open its details`);
        await checkFloors(page, '/chapter/1 (Redrawn details)', scheme);
        await page.keyboard.press('Escape');
        if (await sheet.count()) fail(`/chapter/1 (${scheme}): Escape does not close the Redrawn details`);
      }
      if (await page.locator('figure:not([data-source="template"]) .info-label[data-label="redrawn"]').count()) fail(`/chapter/1 (${scheme}): a screen drawn as in the book is marked "Redrawn"`);
    }
    // Citation links (the assistant's, quote cards', the glossary's) land on the paragraph and highlight it.
    for (const target of ['/chapter/1#c1-b19', '/chapter/2#c2-b2']) {
      await open(page, target);
      await page.waitForTimeout(300);
      const id = target.split('#')[1];
      const landed = await page.evaluate((id) => {
        const el = document.getElementById(id);
        if (!el) return 'missing';
        const r = el.getBoundingClientRect();
        if (!el.matches(':target')) return 'not the target';
        if (getComputedStyle(el).boxShadow === 'none') return 'not highlighted';
        if (r.top < 0 || r.top > innerHeight * 0.6) return `not in view (top ${Math.round(r.top)})`;
        return 'ok';
      }, id);
      if (landed !== 'ok') fail(`${target} (${scheme}): the cited paragraph is ${landed}`);
    }
    await open(page, '/chapter/1');
    {
      // Signed in as an invited FID (session mocked), with the composer's status mocked as ready.
      const ctx = page.context();
      // The assistant's status would answer 401 to the mocked session and sign it out.
      await ctx.route('**/api/chat/status', (r) => r.fulfill({ json: { available: false, model: 'm', host: null, provider: null, route: '', perDay: 30, left: 30 } }));
      await ctx.route('**/api/images/status**', (r) =>
        r.fulfill({ json: { label: 'Trial', ready: true, signedIn: true, invited: true, consented: true, left: 10, publishesLeft: 3, perDay: 10, maxBlocks: 8,
          rules: 'No real people.', model: { name: 'Z-Image Turbo', licence: 'Apache-2.0', host: 'fal.ai' }, styles: [{ id: 'techno-vistas', name: 'Techno vistas', text: 'Style text.' }] } }),
      );
      await page.evaluate(() => {
        const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
        localStorage.setItem('snowmoon.signin', JSON.stringify({ token: `x.${b64({ sub: 6786, exp: 4102444800 })}.y`, fid: 6786, username: 'check', exp: 4102444800 }));
      });
      await open(page, '/chapter/1');
      // Signed in, all three options: still inside the screen at 390px.
      await page.evaluate(() => {
        const p = document.querySelector('#c1-b19')!;
        p.scrollIntoView({ block: 'center' });
        const r = document.createRange();
        r.selectNodeContents(p);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(r);
      });
      await page.waitForSelector('.selection-actions button:has-text("Add an image")');
      if ((await checkSelectionFits(page, `/chapter/1 (${scheme}, selection, signed in)`)) !== 3) fail(`/chapter/1 (${scheme}): signed in, the selection does not offer Share quote, Add an image and Ask about this`);
      await page.evaluate(() => getSelection()!.removeAllRanges());
      await page.locator('.scene-label .add-image').first().click();
      await page.waitForSelector('.image-composer textarea');
      await checkFloors(page, '/chapter/1 (add an image, invited)', scheme);
      const text = (await page.textContent('.image-composer')) ?? '';
      if (!/never sent to a model/.test(text)) fail('/chapter/1: the composer does not say the book text is never sent to a model');
      if (!/sent to Groq to be checked and to fal\.ai/.test(text)) fail('/chapter/1: the composer does not name both hosts');
      await page.keyboard.press('Escape');
      if (await page.locator('.image-composer').count()) fail('/chapter/1: Escape does not close the composer');
      await page.evaluate(() => localStorage.removeItem('snowmoon.signin'));
      await ctx.unroute('**/api/images/status**');
      await ctx.unroute('**/api/chat/status');
    }

    // Minpentai: every Learn screen and Free play (and the sandbox's and "Play the computer"'s old links, which open Free play), at phone width.
    for (const q of [...Array.from({ length: MINPENTAI_LESSONS }, (_, i) => `lesson=${i + 1}`), 'mode=practice']) {
      await open(page, `/minpentai?${q}`);
      await page.waitForTimeout(150);
      await checkFloors(page, `/minpentai?${q}`, scheme);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (wide) fail(`/minpentai?${q} (${scheme}): the page scrolls sideways at 390px`);
      {
        // Learn and Free play: the game is labelled as invented for this edition (P8d), except Under the hood, which is the book's rule.
        // Short labels (owner ruling, 2026-10-09): "Invented ⓘ", "Draft ⓘ", "Book ⓘ", each opening its explanation.
        const tags = await page.locator('.ml-tag .info-word').evaluateAll((els) => els.filter((e) => (e as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 0).map((e) => (e.textContent ?? '').trim()));
        const labelled = tags.includes('Invented');
        if (q === `lesson=${MINPENTAI_HOOD}` ? labelled : !labelled) fail(`/minpentai?${q} (${scheme}): the "Invented" label is ${labelled ? 'on the book\'s rule' : 'missing'}`);
        if (q === 'lesson=1') {
          await page.locator('.ml-tag[data-label="invented"]').click();
          if (!/invented for this edition/i.test((await page.locator('.info-sheet').textContent().catch(() => '')) ?? '')) fail(`/minpentai?${q} (${scheme}): "Invented" does not open its explanation`);
          await checkFloors(page, `/minpentai?${q} (Invented details)`, scheme);
          await page.keyboard.press('Escape');
        }
        // The footer (progress, BACK, the main button) stays in view.
        const foot = await page.locator('.ml-foot').boundingBox();
        const tall = await page.evaluate(() => innerHeight);
        if (!foot || foot.y + foot.height > tall + 1) fail(`/minpentai?${q} (${scheme}): the footer is cut off`);
        // Full screen (owner, 2026-10-09): the frame fills the viewport, the site's top bar is hidden, and × goes back to the site.
        await checkLearnFullScreen(page, `/minpentai?${q} (${scheme})`);
        // The rules note links to the book's rule on its own page.
        const note = page.locator('.ml-rulesnote a');
        if ((await note.count()) && (await note.getAttribute('href')) !== '/minpentai/rule') fail(`/minpentai?${q} (${scheme}): the rules note does not link to /minpentai/rule`);
      }
    }
    await checkPlay(page, scheme);
    // The rule recovered from the book's figure (c4-b5, c4-b7), on its own page; the sandbox's board links (?s=) land on it.
    await open(page, '/minpentai/rule');
    await checkFloors(page, '/minpentai/rule', scheme);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail(`/minpentai/rule (${scheme}): the page scrolls sideways at 390px`);
    {
      const tags = await page.locator('.mr .ml-tag .info-word').evaluateAll((els) => els.filter((e) => (e as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 0).map((e) => (e.textContent ?? '').trim()));
      if (!tags.includes('Book') || tags.includes('Invented')) fail(`/minpentai/rule (${scheme}): tagged ${tags.join(', ')}, not as the book's rule`);
      const words = (await page.locator('.mr').textContent()) ?? '';
      if (!words.includes('c4-b5') || !words.includes('c4-b7')) fail(`/minpentai/rule (${scheme}): does not cite c4-b5 and c4-b7`);
      if (!(await page.locator('.mr-link[href$="/blob/main/docs/minpentai-rules.md"]').count())) fail(`/minpentai/rule (${scheme}): no link to docs/minpentai-rules.md on GitHub`);
      await page.getByRole('button', { name: 'Step forward one turn' }).click();
      if (!/TURN 1 /.test((await page.locator('.mr .ml-strip').textContent()) ?? '')) fail(`/minpentai/rule (${scheme}): stepping does not run the board`);
      if (await page.locator('.topbar').isVisible() === false) fail(`/minpentai/rule (${scheme}): the site's top bar is hidden on the rule page`);
    }
    await open(page, '/minpentai?s=AAAA');
    await page.waitForURL('**/minpentai/rule', { timeout: 5000 }).catch(() => fail(`/minpentai?s= (${scheme}): an old sandbox board link does not open /minpentai/rule`));

    for (let n = 1; n <= 32; n++) {
      await open(page, `/chapter/${n}`);
      await checkFloors(page, `/chapter/${n}`, scheme);
      if (scheme !== 'light') continue;
      const c = await page.evaluate(() => ({
        paper: getComputedStyle(document.body).backgroundColor,
        datelines: Array.from(document.querySelectorAll('.block.dateline')).map((d) => ({
          id: d.id,
          setting: d.getAttribute('data-setting'),
          color: getComputedStyle(d).color,
        })),
      }));
      if (c.paper !== PAPER) fail(`/chapter/${n}: paper is ${c.paper}, not ${PAPER}`);
      for (const d of c.datelines) {
        const want = (d.setting && ACCENT[d.setting]) || INK;
        if (d.color !== want) fail(`/chapter/${n} ${d.id}: dateline (${d.setting}) is ${d.color}, not ${want}`);
      }
    }
    await page.close();
  }

  // ---- Tablet and desktop (src/components/app-shell.tsx, src/styles/shell.css) ----
  // 390 and the Farcaster frame: top bar, no rail; 1024: the rail collapsed; 1440: rail open and the assistant beside the page.
  for (const width of [1024, 1440, 2000]) {
    for (const scheme of ['light', 'dark'] as const) {
      const page = await newPage({ viewport: { width, height: 900 }, colorScheme: scheme, hasTouch: width === 1024 });
      await page.addInitScript('window.__name = (f) => f');
      for (const path of ['/', '/chapter/1', '/about', '/cards', '/adaptations', '/minpentai', '/minpentai/rule', '/assistant', '/glossary', '/glossary/zei']) {
        await open(page, path);
        await checkFloors(page, `${path} @${width}`, scheme);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (wide > 1) fail(`${path} @${width} (${scheme}): scrolls sideways by ${wide}px`);
        const measure = await page.evaluate(() => {
          const el = document.querySelector('main .page.chapter, main .page') as HTMLElement | null;
          return el ? el.getBoundingClientRect().width : 0;
        });
        if (measure > 700) fail(`${path} @${width}: the reading column is ${Math.round(measure)}px wide`);
        // Home is Design's wide page (no .page column): its hero text keeps Design's 780px measure.
        if (path === '/') {
          const hero = await page.evaluate(() => document.querySelector('.home-hero-text')?.getBoundingClientRect().width ?? 0);
          if (!hero || hero > 781) fail(`/ @${width}: the hero text is ${Math.round(hero)}px wide (Design: at most 780)`);
        }
        if (await page.locator('.topbar').isVisible()) fail(`${path} @${width}: the phone top bar shows`);
        // Learn is Design's phone, centred beside the rail, on tablet and desktop (full screen is for phones and the Farcaster app).
        if (path === '/minpentai' && ((await page.locator('.ml-exit').isVisible()) || !(await page.locator('.rail').isVisible()))) fail(`/minpentai @${width}: Learn is full screen outside a phone`);
        if (path.startsWith('/glossary')) await shot(page, `desktop-${width}${path.replace(/\//g, '-')}`, scheme);
      }
      await open(page, '/chapter/1');
      const bodyShown = await page.locator('.rail-body').isVisible();
      if (width === 1024) {
        if (bodyShown) fail('@1024: the rail is not collapsed');
        if (await page.locator('.panel').isVisible()) fail('@1024: the assistant panel shows on a tablet');
        await shot(page, `desktop-${width}-chapter`, scheme);
        await page.click('.rail-collapse');
        await page.waitForSelector('.rail.is-open .rail-body a');
        if (!(await page.evaluate(() => Boolean(document.activeElement?.closest('.rail'))))) fail('@1024: opening the rail does not move focus into it');
        await checkFloors(page, '/chapter/1 @1024 (rail open)', scheme);
        await shot(page, `desktop-${width}-rail-open`, scheme);
        await page.keyboard.press('Escape');
        if (await page.locator('.rail.is-open').count()) fail('@1024: Escape does not close the rail');
        if (!(await page.evaluate(() => document.activeElement?.classList.contains('rail-collapse')))) fail('@1024: focus does not return to the rail control');
      } else {
        if (!bodyShown) fail(`@${width}: the rail is not open`);
        const current = await page.locator('.rail-chapters a[aria-current="page"]').textContent();
        if (!current?.includes('Chapter 1')) fail(`@${width}: the rail does not mark the current chapter`);
        // Signed out: the assistant panel is there, with what it does and a sign-in button.
        await page.waitForSelector('.panel .as-signed-out button');
        await shot(page, `desktop-${width}-chapter`, scheme);
        // Listen view.
        await open(page, '/chapter/1?view=listen');
        await page.waitForSelector('.listen-pane .listen-progress');
        await checkFloors(page, `/chapter/1?view=listen @${width}`, scheme);
        await page.focus('.listen-progress');
        const before = await page.getAttribute('.listen-progress', 'aria-valuenow');
        await page.keyboard.press('ArrowRight');
        const after = await page.getAttribute('.listen-progress', 'aria-valuenow');
        if (before === after) fail(`@${width}: the progress bar does not move with the keyboard`);
        await shot(page, `desktop-${width}-listen`, scheme);
        // Signed in (session and status mocked): the assistant home in the panel.
        await page.route('**/api/chat/status', (r) =>
          r.fulfill({ json: { available: true, model: 'gpt-oss-120b', host: 'Vercel AI Gateway', provider: 'Groq', perDay: 30, left: 30 } }),
        );
        await page.addInitScript(() => {
          const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
          localStorage.setItem('snowmoon.signin', JSON.stringify({ token: `x.${b64({ sub: 1, exp: 4102444800 })}.y`, fid: 1, username: 'check', exp: 4102444800 }));
        });
        await open(page, '/chapter/1');
        await page.waitForSelector('.panel .as-start');
        await checkFloors(page, `/chapter/1 @${width} (signed in)`, scheme);
        await shot(page, `desktop-${width}-signed-in`, scheme);
        await page.unroute('**/api/chat/status');
      }
      await page.close();
    }
  }
  // Phone width: no rail at all.
  for (const scheme of ['light', 'dark'] as const) {
    const page = await newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme, hasTouch: true });
    await open(page, '/chapter/1');
    if (await page.locator('.rail').isVisible()) fail('@390: the rail shows on a phone');
    await shot(page, 'phone-390-chapter', scheme);
    await page.click('.topbar-icon[aria-label="Menu"]');
    await page.waitForSelector('.menu-sheet');
    await checkFloors(page, '/chapter/1 @390 (menu)', scheme);
    await shot(page, 'phone-390-menu', scheme);
    await page.keyboard.press('Escape');
    if (await page.locator('.menu-sheet').count()) fail('@390: Escape does not close the menu');
    // A link to another site opens in a new tab and leaves this one where it was (owner, 2026-10-08).
    if (scheme === 'light') {
      const [popup] = await Promise.all([page.waitForEvent('popup', { timeout: 10000 }).catch(() => null), page.locator('a.provenance').first().click()]);
      if (!popup) fail('@390: the source-edition link (another site) does not open in a new tab');
      else await popup.close();
      if (!page.url().includes('/chapter/1')) {
        fail('@390: following a link to another site left the chapter');
        await open(page, '/chapter/1');
      }
    }
    // The AI label under an image (owner, 2026-10-09): a button that says AI, reached by keyboard, opening the sheet.
    const label = page.locator('.seed-image button.ai-label').first();
    if ((await label.getAttribute('aria-haspopup')) !== 'dialog') fail('@390: the AI label is not a button that opens a dialog');
    if (!/\bAI\b/.test((await label.innerText()) ?? '')) fail('@390: the AI label does not say AI');
    if (!(await label.isVisible())) fail('@390: the AI label under a seeded image is not shown, so its recipe sheet cannot be opened');
    else {
      await label.focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('.recipe-sheet dt');
      const model = await page.textContent('.recipe-sheet');
      if (!/FLUX|Model/.test(model ?? '')) fail('@390: the recipe sheet does not show the model');
      if (!/not by the author/i.test(model ?? '')) fail('@390: the recipe sheet does not say "not by the author"');
      if (!(await page.locator('.recipe-sheet a.recipe-github').count())) fail('@390: the recipe sheet does not link the full recipe');
      await checkFloors(page, '/chapter/1 @390 (recipe)', scheme);
      await shot(page, 'phone-390-recipe', scheme);
      await page.keyboard.press('Escape');
      if (await page.locator('.recipe-sheet').count()) fail('@390: Escape does not close the recipe sheet');
      if (!(await label.evaluate((el) => el === document.activeElement))) fail('@390: closing the recipe sheet does not return focus to the AI label');
    }
    await open(page, '/chapter/1?view=listen');
    await page.waitForSelector('.listen-pane');
    await checkFloors(page, '/chapter/1?view=listen @390', scheme);
    await shot(page, 'phone-390-listen', scheme);
    await page.close();
  }
  {
    const frame = await newPage({ viewport: { width: 424, height: 695 }, hasTouch: true });
    await open(frame, '/chapter/1');
    if (await frame.locator('.rail').isVisible()) fail('@424×695: the rail shows in the Farcaster frame');
    // Learn fills the Farcaster frame: a watch screen, a lesson, Under the hood and the practice match.
    for (const q of ['lesson=1', 'lesson=13', `lesson=${MINPENTAI_HOOD}`, 'mode=practice']) {
      await open(frame, `/minpentai?${q}`);
      await checkLearnFullScreen(frame, `/minpentai?${q} @424×695`);
      const foot = await frame.locator('.ml-foot').boundingBox();
      if (!foot || foot.y + foot.height > 695 + 1) fail(`/minpentai?${q} @424×695: the footer is cut off`);
    }
    await checkPlayFullScreen(frame, '@424×695', 695);
    await frame.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\nUI CHECK FAILED (${failures.length}):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`ui check passed: ${BASE}, ${38 + MINPENTAI_LESSONS + 4} pages, the chapter sheet, the glossary's covers and back link, and 8 assistant states × light and dark; 10 pages at 1024, 1440 and 2000; AI labels on 9 screens at 390 and 1440`);
