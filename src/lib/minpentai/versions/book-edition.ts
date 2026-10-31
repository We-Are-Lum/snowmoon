/**
 * The book edition (draft, 2026-10-31): a separate ruleset with four of the book's structures as pieces,
 * on a bigger board. Play is unchanged: its ruleset never sets these pieces' costs, so the engine never
 * makes one there (scripts/test-minpentai-versions.ts and -one-engine.ts still hold Play to its frozen copy).
 *
 * Design: docs/proposals/minpentai-book-pieces.md. Every quote below is the book's, word for word, with its
 * block; every "edition" line is this edition's invention, not the book's. Rules invented for this edition ·
 * not affiliated with the author.
 */
import type { VersionRules } from './solo-v1';

/**
 * Cyan's rocks on the 24 x 14 board (Amber's half is the same turned 180 degrees): pairs to build
 * factories against, and one in the middle. This edition's.
 */
const ROCKS: [number, number][] = [[5, 6], [5, 7], [9, 2], [10, 2], [9, 11], [10, 11], [11, 4]];

export const BOOK_EDITION: VersionRules = {
  set: {
    width: 24, height: 14, maxSteps: 144, points: 10, setupPoints: 12,
    costMirror: 2, mirrorHits: 3, costSeed: 2, costWall: 6, costFactory: 3, factoryHits: 2, ore: 3,
  },
  // No drawn rule: the pieces are this edition's change.
  drawn: [],
  rocksAt: ROCKS,
};

export interface BookPieceText {
  id: 'm' | 'e' | 'w' | 'f';
  name: string;
  book: { says: string; block: string }[];
  /** This edition's behaviour, one rule a line. */
  edition: string[];
}

/** What each piece is, in the book's words and then this edition's rules. Shown on /minpentai/book. */
export const BOOK_PIECES: BookPieceText[] = [
  {
    id: 'm', name: 'Mirror wall',
    book: [
      { block: 'c2-b12', says: 'Finally figured out a wall structure that reflected their gliders right back at them, completely wreaked havoc on their territory.' },
      { block: 'c4-b95', says: 'and then reflect one glider back into Bai\'s territory where a mirror wall would send the glider right back, but also shoot another glider upward.' },
      { block: 'c14-b91', says: 'As soon as a storm of gliders came, Deluin would figure out how to reflect it.' },
    ],
    edition: [
      'One square, leaning "/" or "\\", chosen when you place it. Costs 2.',
      'A glider that flies into it turns a quarter turn, as light off a mirror, and stays where it is that step. A glider flying diagonally into a mirror goes straight back.',
      'It turns every glider, yours too. After 3 hits it breaks (the third glider breaks with it).',
    ],
  },
  {
    id: 'e', name: 'Symbol glider',
    book: [
      { block: 'c4-b113', says: 'Zei then rolled out his next move: sending three unusual-looking gliders deep into Dza\'s territory along the edge. The gliders hit the wall that Dza had set up around his home base in the northeast corner, and came together into Zei\'s symbol for exactly one turn - Zei\'s next intervention turn. Zei quickly removed junk and put up walls around the symbol, and three gliders aimed in strategic directions. He now had a base right at the core of Dza\'s territory.' },
      { block: 'c4-b132', says: 'Then, seemingly miraculously, for one single turn, the chaos came together into a symbol.' },
      { block: 'c12-b181', says: 'Zei quickly put up symbols, walls, and gliders that would create symbols if they crashed into favorable rock formations.' },
    ],
    edition: [
      'A glider that carries part of your symbol. Costs 2. It flies like a glider, turns off mirrors, and destroys an enemy tower it hits.',
      'When it flies into a rock, a square, a factory, a moving wall or another resting symbol glider, it stops where it is and rests there. Any other glider that hits a resting one breaks both.',
      'Three of your symbol gliders resting within one 3 x 3 box come together into your symbol (a tower), on the square of the one that came to rest last (of several at once, the first in reading order).',
      'The symbol lasts until your next turn to act ends. It gives you sight and lets you place around it in that turn; if, when the turn ends, every square a glider could reach it from is solid or the board\'s edge, it stays. If not, it is gone.',
    ],
  },
  {
    id: 'w', name: 'Moving wall',
    book: [
      { block: 'c4-b111', says: 'At the front, Zei put down a "moving wall" design that he had perfected - a sort of large glider that flew half as fast, but was optimized for reflecting more basic types of gliders right back at the sender.' },
      { block: 'c4-b124', says: 'Then, Zei saw that Pan was sending against Zei the same type of moving wall that Zei had used himself.' },
    ],
    edition: [
      'Three squares in a line across its direction of flight; you place its middle square and its direction (straight only). Costs 6.',
      'It moves one square every second step.',
      'A glider that flies into its front is sent straight back, and the wall is unharmed. A glider that hits it from the side or from behind breaks the square it hits.',
      'It waits while a glider stands in its way, and stops for good at the edge, a rock, a tower or any other piece. It never destroys anything.',
    ],
  },
  {
    id: 'f', name: 'Glider factory',
    book: [
      { block: 'c4-b108', says: 'Gliders flew out, interacted with rock formations, and created more gliders.' },
      { block: 'c14-b38', says: 'an eternal glider factory: a glider would bounce back and forth, at each collision it would break off rock to spray even more gliders further north, and then every thousand turns, the rock would reset.' },
      { block: 'c7-b107', says: 'Part of the factory had been built during the intervention turn, the rest continued to be constructed in real time out of nearby rock formations by gliders.' },
    ],
    edition: [
      'Rocks hold ore: each starts with 3.',
      'A factory is one square placed against a rock, facing away from it; the rock must be within your reach too. Costs 3.',
      'Each time any glider hits that rock, the rock spends 1 ore and the factory fires one of your gliders from the square in front of it. The glider that hit bounces as always.',
      'A rock with no ore left crumbles away. A factory breaks after 2 hits, like a square.',
    ],
  },
];

/** Names proposed for the edition, for the owner to choose. */
export const EDITION_NAMES = ['Rocks and Mirrors', 'Intervention Turns', 'The Wasteland Field'];
