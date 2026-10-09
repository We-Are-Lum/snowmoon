/**
 * Every word of Learn Minpentai: Claude Design's "Minpentai Intro v3" strings
 * (docs/design/minpentai-intro-v3.dc.html; listed in docs/design/minpentai-study.md §9), plus the
 * few this build adds. ALL OF IT IS DRAFT WORDING (one "Draft wording" tag per screen while
 * `modelDrafted` is true). Changes from Design are listed in docs/design/minpentai-learn-port.md:
 * corrected block ids (study §14.3), the "Rules invented for this edition" tag and note, and the
 * sources that pointed at match.ts, which the Learn game no longer uses.
 *
 * Every statement about the book carries a block id in `sources` (check:principles P8c); the
 * Learn game itself is labelled as rules invented for this edition (P8d).
 */

export type TagKey = 'book' | 'imag' | 'lens' | 'inv' | 'rules' | 'draft';
export type Source = [what: string, where: string];
export interface Screen {
  title: string;
  text: string;
  caption?: string;
  button: string;
  tags: TagKey[];
  sources: Source[];
  /** Lessons: the status line when the goal is met (overrides "NICE…"/"LIKE THAT."), or failed. */
  metText?: string;
  failText?: string;
  /** Shows the note that these rules are invented, with the way to the sandbox. */
  rulesNote?: true;
}

/** The book's words on new rules, quoted from c4-b84 (so P8c checks them); never paraphrased as "the rule changes every match" (P8d). */
const BOOK_NEW_RULE: Source = ['In the book, "every game there\'s always some kind of new rule"', 'c4-b84'];
const RECOVERED: Source = ["The sandbox runs the rule recovered from the book's animated board", 'c4-b5 · c4-b7'];
const INVENTED: Source = ['The rules of the Learn game (towers, gliders, squares, rocks, turns to act, the new rules) are invented for this edition', 'invented'];

export const LEARN_TEXT = {
  modelDrafted: true,
  appTitle: 'Learn Minpentai',
  skip: 'SKIP TO FREE PLAY',
  /** Added by this build (draft): full screen's way back to the site (phones, the Farcaster frame). */
  exit: '×',
  exitLabel: 'Exit Learn, back to Snowmoon',
  back: 'BACK',
  next: 'NEXT',
  startLessons: 'START THE LESSONS',
  startPractice: 'START A PRACTICE MATCH',
  watchOf: (n: number, total: number) => `WATCH · ${n} / ${total}`,
  learnOf: (n: number, total: number) => `LEARN · ${n} / ${total}`,
  learnOptional: 'LEARN · OPTIONAL',
  practiceLabel: 'PRACTICE',
  sources: (open: boolean, n: number) => `${open ? 'HIDE SOURCES' : 'SOURCES'} (${n})`,
  tags: {
    book: 'FROM THE BOOK',
    imag: 'BROADCAST IMAGINED',
    lens: 'CLEAR LENSES INVENTED',
    inv: 'SYMBOL SHAPE INVENTED',
    rules: 'RULES INVENTED FOR THIS EDITION',
    draft: 'DRAFT WORDING',
  } satisfies Record<TagKey, string>,
  /** Added by this build (draft): on lesson 1, lesson 7 and the practice match. */
  rulesNote: {
    text: 'The rules of this game are invented for this edition. The book says that "every game there\'s always some kind of new rule" (c4-b84). The rule recovered from the book\'s figure (c4-b5, c4-b7) is in the sandbox.',
    link: "THE BOOK'S RULE, IN THE SANDBOX →",
  },

  cams: {
    crane: 'CAM 1 · CRANE',
    wide: 'CAM 2 · WIDE',
    cyanCorner: 'CAM 3 · CYAN CORNER',
    follow: 'CAM 4 · FOLLOW',
    low: 'CAM 5 · LOW',
    amberCorner: 'CAM 6 · AMBER CORNER',
    symbol: 'CAM 7 · SYMBOL',
    overhead: 'CAM 8 · OVERHEAD',
  },
  /** The commentary line and the banners (broadcast.ts EVENTS). */
  events: {
    setup: 'Setup. Each player builds in their own corner.',
    begins: 'The battle begins.',
    see: 'The players see only near their own towers. The crowd sees all of it.',
    fly: 'Gliders fly straight and bounce off squares and rocks.',
    intervention: 'Intervention turn. Everyone may put down a few squares.',
    forward: 'Cyan and Amber each build a forward tower.',
    pink1: 'Pink loses a tower. Two left.',
    pink2: 'Pink loses another. One left.',
    violetHits: 'Violet hits back at Amber.',
    pinkOut: 'Pink is out.',
    violetForward: "Violet takes out Cyan's forward tower.",
    cyanAnswers: 'Cyan answers. Violet is down to two.',
    amberHits: 'Amber hits Violet too.',
    violetOut: 'Violet is out.',
    cyanStrikes: "Cyan strikes Amber's forward tower.",
    resigns: 'Amber resigns. Cyan wins.',
    wreckage: 'Most of the board is wreckage now.',
    above: 'From above, the same match is a flat board.',
    bBegins: 'BATTLE BEGINS',
    bIntervention: 'INTERVENTION TURN',
    bPinkOut: 'PINK IS OUT',
    bVioletOut: 'VIOLET IS OUT',
    bCyanWins: 'CYAN WINS',
  },
  hud: {
    live: 'LIVE · ',
    turn: (n: string) => `TURN ${n}`,
    out: 'OUT',
    minus: (name: string) => `−1 ${name.toUpperCase()}`,
    atConsole: (name: string) => `${name.toUpperCase()} · AT THE CONSOLE`,
    camOut: ' · OUT',
    dz: 'MU GU GEI TAU FA',
    dzEnglish: 'The battle begins in fifty ticks.',
    pause: 'II',
    play: '▶',
    pauseLabel: 'Pause the match',
    playLabel: 'Play the match',
    noGL: "3D isn't available here. This is the same match from above.",
  },
  stageWatch: 'Imagined broadcast of a Minpentai match. ',
  stageLearn: 'Minpentai board. ',

  watch: [
    {
      title: 'A game a whole country watches',
      text: 'In Dzego, Minpentai fills a giant hall inside a mountain, with over a thousand people watching. Before every match, the priests secretly choose a new rule.',
      caption: 'Players learn the rule only when the match starts, then get a set time to build. In one match it is twenty minutes.',
      button: 'NEXT',
      tags: ['book', 'imag', 'rules', 'draft'],
      sources: [
        ['A giant room inside the mountain, over a thousand watching', 'c4-b58 · c4-b78'],
        ['"Every game there\'s always some kind of new rule"; the priests "decide on the rule sets"', 'c4-b84 · c4-b148'],
        ['"MU GU GEI TAU FA" · The battle begins in fifty ticks.', 'c4-b97–b98'],
        ['Players are kept offline so they cannot learn the rule early', 'c12-b133–b134'],
        ['Twenty minutes to build before the battle', 'c12-b149'],
        INVENTED,
      ],
    },
    {
      title: 'Every player plays alone',
      text: "Each player sits at a console in glasses on a cable, and sees only the board near their own towers. The crowd sees the whole board, and the players' faces.",
      caption: 'Under each face is what that player sees right now.',
      button: 'NEXT',
      tags: ['book', 'lens', 'imag', 'rules', 'draft'],
      sources: [
        ['Devices handed over in the elevator', 'c4-b77'],
        ['A giant game console with a chair', 'c4-b78'],
        ['Glasses on a cable at the console', 'c4-b82'],
        ['The book never says whether the lenses are clear. Here they are, so the eyes show.', 'invented'],
        ['Teammates normally talk by voice chat', 'c4-b99'],
        ['"On the big screen, the audience watched."', 'c7-b86'],
        ['A symbol lets its owner see within thirty squares', 'c4-b93'],
        ['The crowd sees a large detailed map', 'c4-b114'],
      ],
    },
    {
      title: 'Then the battle runs itself',
      text: 'Once it starts, the players can only watch. Gliders fly out in straight lines. Squares and rocks bounce them back.',
      caption: 'In the broadcast, each glider is drawn as a drone.',
      button: 'NEXT',
      tags: ['book', 'imag', 'rules', 'draft'],
      sources: [
        ['Gliders, walls, rocks', 'c4-b84'],
        ['In the book, gliders hitting rocks can make more gliders. Here rocks only bounce them.', 'c4-b108'],
      ],
    },
    {
      title: 'A turn to act',
      text: 'Every so often, each player may put down a few pieces near their own towers. Then the match runs on without them.',
      caption: 'The crews stand for squares being placed.',
      button: 'NEXT',
      tags: ['book', 'imag', 'rules', 'draft'],
      sources: [['"All players were able to put down more squares near any copy of their symbols"', 'c4-b110']],
    },
    {
      title: 'Lose every tower and you are out',
      text: 'Each player starts with a few towers. A glider that reaches an enemy tower destroys it. The scoreboard counts the towers each player has left.',
      caption: 'A white ring marks the tower about to be hit. The book calls towers symbols.',
      button: 'NEXT',
      tags: ['book', 'inv', 'imag', 'rules', 'draft'],
      sources: [
        ['Symbols give sight around them', 'c4-b93'],
        ['A player with no symbols left is out', 'c4-b136–b138'],
        ['The symbol shape is invented; the book never draws one', 'docs/minpentai-rules.md §1.3'],
      ],
    },
    {
      title: 'The last one standing wins',
      text: 'The last player with towers left wins. If time runs out, most towers wins. A player who sees the end coming can resign.',
      button: 'NEXT',
      tags: ['book', 'imag', 'rules', 'draft'],
      sources: [
        ['A player resigns', 'c4-b141'],
        ['A player is out when every symbol is gone', 'c4-b136–b138'],
      ],
    },
    {
      title: 'Your season',
      text: 'You are a young player in your last year of school tournaments. Win, and you go to the nationals, with prize money on the line.',
      caption: 'Practice against bots only goes so far. They play the standard rules well and adapt badly to a new one.',
      button: 'NEXT',
      tags: ['book', 'imag', 'rules', 'draft'],
      sources: [
        ['Last year to compete; winning means the nationals', 'c4-b15'],
        ['Prize money', 'c4-b73'],
        ['Bots are strong on stock Minpentai, weak on new rules', 'c7-b13–b14'],
        ['"A high-entropy wasteland"', 'c4-b140'],
      ],
    },
    {
      title: 'Now try it yourself',
      text: 'From above, the match is a flat board of towers, gliders and squares. Next, learn each piece on that board.',
      button: 'START THE LESSONS',
      tags: ['book', 'imag', 'rules', 'draft'],
      sources: [["The rule was recovered from the book's animated board", 'c4-b5 · c4-b7']],
    },
  ] satisfies Screen[],

  /** Design's LS, in order: seven lessons, then Under the hood and the practice match. */
  lessons: {
    goal: {
      title: 'Keep your towers. Destroy theirs.',
      text: 'You are Cyan. Each player starts with a few towers, and your score is how many you have left. Lose them all and you are out. The last player with towers wins.',
      caption: 'If a match runs long, whoever has the most towers when time runs out wins.',
      button: 'NEXT',
      tags: ['book', 'rules', 'draft'],
      rulesNote: true,
      sources: [
        ['A player with no symbols left is out', 'c4-b136–b138'],
        ['The book calls them symbols. Here they are drawn as towers.', 'invented'],
        ['Most towers when time runs out', 'invented'],
        BOOK_NEW_RULE,
        RECOVERED,
      ],
    },
    glider: {
      title: 'Gliders fly straight',
      text: 'A glider flies in a straight line, up, down, left or right, one square per step. It bounces off the edge. Press play.',
      caption: 'In the match, these were the drones.',
      button: 'PLAY IT',
      tags: ['book', 'rules', 'draft'],
      sources: [['Gliders', 'c4-b84'], ['One square per step stands for a real glider’s two cells every four turns', 'src/lib/minpentai/glider.ts']],
    },
    hit: {
      title: 'A hit destroys a tower',
      text: 'When a glider reaches an enemy tower, the tower is gone. That is how you score. Press play and watch Amber’s score.',
      button: 'PLAY IT',
      tags: ['book', 'rules', 'draft'],
      metText: 'AMBER −1.',
      sources: [['Symbols lost to attacks; out when none are left', 'c4-b136–b138']],
    },
    square: {
      title: 'Squares bounce gliders',
      text: 'An Amber glider is coming for your tower. Tap one of the outlined spots to put a square in its way, then press play.',
      caption: 'A square survives one hit and cracks. The second hit breaks it, and the glider breaks with it.',
      button: 'BLOCK IT FOR ME',
      tags: ['book', 'rules', 'draft'],
      failText: 'YOUR TOWER FELL. PRESS RESET AND TRY AGAIN.',
      sources: [['Walls', 'c4-b84'], ['No wall is invincible', 'c4-b9 · c4-b13']],
    },
    turn: {
      title: 'Your turn to act',
      text: 'Every so often you get 8 points to spend near your own towers. A glider costs 4, a square 1 and a tower 4. Pick a glider’s direction with the arrows. Take out Amber’s last tower.',
      caption: 'Between turns to act, the match runs by itself. The lit area is where you may build.',
      button: 'DO IT FOR ME',
      tags: ['book', 'rules', 'draft'],
      failText: 'MISSED. PRESS RESET AND TRY ANOTHER ROW.',
      sources: [['Players put down more squares near their symbols', 'c4-b110'], ['8 points; glider 4, square 1, tower 4', 'invented']],
    },
    sight: {
      title: 'You only see near your towers',
      text: 'Beyond a few squares of your towers, the board is dark. Press play. Something is coming.',
      caption: 'Lose a tower and you see less. Build one and you see more.',
      button: 'PLAY IT',
      tags: ['book', 'rules', 'draft'],
      metText: 'YOU LOST A TOWER, AND YOUR VIEW SHRANK.',
      sources: [['A symbol lets its owner see around it', 'c4-b93']],
    },
    rule: {
      title: 'Every match, a new rule',
      text: 'Before each match, the priests pick a new rule, and players learn it only when the match begins. That is what makes Minpentai hard:',
      button: 'START A PRACTICE MATCH',
      tags: ['book', 'rules', 'draft'],
      rulesNote: true,
      sources: [BOOK_NEW_RULE, ['Players are kept offline so they cannot learn it early', 'c12-b133–b134'], RECOVERED],
    },
    hood: {
      title: 'Under the hood',
      text: 'Every piece is a few cells, moved by one rule from the book. This is a glider, cell by cell. Press play.',
      caption: 'You never need this to play.',
      button: 'PLAY IT',
      tags: ['book', 'draft'],
      sources: [['The rule, recovered from the book’s animated board', 'c4-b5 · c4-b7']],
    },
    practice: {
      title: 'Practice match',
      text: '',
      button: 'END TURN',
      tags: ['rules', 'draft'],
      rulesNote: true,
      sources: [
        ['Players put down squares near their symbols on turns to act', 'c4-b110'],
        BOOK_NEW_RULE,
        ['Sight near your symbols', 'c4-b93'],
        ['8 points; glider 4, square 1, tower 4', 'invented'],
        ['Amber is a simple bot. In the book, bots handle new rules badly.', 'c7-b13–b14'],
        RECOVERED,
      ],
    },
  } satisfies Record<string, Screen>,

  status: { you: 'NICE. YOU DID IT.', demo: 'LIKE THAT.' },
  toasts: {
    locked: 'Your turn to act is over. Press reset to plan again.',
    zone: 'Too far from your towers. Build in the lit area.',
    cost: 'Not enough points left. Tap a piece you placed to take it back.',
  },
  board: {
    controls: 'Board controls',
    stepBack: '◁ STEP',
    stepBackLabel: 'Step back one turn',
    play: 'PLAY',
    pause: 'PAUSE',
    step: 'STEP ▷',
    stepLabel: 'Step forward one turn',
    reset: 'RESET',
    cells: 'CELLS',
    pieces: 'Pieces to place',
    tool: (k: string, cost: number) => `${k.toUpperCase()} · ${cost}`,
    dir: (words: string) => `Glider flies ${words}`,
    strip: (turn: string, cyan: string, amber: string, pts: string) => `${turn} · CYAN ${cyan} · AMBER ${amber}${pts}`,
    stripTurn: (n: number) => `TURN ${n}`,
    stripPts: (n: number) => ` · ${n} PTS`,
    stripCells: (turn: number, live: number) => `TURN ${turn} · LIVE CELLS ${live}`,
    out: 'OUT',
    /** Added by this build (draft): the keyboard way to place pieces. */
    keys: 'Arrow keys move the outline on the board; Enter or Space puts a piece down, or takes back one you placed.',
    at: (x: number, y: number, what: string) => `Square ${x + 1} across, ${y + 1} down: ${what}.`,
    what: { empty: 'empty', dark: 'dark', tower: 'tower', glider: 'glider', square: 'square', rock: 'rock', cyan: 'Cyan', amber: 'Amber' },
  },
  reasons: ['You only see near your towers.', 'You can act only on your turns.', 'The rules change every match.', 'No square stops everything forever.'],
  hoodLink: 'UNDER THE HOOD, OPTIONAL →',
  rule: {
    show: 'HOW THE RULE WORKS',
    hide: 'HIDE HOW THE RULE WORKS',
    rows: [
      ['0 OR 4 LIVE', 'Nothing changes.', [0, 0, 0, 0], [0, 0, 0, 0]],
      ['1 LIVE', 'On odd turns it jumps to the opposite corner.', [1, 0, 0, 0], [0, 0, 0, 1]],
      ['2 LIVE', 'Every cell flips: live becomes empty, empty becomes live.', [1, 1, 0, 0], [0, 0, 1, 1]],
      ['3 LIVE', 'On even turns the block turns half a circle.', [1, 1, 1, 0], [0, 1, 1, 1]],
    ] as [string, string, number[], number[]][],
    closing: 'The blocks shift one cell diagonally every turn, so cells pass from block to block. Nothing is ever created or destroyed.',
  },
  practice: {
    titles: { win: 'You win', lose: 'Amber wins', draw: 'A draw' },
    act0: 'Amber’s towers mirror yours on the far side. You see them only until this turn ends. Spend 8 points in the lit area, then end your turn.',
    act: 'Your turn. Amber’s towers are where they started. Spend 8 points, then end your turn.',
    run: 'The match runs by itself until your next turn. Pause any time.',
    over: { win: 'Amber is out of towers, or had fewer when time ran out.', lose: 'Amber outlasted you. Squares in your towers’ rows are your best defence.', draw: 'Same number of towers when time ran out.' },
    rule: (t: string) => `New rule this match: ${t}`,
    rules: { diag: 'Gliders may also fly diagonally.', cost: 'Gliders cost 3 points.', fog: 'You see only 2 squares around your towers.', every: 'Turns to act come every 8 steps.' },
    buttons: { act: 'END TURN', pause: 'PAUSE', resume: 'RESUME', again: 'PLAY AGAIN' },
    status: {
      act: (n: number) => `YOUR TURN · STEP ${n}`,
      run: (n: number) => `NEXT TURN AT STEP ${n}`,
      win: 'YOU WIN.',
      lose: 'AMBER WINS.',
      draw: 'DRAW.',
    },
  },
};
