/**
 * Every word of the Learn flow (lessons.ts), after Design's "Minpentai Intro v3"
 * (docs/design/minpentai-study.md). MODEL-DRAFTED: Design's wording, changed where the engine
 * does something else or a source did not hold up; each change is listed in the study doc.
 * Each screen shows one "Draft wording" tag while `modelDrafted` is true.
 *
 * Every statement about the book carries a block id in `sources` (checked by check:principles
 * P8c); everything invented says so, in a tag or in its source line.
 */
import type { LessonId, NewRule, WatchId } from './lessons';

export type Tag = 'book' | 'imag' | 'lens' | 'inv' | 'draft';
export type Source = [what: string, where: string];
export interface LearnScreen {
  title: string;
  text: string;
  caption?: string;
  button: string;
  tags: Tag[];
  sources: Source[];
  /** Shown when the goal is met, or when it fails. */
  met?: string;
  failed?: string;
}

export const LEARN_TEXT = {
  modelDrafted: true,
  appTitle: 'Learn Minpentai',
  skip: 'Skip to free play',
  back: 'Back',
  next: 'Next',
  watchOf: (n: number, total: number) => `Watch · ${n} / ${total}`,
  learnOf: (n: number, total: number) => `Learn · ${n} / ${total}`,
  practiceLabel: 'Practice',
  sources: (n: number) => `Sources (${n})`,
  hideSources: (n: number) => `Hide sources (${n})`,
  youDidIt: 'Nice. You did it.',
  likeThat: 'Like that.',
  learnOptional: 'Learn · optional',
  tags: {
    book: 'From the book',
    imag: 'Broadcast imagined',
    lens: 'Clear lenses invented',
    inv: 'Match rules invented',
    draft: 'Draft wording',
  } satisfies Record<Tag, string>,
  /** The broadcast's overlays. Story lines are in broadcast.ts (commentary). */
  hud: {
    live: (turn: number) => `LIVE · TURN ${turn}`,
    out: 'OUT',
    setup: 'Setup. Each player builds in their own corner.',
    begins: 'The battle begins.',
    runs: 'The battle runs on its own.',
    battleBegins: 'BATTLE BEGINS',
    intervention: 'INTERVENTION TURN',
    isOut: (name: string) => `${name.toUpperCase()} IS OUT`,
    wins: (name: string) => `${name.toUpperCase()} WINS`,
    draw: 'A DRAW',
    atConsole: (name: string) => `${name.toUpperCase()} · AT THE CONSOLE`,
    topView: 'TOP VIEW',
    play: 'Play the match',
    pause: 'Pause the match',
    cams: { crane: 'CAM 1 · CRANE', wide: 'CAM 2 · WIDE', corner: 'CAM 3 · CORNER', follow: 'CAM 4 · FOLLOW', low: 'CAM 5 · LOW', tower: 'CAM 7 · SYMBOL', top: 'CAM 8 · OVERHEAD' },
  },
  broadcastLabel: 'The recorded four-player match, drawn in 3D as the crowd might see it. The line under it tells what is happening.',
  boardLabel: (title: string) => `Lesson board: ${title}`,

  watch: {
    country: {
      title: 'A game a whole country watches',
      text: 'In Dzego, Minpentai fills a giant hall inside a mountain, with over a thousand people watching. Before every match, the priests choose a new rule.',
      caption: 'Players learn the rule only when the match starts, then get a set time to build. In one match it is twenty minutes.',
      button: 'Next',
      tags: ['book', 'imag', 'draft'],
      sources: [
        ['The hall is inside a mountain pyramid', 'c4-b58'],
        ['A giant room, over a thousand people watching', 'c4-b78'],
        ['A new rule every game', 'c4-b84'],
        ['The priests decide the rule sets', 'c4-b148'],
        ['"MU GU GEI TAU FA" · The battle begins in fifty ticks.', 'c4-b97–b98'],
        ['Players are kept offline so they cannot learn the rule early', 'c12-b133–b134'],
        ['Twenty minutes to build before the battle', 'c12-b149'],
      ],
    },
    alone: {
      title: 'Every player plays alone',
      text: 'Each player sits at a console in glasses on a cable, and sees only the board near their own towers. The crowd sees the whole board.',
      caption: 'Under each face is what that player sees right now.',
      button: 'Next',
      tags: ['book', 'lens', 'imag', 'draft'],
      sources: [
        ['Devices handed over in the elevator', 'c4-b77'],
        ['A giant game console with a chair', 'c4-b78'],
        ['Glasses on a cable at the console', 'c4-b82'],
        ['The book never says whether the lenses are clear. Here they are, so the eyes show. The faces are stand-ins.', 'invented'],
        ['A symbol lets its owner see within thirty squares', 'c4-b93'],
        ['The crowd sees a large detailed map', 'c4-b114'],
        ['"On the big screen, the audience watched."', 'c7-b86'],
      ],
    },
    runs: {
      title: 'Then the battle runs itself',
      text: 'Once it starts, the players can only watch. Gliders fly out in straight lines. Squares and rocks bounce them back.',
      caption: 'In the broadcast, each glider is drawn as a drone.',
      button: 'Next',
      tags: ['book', 'inv', 'imag', 'draft'],
      sources: [
        ['Gliders, walls, rocks', 'c4-b84'],
        ['Gliders flying; the first turns are spent expanding', 'c4-b106–b108'],
        ['In the book, gliders hitting rocks can make more gliders. Here rocks only bounce them.', 'invented'],
      ],
    },
    act: {
      title: 'A turn to act',
      text: 'Every so often, each player may put down a few pieces near their own towers. Then the match runs on without them.',
      caption: 'The crews stand for squares being placed.',
      button: 'Next',
      tags: ['book', 'inv', 'imag', 'draft'],
      sources: [
        ['"All players were able to put down more squares near any copy of their symbols"', 'c4-b110'],
        ['How often, and how many: every 24 turns, 8 squares', 'invented (match.ts)'],
      ],
    },
    out: {
      title: 'Lose every tower and you are out',
      text: 'Each player starts with a few towers and builds more on their turns. A glider that hits an enemy tower squarely destroys it. The scoreboard counts the towers each player has left.',
      caption: 'A white ring marks a tower about to fall. The book calls towers symbols.',
      button: 'Next',
      tags: ['book', 'inv', 'imag', 'draft'],
      sources: [
        ['Symbols give sight around them', 'c4-b93'],
        ['A player with no symbols left is out', 'c4-b136–b138'],
        ['The symbol shape is invented; the book never draws one', 'invented (docs/minpentai-rules.md)'],
      ],
    },
    last: {
      title: 'The last one standing wins',
      text: 'The last player with towers left wins. If time runs out, most towers wins.',
      caption: 'In this match, Violet outlasts the other three.',
      button: 'Next',
      tags: ['book', 'inv', 'imag', 'draft'],
      sources: [
        ['A player is out when every symbol is gone', 'c4-b136–b138'],
        ['In the book a player can also resign. This version has no resigning.', 'c4-b141'],
        ['Most towers when time runs out', 'invented (match.ts)'],
      ],
    },
    season: {
      title: 'Your season',
      text: 'You are a young player in your last year of school tournaments. Win, and you go to the nationals, with prize money on the line.',
      caption: 'Practice against bots only goes so far. They play the standard rules well and adapt badly to a new one.',
      button: 'Next',
      tags: ['book', 'imag', 'draft'],
      sources: [
        ['A high-school programming game', 'c4-b79'],
        ['Last year to compete; winning means the nationals', 'c4-b15'],
        ['Prize money', 'c4-b73'],
        ['Games against bots hit diminishing returns; bots play stock Minpentai well and adapt badly to new rules', 'c7-b13–b14'],
        ['"A high-entropy wasteland"', 'c4-b140'],
      ],
    },
    try: {
      title: 'Now try it yourself',
      text: 'From above, the match is a flat board of towers, gliders and squares. Next, learn each piece on that board.',
      button: 'Start the lessons',
      tags: ['book', 'imag', 'draft'],
      sources: [["The rule was recovered from the book's animated board", 'c4-b5 · c4-b7']],
    },
  } satisfies Record<WatchId, LearnScreen>,

  lessons: {
    goal: {
      title: 'Keep your towers. Destroy theirs.',
      text: 'You are Cyan. Each player starts with a few towers, and your score is how many you have left. Lose them all and you are out. The last player with towers wins.',
      caption: 'If a match runs long, whoever has the most towers when time runs out wins.',
      button: 'Next',
      tags: ['book', 'inv', 'draft'],
      sources: [
        ['A player with no symbols left is out', 'c4-b136–b138'],
        ['The book calls them symbols. Here they are drawn as towers.', 'invented'],
        ['Most towers when time runs out', 'invented (match.ts)'],
      ],
    },
    glider: {
      title: 'Gliders fly straight',
      text: 'A glider flies in a straight line: up, down, left or right. Press play.',
      caption: 'It moves two cells every four turns. Off one edge, it comes back on the other.',
      button: 'Play it',
      tags: ['book', 'inv', 'draft'],
      sources: [
        ['Gliders', 'c4-b84'],
        ['Two cells every four turns, in a straight line: what the rule does', 'src/lib/minpentai/glider.ts'],
        ['A board whose edges wrap round', 'invented'],
      ],
    },
    hit: {
      title: 'A hit destroys a tower',
      text: 'When a glider hits an enemy tower squarely, the tower is gone. That is how you score. Press play and watch Amber’s score.',
      caption: 'A glider that only grazes a tower can bounce off instead. Gliders hit your own towers too.',
      button: 'Play it',
      met: 'Amber −1.',
      tags: ['book', 'inv', 'draft'],
      sources: [
        ['Symbols lost to attacks; out when none are left', 'c4-b136–b138'],
        ['A teammate’s stray gliders wreck Zei’s factory; Zei’s slip sends a glider back toward his own base', 'c4-b109'],
        ['How often a hit lands is what the rule does (scripts/probe-minpentai-pieces.ts)', 'src/lib/minpentai/match.ts'],
      ],
    },
    square: {
      title: 'Squares bounce gliders',
      text: 'An Amber glider is coming for your tower. Tap one of the outlined spots to put a square in its way, then press play.',
      caption: 'The glider bounces back the way it came, and the square stays where it is.',
      button: 'Block it for me',
      failed: 'Your tower fell. Press reset and try again.',
      tags: ['book', 'inv', 'draft'],
      sources: [
        ['Walls', 'c4-b84'],
        ['No wall is invincible', 'c4-b9 · c4-b13'],
      ],
    },
    turn: {
      title: 'Your turn to act',
      text: 'Every so often you get 8 points to spend near your own towers. A glider costs 4, a square 1 and a tower 4. Pick a glider’s direction with the arrows. Take out Amber’s last tower.',
      caption: 'Between turns to act, the match runs by itself. The lit area is where you may build.',
      button: 'Do it for me',
      failed: 'Missed. Press reset and try another row.',
      tags: ['book', 'inv', 'draft'],
      sources: [
        ['Players put down more squares near their symbols', 'c4-b110'],
        ['8 points; a piece costs one point per cell: glider 4, square 1, tower 4', 'invented (match.ts)'],
      ],
    },
    sight: {
      title: 'You only see near your towers',
      text: 'Beyond a few squares of your towers, the board is dark. Press play. Something is coming.',
      caption: 'Lose a tower and you see less. Build one and you see more.',
      button: 'Play it',
      met: 'You lost a tower, and your view shrank.',
      tags: ['book', 'inv', 'draft'],
      sources: [
        ['A symbol lets its owner see within thirty squares', 'c4-b93'],
        ['Six squares here, on a smaller board', 'invented'],
      ],
    },
    rule: {
      title: 'Every match, a new rule',
      text: 'Before each match, the priests pick a new rule, and players learn it only when the match begins. That is what makes Minpentai hard:',
      button: 'Start a practice match',
      tags: ['book', 'draft'],
      sources: [
        ['A new rule every game', 'c4-b84'],
        ['The priests decide the rule sets', 'c4-b148'],
        ['Players are kept offline so they cannot learn it early', 'c12-b133–b134'],
        ['Nothing can be invincible', 'c4-b13'],
      ],
    },
  } satisfies Record<LessonId, LearnScreen>,

  reasons: ['You only see near your towers.', 'You can act only on your turns.', 'The rules change every match.', 'No square stops everything forever.'],
  hoodLink: 'Under the hood (optional)',

  hood: {
    title: 'Under the hood',
    text: 'Every piece is a few cells, moved by one rule from the book. This is a glider, cell by cell. Press play.',
    caption: 'You never need this to play.',
    button: 'Play it',
    tags: ['book', 'draft'],
    sources: [
      ['The rule, recovered from the book’s animated board', 'c4-b5 · c4-b7'],
      ['"rotate one eighty if three"', 'c4-b7'],
    ],
  } satisfies LearnScreen,
  ruleCard: [
    ['0 or 4 live', 'Nothing changes.'],
    ['1 live', 'On odd turns it jumps to the opposite corner.'],
    ['2 live', 'Every cell flips: live becomes empty, empty becomes live.'],
    ['3 live', 'On even turns the block turns half a circle.'],
  ] as [string, string][],
  ruleCardLabel: 'The rule, for each 2 × 2 block',

  practice: {
    title: 'Practice match',
    text: 'Amber’s towers mirror yours on the far side, out of sight. Spend your points in the lit area, then end your turn.',
    rule: (r: string) => `New rule this match: ${r}`,
    rules: {
      interval: 'Turns to act come every 16 turns.',
      sight: 'You see only 4 squares around your towers.',
      budget: 'You get 12 points on each turn to act.',
      reach: 'You may build up to 9 squares from your towers.',
    } satisfies Record<NewRule['id'], string>,
    yourTurn: (turn: number) => `Your turn · turn ${turn}`,
    running: (k: number) => `Running · next turn to act in ${k}`,
    won: 'You win.',
    lost: 'Amber wins.',
    draw: 'A draw.',
    endTurn: 'End turn',
    again: 'Play again',
    tags: ['inv', 'draft'] as Tag[],
    sources: [
      ['Players put down squares near their symbols on turns to act', 'c4-b110'],
      ['A new rule every game', 'c4-b84'],
      ['Sight near your symbols', 'c4-b93'],
      ['Amber is a simple computer player. In the book, bots adapt badly to a new rule.', 'c7-b14'],
      ['The board, the rocks, and every number', 'invented (match.ts)'],
    ] as Source[],
  },

  board: {
    stepBack: 'Step back',
    stepBackShort: '◁ Step',
    play: 'Play',
    pause: 'Pause',
    step: 'Step ▷',
    stepLabel: 'Step forward',
    reset: 'Reset',
    cells: 'Cells',
    pieces: 'Pieces',
    cellsLabel: 'Show the cells each piece is made of',
    tools: { glider: 'Glider', mirror: 'Square', symbol: 'Tower' },
    cost: (n: number) => `· ${n}`,
    toolsLabel: 'What to put down',
    dirsLabel: 'Glider direction',
    dirs: { left: 'Left', up: 'Up', down: 'Down', right: 'Right' },
    strip: (turn: number) => `Turn ${turn}`,
    points: (n: number) => `${n} pts`,
    problems: {
      reach: 'Too far from your towers.',
      crowded: 'Too close to other pieces.',
      budget: 'Not enough points left.',
      'not-intervention': 'Wait for your next turn to act.',
      out: 'The match is over.',
    },
    controlsLabel: 'Board controls',
    keys: 'Arrow keys move the cursor; Enter puts the piece down.',
  },
};
