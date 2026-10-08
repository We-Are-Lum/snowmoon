/**
 * Words of the Play and Sandbox modes at /minpentai. The Learn flow's words are in
 * learn-text.ts. MODEL-DRAFTED: while `modelDrafted` is true, the page shows a small
 * "Draft wording" note. Everything about matches here is invented (match.ts).
 */

export const TUTORIAL_TEXT = {
  modelDrafted: true,

  draftNote: 'Draft wording',
  backToTutorial: 'Tutorial',

  nav: { learn: 'Learn', practice: 'Practice', play: 'Play', sandbox: 'Sandbox', label: 'Minpentai sections' },
  /** Player names in matches, by colour (the approved board's owner colours). */
  players: ['Cyan', 'Amber', 'Pink', 'Violet'],
  inventedRules: 'Match rules invented',

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

};
