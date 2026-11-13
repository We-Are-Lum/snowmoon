/**
 * The six character cards on /challenge (owner, 2026-11-05, answer 2: "you draft all six cards … citing block ids,
 * word-for-word quotes checked by a test; anything this edition invented (looks) marked as the edition's own").
 *
 * Drafted by the coding agent (Claude, a closed model by Anthropic) on 2026-11-05, on branch challenge-moments.
 * Approved (owner, 2026-11-06; "reviewed by the coordinator, approved by the owner") with three changes: Mu's one line,
 * Zei's "A math guy, not a diplomat, Mu tells him" (c4-b67; the book never calls Mu his mentor), and "one of the book's
 * main characters" for Zei, Gladias and Seila. CHALLENGE.cardsApproved is true (check:principles P2m).
 *
 * What is whose (P2, P8):
 * - `line` and `description`: this edition's own words, saying what the book says without inventing; shown with
 *   "This edition's summary".
 * - each fact's `text`: this edition's short phrase for one fact; its `quote` is the book's own words, word for word,
 *   at `block` (checked by scripts/test-challenge-moments.ts and P9g as an exact substring of the block).
 * - `appears`: the book's own words, word for word, each with its block.
 * - the look: the book doesn't describe any of the six; every picture says "Look invented by this edition".
 *
 * Spoilers (P9's challenge exception, owner 2026-11-05, answer 1): the first layer (the line, the three facts, the
 * moments list) is written without the book's major turns, and its facts cite chapters 1 to FIRST_LAYER_MAX_CHAPTER
 * only (P9g checks it). The deeper layers ("More about", "Where they appear") may draw on the whole book (they aren't
 * shown since 2026-11-08), with no spoiler mark (owner, 2026-11-09). Each moment chip shows its chapter.
 *
 * Plain data: served to the browser inside the page's data (the first and second layers). "Where they appear" is sent
 * only when opened (GET /api/challenge/appears).
 */
export interface CardFact {
  /** This edition's phrase. */
  text: string;
  /** "c4-b70". */
  block: string;
  /** The book's words at that block, word for word. */
  quote: string;
}

export interface CardPassage {
  block: string;
  quote: string;
}

export interface CharacterCard {
  slug: string;
  /** One line: this edition's summary, without major turns. */
  line: string;
  /** About three facts, from chapters 1 to FIRST_LAYER_MAX_CHAPTER. */
  facts: CardFact[];
  /** The second layer: a fuller description (this edition's words) and more facts, from anywhere in the book. */
  more: { description: string; facts: CardFact[] };
  /** The third layer: where the character appears, the book's words, in book order. */
  appears: CardPassage[];
}

/** The first layer's facts cite no block past this chapter (owner, 2026-11-05: the first layer has no major twists). */
export const FIRST_LAYER_MAX_CHAPTER = 14;

export const CARDS: readonly CharacterCard[] = [
  {
    slug: 'zei',
    line: 'An eighteen-year-old Minpentai player from Pafogai Du, in Dzego, and one of the book’s main characters.',
    facts: [
      { text: 'Plays Minpentai, a high-school programming game', block: 'c4-b79', quote: 'a high-school programming game' },
      { text: 'A math guy, not a diplomat, Mu tells him', block: 'c4-b67', quote: 'You\'re a math guy, not a diplomat.' },
      { text: 'Hurt in the arm when a classroom wall came down', block: 'c2-b100', quote: 'The next thing Zei knew, a fragment of stone hit him in the arm.' },
    ],
    more: {
      description:
        'Zei Leimin is eighteen and lives in Pafogai Du, in Dzego, with his mother. He plays Minpentai, the book’s programming game, well enough to reach the quarterfinals and the championship, and Mu tells him he is a math guy, not a diplomat. He has a long rivalry with Bai, who has beaten him every time. The book gives his age and an arm that was broken and healed, but never his looks.',
      facts: [
        { text: 'Lives with his mother', block: 'c5-b3', quote: '"Come on, Mom!", he shouted.' },
        { text: 'His left arm was broken and took a month to heal', block: 'c9-b75', quote: 'That arm had been broken and taken a month to heal' },
        { text: 'Wears cabled glasses at the game console', block: 'c4-b82', quote: 'offering glasses attached to a long cable' },
        { text: 'Later wears a white-and-grey jacket in the snow', block: 'c29-b2', quote: 'jackets covered in a mixture of white and grey' },
      ],
    },
    appears: [
      { block: 'c2-b2', quote: 'Fin and Zei got off the autobus and walked down Hun Min street.' },
      { block: 'c2-b99', quote: 'A fraction of a tick later, part of the wall and the floor came crashing down.' },
      { block: 'c4-b79', quote: 'Zei gazed in awe at the room.' },
      { block: 'c4-b129', quote: '"Bai, next intervention turn is your chance to shine."' },
      { block: 'c5-b56', quote: '"Ah, we\'re also tourists. From Dzego", Zei replied. "I\'m Zei."' },
      { block: 'c12-b73', quote: '"I\'m Zei."' },
      { block: 'c29-b4', quote: '"Do you think we\'re ready?", Zei asked.' },
      { block: 'c31-b7', quote: '"Deluin!", he shouted.' },
    ],
  },
  {
    slug: 'gladias',
    line: 'A Veridian in the anonymous Order of Steering, who wears a privacy robe in public, and one of the book’s main characters.',
    facts: [
      { text: 'Wears the dark purple Veridian Privacy Robe in public', block: 'c1-b45', quote: 'the same signature Veridian Privacy Robe that he was wearing' },
      { text: 'Hopes to become a Sentinel, or a Keeper', block: 'c1-b68', quote: 'he would get in and become a Sentinel - or, if he changed his mind, a Keeper' },
      { text: 'Likes long walks in the forest', block: 'c1-b135', quote: 'I\'m going to go on some long walks in the forest' },
    ],
    more: {
      description:
        'Gladias lives in Meldan, the capital of Veridia, with his wife Seila and their children. He is an Acolyte in the Order of Steering, whose members keep who they are hidden behind privacy robes, and he is close to the score he needs to move up. He is thirty-nine. The book says almost nothing about his looks, and the robe’s shoes even hide his height.',
      facts: [
        { text: 'He is thirty-nine', block: 'c8-b52', quote: 'I was born thirty-nine years ago.' },
        { text: 'Robe shoes hide his real height', block: 'c1-b86', quote: 'his shoes, which had high heels to raise his height to the same level as other robe wearers' },
        { text: 'Learned programming when he was younger', block: 'c3-b24', quote: 'he had learned programming by writing an alternative client' },
        { text: 'Wears a neck band, and takes the robe off at home', block: 'c6-b4', quote: 'Gladias took off his privacy robe, though keeping his neck band on' },
      ],
    },
    appears: [
      { block: 'c1-b2', quote: 'Gladias was walking along a foot path, with tall trees towering on both sides.' },
      { block: 'c1-b50', quote: 'He soon got to the concert stage area, and was able to clearly hear the gnarly voice of Dreadknot\'s lead singer.' },
      { block: 'c1-b101', quote: '"Are you home, Seila?", he shouted.' },
      { block: 'c6-b158', quote: '"I am applying to become a Keeper."' },
      { block: 'c8-b8', quote: '"I\'m looking forward to your blog", Gladias whispered through his neck band' },
      { block: 'c24-b39', quote: 'She walked up to Gladias, and gently hugged him.' },
      { block: 'c26-b75', quote: 'Gladias and Zei stepped out of the car first.' },
    ],
  },
  {
    slug: 'bai',
    line: 'Zei’s Minpentai rival from Pafogai Du, about his age, confident and teasing.',
    facts: [
      { text: 'About Zei’s age', block: 'c4-b70', quote: 'Another woman walked in, about the same age as Zei.' },
      { text: 'Has beaten Zei three times out of three', block: 'c4-b72', quote: 'Bai had beaten him three out of three times over the past years' },
      { text: 'Self-made: worked side jobs in high school', block: 'c9-b17', quote: 'Do side jobs even while I was in high school.' },
    ],
    more: {
      description:
        'Bai Jahen is Zei’s rival at Minpentai, about his age, and hardly magnanimous in victory. In the quarterfinals the two are put on the same team and have to find a way to work together. She grew up making her own way, with side jobs even in high school. The book gives her age but not her looks.',
      facts: [
        { text: 'Often grinning', block: 'c7-b30', quote: 'Bai\'s grin faltered for a moment, then returned.' },
        { text: 'Seen carrying a shopping bag on the Freetown trip', block: 'c5-b4', quote: 'Bai followed along behind, carrying a shopping bag.' },
        { text: 'Second place in the Pafogai Du Minpentai games', block: 'c24-b48', quote: 'I got second place in the Pafogai Du Minpentai games' },
      ],
    },
    appears: [
      { block: 'c4-b70', quote: 'Another woman walked in, about the same age as Zei.' },
      { block: 'c4-b73', quote: 'Bai walked up closer, and put her hand on Zei\'s shoulder.' },
      { block: 'c4-b133', quote: 'Bai\'s symbol.' },
      { block: 'c5-b57', quote: '"And I\'m Bai."' },
      { block: 'c7-b30', quote: 'Bai\'s grin faltered for a moment, then returned.' },
      { block: 'c24-b39', quote: 'She walked up to Gladias, and gently hugged him.' },
    ],
  },
  {
    slug: 'seila',
    line: 'Gladias’s wife, a Veridian who writes a blog, and one of the book’s main characters.',
    facts: [
      { text: 'Gladias’s wife', block: 'c3-b89', quote: 'And your wife is Seila' },
      { text: 'Writes a blog', block: 'c8-b8', quote: 'I\'m looking forward to your blog' },
      { text: 'Travels to Freetown for a month or two', block: 'c1-b134', quote: 'I\'m going to visit Freetown for a month or two' },
    ],
    more: {
      description:
        'Seila lives in Meldan with Gladias and their children. She sets off to Freetown to see the United Cities for herself and maybe write about them, and there she meets Zei and Bai by chance over lunch. She isn’t a member of the Order. The book describes nothing of her appearance.',
      facts: [
        { text: 'Mother of Zven and Lily', block: 'c1-b125', quote: 'Zven and Lily were theirs' },
        { text: 'Borrows one of Gladias’s privacy robes', block: 'c20-b50', quote: 'Seila put on one of Gladias\'s privacy robes.' },
        { text: 'Drinks tea', block: 'c28-b91', quote: 'as she was pouring herself a tea' },
      ],
    },
    appears: [
      { block: 'c1-b101', quote: '"Are you home, Seila?", he shouted.' },
      { block: 'c1-b134', quote: 'I\'m going to visit Freetown for a month or two, see Jahn, maybe figure out some blog post to write on the United Cities.' },
      { block: 'c5-b58', quote: '"I\'m Seila", the woman replied.' },
      { block: 'c21-b49', quote: '"Gladias, you idiot! Do you know what you\'ve done?!!!!"' },
      { block: 'c26-b76', quote: 'It was Seila.' },
    ],
  },
  {
    slug: 'deluin',
    line: 'Zei’s friend and fellow Minpentai player, an older teenager from Redshire in the United Cities.',
    facts: [
      { text: 'An older teenager when Zei meets him', block: 'c12-b70', quote: 'An older teenage boy sat down beside Zei.' },
      { text: 'From Redshire', block: 'c12-b75', quote: 'Ah, I\'m from Redshire.' },
      { text: 'Almost a local in Dzego already, Zei says', block: 'c14-b119', quote: 'I\'m impressed, you\'re almost a local already.' },
    ],
    more: {
      description:
        'Deluin comes to Dzego from Redshire, in the United Cities, to play in the national Minpentai championship, and sits down beside Zei on the first day. His name gives him away as a foreigner. He can be earnest, even lecturing, and he is proud of home: he shows Zei pictures of its castles and mountains. The book calls him an older teenager and says little else about his looks.',
      facts: [
        { text: 'Not a Dzegojan name, Zei thinks', block: 'c12-b72', quote: 'That\'s not a very Dzegojan name' },
        { text: 'Both his parents are in Redshire', block: 'c14-b120', quote: 'I have to fly back for my mom and dad\'s birthdays' },
        { text: 'Later seen in only a sweater and a light hood in the snow', block: 'c31-b5', quote: 'a young man wearing only a sweater and a light hood climbing up' },
      ],
    },
    appears: [
      { block: 'c12-b71', quote: '"Hi, I\'m Deluin", he said.' },
      { block: 'c12-b75', quote: '"Ah, I\'m from Redshire. My name gave me away, didn\'t it?"' },
      { block: 'c14-b118', quote: 'Deluin replied in a lecturing tone.' },
      { block: 'c14-b124', quote: 'Deluin took out his hand device, and showed Zei some pictures of Redshire.' },
      { block: 'c31-b7', quote: '"Deluin!", he shouted.' },
      { block: 'c31-b9', quote: 'He reached the top, and almost threw Zei off balance as he threw himself into his arms for a hug.' },
    ],
  },
  {
    slug: 'mu',
    line: 'An older woman in Pafogai Du who knows Zei well and follows his Minpentai games.',
    facts: [
      { text: 'An older woman', block: 'c4-b62', quote: 'An older woman noticed him and turned to him.' },
      { text: 'Tells Zei he is a math guy, not a diplomat', block: 'c4-b67', quote: 'You\'re a math guy, not a diplomat.' },
      { text: 'Raises a toast before the final', block: 'c7-b49', quote: 'Mu raised the glass. "To our future," she said.' },
    ],
    more: {
      description:
        'Mu is an older woman in Pafogai Du who knows Zei well and is there for his biggest Minpentai games, from the quarterfinals to the final. She is warm with him and blunt about his weak spots, and she watches the game for more than who wins. The book calls her an older woman and gives no other detail of her looks.',
      facts: [
        { text: 'About the age of an older woman Zei meets later', block: 'c12-b14', quote: 'an older woman about the same age as Mu' },
        { text: 'Gentle with the robots; drinks tea', block: 'c29-b48', quote: 'Mu gently whispered, patting the robot on its head and taking her tea' },
        { text: 'A commander later in the book', block: 'c29-b110', quote: 'Mu had immediately taken over as the commander of Group South.' },
      ],
    },
    appears: [
      { block: 'c4-b64', quote: '"Ah, Mu, good to see you again!"' },
      { block: 'c4-b118', quote: 'Watching from the sidelines, Mu sighed.' },
      { block: 'c7-b49', quote: 'Mu raised the glass. "To our future," she said.' },
      { block: 'c29-b3', quote: '"So this is where our future will be decided", Mu said calmly.' },
      { block: 'c29-b5', quote: '"No", Mu replied. "But nothing meaningful ever happens when people are ready."' },
    ],
  },
  // Lord Ephelion (joined 2026-11-11). Drafted by the coding agent (Claude, a closed model by Anthropic): DRAFT until
  // the owner's OK. The book never describes his looks; it makes clear he is a man (c21-b76).
  // Approved (owner, 2026-11-11) with one change: the c21-b76 fact replaced by his poster's own words (c3-b5).
  {
    slug: 'ephelion',
    line: 'The Arctic ambassador to Veridia, whose speeches and debates reach Veridians on their screens.',
    facts: [
      { text: 'The Arctic ambassador to Veridia', block: 'c8-b17', quote: 'Lord Ephelion, Arctic ambassador to Veridia' },
      { text: 'Debates Professor Sylka, president of VNU', block: 'c8-b17', quote: 'Live debate between Professor Sylka, president of VNU, and Lord Ephelion' },
      { text: 'Gladias finds him a gifted demagogue', block: 'c8-b37', quote: 'A gifted demagogue, he concluded.' },
    ],
    more: {
      description:
        'Lord Ephelion speaks for the Arctics in Veridia: in a live debate with the president of Veridia National University, on posters, and in messages that take over screens. His speeches aggravate many Veridians, though his poster asks them to join him. It never describes his looks.',
      facts: [
        { text: 'Signs as consul to Veridia', block: 'c3-b5', quote: 'Arctic Empire consul to Veridia.' },
        { text: 'His speeches aggravate people', block: 'c13-b11', quote: 'even Ephelion\'s speeches, it just always aggravates people so much' },
        { text: 'His poster asks Veridians to join him', block: 'c3-b5', quote: 'Join us, and we will build it together.' },
      ],
    },
    appears: [
      { block: 'c3-b5', quote: 'Lord Ephelion' },
      { block: 'c8-b26', quote: 'Sylka paused. Lord Ephelion started speaking.' },
      { block: 'c11-b109', quote: 'we have to listen to Lord Ephelion giving his sermons all the time' },
      { block: 'c13-b63', quote: 'An image of Lord Ephelion appeared on the left side of the screen, and a multi-paragraph message on the right side.' },
      { block: 'c27-b74', quote: '"Do you remember Ephelion\'s debate with Sylka?"' },
    ],
  },
];

export const cardOf = (slug: string): CharacterCard | null => CARDS.find((c) => c.slug === slug) ?? null;

/** The chapter of a block id ("c4-b70" → 4), or NaN. */
export const chapterOf = (block: string) => Number(/^c(\d+)-b\d+$/.exec(block)?.[1] ?? NaN);

/**
 * "Read more about {name}" on a character's page (owner, 2026-11-12: ADD): the card's first-layer facts only, each with
 * its book quote, block and chapter, and none past chapter FIRST_LAYER_MAX_CHAPTER. Never the second layer or "Where they
 * appear" (P9g checks this function and that the page's data reads the facts only through it).
 */
export const firstLayerFacts = (slug: string): { text: string; block: string; quote: string; chapter: number }[] =>
  (cardOf(slug)?.facts ?? []).filter((f) => chapterOf(f.block) <= FIRST_LAYER_MAX_CHAPTER).map((f) => ({ text: f.text, block: f.block, quote: f.quote, chapter: chapterOf(f.block) }));

/** Every quote on the cards, for the word-for-word check. */
export function cardQuotes(cards: readonly CharacterCard[] = CARDS): { where: string; block: string; text: string }[] {
  return cards.flatMap((c) => [
    ...c.facts.map((f, i) => ({ where: `card ${c.slug} fact ${i + 1}`, block: f.block, text: f.quote })),
    ...c.more.facts.map((f, i) => ({ where: `card ${c.slug} more fact ${i + 1}`, block: f.block, text: f.quote })),
    ...c.appears.map((a, i) => ({ where: `card ${c.slug} appears ${i + 1}`, block: a.block, text: a.quote })),
  ]);
}

/** What is wrong with the cards' shape: one per challenge character, about three first-layer facts, no later chapter there, passages in book order. */
export function cardShapeProblems(cards: readonly CharacterCard[] = CARDS, characters: readonly string[] = []): string[] {
  const p: string[] = [];
  const slugs = cards.map((c) => c.slug);
  if (characters.length && (slugs.length !== characters.length || !characters.every((c) => slugs.includes(c)))) p.push(`the cards are ${cards.map((c) => c.slug).join()}, not one per challenge character (${characters.join()})`);
  for (const c of cards) {
    if (!c.line.trim() || !c.more.description.trim()) p.push(`${c.slug}: no line or description`);
    if (c.facts.length < 2 || c.facts.length > 4) p.push(`${c.slug}: ${c.facts.length} first-layer facts, not about three`);
    for (const f of c.facts) if (!(chapterOf(f.block) <= FIRST_LAYER_MAX_CHAPTER)) p.push(`${c.slug}: a first-layer fact cites ${f.block}, past chapter ${FIRST_LAYER_MAX_CHAPTER}`);
    for (const f of [...c.facts, ...c.more.facts]) if (!f.text.trim() || !f.quote.trim()) p.push(`${c.slug}: a fact cites nothing`);
    const order = c.appears.map((a) => /^c(\d+)-b(\d+)$/.exec(a.block)).map((m) => (m ? Number(m[1]) * 1e4 + Number(m[2]) : NaN));
    if (!order.every((x, i) => Number.isFinite(x) && (i === 0 || order[i - 1] < x))) p.push(`${c.slug}: "Where they appear" isn't in book order`);
  }
  return p;
}
