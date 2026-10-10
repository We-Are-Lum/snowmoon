/**
 * The home page (src/app/page.tsx), from Claude Design's HomeWindow (docs/design/home/).
 *
 * MOMENTS: sentences of the book, exactly as in their block (speaker-colour span tags removed,
 * nothing else), each with its block id. check:principles P2i checks every one against
 * content/snowmoon/text/chapter-N.json. Design's sample (docs/design/home/home-live.js) had six:
 * c1-b18 is a screen, not a sentence, and is left out; Design's c1-b20 sentence is in c1-b19; its
 * c1-b9 stopped mid-sentence and is given here whole.
 */
export interface HomeMoment {
  chapter: number;
  /** The block it is quoted from: c<chapter>-b<idx>. */
  block: string;
  /** One or more whole sentences of that block, verbatim. */
  text: string;
}

export const HOME_MOMENTS: HomeMoment[] = [
  { chapter: 1, block: 'c1-b4', text: 'Suddenly, a small drone flew over his head. Gladias instinctively checked his watch. Almost immediately, a green checkmark lit up.' },
  { chapter: 1, block: 'c1-b6', text: '"Five points for me!", the boy shouted excitedly.' },
  {
    chapter: 1,
    block: 'c1-b9',
    text: "And playing into Gladias's ear this whole time, there was an audio program from Emerald, the local AI running from Gladias's hand device, explaining the nuances of airborne virus transmission and how to calculate how much a given change to a building's ventilation or density might affect total city-wide cases in an epidemic.",
  },
  {
    chapter: 1,
    block: 'c1-b12',
    text: '"Pause, I want to enjoy the view", Gladias said to Emerald, out of habit whispering the sentence so softly that only his throat muscles moved and no sound at all left his lips.',
  },
  { chapter: 1, block: 'c1-b19', text: 'As a citizen of Veridia, he had been randomly selected by cryptographic sortition to vote on how much he liked the building.' },
];

/** The block's text that moments are quoted from: only the speaker-colour span tags removed. */
export const momentSource = (content: string) => content.replace(/<\/?span[^>]*>/g, '');

/**
 * Problems with the moments, given each block's content by id: a block that is missing or not a
 * paragraph, a chapter that does not match the id, or a text that is not whole sentences of it.
 */
export function momentProblems(moments: HomeMoment[], blocks: Map<string, { kind: string; content: string }>): string[] {
  const problems: string[] = [];
  for (const m of moments) {
    const b = blocks.get(m.block);
    if (!b) { problems.push(`${m.block}: no such block`); continue; }
    if (!m.block.startsWith(`c${m.chapter}-b`)) problems.push(`${m.block}: listed under chapter ${m.chapter}`);
    if (b.kind !== 'paragraph' && b.kind !== 'quote') problems.push(`${m.block}: a ${b.kind}, not a sentence of the book`);
    const src = momentSource(b.content);
    const at = src.indexOf(m.text);
    if (!m.text.trim() || at < 0) { problems.push(`${m.block}: "${m.text.slice(0, 50)}…" is not verbatim in the block`); continue; }
    // Whole sentences: it starts the block or follows a sentence end, and ends one.
    const before = src.slice(0, at), after = src.slice(at + m.text.length);
    if (!(before === '' || /[.!?…]["”’)]?\s$/.test(before)) || !/[.!?…]["”’)]?$/.test(m.text) || !(after === '' || /^\s/.test(after)))
      problems.push(`${m.block}: "${m.text.slice(0, 50)}…" is not whole sentences of the block`);
  }
  return problems;
}

/**
 * Design's words for the page (HomeWindow.dc.html), and the coding agent's where Design's were not
 * true here. Model-drafted wording (Claude Design, then the coding agent, 2026-10-10), for the owner
 * to rewrite.
 */
export const HOME_TEXT = {
  kicker: 'An open novel, being adapted by its readers · Draft',
  title: 'Build a world together.',
  lines: [
    'Make something with others, and keep your name on it.',
    'Get to know Veridia in depth, one passage at a time.',
    'Learn to make things with AI, in the open.',
  ],
  start: 'Start chapter 1',
  how: 'How this works',
  continue: (n: number) => `Continue · Chapter ${n}`,
  about: 'Licence and sources',
  moment: { head: (n: number) => `A moment from chapter ${n}`, read: 'Read from here →', another: 'Another ↻' },
  feed: { head: 'Just made · All AI-assisted', all: 'Everything made →', empty: 'Nothing published yet.', unavailable: 'Nothing to show right now.' },
  game: {
    head: 'Minpentai · Playing itself',
    // Where the book has the game: Zei's last match, in chapter 4 (c4-b4–b7). Design's "the game the boy is
    // playing in chapter 1" is not in the book: the boy in chapter 1 (c1-b6) is flying a toy drone.
    caption: 'Zei studies a board from his last Minpentai game in chapter 4 (c4-b5, c4-b7). This board plays the Learn game against itself: both sides are its computer player.',
    play: 'Play Minpentai →',
    pause: 'Pause',
    resume: 'Play',
  },
  everything: 'Everything you can do here',
  chapters: 'Chapters',
  footer: 'All wording on this page is draft.',
} as const;
