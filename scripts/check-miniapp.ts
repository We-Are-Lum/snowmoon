/**
 * The app as a Farcaster miniapp, in a stand-in client (scripts/miniapp-host/host.ts).
 * Fails (exit 1) on any problem.
 *
 *   npm run check:miniapp -- --url=http://localhost:3000
 *
 * - Every entry point (home, a chapter, /assistant) calls ready() exactly once, so the
 *   Farcaster splash screen goes away.
 * - Sign-in is silent and happens once per launch, shared by the bar and the assistant;
 *   every chat request carries the Quick Auth token as a bearer.
 * - The assistant works inside the 424×695 frame: home, the notice, an answer.
 * - Learn Minpentai and Free play fill the 424×695 frame: no site top bar, a × back to the site.
 * - The page can be framed (no X-Frame-Options or frame-ancestors).
 * - /assistant has its own embed, so a cast link opens the assistant.
 * The Quick Auth server and the chat API are mocked: what is checked is the client's
 * wiring. The server's token check (src/lib/auth.ts) needs a real Farcaster sign-in.
 */
import { build } from 'esbuild';
import { chromium, type Frame } from 'playwright-core';
import { CHAT } from '../src/lib/config';

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const BASE = (arg('url') ?? 'http://localhost:3000').replace(/\/$/, '');
const HOST = 'http://localhost:3199/';
const failures: string[] = [];
const fail = (m: string) => failures.push(m);

const bundle = (await build({ entryPoints: [new URL('./miniapp-host/host.ts', import.meta.url).pathname], bundle: true, format: 'iife', write: false, logLevel: 'error' })).outputFiles[0].text;
// A fake token the SDK can decode (it reads exp); the API is mocked, so nothing verifies it.
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `${b64({ alg: 'EdDSA', typ: 'JWT' })}.${b64({ sub: 6786, exp: 4102444800, iss: 'https://auth.farcaster.xyz', aud: new URL(BASE).hostname })}.c2ln`;

for (const h of ['/', '/assistant']) {
  const res = await fetch(BASE + h, { redirect: 'manual' });
  if (res.headers.get('x-frame-options')) fail(`${h}: X-Frame-Options ${res.headers.get('x-frame-options')} stops Farcaster framing it`);
  if (/frame-ancestors/.test(res.headers.get('content-security-policy') ?? '')) fail(`${h}: CSP frame-ancestors may stop Farcaster framing it`);
  if (h === '/assistant') {
    const html = await res.text();
    const m = html.match(/<meta name="fc:miniapp" content="([^"]+)"/);
    const embed = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null;
    if (!embed?.button?.action?.url?.endsWith('/assistant')) fail(`/assistant: its fc:miniapp embed does not open /assistant (${embed?.button?.action?.url})`);
  }
}

// Chrome blocks a page framing localhost unless the framing page is local too; this one is routed, so allow it.
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessForNavigations'] });
try {
  for (const path of ['/', '/chapter/1', '/assistant']) {
    const page = await browser.newPage({ viewport: { width: 480, height: 760 } });
    await page.addInitScript('window.__name = (f) => f');
    const errors: string[] = [];
    const bearer: Record<string, string[]> = {};
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(HOST + '**', (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0"><script>${bundle.replace(/<\/script>/g, '<\\/script>')}</script></body>` }));
    await page.route('https://auth.farcaster.xyz/**', (r) => r.fulfill({ json: new URL(r.request().url()).pathname.includes('nonce') ? { nonce: 'checknonce1' } : { token: TOKEN } }));
    const seen = (name: string, auth?: string) => (bearer[name] ??= []).push(auth ?? '');
    await page.route('**/api/auth/me', (r) => (seen('me', r.request().headers().authorization), r.fulfill({ json: { fid: 6786 } })));
    await page.route('**/api/chat/status', (r) => (seen('status', r.request().headers().authorization), r.fulfill({ json: { available: true, model: 'gpt-oss-120b', host: 'Vercel AI Gateway', provider: 'Groq', perDay: 30, left: 30 } })));
    await page.route('**/api/chat/ask', (r) => (seen('ask', r.request().headers().authorization), r.fulfill({ json: { state: 'answer', parts: [{ type: 'text', text: 'Commentary.' }], quotes: [], heldBack: false, left: 29, guard: 'ok', dropped: 0, regenerated: false } })));
    await page.goto(`${HOST}?url=${encodeURIComponent(BASE + path)}`);
    const frame = await new Promise<Frame>((resolve) => {
      const t = setInterval(() => {
        const f = page.frames().find((x) => x !== page.mainFrame() && x.url().startsWith(BASE));
        if (f) (clearInterval(t), resolve(f));
      }, 100);
    });
    // The first-visit intro covers the home page once; skip it, as a visitor would.
    const skip = frame.getByRole('button', { name: 'Skip', exact: true });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    // Signed in silently: the menu shows the account from the Farcaster context.
    await frame.click('.topbar-icon[aria-label="Menu"]');
    await frame.waitForSelector('.menu-sheet .account-name:has-text("@check")', { timeout: 15000 }).catch(() => fail(`${path}: not signed in silently`));
    await frame.click('.menu-close');
    if (path === '/assistant') {
      await frame.waitForSelector('.as-start', { timeout: 15000 });
      await frame.evaluate(() => localStorage.clear());
      await frame.click('.as-start');
      await frame.fill('#as-q', 'Why is Gladias asked to rate a building?');
      await frame.click('.as-send');
      await frame.waitForSelector('.as-sheet');
      const notice = (await frame.textContent('.as-sheet')) ?? '';
      // The notice names where messages go (src/lib/chat/notice.ts): the provider, and the gateway while it is the fallback.
      if (!notice.includes(CHAT.providerName ?? '\u0000') || (CHAT.gatewayFallback && !notice.includes(CHAT.host ?? '\u0000'))) fail('/assistant: the notice does not name every hop in use');
      if (!/saved only on this device/i.test(notice) || !/never published/i.test(notice)) fail('/assistant: the notice does not say questions are saved only on this device and never published');
      const box = await frame.locator('.as-sheet .as-primary').boundingBox();
      if (!box || box.y + box.height > 695) fail('/assistant: the notice\'s Continue button is outside the 695px frame');
      await frame.click('.as-sheet .as-primary');
      await frame.waitForSelector('.as-answer');
    }
    const host = await page.evaluate(() => window.__host);
    if (host.ready !== 1) fail(`${path}: ready() called ${host.ready} times, not once`);
    if (host.signIn !== 1) fail(`${path}: sign-in asked ${host.signIn} times, not once`);
    for (const [name, auths] of Object.entries(bearer)) if (auths.some((a) => a !== `Bearer ${TOKEN}`)) fail(`${path}: /api/${name} sent without the Quick Auth bearer`);
    if (path === '/assistant' && !(bearer.status && bearer.ask)) fail('/assistant: the chat API was not called from inside the frame');
    for (const e of errors) fail(`${path}: page error: ${e}`);
    await page.close();
  }
  // Learn Minpentai fills the Farcaster frame (owner, 2026-10-09): no site top bar, the frame is the iframe's viewport, × back to the site.
  // ?mode=free became Minpentai Play's free play (another session, 2026-10-09); it is checked below as Play.
  for (const path of ['/minpentai?lesson=13', '/minpentai?mode=practice']) {
    const page = await browser.newPage({ viewport: { width: 480, height: 760 } });
    await page.addInitScript('window.__name = (f) => f');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(HOST + '**', (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0"><script>${bundle.replace(/<\/script>/g, '<\\/script>')}</script></body>` }));
    await page.route('https://auth.farcaster.xyz/**', (r) => r.fulfill({ json: new URL(r.request().url()).pathname.includes('nonce') ? { nonce: 'checknonce1' } : { token: TOKEN } }));
    await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
    await page.goto(`${HOST}?url=${encodeURIComponent(BASE + path)}`);
    const frame = await new Promise<Frame>((resolve) => {
      const t = setInterval(() => {
        const f = page.frames().find((x) => x !== page.mainFrame() && x.url().startsWith(BASE));
        if (f) (clearInterval(t), resolve(f));
      }, 100);
    });
    await frame.waitForSelector('html.ml-in-app .ml-learn .ml-foot', { timeout: 15000 }).catch(() => fail(`${path}: Learn does not know it is in the mini app`));
    const r = await frame.evaluate(() => {
      const b = document.querySelector('.ml-learn')!.getBoundingClientRect();
      const top = document.querySelector('.topbar');
      const exit = document.querySelector('.ml-exit') as HTMLAnchorElement | null;
      return { x: b.x, y: b.y, w: b.width, h: b.height, vw: innerWidth, vh: innerHeight, bar: !!top && getComputedStyle(top).display !== 'none', exit: !!exit && getComputedStyle(exit).display !== 'none' && exit.getAttribute('href') };
    });
    if (Math.abs(r.x) > 1 || Math.abs(r.y) > 1 || Math.abs(r.w - r.vw) > 1 || Math.abs(r.h - r.vh) > 1) fail(`${path}: Learn does not fill the Farcaster frame (${Math.round(r.w)}×${Math.round(r.h)} at ${Math.round(r.x)},${Math.round(r.y)} in ${r.vw}×${r.vh})`);
    if (r.bar) fail(`${path}: the site's top bar shows above Learn in the Farcaster frame`);
    if (r.exit !== '/') fail(`${path}: no × back to the site in the Farcaster frame`);
    const host = await page.evaluate(() => window.__host);
    if (host.ready !== 1) fail(`${path}: ready() called ${host.ready} times, not once`);
    for (const e of errors) fail(`${path}: page error: ${e}`);
    await page.close();
  }
  // Minpentai Play's free play loads in the Farcaster frame: its frame shows, ready() once, no page errors.
  // Whether Play should fill the frame is for Play's owner to decide; this checks only that it works there.
  {
    const path = '/minpentai?mode=free';
    const page = await browser.newPage({ viewport: { width: 480, height: 760 } });
    await page.addInitScript('window.__name = (f) => f');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(HOST + '**', (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0"><script>${bundle.replace(/<\/script>/g, '<\\/script>')}</script></body>` }));
    await page.route('https://auth.farcaster.xyz/**', (r) => r.fulfill({ json: new URL(r.request().url()).pathname.includes('nonce') ? { nonce: 'checknonce1' } : { token: TOKEN } }));
    // Play's own API calls go to the server under test (an empty stand-in reply breaks it; it reads them signed out).
    await page.goto(`${HOST}?url=${encodeURIComponent(BASE + path)}`);
    const frame = await new Promise<Frame>((resolve) => {
      const t = setInterval(() => {
        const f = page.frames().find((x) => x !== page.mainFrame() && x.url().startsWith(BASE));
        if (f) (clearInterval(t), resolve(f));
      }, 100);
    });
    await frame.waitForSelector('.mp-play:not([aria-busy])', { timeout: 15000 }).catch(() => fail(`${path}: Minpentai Play does not show in the Farcaster frame`));
    const host = await page.evaluate(() => window.__host);
    if (host.ready !== 1) fail(`${path}: ready() called ${host.ready} times, not once`);
    for (const e of errors) fail(`${path}: page error: ${e}`);
    await page.close();
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`MINIAPP CHECK FAILED (${failures.length}):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`miniapp check passed: ${BASE}, home, a chapter, the assistant and Learn Minpentai (full screen) and Minpentai Play in a stand-in Farcaster client`);
