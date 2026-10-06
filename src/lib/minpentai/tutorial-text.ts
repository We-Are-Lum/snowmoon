/**
 * Every word the Minpentai tutorial shows. Edit freely: nothing else in the code
 * holds tutorial wording.
 *
 * MODEL-DRAFTED. Written by the coding model and not yet edited by the owner.
 * While `modelDrafted` is true, the page shows a small "Draft wording" note.
 * Set it to false once the words are yours.
 *
 * Rules for this file: at most two short sentences per lesson, plain words, and
 * nothing that spoils the book beyond chapter 4.
 */
export const TUTORIAL_TEXT = {
  modelDrafted: true,

  heading: 'Learn the board',
  draftNote: 'Draft wording',
  lessonOf: (n: number, total: number) => `Lesson ${n} of ${total}`,
  inventedTag: 'invented',
  done: 'Done.',
  next: 'Next lesson',
  skip: 'Skip lesson',
  freePlay: 'Free play',
  startFreePlay: 'Start free play',
  backToTutorial: 'Tutorial',
  dotLabel: (n: number, title: string) => `Lesson ${n}: ${title}`,

  lessons: [
    {
      title: 'One cell',
      text: 'A lone cell hops to a corner and back. Step forward four times.',
    },
    {
      title: 'Time runs backward',
      text: 'Every move on this board can be undone. Step back to turn 0.',
    },
    {
      title: 'A glider',
      text: 'Some shapes travel across the board. Press play and let this one go.',
    },
    {
      title: 'Build one',
      text: 'Tap the four outlined cells to draw a glider.',
    },
    {
      title: 'A rock',
      text: 'Rocks never move, and gliders bounce off them. Press play to fire the glider at the rock.',
      invented: true,
    },
    {
      title: 'Your symbol',
      text: 'A glider striking a rock can form your symbol. Stop on a turn where it is framed, and step back if you miss it.',
      invented: true,
    },
    {
      title: "The book's board",
      text: 'This board comes from a game in chapter 4, drawn in the book itself.',
    },
  ],
} as const;
