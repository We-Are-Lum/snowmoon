/**
 * The words of /challenge as a landing page and of its feed, /challenge/remixes (owner, 2026-11-04). DRAFT wording,
 * drafted by the coding agent (Claude, a closed model by Anthropic) for the owner's review. Kept apart from
 * wording.ts so that shared file changes little. No date is written here (scripts/test-challenge.ts fails if one is).
 */
import { phase, shortDateText } from './rules';

export const LANDING_WORDING = {
  /**
   * The short page's one line (owner, 2026-11-04: "one line on what to do"): what to do, then when, from
   * CHALLENGE.dates. Draft wording.
   */
  line: (now: ReturnType<typeof phase> = phase()) =>
    now === 'closed'
      ? `Entries closed ${shortDateText('closes')}. Every remix is below.`
      : `Pick a character, tap one of its bases, then Remix to make it your own. Entries ${now === 'before' ? `open ${shortDateText('opens')} and ` : ''}close ${shortDateText('closes')}.`,
  rulesLink: 'Rules',
  rulesTitle: 'The rules',
  countsHead: 'Entrants so far',
  /** A base's tile when its style has no name. */
  baseLabel: (n: number) => `Base ${n}`,
  sheetLabel: (n: number) => `Sheet ${n}`,
  /** Before a base is tapped. */
  pickFirst: 'Tap a base to remix it',
  remix: 'Remix',
  seeBase: 'See this base',
  seeSheet: 'See this sheet',
  /** Before the character's bases are picked (CHALLENGE.bases empty). */
  noBasesYet: (name: string) => `${name}’s three bases aren’t picked yet. Until they are, remix any published sheet of ${name}.`,
  noBasesNoSheet: (name: string) => `${name}’s three bases aren’t picked yet, and no sheet of ${name} is published yet.`,
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
  back: '← The remix challenge',
  untitled: (name: string) => `${name}, remixed`,
  pictureAlt: (name: string) => `AI-generated front view of ${name}, not by the author`,
};
