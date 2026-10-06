/**
 * Every word the Minpentai tutorial shows. Edit freely: nothing else in the code
 * holds tutorial wording. Lessons are keyed by id; their order is set in
 * tutorial.ts.
 *
 * MODEL-DRAFTED. Written by the coding model and not yet edited by the owner.
 * While `modelDrafted` is true, the page shows a small "Draft wording" note.
 * Set it to false once the words are yours.
 *
 * Rules for this file: at most two short sentences per lesson, plain words, and
 * nothing that spoils the book beyond chapter 4. What the lessons say about the
 * game itself comes from chapters 2–4: a high-school programming game (c4-b79),
 * played in a stadium inside the mountain before over a thousand people (c4-b78),
 * a new rule every game chosen by the priests (c4-b84, c4-b148), symbols that let
 * a player see the board around them (c4-b93), intervention turns that let a
 * player add squares near their symbols (c4-b110), and a player is out once all
 * their symbols are destroyed (c4-b136–b138) or they resign (c4-b141).
 */
import type { LessonId } from './tutorial';

export const TUTORIAL_TEXT = {
  modelDrafted: true,

  heading: 'Learn the board',
  draftNote: 'Draft wording',
  lessonOf: (n: number, total: number) => `Lesson ${n} of ${total}`,
  inventedTag: 'invented',
  done: 'Done.',
  next: 'Next lesson',
  begin: 'Start the lessons',
  skip: 'Skip lesson',
  freePlay: 'Free play',
  startFreePlay: 'Start free play',
  backToTutorial: 'Tutorial',
  dotLabel: (n: number, title: string) => `Lesson ${n}: ${title}`,

  lessons: {
    what: {
      title: 'What is Minpentai?',
      text: 'Minpentai is a programming game played across Dzego, from schools to a stadium inside a mountain. Thousands watch the tournaments, and before each match the priests secretly choose a new rule.',
    },
    'one-cell': {
      title: 'One cell',
      text: 'A lone cell hops to a corner and back. Step forward four times.',
    },
    backward: {
      title: 'Time runs backward',
      text: 'Every move on this board can be undone. Step back to turn 0.',
    },
    glider: {
      title: 'A glider',
      text: 'Some shapes travel across the board. Press play and let this one go.',
    },
    build: {
      title: 'Build one',
      text: 'Tap the four outlined cells to draw a glider.',
    },
    rock: {
      title: 'A rock',
      text: 'Rocks never move, and gliders bounce off them. Press play to fire the glider at the rock.',
      invented: true,
    },
    symbol: {
      title: 'Your symbol',
      text: 'Each player has a symbol, which they protect and their opponents hunt. A glider striking a rock can form yours: stop on a turn where it is framed.',
      invented: true,
    },
    match: {
      title: 'How a match is played',
      text: 'Each player starts with copies of their symbol and sees the board around them. Then the board runs on its own, and every so often a turn comes when you can add squares near your symbols.',
    },
    win: {
      title: 'How you win',
      text: 'A player is out when every copy of their symbol is destroyed, or when they give up. Press play to send this glider into the symbol.',
    },
    book: {
      title: "The book's board",
      text: 'This board comes from a game in chapter 4, drawn in the book itself. This sandbox has no opponents yet: it is for learning how the board behaves.',
    },
  } satisfies Record<LessonId, { title: string; text: string; invented?: boolean }>,
};
