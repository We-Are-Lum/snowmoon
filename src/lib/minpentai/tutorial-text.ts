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
 *           own (c4-b106–b108); intervention turns (c4-b110); a player is out
 *           when all their symbols are destroyed (c4-b136–b138); the audience
 *           sees the whole board, players only near their symbols (c4-b114).
 *           The match shown is played by computer players under invented rules
 *           (match.ts); the text says so.
 *   practice, play  invented rules throughout; "Test" echoes testing designs in
 *           a private sandbox first (c4-b96); walls reflect gliders (c2-b12)
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
      text: 'Four players start in four corners, and each gets a turn to act every 24 turns. The crowd sees the whole board; players see only near their symbols.',
      caption: 'Computer players · match rules invented',
      button: 'Next',
      invented: true,
    },
    hard: {
      title: 'Why it is hard',
      text: 'This is the same match as cyan sees it.',
      button: 'Next',
    },
    book: {
      title: "The book's own board",
      text: 'This board is drawn in chapter 4 of the book, from a real match. Next, play a practice match yourself.',
      button: 'Practice match',
    },
  } satisfies Record<ScreenId, ScreenText>,

  nav: { learn: 'Learn', practice: 'Practice', play: 'Play', sandbox: 'Sandbox', label: 'Minpentai sections' },
  /** Player names in matches, by colour (the approved board's owner colours). */
  players: ['Cyan', 'Amber', 'Pink', 'Violet'],
  inventedRules: 'Match rules invented',

  /** The recorded four-player match. */
  watch: {
    start: 'Each corner starts with two symbols.',
    intervention: 'A turn to act: everyone puts down squares.',
    out: (name: string) => `${name} is out.`,
    wins: (name: string) => `${name} wins.`,
    draw: 'A draw.',
    play: 'Play',
    pause: 'Pause',
    again: 'Watch again',
  },

  /** Shared by the practice match and the match against the computer. */
  match: {
    turn: (n: number) => `TURN ${n}`,
    symbols: (name: string, n: number) => `${name.toUpperCase()} ${n}`,
    hidden: (name: string) => `${name.toUpperCase()} ?`,
    yourTurn: (left: number) => `YOUR TURN · ${left} SQUARES LEFT`,
    actIn: (k: number) => `NEXT TURN TO ACT IN ${k}`,
    testing: 'TEST · ONLY WHAT YOU CAN SEE',
    tools: { glider: 'Glider', mirror: 'Square', symbol: 'Symbol' },
    toolCost: (n: number) => `${n} sq`,
    toolsLabel: 'What to put down',
    dirsLabel: 'Glider direction',
    dirs: { up: 'Up', down: 'Down', left: 'Left', right: 'Right' },
    undo: 'Undo',
    test: 'Test',
    stopTest: 'Stop test',
    tapAgain: 'Tap it again to put it down.',
    tapToPlace: 'Tap the board near your symbols to place it.',
    problems: {
      reach: 'Too far from your symbols.',
      crowded: 'Too close to other cells.',
      budget: 'Not enough squares left.',
      'not-intervention': 'Wait for your next turn to act.',
      out: 'The match is over.',
    },
    run: 'Run',
    skip: 'Skip ahead',
  },

  practice: {
    heading: 'Practice match',
    steps: {
      dark: {
        title: 'A practice match',
        text: 'You are cyan, against a practice rival that follows a script. You see only the lit area around your symbols.',
        button: 'Next',
      },
      spread: {
        title: 'Spread out',
        text: 'This is a turn to act: you may put down 8 squares near your symbols. Put a new symbol on the outline to see further.',
        button: 'Show me',
      },
      block: {
        title: 'Block',
        text: 'A rival glider is heading for your symbol. One square in its path bounces it away, so put one on the outline.',
        button: 'Show me',
      },
      attack: {
        title: 'Attack',
        text: 'Their symbol is in sight now. Fire a glider up at it from the outline; Test shows where it goes first.',
        button: 'Show me',
      },
      won: {
        title: 'You win',
        text: 'Their last symbol is gone, so they are out. Next, play the computer.',
        button: 'Play the computer',
      },
    },
  },

  play: {
    heading: 'Play the computer',
    intro: 'You are cyan; the computer is amber and plays an easy game. Find its symbols in the dark and destroy them.',
    level: 'Easy',
    youWin: 'You win.',
    youLose: 'The computer wins.',
    draw: 'A draw.',
    again: 'Play again',
    sandbox: 'Open the sandbox',
  },

  /** The four reasons on the "why it is hard" screen. */
  hardReasons: [
    'You only see the board near your symbols.',
    'You can act only on intervention turns.',
    'The rules change every match.',
    'No wall is invincible.',
  ],
};
