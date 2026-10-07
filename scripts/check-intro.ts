/**
 * The first-visit intro (config/intro.json) holds together. Fails (exit 1) on any problem.
 *
 *   npx tsx scripts/check-intro.ts                         content and routes, offline
 *   npx tsx scripts/check-intro.ts --url=https://snowmoon.party   also fetch every live card's link
 *
 * - Five cards, each with a title, one sentence, an image and a status of
 *   "live" or "coming".
 * - Every image reference resolves to a published image.
 * - A "live" card points at something that exists: a route this app serves
 *   (a chapter that exists, an adaptation in config/adaptations.json), and
 *   with --url, a page that answers 200.
 * - Card 1 keeps the line that the edition is independent ("not affiliated
 *   with the author") and that there is no token (principle 7).
 *
 * Every rule is proven to fail on a planted violation each time it runs.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const BASE = arg('url')?.replace(/\/$/, '');
const json = (rel: string) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));

type Card = { id: string; title: string; sentence: string; image: string; status: string; href: string | null };
const intro = json('config/intro.json') as { cards: Card[] };
const published = new Set((json('content/snowmoon/illustrations/published.json').images as { id: string }[]).map((i) => i.id));
const chapters = new Set(
  Array.from({ length: 40 }, (_, i) => i + 1).filter((n) => existsSync(path.join(ROOT, 'content/snowmoon/text', `chapter-${n}.json`))),
);
const seeds = new Set((json('config/adaptations.json').seeds as { slug: string }[]).map((s) => s.slug));
const STATIC = new Set(['/', '/about', '/cards', '/adaptations']);

function routeExists(href: string): boolean {
  const p = href.split(/[?#]/)[0];
  if (STATIC.has(p)) return true;
  const ch = p.match(/^\/chapter\/(\d+)$/);
  if (ch) return chapters.has(Number(ch[1]));
  const ad = p.match(/^\/adaptations\/([a-z0-9-]+)$/);
  if (ad) return seeds.has(ad[1]);
  return false;
}

function problems(cards: Card[]): string[] {
  const out: string[] = [];
  if (cards.length !== 5) out.push(`expected 5 cards, found ${cards.length}`);
  cards.forEach((c, i) => {
    const at = `card ${i + 1} (${c.id})`;
    if (!c.title?.trim()) out.push(`${at}: no title`);
    const ends = (c.sentence ?? '').trim().match(/[.!?](\s|$)/g) ?? [];
    if (ends.length !== 1) out.push(`${at}: the text must be one sentence (found ${ends.length})`);
    const im = c.image?.match(/^published:(.+)$/);
    if (!im || !published.has(im[1])) out.push(`${at}: image ${c.image} is not a published image`);
    if (c.status !== 'live' && c.status !== 'coming') out.push(`${at}: status must be "live" or "coming"`);
    if (c.status === 'live' && (!c.href || !routeExists(c.href))) out.push(`${at}: live, but points at ${c.href ?? 'nothing'}, which does not exist`);
  });
  const first = (cards[0]?.sentence ?? '').toLowerCase();
  if (!first.includes('not affiliated with the author')) out.push('card 1 must say the edition is "not affiliated with the author"');
  if (!/\bno token\b/.test(first)) out.push('card 1 must say there is no token');
  return out;
}

const failures = problems(intro.cards);

// Prove each rule bites on a planted violation.
const planted: [string, (c: Card[]) => void][] = [
  ['live card to a missing page', (c) => (c[1].href = '/chapter/999')],
  ['live card with no link', (c) => (c[2].href = null)],
  ['card 1 without the no-token line', (c) => (c[0].sentence = 'An independent, illustrated edition, not affiliated with the author.')],
  ['card 1 without the independence line', (c) => (c[0].sentence = 'An illustrated edition of the novel, and there is no token.')],
  ['an image that is not published', (c) => (c[3].image = 'published:c99-b001-nothing')],
  ['two sentences on a card', (c) => (c[4].sentence = 'One. Two.')],
];
for (const [name, plant] of planted) {
  const copy = structuredClone(intro.cards);
  plant(copy);
  if (problems(copy).length <= problems(intro.cards).length) failures.push(`the check did not catch a planted violation: ${name}`);
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
console.log(`intro check passed: ${intro.cards.length} cards, ${intro.cards.filter((c) => c.status === 'live').length} live, ${planted.length} planted violations caught${BASE ? `, links answer on ${BASE}` : ''}`);
