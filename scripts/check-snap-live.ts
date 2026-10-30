/**
 * The Minpentai snap on a live deployment, as Farcaster's clients and browsers reach it. Run after every
 * snap change is deployed (owner, 2026-10-23), against production by default:
 *
 *   npm run check:snap-live                       (https://snowmoon.party)
 *   npm run check:snap-live -- --url=https://…    (another public deployment)
 *
 * Checks, for /minpentai and /minpentai/play (the snap's own link):
 * - from another origin in a real browser (Chromium on https://example.com), a fetch with the snap
 *   Accept and with X-Snap-Payload gets the snap: Farcaster's web client sends that header, so the
 *   browser preflights first, and a preflight the page answers allows no headers (2026-10-23: no snap
 *   in the web composer). The same fetch without X-Snap-Payload gets the snap too;
 * - twice each: the snap Accept gets snap JSON (v2.0, "Start a match"); a browser's Accept gets the HTML
 *   page, 200, not a redirect, with the Link header naming the snap (/minpentai also with no Accept);
 *   /minpentai/play also: Accept *\/* gets the snap, X's Twitterbot gets the page and its card;
 * - /minpentai/play in a browser: Play's home, and the share card (og:image 1200×630,
 *   twitter:card summary_large_image, fc:miniapp's 3:2 image), each image served;
 * - a forged challenge link and its card are 404; an unsigned tap is 400;
 * - a tap signed with a fresh key for FID 6786 gets 401 "signer not active": the signature was checked
 *   and the hub (Neynar's in production) answered. 503 "hub unavailable" means the hub lookup failed.
 *   An accepted tap needs a real Farcaster app: that stays the owner's phone check.
 * Exit 1 on any failure.
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import { chromium } from 'playwright-core';

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const BASE = (arg('url') ?? 'https://snowmoon.party').replace(/\/$/, '');
const SNAP = 'application/vnd.farcaster.snap+json';
const BROWSER = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const PATHS = ['/minpentai', '/minpentai/play'];
const FORGED = '/minpentai/c/ll.3.diag._.C-41-3-0-38.AAAAAAAAAAAAAAAAAAAAAA';

let failures = 0;
const ok = (pass: boolean, what: string) => {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}`);
  if (!pass) failures++;
};
const meta = (html: string, key: string) =>
  html.match(new RegExp(`<meta[^>]+(?:name|property)="${key}"[^>]+content="([^"]*)"`))?.[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');

async function negotiation() {
  for (const p of PATHS) {
    for (const i of [1, 2]) {
      let r = await fetch(BASE + p, { headers: { Accept: SNAP }, redirect: 'manual' });
      const j = (await r.json().catch(() => null)) as { version?: string } | null;
      ok(r.status === 200 && !!r.headers.get('content-type')?.startsWith(SNAP) && j?.version === '2.0' && JSON.stringify(j).includes('Start a match'),
        `${p} with the snap Accept #${i}: ${r.status} ${r.headers.get('content-type')} (cache ${r.headers.get('x-vercel-cache')})`);
      // /minpentai/play serves the snap to anything that doesn't clearly want a page (src/lib/minpentai/snap/negotiate.ts).
      if (p === '/minpentai/play') {
        r = await fetch(BASE + p, { headers: { Accept: '*/*' }, redirect: 'manual' });
        ok(r.status === 200 && !!r.headers.get('content-type')?.startsWith(SNAP), `${p} with Accept */* #${i}: ${r.status} ${r.headers.get('content-type')}`);
        r = await fetch(BASE + p, { headers: { Accept: '*/*', 'User-Agent': 'Twitterbot/1.0' }, redirect: 'manual' });
        ok(r.status === 200 && !!r.headers.get('content-type')?.startsWith('text/html') && (await r.text()).includes('twitter:card'), `${p} as X's Twitterbot (*/*) #${i}: ${r.status} ${r.headers.get('content-type')}, card`);
      }
      for (const [name, accept] of (p === '/minpentai/play' ? [['a browser Accept', BROWSER]] : [['no Accept', null], ['a browser Accept', BROWSER]]) as [string, string | null][]) {
        r = await fetch(BASE + p, { headers: accept ? { Accept: accept } : {}, redirect: 'manual' });
        const html = await r.text();
        ok(r.status === 200 && !!r.headers.get('content-type')?.startsWith('text/html') && (r.headers.get('link') ?? '').includes(`<${p}>; rel="alternate"; type="${SNAP}"`) && html.includes('<title>'),
          `${p} with ${name} #${i}: ${r.status} ${r.headers.get('content-type')}, Link ${r.headers.get('link') ? 'yes' : 'no'}`);
      }
    }
  }
}

async function crossOrigin() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('https://example.com');
    for (const p of PATHS) {
      for (const headers of [{ Accept: SNAP }, { Accept: SNAP, 'X-Snap-Payload': 'check-snap-live' }] as Record<string, string>[]) {
        const got = await page.evaluate(async ([u, h]) => {
          try {
            const r = await fetch(u, { headers: h });
            return { status: r.status, type: r.headers.get('content-type') ?? '', body: await r.text() };
          } catch (e) {
            return { status: 0, type: '', body: `blocked: ${(e as Error).message}` };
          }
        }, [BASE + p, headers] as const);
        ok(got.status === 200 && got.type.startsWith(SNAP) && got.body.includes('Start a match'),
          `${p} from another origin, ${Object.keys(headers).join(' + ')}: ${got.status ? `${got.status} ${got.type}` : got.body}`);
      }
    }
    // /minpentai/play in a browser: Play's home, and its share card.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const res = await page.goto(`${BASE}/minpentai/play`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const text = await page.evaluate(() => document.body.innerText);
    ok(res?.status() === 200 && page.url() === `${BASE}/minpentai/play` && /PLAY/.test(text) && errors.length === 0,
      `/minpentai/play in a browser: ${res?.status()}, stays at ${new URL(page.url()).pathname}, Play's home${errors.length ? `, errors: ${errors.join('; ')}` : ''}`);
  } finally {
    await browser.close();
  }
  const html = await (await fetch(`${BASE}/minpentai/play`, { headers: { Accept: BROWSER } })).text();
  const embed = JSON.parse(meta(html, 'fc:miniapp') ?? 'null') as { imageUrl?: string; button?: { title?: string } } | null;
  ok(meta(html, 'twitter:card') === 'summary_large_image', `/minpentai/play twitter:card ${meta(html, 'twitter:card')}`);
  for (const [what, url] of [['og:image', meta(html, 'og:image')], ['fc:miniapp image', embed?.imageUrl]] as const) {
    const r = url ? await fetch(url) : null;
    ok(!!r?.ok && !!r.headers.get('content-type')?.startsWith('image/'), `/minpentai/play ${what}: ${url ?? 'missing'} → ${r?.status} ${r?.headers.get('content-type')}`);
  }
  ok(!!embed?.button?.title, `/minpentai/play fc:miniapp button: "${embed?.button?.title}"`);
}

async function refusals() {
  ok((await fetch(BASE + FORGED, { headers: { Accept: SNAP } })).status === 404, 'a forged challenge link, snap Accept: 404');
  ok((await fetch(BASE + FORGED, { headers: { Accept: BROWSER } })).status === 404, 'a forged challenge link, browser: 404');
  ok((await fetch(`${BASE}/api/minpentai-challenge-card?c=${FORGED.split('/').pop()}`)).status === 404, 'a forged challenge card: 404');
  const unsigned = await fetch(`${BASE}/snap/minpentai?a=start`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: SNAP }, body: JSON.stringify({ header: 'x', payload: 'x', signature: 'x' }) });
  ok(unsigned.status === 400, `an unsigned tap: ${unsigned.status}`);
}

async function signedTap() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const key = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ fid: 6786, type: 'app_key', key: `0x${key}` });
  const payload = b64({ fid: 6786, inputs: { lvl: 0, rule: '?' }, timestamp: Math.floor(Date.now() / 1000), audience: new URL(BASE).origin, user: { fid: 6786 }, surface: { type: 'standalone' } });
  const signature = sign(null, Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  const t0 = Date.now();
  const r = await fetch(`${BASE}/snap/minpentai?a=start`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: SNAP }, body: JSON.stringify({ header, payload, signature }) });
  const body = await r.text();
  ok(r.status === 401 && body.includes('signer not active'), `a tap signed by an unregistered key: ${r.status} ${body} in ${Date.now() - t0} ms (503 would mean the hub lookup failed)`);
}

async function main() {
  console.log(`check:snap-live ${BASE}`);
  await negotiation();
  await crossOrigin();
  await refusals();
  await signedTap();
  if (failures) {
    console.log(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log('\nsnap live check passed');
}
void main();
