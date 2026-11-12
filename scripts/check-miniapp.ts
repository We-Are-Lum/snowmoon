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
 * - A remix page (/references/designs/<id>, owner 2026-11-04) has its embed ("Remix this", a 3:2 PNG card) and link
 *   preview (Open Graph, twitter:card, 1200×630); a hidden or unpublished one has none (fixture build, on localhost).
 * - /minpentai has its share card: "Start the tutorial" opens /minpentai?lesson=1, 1200×800 embed, 1200×630 og:image
 *   and twitter:card summary_large_image; a shared win (/minpentai/result) keeps its own card.
 * The Quick Auth server and the chat API are mocked: what is checked is the client's
 * wiring. The server's token check (src/lib/auth.ts) needs a real Farcaster sign-in.
 */
import { build } from 'esbuild';
import { chromium, type Frame } from 'playwright-core';
import { CHALLENGE, CHAT } from '../src/lib/config';
import { requireTarget } from './lib/target';

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const BASE = requireTarget('check:miniapp');
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

// The share card for /minpentai (owner, 2026-10-20): Farcaster's 3:2 embed with "Start the tutorial" opening
// /minpentai?lesson=1 (also when the pasted link already has it), and X's 1200×630 large card. The images are
// fetched from this server by path, since the tags name the app's own address.
const metaTags = (html: string) => {
  const tags: Record<string, string> = {};
  for (const [, , k, v] of html.matchAll(/<meta (name|property)="([^"]+)" content="([^"]*)"/g)) tags[k] = v.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");
  return tags;
};
/** "WxH" for a PNG, the content type otherwise, '' when it does not answer. */
const imageKind = async (url: string, where: string) => {
  const u = new URL(url, BASE);
  const res = await fetch(BASE + u.pathname + u.search);
  const b = Buffer.from(await res.arrayBuffer());
  if (!res.ok) return fail(`${where}: ${url} answers ${res.status}`), '';
  if (b.subarray(1, 4).toString() === 'PNG') return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
  return res.headers.get('content-type') ?? '';
};
for (const h of ['/minpentai', '/minpentai?lesson=1']) {
  const t = metaTags(await (await fetch(BASE + h)).text());
  for (const name of ['fc:miniapp', 'fc:frame']) {
    const e = t[name] ? JSON.parse(t[name]) : null;
    if (e?.button?.title !== 'Start the tutorial') fail(`${h}: ${name} button is "${e?.button?.title}", not "Start the tutorial"`);
    if (!String(e?.button?.action?.url).endsWith('/minpentai?lesson=1')) fail(`${h}: ${name} button opens ${e?.button?.action?.url}, not /minpentai?lesson=1`);
    if (!String(e?.imageUrl).endsWith('/share/minpentai-embed-3x2.png')) fail(`${h}: ${name} image is ${e?.imageUrl}`);
    else if ((await imageKind(e.imageUrl, h)) !== '1200x800') fail(`${h}: ${name} image is not a 1200×800 PNG`);
  }
  if (t['twitter:card'] !== 'summary_large_image') fail(`${h}: twitter:card is ${t['twitter:card']}, not summary_large_image`);
  for (const k of ['og:image', 'twitter:image']) {
    if (!t[k]?.endsWith('/share/minpentai-og-1200x630.png')) fail(`${h}: ${k} is ${t[k]}`);
    else if ((await imageKind(t[k], h)) !== '1200x630') fail(`${h}: ${k} is not a 1200×630 PNG`);
  }
  if (t['og:image:width'] !== '1200' || t['og:image:height'] !== '630') fail(`${h}: og:image is not declared 1200×630`);
}
// The challenge poster as /challenge's link preview, only while entries are open (owner, 2026-11-12): Farcaster's embed
// the 1200×800 JPEG, Open Graph and the X card (summary_large_image) the 1200×630 JPEG, both served from public/challenge/
// with their recipe beside them. Before or after the window: the site's card (embed.png) and no og:image, as before.
// A target that doesn't serve the poster yet (a deploy before this change) is said, not failed.
{
  const { POSTER } = await import('../src/lib/challenge/poster');
  const { phase } = await import('../src/lib/challenge/rules');
  const jpegSize = (b: Buffer) => {
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) return '';
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return `${b.readUInt16BE(i + 7)}x${b.readUInt16BE(i + 5)}`;
      i += 2 + len;
    }
    return '';
  };
  const served = (await fetch(`${BASE}/challenge/poster-recipe.json`)).ok;
  const h = '/challenge';
  const t = metaTags(await (await fetch(BASE + h)).text());
  const e = t['fc:miniapp'] ? JSON.parse(t['fc:miniapp']) : null;
  if (!CHALLENGE.public) console.log(`${h}: the challenge isn't public on this build; its preview wasn't checked`);
  else if (!served) console.log(`${h}: this target doesn't serve the poster yet (a deploy before it); its preview wasn't checked`);
  else if (phase() === 'open') {
    if (!String(e?.imageUrl).endsWith(POSTER.embed)) fail(`${h}: fc:miniapp image is ${e?.imageUrl}, not the poster (${POSTER.embed})`);
    if (t['twitter:card'] !== 'summary_large_image') fail(`${h}: twitter:card is ${t['twitter:card']}, not summary_large_image`);
    for (const k of ['og:image', 'twitter:image']) if (!t[k]?.endsWith(POSTER.og)) fail(`${h}: ${k} is ${t[k]}, not the poster (${POSTER.og})`);
    if (t['og:image:width'] !== '1200' || t['og:image:height'] !== '630') fail(`${h}: og:image is not declared 1200×630`);
    if (!/AI-generated/.test(t['og:image:alt'] ?? '') || /not by the author/i.test(t['og:image:alt'] ?? '')) fail(`${h}: og:image:alt doesn't say AI-generated (or says "not by the author")`);
    for (const [path, want] of [[POSTER.embed, '1200x800'], [POSTER.og, '1200x630']] as const) {
      const r = await fetch(BASE + path);
      const got = r.ok && /^image\/jpeg/.test(r.headers.get('content-type') ?? '') ? jpegSize(Buffer.from(await r.arrayBuffer())) : `${r.status} ${r.headers.get('content-type')}`;
      if (got !== want) fail(`${h}: ${path} is ${got}, not a ${want} JPEG`);
    }
    const recipe = (await (await fetch(`${BASE}/challenge/poster-recipe.json`)).json()) as { model?: { id?: string; maker?: string }; prompt?: string; references?: unknown[]; cost_usd?: number };
    if (!recipe.model?.id || !recipe.model.maker || !recipe.prompt || (recipe.references ?? []).length !== 7 || typeof recipe.cost_usd !== 'number') fail(`${h}: the poster's recipe is missing its model, prompt, seven references or cost`);
  } else {
    if (!String(e?.imageUrl).endsWith('/embed.png')) fail(`${h}: outside the entry window, fc:miniapp image is ${e?.imageUrl}, not the site's card`);
    if (t['og:image']) fail(`${h}: outside the entry window, og:image is ${t['og:image']} (want none, as before)`);
  }
}
// A shared ladder win keeps its own card, unchanged (src/app/minpentai/result/page.tsx).
{
  const h = '/minpentai/result?r=3&s=42';
  const t = metaTags(await (await fetch(BASE + h)).text());
  const e = t['fc:miniapp'] ? JSON.parse(t['fc:miniapp']) : null;
  if (e?.button?.title !== 'Play Minpentai' || !String(e?.button?.action?.url).endsWith('/minpentai')) fail(`${h}: the win card's button changed (${e?.button?.title} → ${e?.button?.action?.url})`);
  if (!String(e?.imageUrl).endsWith('/api/minpentai-card?r=3&s=42&shape=embed')) fail(`${h}: the win card's embed image changed (${e?.imageUrl})`);
  if (!t['og:image']?.endsWith('/api/minpentai-card?r=3&s=42') || t['twitter:card'] !== 'summary_large_image') fail(`${h}: the win card's link preview changed (${t['og:image']}, ${t['twitter:card']})`);
  if (!/^image\/jpeg/.test(await imageKind(e?.imageUrl ?? '', h))) fail(`${h}: the win card's embed image is not drawn as a JPEG`);
}

// A remix page (owner, 2026-11-04: every remix page is a landing page whose link preview shows the picture): its
// fc:miniapp and fc:frame embed, "Remix this" opening that version's page, a 3:2 card (a 1200×800 PNG, within the spec's
// 600×400 to 3000×2000 and 10 MB, cached), and Open Graph and twitter:card (1200×630) for Bluesky and Lens. A hidden or
// unpublished version answers 404 with no preview picture at all, and its card answers 404.
// On the target: --design=<version id>, or the first sheet listed on a challenge character's page (none before the
// first is published: then said, not failed). Against localhost, also this checkout's build on the fixture database
// (scripts/fixtures/reader-images-db.ts: a published remix, a base, a hidden remix and a draft).
const pngSize = (b: Buffer) => (b.subarray(1, 4).toString() === 'PNG' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null);
async function checkRemixEmbed(base: string, id: string, where: string) {
  const res = await fetch(`${base}/references/designs/${id}`);
  if (!res.ok) return fail(`${where}: /references/designs/${id} answers ${res.status}`);
  const t = metaTags(await res.text());
  for (const name of ['fc:miniapp', 'fc:frame']) {
    let e: { version?: string; imageUrl?: string; button?: { title?: string; action?: { type?: string; url?: string; splashImageUrl?: string } } } | null = null;
    try {
      e = JSON.parse(t[name] ?? 'null');
    } catch {
      fail(`${where}: ${name} is not JSON`);
    }
    if (!e) {
      fail(`${where}: no ${name} embed`);
      continue;
    }
    if (e.version !== '1') fail(`${where}: ${name} version is ${e.version}`);
    if (e.button?.title !== 'Remix this' || (e.button.title ?? '').length > 32) fail(`${where}: ${name} button is "${e.button?.title}"`);
    if (e.button?.action?.type !== 'launch_frame') fail(`${where}: ${name} action is ${e.button?.action?.type}, not launch_frame`);
    if (!String(e.button?.action?.url).endsWith(`/references/designs/${id}`)) fail(`${where}: ${name} button opens ${e.button?.action?.url}, not this version's page`);
    if (!String(e.imageUrl).endsWith(`/api/design-card/${id}`) || String(e.imageUrl).length > 1024) fail(`${where}: ${name} image is ${e.imageUrl}`);
    else {
      const r = await fetch(base + new URL(e.imageUrl!).pathname);
      const b = Buffer.from(await r.arrayBuffer());
      const sz = pngSize(b);
      if (!r.ok || !sz) fail(`${where}: ${name} image answers ${r.status} ${r.headers.get('content-type')}, not a PNG`);
      else {
        if (sz.w * 2 !== sz.h * 3) fail(`${where}: ${name} image is ${sz.w}×${sz.h}, not 3:2`);
        if (sz.w < 600 || sz.h < 400 || sz.w > 3000 || sz.h > 2000) fail(`${where}: ${name} image is ${sz.w}×${sz.h}, outside 600×400 to 3000×2000`);
        if (b.length >= 10_000_000) fail(`${where}: ${name} image is ${b.length} bytes, not under 10 MB`);
        if (!/max-age=[1-9]/.test(r.headers.get('cache-control') ?? '')) fail(`${where}: ${name} image has no non-zero max-age`);
      }
    }
  }
  if (t['twitter:card'] !== 'summary_large_image') fail(`${where}: twitter:card is ${t['twitter:card']}`);
  for (const k of ['og:title', 'og:description', 'twitter:title', 'twitter:description']) if (!t[k]) fail(`${where}: no ${k}`);
  // "Not by the author" only beside the book's text, not in link previews (owner, 2026-11-12).
  if (!/AI-generated/.test(t['og:description'] ?? '')) fail(`${where}: og:description doesn't say the picture is AI-generated`);
  if (/not by the author/i.test(t['og:description'] ?? '')) fail(`${where}: og:description still says "not by the author" (only beside the book's text, owner 2026-11-12)`);
  for (const k of ['og:image', 'twitter:image']) {
    if (!t[k]?.endsWith(`/api/design-card/${id}?shape=og`)) fail(`${where}: ${k} is ${t[k]}`);
    else {
      const u = new URL(t[k]);
      const b = Buffer.from(await (await fetch(base + u.pathname + u.search)).arrayBuffer());
      const sz = pngSize(b);
      if (!sz || sz.w !== 1200 || sz.h !== 630) fail(`${where}: ${k} is not a 1200×630 PNG`);
    }
  }
  if (t['og:image:width'] !== '1200' || t['og:image:height'] !== '630') fail(`${where}: og:image is not declared 1200×630`);
}
// While the challenge is admin-only (CHALLENGE.public off; owner, 2026-11-04): a published sheet's page answers, but has no
// remix preview ("Remix this", the challenge card) and its card answers 404.
async function checkNoRemixPreview(base: string, id: string, where: string) {
  const res = await fetch(`${base}/references/designs/${id}`);
  if (!res.ok) return fail(`${where}: /references/designs/${id} answers ${res.status}`);
  const t = metaTags(await res.text());
  for (const name of ['fc:miniapp', 'fc:frame']) if ((t[name] ?? '').includes('Remix this') || (t[name] ?? '').includes('/api/design-card/')) fail(`${where}: ${name} is the remix embed while the challenge is admin-only`);
  for (const k of ['og:image', 'twitter:image']) if ((t[k] ?? '').includes('/api/design-card/')) fail(`${where}: ${k} is the challenge card while the challenge is admin-only`);
  for (const q of ['', '?shape=og']) {
    const r = await fetch(`${base}/api/design-card/${id}${q}`);
    if (r.status !== 404) fail(`${where}: its card${q} answers ${r.status} while the challenge is admin-only, not 404`);
  }
}
async function checkNoPreview(base: string, id: string, where: string) {
  const res = await fetch(`${base}/references/designs/${id}`);
  if (res.status !== 404) fail(`${where}: /references/designs/${id} answers ${res.status}, not 404`);
  const t = metaTags(await res.text());
  for (const k of ['fc:miniapp', 'fc:frame', 'og:image', 'twitter:image']) if (t[k]) fail(`${where}: a hidden or unpublished version's page has ${k} (${t[k].slice(0, 80)})`);
  for (const q of ['', '?shape=og']) {
    const r = await fetch(`${base}/api/design-card/${id}${q}`);
    if (r.status !== 404) fail(`${where}: its card${q} answers ${r.status}, not 404`);
  }
}
let remixNote = '';
{
  const { CHALLENGE } = await import('../src/lib/config');
  let id = arg('design') ?? null;
  for (const slug of id ? [] : CHALLENGE.characters) {
    const html = await (await fetch(`${BASE}/references/designs/character/${slug}`)).text();
    id = html.match(/href="\/references\/designs\/([0-9a-f-]{36})"/)?.[1] ?? null;
    if (id) break;
  }
  const remixCheck = CHALLENGE.public ? checkRemixEmbed : checkNoRemixPreview;
  if (id) await remixCheck(BASE, id, `remix page ${id.slice(0, 8)}`);
  else remixNote = 'no challenge character sheet is published on the target yet, so its remix embed was not checked there';
  if (/^(localhost|127\.0\.0\.1)$/.test(new URL(BASE).hostname)) {
    const { spawn, execFileSync } = await import('node:child_process');
    const { createServer } = await import('node:net');
    const freePort = () => new Promise<number>((resolve) => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => resolve(p)); }); });
    const { startReaderImagesDb, FIXTURE_DESIGNS: D } = await import('./fixtures/reader-images-db');
    const data = await startReaderImagesDb(await freePort(), { designs: true });
    const port = await freePort();
    const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], { env: { ...process.env, STUDIO_DATABASE_URL: data.url }, stdio: 'ignore' });
    const LOCAL = `http://localhost:${port}`;
    try {
      for (let i = 0; !(await fetch(LOCAL).then((r) => r.ok, () => false)); i++) {
        if (i > 120) throw new Error('the local build did not start (run next build first)');
        await new Promise((r) => setTimeout(r, 500));
      }
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const built = ((await (await fetch(`${LOCAL}/api/version`)).json()) as { commit?: string }).commit ?? 'unknown';
      if (built !== head) fail(`remix pages (fixture): the local build is from ${built.slice(0, 7)}, this checkout is at ${head.slice(0, 7)}; run next build first`);
      else {
        await remixCheck(LOCAL, D.remix.version, 'remix page (fixture remix)');
        await remixCheck(LOCAL, D.base.version, 'remix page (fixture base)');
        await checkNoPreview(LOCAL, D.hidden.version, 'remix page (fixture hidden)');
        await checkNoPreview(LOCAL, D.draft.version, 'remix page (fixture draft)');
      }
    } finally {
      server.kill();
      await data.stop();
    }
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
    // Signed in silently: the menu shows the account from the Farcaster context (its name is .menu-account-name since the menu sign-in, #1).
    await frame.click('.topbar-icon[aria-label="Menu"]');
    await frame.waitForSelector('.menu-sheet .menu-account-name:has-text("@check")', { timeout: 15000 }).catch(() => fail(`${path}: not signed in silently`));
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
  // ?mode=free opens Play's free play since Play shipped (2026-10-10); it is checked below.
  for (const path of ['/minpentai?lesson=5', '/minpentai?mode=practice']) {
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
  // Play in the Farcaster frame (Design's "frame" device): free play fills the frame, ready() once, no errors.
  for (const path of ['/minpentai?mode=free', '/minpentai?mode=play']) {
    const page = await browser.newPage({ viewport: { width: 480, height: 760 } });
    await page.addInitScript('window.__name = (f) => f');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(HOST + '**', (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0"><script>${bundle.replace(/<\/script>/g, '<\\/script>')}</script></body>` }));
    await page.route('https://auth.farcaster.xyz/**', (r) => r.fulfill({ json: new URL(r.request().url()).pathname.includes('nonce') ? { nonce: 'checknonce1' } : { token: TOKEN } }));
    // An empty stand-in reply for every API call, as for Learn: Play must not break on a malformed answer.
    await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
    await page.goto(`${HOST}?url=${encodeURIComponent(BASE + path)}`);
    const frame = await new Promise<Frame>((resolve) => {
      const t = setInterval(() => {
        const f = page.frames().find((x) => x !== page.mainFrame() && x.url().startsWith(BASE));
        if (f) (clearInterval(t), resolve(f));
      }, 100);
    });
    const shown = await frame.waitForSelector('.mp-play:not([aria-busy])', { timeout: 15000 }).then(() => true, () => false);
    if (!shown) fail(`${path}: Play does not open in the Farcaster frame`);
    else {
      const r = await frame.evaluate(() => {
        const b = document.querySelector('.mp-play')!.getBoundingClientRect();
        return { x: b.x, w: b.width, bottom: b.bottom, vw: innerWidth, vh: innerHeight, wide: document.documentElement.scrollWidth > innerWidth + 1, cls: document.querySelector('.mp-play')!.className };
      });
      console.log(`${path}: ${JSON.stringify(r)}`);
      if (Math.abs(r.x) > 1 || Math.abs(r.w - r.vw) > 1) fail(`${path}: Play is ${Math.round(r.w)}px wide at x=${Math.round(r.x)} in a ${r.vw}px frame`);
      if (r.wide) fail(`${path}: Play scrolls sideways in the Farcaster frame`);
    }
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
console.log(`miniapp check passed: ${BASE}, home, a chapter, the assistant and Learn Minpentai (full screen) and Minpentai Play in a stand-in Farcaster client; the /minpentai share card and the win card's embed; a remix page's embed and link preview${remixNote ? ` (${remixNote})` : ''}`);
