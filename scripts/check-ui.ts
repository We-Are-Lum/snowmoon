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
 * - The first screen says: independent adaptation, not affiliated with the author, no token.
 * - The live voting screens (c1-b18, c1-b31, c7-b6) start where the book shows them, move by
 *   keyboard, and Reset returns them, with no request made and no storage changed.
 * - The assistant (/assistant) meets the same floors signed out (9d), the reader's "Ask about this" (1a), its home (1d),
 *   the first-time notice (2), a thread with an answer and quote cards (3), a held-back
 *   question (9b) and the daily limit (9c). The API is replayed from results recorded
 *   live (scripts/fixtures/chat-live-2026-10-07.json); quotes are checked against the
 *   stored text by test:chat. --shots=DIR also saves a screenshot of each.
 * - Learn Minpentai's screens are full screen at 390 and in the 424 × 695 Farcaster frame (the frame fills the
 *   viewport, no site top bar, a × back to the site), and Design's centred phone beside the rail at 1024 and up.
 */
import { readFileSync } from 'node:fs';
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
        if (el.tagName === 'A' && el.closest('p, li') && !el.closest('.chapter-list, nav')) continue; // inline in running text
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
const browser = await chromium.launch({ channel: 'chrome' });
try {
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

    await open(page, '/');
    await checkFloors(page, '/', scheme);
    if (scheme === 'light') {
      const first = await page.evaluate(() =>
        Array.from(document.querySelectorAll('body *'))
          .filter((e) => e.getBoundingClientRect().top < innerHeight && e.getBoundingClientRect().bottom > 0)
          .map((e) => Array.from(e.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '))
          .join(' ')
          .replace(/\s+/g, ' ')
          .toLowerCase(),
      );
      for (const phrase of ['independent adaptation', 'not affiliated with the author', 'no token']) {
        if (!first.includes(phrase)) fail(`/: first screen does not say "${phrase}"`);
      }
    }

    await open(page, '/about');
    await checkFloors(page, '/about', scheme);
    await checkAssistant(page, scheme);
    await checkLiveScreens(page, scheme);
    await open(page, '/cards');
    await checkFloors(page, '/cards', scheme);
    // Readers' images (slice 1): the feed for everyone; "Add an image" only for a signed-in, invited FID.
    await open(page, '/images');
    await checkFloors(page, '/images', scheme);
    if (!(await page.getByText('Most liked').isVisible())) fail('/images: no "Most liked" order');
    await open(page, '/chapter/1');
    if (await page.locator('.add-image').count()) fail('/chapter/1: "Add an image" shows to a signed-out reader');
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

    // Minpentai: every tutorial screen and every mode, at phone width.
    for (const q of [...Array.from({ length: MINPENTAI_LESSONS }, (_, i) => `lesson=${i + 1}`), 'mode=practice', 'mode=play', 'mode=free']) {
      await open(page, `/minpentai?${q}`);
      await page.waitForTimeout(150);
      await checkFloors(page, `/minpentai?${q}`, scheme);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (wide) fail(`/minpentai?${q} (${scheme}): the page scrolls sideways at 390px`);
      if (q.startsWith('lesson=') || q === 'mode=practice') {
        // Learn: the game is labelled as invented for this edition (P8d), except Under the hood, which is the book's rule.
        const tags = await page.locator('.ml-tag').allTextContents();
        const labelled = tags.includes('RULES INVENTED FOR THIS EDITION');
        if (q === `lesson=${MINPENTAI_HOOD}` ? labelled : !labelled) fail(`/minpentai?${q} (${scheme}): the "Rules invented for this edition" tag is ${labelled ? 'on the book\'s rule' : 'missing'}`);
        // The footer (progress, BACK, the main button) stays in view.
        const foot = await page.locator('.ml-foot').boundingBox();
        const tall = await page.evaluate(() => innerHeight);
        if (!foot || foot.y + foot.height > tall + 1) fail(`/minpentai?${q} (${scheme}): the footer is cut off`);
        // Full screen (owner, 2026-10-09): the frame fills the viewport, the site's top bar is hidden, and × goes back to the site.
        await checkLearnFullScreen(page, `/minpentai?${q} (${scheme})`);
      }
    }

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
      for (const path of ['/', '/chapter/1', '/about', '/cards', '/adaptations', '/minpentai', '/assistant']) {
        await open(page, path);
        await checkFloors(page, `${path} @${width}`, scheme);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (wide > 1) fail(`${path} @${width} (${scheme}): scrolls sideways by ${wide}px`);
        const measure = await page.evaluate(() => {
          const el = document.querySelector('main .page.chapter, main .page') as HTMLElement | null;
          return el ? el.getBoundingClientRect().width : 0;
        });
        if (measure > 700) fail(`${path} @${width}: the reading column is ${Math.round(measure)}px wide`);
        if (await page.locator('.topbar').isVisible()) fail(`${path} @${width}: the phone top bar shows`);
        // Learn is Design's phone, centred beside the rail, on tablet and desktop (full screen is for phones and the Farcaster app).
        if (path === '/minpentai' && ((await page.locator('.ml-exit').isVisible()) || !(await page.locator('.rail').isVisible()))) fail(`/minpentai @${width}: Learn is full screen outside a phone`);
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
    await frame.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\nUI CHECK FAILED (${failures.length}):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`ui check passed: ${BASE}, ${36 + MINPENTAI_LESSONS + 3} pages, the chapter sheet and 8 assistant states × light and dark; 7 pages at 1024, 1440 and 2000`);
