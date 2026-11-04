/**
 * Characters in the book's order (owner, 2026-11-04: "list characters by how often they're named in the book, most
 * first, everywhere characters are listed"): the counting rules, spot-checked counts, the regeneration check, and each
 * character list on the site in that order.
 *
 *   npm run test:character-order
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { countMentions, MENTIONS_FILE, mentionsFile, type ChapterText } from './lib/character-mentions';
import { BOOK_MENTIONS, inBookOrder, mentionRank } from '../src/lib/character-order';
import { CHALLENGE } from '../src/lib/config';
import { CHALLENGE_WORDING } from '../src/lib/challenge/wording';
import { bookCharacters, composerPicks, type MyPick } from '../src/lib/images/designs';
import { inPassage, sheetCharacters } from '../src/lib/images/sheets';
import { castText } from '../src/lib/make/cast';
import { byReferenceOrder } from '../src/lib/references';

const ROOT = path.resolve(import.meta.dirname, '..');
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? `: ${detail}` : ''}`);
  if (!ok) failed++;
};
const order = BOOK_MENTIONS.map((c) => c.slug);
const row = (slug: string) => BOOK_MENTIONS.find((c) => c.slug === slug) as (typeof BOOK_MENTIONS)[number] & { as: Record<string, number> };

// --- The counting rules, on made-up text --------------------------------------------------------
const chars = [
  { slug: 'zei', name: 'Zei Leimin' },
  { slug: 'bai', name: 'Bai Jahen' },
  { slug: 'mu', name: 'Mu' },
  { slug: 'min', name: 'Min', name_exclusions: ['Hun Min'] },
  { slug: 'ephelion', name: 'Lord Ephelion' },
];
const one = (content: string, kind = 'paragraph'): ChapterText[] => [{ chapter: 1, blocks: [{ idx: 0, kind, content }] }];
const n = (content: string, slug: string, kind?: string) => countMentions(one(content, kind), chars).find((r) => r.slug === slug)!.mentions;
check('whole words: "Bai" inside a longer word does not count', n('Baiko and Mumble met Minpentai players.', 'bai') === 0 && n('Baiko and Mumble.', 'mu') === 0 && n('Minpentai.', 'min') === 0);
check('a possessive counts', n("Zei's hand, Bai's.", 'zei') === 1 && n("Zei's hand, Bai's.", 'bai') === 1);
check('case-sensitive: lower-case words never count', n('mu min bai zei', 'mu') + n('mu min bai zei', 'min') + n('mu min bai zei', 'bai') === 0);
check('the full name counts once, not also its words', n('Zei Leimin stood. Zei sat.', 'zei') === 2 && countMentions(one('Zei Leimin stood.'), chars).find((r) => r.slug === 'zei')!.as['Zei Leimin'] === 1);
check('a title is left out, and "Lord Ephelion" is one mention', n('Lord Ephelion spoke; Ephelion left.', 'ephelion') === 2);
check('name_exclusions never count ("Hun Min" street is not Min)', n('They walked down Hun Min street. Min waved.', 'min') === 1);
check('tags and Markdown are removed first', n('<span data-hue="1">"I\'m **Mu**."</span>', 'mu') === 1);
check('headings, datelines and breaks are skipped', n('# Mu', 'mu', 'heading') === 0 && n('**Mu** · 3724', 'mu', 'dateline') === 0 && n('Mu', 'mu', 'screen') === 1);
check('every naming counts; blocks counts blocks', (() => {
  const r = countMentions([{ chapter: 1, blocks: [{ idx: 0, kind: 'paragraph', content: 'Mu, Mu.' }, { idx: 1, kind: 'quote', content: 'Mu' }] }], chars).find((x) => x.slug === 'mu')!;
  return r.mentions === 3 && r.blocks === 2;
})());
check('ties are broken by name', countMentions(one('Mu. Bai Jahen.'), chars).slice(0, 2).map((r) => r.slug).join() === 'bai,mu');

// --- The counts, spot-checked by hand against the text ------------------------------------------
// By hand (2026-11-04: a plain whole-word, case-sensitive regex over every block's content, headings included, no
// masking): Seila 185, Gladias 534, Mu 69, Zei 669 of which "Zei Leimin" 6. Min: 9 capitalised "Min", 3 of them
// "Hun Min" street (an exclusion), so 6.
check('Zei: 669 (663 "Zei", 6 "Zei Leimin")', row('zei').mentions === 669 && row('zei').as['Zei'] === 663 && row('zei').as['Zei Leimin'] === 6);
check('Gladias: 534 in 492 blocks (the glossary counts the same 492 blocks)', row('gladias').mentions === 534 && row('gladias').blocks === 492);
check('Seila: 185', row('seila').mentions === 185);
check('Mu: 69', row('mu').mentions === 69);
check('Min: 6 ("Hun Min" left out)', row('min').mentions === 6);
check('Ephelion: 29 (13 "Lord Ephelion", 16 "Ephelion")', row('ephelion').mentions === 29 && row('ephelion').as['Lord Ephelion'] === 13);
const glossary = JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/glossary.json'), 'utf8')) as { terms: { slug: string; mention_count: number }[] };
const agree = ['gladias', 'seila', 'deluin', 'delwart', 'febric', 'jahn', 'mov', 'zven', 'hreda', 'verdow', 'vil', 'ephelion', 'lektor', 'daia', 'tafindel'];
const disagree = agree.filter((s) => glossary.terms.find((t) => t.slug === s)?.mention_count !== row(s).blocks);
check('blocks agree with the glossary\'s own count for the names it has', !disagree.length, disagree.join(', '));
check('every character file is counted', BOOK_MENTIONS.length === bookCharacters().length && bookCharacters().every((c) => mentionRank(c.slug) < BOOK_MENTIONS.length));
check('the file is in its own order (mentions, then name)', BOOK_MENTIONS.every((c, i) => i === 0 || BOOK_MENTIONS[i - 1].mentions > c.mentions || (BOOK_MENTIONS[i - 1].mentions === c.mentions && BOOK_MENTIONS[i - 1].name.localeCompare(c.name, 'en') < 0)));

// --- The regeneration check --------------------------------------------------------------------
check(`${MENTIONS_FILE} is up to date with the text`, readFileSync(path.join(ROOT, MENTIONS_FILE), 'utf8') === mentionsFile(ROOT));
let exit = 0;
try {
  execFileSync('npx', ['tsx', 'scripts/characters-by-mentions.ts'], { cwd: ROOT, stdio: 'pipe' });
} catch (e) {
  exit = (e as { status: number }).status;
}
check('npm run characters:mentions passes now', exit === 0);
{
  // Planted: one more "Mu" in a copy of the book; the committed file is then out of date.
  const tmp = mkdtempSync(path.join(tmpdir(), 'char-order-'));
  cpSync(path.join(ROOT, 'content/snowmoon/text'), path.join(tmp, 'content/snowmoon/text'), { recursive: true });
  cpSync(path.join(ROOT, 'content/snowmoon/designs/characters'), path.join(tmp, 'content/snowmoon/designs/characters'), { recursive: true });
  const f = path.join(tmp, 'content/snowmoon/text/chapter-1.json');
  const ch = JSON.parse(readFileSync(f, 'utf8')) as ChapterText;
  ch.blocks.push({ idx: 9999, kind: 'paragraph', content: 'Mu nodded.' });
  writeFileSync(f, JSON.stringify(ch));
  check('planted: a changed text makes the file out of date', mentionsFile(tmp) !== readFileSync(path.join(ROOT, MENTIONS_FILE), 'utf8'));
  rmSync(tmp, { recursive: true, force: true });
}

// --- Each list in the order --------------------------------------------------------------------
const want = (list: string[]) => order.filter((s) => list.includes(s)).join();
check('the Characters tab and the designs index (bookCharacters)', bookCharacters().map((c) => c.slug).join() === order.join());
check('sheets (sheetCharacters: the sheet pages, the glossary\'s sheets)', sheetCharacters().map((c) => c.slug).join() === order.join());
const passage = inPassage(28, 16, 16).characters.map((c) => c.slug);
check('Make an image, "In this passage" (c28-b16: "I\'m Den, this is Zei, Mu and Bai")', passage.join() === 'zei,bai,den,mu', passage.join());
const pick = (entity: string, kind: MyPick['kind'] = 'character') => ({ kind, entity, available: true }) as MyPick;
const picked = composerPicks([pick('Mu'), pick('Lord Ephelion'), pick('Zei Leimin'), pick('A style', 'style'), pick('Gladias')]).characters.map((p) => p.entity);
check('Make an image, your picked character sheets', picked.join() === 'Zei Leimin,Gladias,Mu,Lord Ephelion', picked.join());
check('My picks (inBookOrder by entity name)', inBookOrder([{ e: 'Mu' }, { e: 'Seila' }, { e: 'Zei Leimin' }], (x) => x.e).map((x) => x.e).join() === 'Zei Leimin,Seila,Mu');
const cast = castText(4).split('.')[0].split('; ').map((s) => s.split(':')[0]);
check('the Make your own coach\'s cast list', cast.slice(0, 4).join() === 'Zei,Gladias,Bai,Seila' && cast.join() === inBookOrder(cast, (n) => bookCharacters().find((c) => c.name.split(' ').includes(n))!.slug).join(), cast.join());
check('/challenge: CHALLENGE.characters', CHALLENGE.characters.join() === want([...CHALLENGE.characters]) && CHALLENGE.characters.join() === 'zei,gladias,bai,seila,deluin,mu', CHALLENGE.characters.join());
check('/challenge: the rules name them in that order', CHALLENGE_WORDING.intro().includes('Zei, Gladias, Bai, Seila, Deluin or Mu'));
const card = (term: string, chapter: number, kind: 'character' | 'place', slug: string) => ({ term, chapter, sheets: [{ kind, slug, name: slug, href: '' }] });
const cards = [card('autobus', 1, 'place', 'autobus'), card('mu', 4, 'character', 'mu'), card('kalimar', 1, 'place', 'kalimar-footpaths'), card('gladias', 1, 'character', 'gladias'), card('zei', 2, 'character', 'zei')].sort(byReferenceOrder);
check('the glossary references: characters first, most named first, then the other words by chapter', cards.map((c) => c.term).join() === 'zei,gladias,mu,autobus,kalimar', cards.map((c) => c.term).join());

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
