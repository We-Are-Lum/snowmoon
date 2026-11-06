/**
 * The remix challenge's moments (owner, 2026-11-05, answer 4: "All 15 moments at launch, no reserves"; the list is
 * docs/proposals/challenge-moments.md §3, 1–15). An entry is one picture of a challenge character at one of these.
 *
 * Whose list this is (P5g's fourth exception, owner 2026-11-05, answer 3): the owner's pick, shown as "Moments picked
 * by @naaate", never as official or best. Its order is the book's (chapter, then block), fixed, not a ranking:
 * scripts/test-challenge-moments.ts and check:principles P5g fail if it isn't. "Surprise me" draws from this list only,
 * all fifteen, unweighted (shuffleFresh in the remix screen; owner, answer 4: "draws from all 15").
 *
 * What is whose:
 * - `quotes`: the book's own words, word for word, each with its block (c<chapter>-b<block>); checked as an exact
 *   substring of the block as a reader sees it (P8c-style, src/lib/challenge/book-quotes.ts) by the tests and P9g.
 * - `title` and `scene`: this edition's own words, drafted by the coding agent (Claude, a closed model by Anthropic)
 *   on 2026-11-05, for the owner's one-pass approval (CHALLENGE.sceneLinesApproved; P2m). Titles are kept free of the
 *   book's major turns, since they show on a card's first layer (owner, answer 1). The scene line is a prompt, not story
 *   words: it is what the model receives for the moment (the quote is shown, never sent), and every recipe records it
 *   with `assist` saying the coding agent drafted it. Each was drafted from the passage and the illustration job's
 *   prompt at or near it (content/snowmoon/illustrations, itself drafted by the coding agent).
 * - `characters`: the challenge characters the passage names (CHALLENGE.characters' slugs), in the book-mentions order.
 *
 * Plain data and pure functions: this file is served to the browser by the remix screen.
 */
export interface MomentQuote {
  /** "c4-b129". */
  block: string;
  /** Word for word from that block, as a reader sees it (speaker-colour spans removed). */
  text: string;
}

export interface Moment {
  /** Stable id: the first quote's block and a short name. */
  id: string;
  /** This edition's title (drafted, see above). */
  title: string;
  /** The passage the picture is anchored to (studio.anchors), inclusive. */
  chapter: number;
  start: number;
  end: number;
  quotes: MomentQuote[];
  /** The challenge characters the passage names (slugs). */
  characters: string[];
  /** What the model receives for the moment: this edition's scene line (drafted, see above). */
  scene: string;
}

export const MOMENTS: readonly Moment[] = [
  {
    id: 'c1-b50-concert',
    title: 'The concert in a privacy robe',
    chapter: 1, start: 44, end: 50,
    quotes: [{ block: 'c1-b50', text: 'He soon got to the concert stage area, and was able to clearly hear the gnarly voice of Dreadknot\'s lead singer.' }],
    characters: ['gladias'],
    scene: 'A crowded open-air concert field enclosed by a high soundproof wall behind tall trees, a metal band playing on a distant stage; dancing concert-goers in band shirts, a few figures in loose dark purple hooded robes among them.',
  },
  {
    id: 'c2-b99-wall',
    title: 'The wall comes down',
    chapter: 2, start: 98, end: 100,
    quotes: [{ block: 'c2-b99', text: 'A fraction of a tick later, part of the wall and the floor came crashing down.' }],
    characters: ['zei'],
    scene: 'An underground classroom at the instant part of a foil-covered wall and the floor crash down: a burst of dust and stone fragments, chairs tipping over, students ducking.',
  },
  {
    id: 'c4-b129-symbol',
    title: 'The quarterfinal',
    chapter: 4, start: 118, end: 135,
    quotes: [
      { block: 'c4-b129', text: '"Bai, next intervention turn is your chance to shine."' },
      { block: 'c4-b133', text: 'Bai\'s symbol.' },
    ],
    characters: ['zei', 'bai', 'mu'],
    scene: 'A vast dark underground game hall with over a thousand spectators in tiered seats, faces lit by a giant glowing display of abstract dotted patterns; a player at a large game console wearing glasses on a long cable, small drones circling.',
  },
  {
    id: 'c5-b58-lunch',
    title: 'Lunch with a stranger',
    chapter: 5, start: 55, end: 62,
    quotes: [{ block: 'c5-b58', text: '"I\'m Seila", the woman replied.' }],
    characters: ['zei', 'bai', 'seila'],
    scene: 'A bright restaurant table on the spiral ramp of a modern institute building in a busy city, cups of tea and plates of rice and vegetables, strangers meeting across the table, a small service robot nearby.',
  },
  {
    id: 'c6-b158-tower',
    title: 'The tower',
    chapter: 6, start: 146, end: 158,
    quotes: [{ block: 'c6-b158', text: '"I am applying to become a Keeper."' }],
    characters: ['gladias'],
    scene: 'The open top floor of a stone tower under a pale cold sky: robed, hooded figures seated around the circular edge, solemn and still, a large circle on the floor glowing green, small green lights along the walls, wooded slopes far below.',
  },
  {
    id: 'c7-b49-toast',
    title: 'To our future',
    chapter: 7, start: 44, end: 50,
    quotes: [{ block: 'c7-b49', text: 'Mu raised the glass. "To our future," she said.' }],
    characters: ['zei', 'bai', 'mu'],
    scene: 'A polished stone waiting room inside a mountain, elevator doors behind; glasses of water raised in a solemn toast, a small service robot gliding away.',
  },
  {
    id: 'c7-b104-final',
    title: 'The championship final',
    chapter: 7, start: 101, end: 111,
    quotes: [{ block: 'c7-b104', text: 'Bai\'s AI started thinking about countermeasures to all sixteen strategies, but soon hit a limit: it could not optimize defenses against all of them at the same time.' }],
    characters: ['zei', 'bai'],
    scene: 'The championship final in a vast dark underground hall packed with spectators, an enormous display of swirling dotted patterns and colliding streams of light, two rival players at game consoles far apart on the floor.',
  },
  {
    id: 'c12-b71-deluin',
    title: '"Hi, I\'m Deluin"',
    chapter: 12, start: 68, end: 75,
    quotes: [
      { block: 'c12-b70', text: 'An older teenage boy sat down beside Zei.' },
      { block: 'c12-b71', text: '"Hi, I\'m Deluin", he said.' },
    ],
    characters: ['zei', 'deluin'],
    scene: 'A grand hall carved into a mountain, arched stone-brick walls, rows of about fifty chairs facing a small stage with priests in ceremonial robes; teenage contestants taking their seats, two of them turning to introduce themselves.',
  },
  {
    id: 'c14-b124-redshire',
    title: 'Pictures of Redshire',
    chapter: 14, start: 123, end: 130,
    quotes: [{ block: 'c14-b124', text: 'He saw castles, pine forests, large pristine grasslands, red-colored mountains with their tops covered in snow, and one giant icy waterfall.' }],
    characters: ['zei', 'deluin'],
    scene: 'A small courtyard cafe table in the evening, neon pink and cyan shop lights, two cups of tea; a hand device held out, its screen showing castles, pine forests and red snow-capped mountains.',
  },
  {
    id: 'c21-b49-call',
    title: 'A call from the basement',
    chapter: 21, start: 45, end: 52,
    quotes: [{ block: 'c21-b49', text: '"Gladias, you idiot! Do you know what you\'ve done?!!!!"' }],
    characters: ['gladias', 'seila'],
    scene: 'A small windowless basement room with stone walls and a single warm lamp, late at night; someone alone in a chair, leaning forward over a hand device that lights their face from below, shelves and boxes in the shadows.',
  },
  {
    id: 'c24-b39-library',
    title: 'In the library',
    chapter: 24, start: 36, end: 42,
    quotes: [
      { block: 'c24-b38', text: '"So don\'t worry, I won\'t ask any questions."' },
      { block: 'c24-b39', text: 'She walked up to Gladias, and gently hugged him.' },
    ],
    characters: ['gladias', 'bai'],
    scene: 'A warm underground library, towering two-level shelves of paper books on one side and computer terminals on the other, soft amber lamplight, quiet empty tables; a gentle, quiet moment between two people.',
  },
  {
    id: 'c26-b75-hotel',
    title: 'At the hotel',
    chapter: 26, start: 73, end: 76,
    quotes: [
      { block: 'c26-b75', text: 'She turned toward him, and began running toward him with outstretched arms.' },
      { block: 'c26-b76', text: 'It was Seila.' },
    ],
    characters: ['zei', 'gladias', 'seila'],
    scene: 'The quiet lobby of a calm, stone-walled government hotel with wooden furniture and potted plants, a black car whose doors open straight into the room; someone running across the room with arms outstretched.',
  },
  {
    id: 'c26-b122-streets',
    title: 'Fly through the streets',
    chapter: 26, start: 119, end: 128,
    quotes: [{ block: 'c26-b122', text: '"New plan. Everyone fly low, under the buildings and trees. Fly through the streets.' }],
    characters: ['zei', 'mu'],
    scene: 'A small dim room with a gaming-style console, glasses glowing with projected light; on the screens, swarms of small drones racing low through city streets at night under blinking streetlights.',
  },
  {
    id: 'c29-b4-hilltop',
    title: 'A snowy hilltop at sunrise',
    chapter: 29, start: 2, end: 10,
    quotes: [
      { block: 'c29-b4', text: '"Do you think we\'re ready?", Zei asked.' },
      { block: 'c29-b5', text: '"No", Mu replied. "But nothing meaningful ever happens when people are ready."' },
    ],
    characters: ['zei', 'bai', 'mu'],
    scene: 'A snowy hilltop at sunrise, a pine forest heavy with snow stretching to the horizon, cold wind blowing snow; thick white-and-grey patterned winter jackets, long pale golden light.',
  },
  {
    id: 'c31-b9-summit',
    title: 'On the summit',
    chapter: 31, start: 5, end: 12,
    quotes: [{ block: 'c31-b9', text: 'He reached the top, and almost threw Zei off balance as he threw himself into his arms for a hug.' }],
    characters: ['zei', 'bai', 'deluin'],
    scene: 'A circular snowy platform at the top of a mountain, snowy hills and a small town far below, a staircase climbing up to it; a joyful running hug at the top.',
  },
];

/** The moment with this id, or null. */
export const momentById = (id: string | null | undefined): Moment | null => MOMENTS.find((m) => m.id === id) ?? null;

/** The moments a character is in, in the book's order (a card's "Moments" list). */
export const momentsWith = (character: string): Moment[] => MOMENTS.filter((m) => m.characters.includes(character));

/** "Ch 4": shown on every moment chip (owner, 2026-11-05, answer 1). */
export const chapterChip = (m: Pick<Moment, 'chapter'>) => `Ch ${m.chapter}`;

/** The reader at a block: /chapter/<n>#c<n>-b<idx> (the reader's own anchors, as the assistant links them). */
export const readerHref = (block: string) => {
  const m = /^c(\d+)-b(\d+)$/.exec(block);
  return m ? `/chapter/${m[1]}#${block}` : '/';
};

/** Whether the list is in the book's order (chapter, then the passage's first block): the only order it may have. */
export const inBookOrder = (list: readonly Pick<Moment, 'chapter' | 'start'>[]) => list.every((m, i) => i === 0 || list[i - 1].chapter < m.chapter || (list[i - 1].chapter === m.chapter && list[i - 1].start <= m.start));

/** Every quote's block lies in its moment's passage, and the anchor is a sensible run of blocks. */
export function momentShapeProblems(list: readonly Moment[] = MOMENTS, characters: readonly string[] = []): string[] {
  const p: string[] = [];
  const ids = new Set<string>();
  for (const m of list) {
    if (ids.has(m.id)) p.push(`${m.id}: listed twice`);
    ids.add(m.id);
    if (!(m.end >= m.start)) p.push(`${m.id}: the passage ends before it starts`);
    if (!m.quotes.length) p.push(`${m.id}: no quote`);
    for (const q of m.quotes) {
      const b = /^c(\d+)-b(\d+)$/.exec(q.block);
      if (!b || Number(b[1]) !== m.chapter || Number(b[2]) < m.start || Number(b[2]) > m.end) p.push(`${m.id}: ${q.block} is outside its passage c${m.chapter}-b${m.start}–b${m.end}`);
    }
    if (!m.characters.length) p.push(`${m.id}: no challenge character`);
    for (const c of m.characters) if (characters.length && !characters.includes(c)) p.push(`${m.id}: ${c} is not a challenge character`);
    if (!m.title.trim() || !m.scene.trim()) p.push(`${m.id}: no title or scene line`);
  }
  if (!inBookOrder(list)) p.push('the moments are not in the book’s order (chapter, then block)');
  return p;
}
