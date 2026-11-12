/**
 * The words of /challenge as a landing page and of its feed, /challenge/remixes (owner, 2026-11-04). DRAFT wording,
 * drafted by the coding agent (Claude, a closed model by Anthropic) for the owner's review. Kept apart from
 * wording.ts so that shared file changes little. No date is written here (scripts/test-challenge.ts fails if one is).
 */
import { phase, shortDateText } from './rules';

/**
 * Shown only before the open date, right after "Entries open … and close …", on /challenge and the sheet pages (owner,
 * 2026-11-07, his words, approved): remixing works from the flip, but those pictures can't be entered.
 */
export const LANDING_BEFORE_OPEN = 'Pictures made before then are for trying it out, and can’t be entered.';

export const LANDING_WORDING = {
  /** The sheet pages' copy of the line, starting at "Entries …" (owner, 2026-11-07: no "Pick a character.", then no "Tap a picture to remix it."). */
  sheetLine: (now: ReturnType<typeof phase> = phase()) => LANDING_WORDING.line(now).replace(/^Pick a character\. Tap a picture to remix it\. /, ''),
  /**
   * The short page's one line (owner, 2026-11-04: "one line on what to do"): what to do, then when, from
   * CHALLENGE.dates. Draft wording.
   */
  line: (now: ReturnType<typeof phase> = phase()) =>
    now === 'closed'
      ? `Entries closed ${shortDateText('closes')}. Every remix is below.`
      : `Pick a character. Tap a picture to remix it. Entries ${now === 'before' ? `open ${shortDateText('opens')} and ` : ''}close ${shortDateText('closes')}.${now === 'before' ? ` ${LANDING_BEFORE_OPEN}` : ''}`,
  rulesLink: 'Rules',
  rulesTitle: 'The rules',
  countsHead: 'Entrants so far',
  // The hub's cards (branch challenge-moments, 2026-11-05; docs/proposals/challenge-moments.md §1.3). Draft wording.
  cards: {
    bases: 'Bases',
    remixes: 'Remixes',
    showMore: 'Show more',
    /** P5g's fourth exception (owner, 2026-11-05, answer 3): the curated list says whose it is. */
    moments: 'Moments picked by @naaate',
    more: (name: string) => `More about ${name}`,
    less: (name: string) => `Less about ${name}`,
    summary: 'This edition’s summary',
    look: 'Look invented by this edition: the book doesn’t describe it.',
    appears: (name: string) => `Where ${name} appears in the book`,
    appearsCount: '{n} passages, chapters {a} to {b}',
    loading: 'Loading…',
    failed: 'Couldn’t load the passages. Try again.',
    readIt: 'Read it →',
    chapter: 'Chapter {n}',
    tapToRemix: 'Remix this picture',
  },
  /** The base's tile when its style has no name. */
  baseLabel: 'Base',
  sheetLabel: 'Sheet',
  /**
   * The heading over the owner's first remixes of a character (owner, 2026-11-04: a heading over the row, not a label
   * on each picture), and the slot for one that doesn't exist yet.
   */
  firstRemixesHead: 'First remixes by @naaate',
  firstRemixEmpty: 'Not here yet',
  /** Before a picture is tapped. */
  pickFirst: 'Tap a picture to remix it',
  remix: 'Remix',
  seeBase: 'See this base',
  seeSheet: 'See this sheet',
  seeRemix: 'See this remix',
  /** Before the character's base is picked (CHALLENGE.bases empty). */
  noBasesYet: (name: string) => `${name}’s base isn’t picked yet. Until it is, remix any published sheet of ${name}.`,
  noBasesNoSheet: (name: string) => `${name}’s base isn’t picked yet, and no sheet of ${name} is published yet.`,
  remixesHead: 'Remixes',
  remixesNote: 'A random few from every published remix, picked again on each visit.',
  remixesNone: 'No remixes yet. Be the first: pick a character above.',
  remixesNoScript: 'Turn on JavaScript to see a random few here, or see them all.',
  seeAll: 'See all remixes',
  howHead: 'How it works',
  // The feed.
  feedTitle: 'Every remix',
  feedNote: 'Newest first.',
  feedAll: 'All',
  feedNone: 'No remixes yet.',
  feedNoneFor: (name: string) => `No remixes of ${name} yet.`,
  feedOlder: 'Older remixes',
  feedNewest: 'Back to the newest',
  // Every submission (branch contest, 2026-11-04). Draft wording.
  entriesLink: 'Every entry',
  entriesTitle: 'Every entry',
  filterLabel: 'Filter by character',
  entriesOrderLabel: 'Order',
  entriesNewest: 'Newest first',
  entriesShuffled: 'Shuffled',
  entriesNone: 'No entries yet.',
  entriesNoneFor: (name: string) => `No entries for ${name} yet.`,
  back: '← The remix challenge',
  /**
   * The redesigned home (Claude Design's handoff, owner-approved 2026-11-11). The pitch is the owner's (approved). DRAFT
   * until the owner's OK: the "Remix a picture" card's tag and line, the three details' titles, and "About the pictures".
   * The other two ways (backstories, the collab) wait for the owner's rewards decision and aren't shown.
   */
  home: {
    pitch: 'Help find the characters you’d love, hate, or can’t stop thinking about.',
    closes: (when: string) => `Entries close ${when}.`,
    ways: [{ n: '1', title: 'Remix a picture', tag: 'START HERE', body: 'Pick a character, start from a base or anyone’s remix, describe a change, then publish and post it.' }],
    newTitle: 'New to Snowmoon?',
    rulesTitle: 'Rules',
    aboutTitle: 'About the pictures',
    about: 'Every picture here is AI-generated, not by the author. Each one names its model, and closed models name their maker. Lists are newest first.',
    /** The owner's words (2026-11-11). */
    joins: (name: string) => `${name} joins mid-challenge.`,
    joinsNote: 'joins mid-challenge',
    homeFrom: (block: string) => `the book, ${block}`,
  },
  /**
   * A character's redesigned page (Claude Design's handoff, screen 2). Approved (owner, 2026-11-11): "Starting pictures",
   * "Every remix of {name}", "newest first", "Remix {name}". DRAFT until the owner's OK: "Remix this", "Read more about
   * {name}", "{n} bases" and the looks line.
   */
  character: {
    startHead: 'Starting pictures',
    basesCount: (n: number) => `${n} ${n === 1 ? 'base' : 'bases'}`,
    everyHead: (name: string) => `Every remix of ${name}`,
    newestFirst: 'newest first',
    remix: (name: string) => `Remix ${name}`,
    remixThis: 'Remix this',
    readMore: (name: string) => `Read more about ${name}`,
    looks: (name: string) => `The book doesn’t describe ${name}’s looks. Every picture’s look is this edition’s.`,
  },
  untitled: (name: string) => `${name}, remixed`,
  pictureAlt: (name: string) => `AI-generated front view of ${name}, not by the author`,
  /** A challenge picture or a card's picture (branch challenge-moments). */
  pictureAltMoment: (name: string) => `AI-generated picture of ${name}, not by the author`,
};
