/**
 * Reader UI floors, checked in a real browser at phone width (390px), light and dark.
 * Fails (exit 1) on any problem. Uses the locally installed Chrome (playwright-core).
 *
 *   npm run check:ui -- --url=http://localhost:3000
 *   npm run check:ui -- --url=… --inject-css='…'   plant an error; must fail
 *
 * - Text is at least 12px everywhere, including SVG text at its rendered scale.
 * - Tap targets are at least 44×44. Exempt: links inside running text (WCAG 2.5.8's
 *   inline exception) and disabled controls drawn inside source screens.
 * - App chrome uses Crimson Pro or DM Mono only; source screens, lyric cards, SVGs,
 *   and in-world templates may use their own faces.
 * - Paper is #F4F2ED in light mode in every chapter. Datelines take the accent of
 *   their setting: #2E5A3A Veridia, #B3306E Dzego, ink otherwise.
 * - The first screen says: independent adaptation, not affiliated with the author, no token.
 */
import { readFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const BASE = (arg('url') ?? 'http://localhost:3000').replace(/\/$/, '');
const INJECT = arg('inject-css');
const MIN_TEXT = 12;
const MIN_TAP = 44;
const PAPER = 'rgb(244, 242, 237)';
const ACCENT: Record<string, string> = { veridia: 'rgb(46, 90, 58)', dzego: 'rgb(179, 48, 110)' };
const INK = 'rgb(29, 29, 27)';
const IN_WORLD = '.device-view, .dz-card, svg, [data-template]';
/** Tutorial screens at /minpentai (src/lib/minpentai/tutorial.ts). */
const MINPENTAI_LESSONS = 11;

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);

async function open(page: Page, path: string) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  if (INJECT) await page.addStyleTag({ content: INJECT });
  await page.evaluate(() => document.fonts.ready);
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
      for (const el of Array.from(document.querySelectorAll('a, button, input, select, summary, [role="button"]'))) {
        if (!visible(el)) continue;
        if ((el as HTMLButtonElement).disabled && el.closest('.device-view')) continue;
        if (el.tagName === 'A' && el.closest('p, li') && !el.closest('.chapter-list, nav')) continue; // inline in running text
        const r = el.getBoundingClientRect();
        if (r.width < MIN_TAP - 0.5 || r.height < MIN_TAP - 0.5) taps.push(`${describe(el)} "${(el.textContent ?? '').trim().slice(0, 20)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      return { small, taps, fonts, overflow: document.documentElement.scrollWidth - innerWidth };
    },
    { MIN_TEXT, MIN_TAP, IN_WORLD },
  );
  const where = `${path} (${scheme})`;
  if (r.small.length) fail(`${where}: ${r.small.length} text below ${MIN_TEXT}px, e.g. ${r.small.slice(0, 3).join('; ')}`);
  if (r.taps.length) fail(`${where}: ${r.taps.length} tap targets below ${MIN_TAP}px, e.g. ${r.taps.slice(0, 3).join('; ')}`);
  if (r.fonts.length) fail(`${where}: ${r.fonts.length} chrome elements in other fonts, e.g. ${r.fonts.slice(0, 3).join('; ')}`);
  if (r.overflow > 0) fail(`${where}: page scrolls sideways by ${r.overflow}px`);
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  // First-visit intro (config/intro.json): once, home page only, Skip on every
  // card, remembered on the device without cookies; deep links go straight in.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
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
    await open(page, '/cards');
    await checkFloors(page, '/cards', scheme);

    // Minpentai: every tutorial screen and every mode, at phone width.
    for (const q of [...Array.from({ length: MINPENTAI_LESSONS }, (_, i) => `lesson=${i + 1}`), 'mode=practice', 'mode=play', 'mode=free']) {
      await open(page, `/minpentai?${q}`);
      await page.waitForTimeout(150);
      await checkFloors(page, `/minpentai?${q}`, scheme);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (wide) fail(`/minpentai?${q} (${scheme}): the page scrolls sideways at 390px`);
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
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\nUI CHECK FAILED (${failures.length}):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`ui check passed: ${BASE}, ${35 + MINPENTAI_LESSONS + 3} pages × light and dark`);
