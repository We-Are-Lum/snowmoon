/**
 * Every word the Minpentai tutorial shows. Edit freely: nothing else in the code
 * holds tutorial wording. Screens are keyed by id; their order is set in
 * tutorial.ts.
 *
 * MODEL-DRAFTED. Written by the coding model and not yet edited by the owner.
 * While `modelDrafted` is true, the page shows a small "Draft wording" note.
 * Set it to false once the words are yours.
 *
 * Rules: at most two short sentences of instruction per screen (captions and
 * labels may add to that), plain words, and nothing from the book beyond
 * chapter 4. Sources for what is said about the book:
 *   arena   stadium inside the mountain, over a thousand watching (c4-b78–b79);
 *           new rule every game, chosen by priests (c4-b84, c4-b148);
 *           the countdown "MU GU GEI FA", fifty ticks (c4-b83)
 *   you     last year to compete; winning means the nationals (c4-b15);
 *           prize money (c4-b73)
 *   backward  rules run backward, so no wall is invincible (c4-b9, c4-b13)
 *   symbol  a copy of your symbol lets you see around it (c4-b93)
 *   match   dark board, setup in a corner (c4-b93–b94); the battle runs on its
 *           own, spaceships leave new symbols (c4-b106–b108); intervention turns
 *           (c4-b110); wreckage and debris (c4-b109, c4-b140); a player is out
 *           when all their symbols are destroyed (c4-b136–b138)
 *   hard    sight (c4-b93); intervention turns only (c4-b110); a new rule every
 *           game (c4-b84); no invincible wall (c4-b9)
 *   book    the board is from Zei's last game (c4-b7)
 */
import type { ScreenId } from './tutorial';

type ScreenText = {
  title: string;
  text: string;
  /** The one button's label before the goal is met (do screens) or always (read screens). */
  button: string;
  /** Small line under the board. */
  caption?: string;
  invented?: boolean;
};

export const TUTORIAL_TEXT = {
  modelDrafted: true,

  heading: 'Learn Minpentai',
  draftNote: 'Draft wording',
  stepOf: (n: number, total: number) => `${n} / ${total}`,
  inventedTag: 'invented',
  next: 'Next',
  youDidIt: 'Nice. You did it.',
  shown: 'Like that.',
  freePlay: 'Skip to free play',
  backToTutorial: 'Tutorial',
  dotLabel: (n: number, title: string) => `${n}. ${title}`,
  jumpTo: 'Jump to a screen',
  illustrationTag: 'Illustration · not playable here',

  screens: {
    arena: {
      title: 'A game a whole country watches',
      text: 'In Dzego, Minpentai fills a stadium inside a mountain, with over a thousand people watching. Before every match, the priests secretly choose a new rule.',
      caption: 'MU GU GEI FA · starting in fifty ticks',
      button: 'Next',
    },
    you: {
      title: 'Your season',
      text: 'You are a young player in your last year of school tournaments. Win, and you go to the nationals, with prize money on the line.',
      caption: 'Your symbol',
      button: 'Next',
    },
    alive: {
      title: 'The board is alive',
      text: 'Once a match begins, cells move by themselves. Step forward four times and watch this one hop and come home.',
      button: 'Show me',
    },
    backward: {
      title: 'Time runs both ways',
      text: 'Every move can be undone, so no wall is ever invincible. Step back to turn 0.',
      button: 'Show me',
    },
    glider: {
      title: 'The glider',
      text: 'This four-cell shape travels on its own, and it is your main tool. Press play and let it go.',
      button: 'Play it',
    },
    build: {
      title: 'Build one',
      text: 'Tap the four outlined cells to draw your own glider.',
      button: 'Draw it for me',
    },
    rock: {
      title: 'Rocks',
      text: 'Rocks never move, and gliders bounce off them. Press play to fire the glider at this one.',
      button: 'Fire it',
      invented: true,
    },
    symbol: {
      title: 'Your symbol',
      text: 'Each copy of your symbol lets you see the board around it, so it is what you protect and rivals hunt. Here a glider forms one against a rock: stop while it is framed.',
      button: 'Show me',
      invented: true,
    },
    match: {
      title: 'A full match',
      text: 'Two players, a dark board, and only a few chances to act. This is how a real match unfolds.',
      button: 'Next',
    },
    hard: {
      title: 'Why it is hard',
      text: 'Every match tests you in a new way.',
      button: 'Next',
    },
    book: {
      title: "The book's own board",
      text: 'This board is drawn in chapter 4 of the book, from a real match. Now it is yours to play with.',
      button: 'Start playing',
    },
  } satisfies Record<ScreenId, ScreenText>,

  /** Captions for the full-match illustration, one per frame. */
  matchFrames: {
    setup: 'Setup. You place copies of your symbol and your first walls in your corner. The rest of the board is dark.',
    spread: 'The battle runs on its own. Your gliders spread, and new copies of your symbol let you see further.',
    intervene: 'An intervention turn. For a moment you can add squares near any copy of your symbol.',
    clash: 'Your gliders meet your rival’s. Walls break, and debris piles up.',
    out: 'Every copy of your rival’s symbol is gone. They are out.',
  },

  /** The four reasons on the "why it is hard" screen. */
  hardReasons: [
    'You only see the board near your symbols.',
    'You can act only on intervention turns.',
    'The rules change every match.',
    'No wall is invincible.',
  ],
};
