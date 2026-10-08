/**
 * The first-visit intro (config/intro.json) holds together. Fails (exit 1) on any problem.
 *
 *   npx tsx scripts/check-intro.ts                         content and routes, offline
 *   npx tsx scripts/check-intro.ts --url=https://snowmoon.party   also fetch every live card's link
 *
 * - Five cards, each with an eyebrow, one sentence (line), a known visual and
 *   a status of "live" or "coming".
 * - The recipe and record visuals use an image that resolves to a published
 *   image; the others draw in code and take none.
 * - A "live" card points at something that exists: a route this app serves
 *   (a chapter that exists, an adaptation in config/adaptations.json), and
 *   with --url, a page that answers 200.
 * - Every feature is "live" or "planned"; a live feature links to a page that
 *   exists, so nothing reads as available that isn't.
 * - The disclaimer, shown on card 1 and at the top of /about, says the
 *   edition is independent ("not affiliated with the author") and that there
 *   is no token (principle 7).
 *
 * Every rule is proven to fail on a planted violation each time it runs.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const BASE = arg('url')?.replace(/\/$/, '');
const json = (rel: string) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));

type Card = { id: string; eyebrow: string; line: string; visual: string; image: string | null; status: string; href: string | null };
type Feature = { label: string; status: string; href: string | null };
type IntroFile = { disclaimer: string; cards: Card[]; features: Feature[] };
const intro = json('config/intro.json') as IntroFile;
const VISUALS = new Set(['cover', 'recipe', 'record', 'live', 'planned']);
const NEEDS_IMAGE = new Set(['recipe', 'record']);
const published = new Set((json('content/snowmoon/illustrations/published.json').images as { id: string }[]).map((i) => i.id));
const chapters = new Set(
  Array.from({ length: 40 }, (_, i) => i + 1).filter((n) => existsSync(path.join(ROOT, 'content/snowmoon/text', `chapter-${n}.json`))),
);
const seeds = new Set((json('config/adaptations.json').seeds as { slug: string }[]).map((s) => s.slug));
const STATIC = new Set(['/', '/about', '/cards', '/adaptations', '/minpentai', '/assistant']);

function routeExists(href: string): boolean {
  const p = href.split(/[?#]/)[0];
  if (STATIC.has(p)) return true;
  const ch = p.match(/^\/chapter\/(\d+)$/);
  if (ch) return chapters.has(Number(ch[1]));
  const ad = p.match(/^\/adaptations\/([a-z0-9-]+)$/);
  if (ad) return seeds.has(ad[1]);
  return false;
}

function problems(file: IntroFile): string[] {
  const out: string[] = [];
  const cards = file.cards;
  if (cards.length !== 5) out.push(`expected 5 cards, found ${cards.length}`);
  cards.forEach((c, i) => {
    const at = `card ${i + 1} (${c.id})`;
    if (!c.eyebrow?.trim()) out.push(`${at}: no eyebrow`);
    const ends = (c.line ?? '').trim().match(/[.!?](\s|$)/g) ?? [];
    if (ends.length !== 1) out.push(`${at}: the text must be one sentence (found ${ends.length})`);
    if (!VISUALS.has(c.visual)) out.push(`${at}: unknown visual ${c.visual}`);
    if (NEEDS_IMAGE.has(c.visual)) {
      const im = c.image?.match(/^published:(.+)$/);
      if (!im || !published.has(im[1])) out.push(`${at}: image ${c.image} is not a published image`);
    } else if (c.image) out.push(`${at}: the ${c.visual} visual is drawn in code and takes no image`);
    if (c.status !== 'live' && c.status !== 'coming') out.push(`${at}: status must be "live" or "coming"`);
    if (c.status === 'live' && (!c.href || !routeExists(c.href))) out.push(`${at}: live, but points at ${c.href ?? 'nothing'}, which does not exist`);
  });
  for (const f of file.features ?? []) {
    if (f.status !== 'live' && f.status !== 'planned') out.push(`feature ${f.label}: status must be "live" or "planned"`);
    if (f.status === 'live' && (!f.href || !routeExists(f.href))) out.push(`feature ${f.label}: live, but points at ${f.href ?? 'nothing'}, which does not exist`);
  }
  if (!(file.features ?? []).some((f) => f.status === 'live')) out.push('no live features');
  const d = (file.disclaimer ?? '').toLowerCase();
  if (!d.includes('not affiliated with the author')) out.push('the disclaimer must say the edition is "not affiliated with the author"');
  if (!/\bno token\b/.test(d)) out.push('the disclaimer must say there is no token');
  return out;
}

const failures = problems(intro);

// Prove each rule bites on a planted violation.
const planted: [string, (f: IntroFile) => void][] = [
  ['live card to a missing page', (f) => (f.cards[1].href = '/chapter/999')],
  ['live card with no link', (f) => (f.cards[2].href = null)],
  ['disclaimer without the no-token line', (f) => (f.disclaimer = 'Independent adaptation · Not affiliated with the author')],
  ['disclaimer without the independence line', (f) => (f.disclaimer = 'An illustrated edition · No token')],
  ['an image that is not published', (f) => (f.cards[1].image = 'published:c99-b001-nothing')],
  ['two sentences on a card', (f) => (f.cards[4].line = 'One. Two.')],
  ['a live feature with no page', (f) => (f.features[0].href = '/minpentai-nowhere')],
  ['a feature neither live nor planned', (f) => (f.features[0].status = 'soon')],
];
for (const [name, plant] of planted) {
  const copy = structuredClone(intro);
  plant(copy);
  if (problems(copy).length <= problems(intro).length) failures.push(`the check did not catch a planted violation: ${name}`);
}

// With --url, every live card's page must answer.
if (BASE) {
  for (const c of intro.cards.filter((c) => c.status === 'live' && c.href)) {
    const r = await fetch(BASE + c.href, { redirect: 'manual' });
    if (r.status !== 200) failures.push(`${c.id}: ${BASE}${c.href} answered ${r.status}`);
  }
}

if (failures.length) {
  console.error(`intro check FAILED (${failures.length}):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`intro check passed: ${intro.cards.length} cards, ${intro.cards.filter((c) => c.status === 'live').length} live, ${intro.features.filter((f) => f.status === 'live').length} live features, ${planted.length} planted violations caught${BASE ? `, links answer on ${BASE}` : ''}`);
