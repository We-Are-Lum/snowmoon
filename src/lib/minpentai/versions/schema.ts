/**
 * Player-made Minpentai versions (design spike, 2026-10-21; not wired into any page). A version is
 * data only: a title, a one-line "what's different", its parent, its author, the prompt that made
 * it, the settings it changes and the rule pieces it picks. versions/engine.ts plays any valid
 * version; no code from the model or the author ever runs.
 *
 * Every number is a non-negative whole number and every string printable ASCII, so a version drops
 * into a ruleset manifest (versions/manifest.ts) under the onchain branch's sorted JSON as is.
 *
 * SETTINGS and PIECES are the inventory (docs/proposals/minpentai-versions.md, part 1): each entry
 * names its allowed range, where it comes from (a book passage, or this edition's) and what the
 * sweep found about the six computer players (scripts/minpentai-versions-sweep.ts).
 */

export interface Source {
  /** The book's passage, quoted exactly, with its blocks; absent when the setting is this edition's. */
  book?: { says: string; blocks: string[] };
  /** What this edition made up. */
  edition: string;
}

export interface SettingSpec extends Source {
  text: string;
  min: number;
  max: number;
  base: number;
  /** Allowed values when not every whole number in min..max is allowed. */
  only?: number[];
}

/** Numbers that can vary. `base` is Play today (solo-v1). */
export const SETTINGS = {
  width: { text: 'Board width in squares', min: 9, max: 25, base: 15, edition: 'The board is 15 x 10. The book never gives a size; it has edges and corners (c4-b113, c7-b81).' },
  height: { text: 'Board height in squares', min: 6, max: 16, base: 10, edition: 'As width.' },
  maxSteps: { text: 'The match stops at this step; most towers wins', min: 24, max: 240, base: 96, edition: 'The whole rule. The book has no turn limit (c14-b94). 96 in solo-v1; 120 in solo-v2 (2026-10-22).' },
  points: {
    text: 'Points for each turn to act after setup', min: 2, max: 24, base: 8,
    book: { says: 'The resources you can allocate in each intervention turn are reduced by eighty percent.', blocks: ['c14-b33'] },
    edition: 'Points are this edition\'s unit; the book cuts its budget by 80% for one match.',
  },
  setupPoints: {
    text: 'Points for the setup turn at step 0', min: 2, max: 32, base: 8,
    book: { says: 'He drew a few copies of his symbol in the bottom right corner of the board, where he was allowed to put down squares during the initiation phase.', blocks: ['c4-b94'] },
    edition: 'A separate setup budget; today it equals the turn budget.',
  },
  costGlider: { text: 'A glider costs', min: 1, max: 12, base: 4, edition: 'Costs are this edition\'s.' },
  costSquare: { text: 'A square costs', min: 1, max: 6, base: 1, edition: 'Costs are this edition\'s.' },
  costTower: { text: 'A tower costs', min: 1, max: 16, base: 4, edition: 'Costs are this edition\'s.' },
  sight: {
    text: 'You see every square within this many of your towers', min: 1, max: 30, base: 3,
    book: { says: 'were a copy of it anywhere on the board, would allow him to see everything within thirty squares', blocks: ['c4-b93'] },
    edition: '3, not thirty; counting diagonals. Rocks are shown everywhere; an opponent\'s tower you cannot see is shown dimmed where you last saw it (its starting square until you first see it).',
  },
  reach: {
    text: 'You may place within this many squares of a tower you had when the turn began', min: 1, max: 30, base: 3,
    book: { says: 'Here, all players were able to put down more squares near any copy of their symbols.', blocks: ['c4-b110'] },
    edition: '"Near" is this edition\'s number; today it is the same as sight.',
  },
  every: {
    text: 'A turn to act comes every this many steps', min: 4, max: 32, base: 12,
    book: { says: 'A thousand turns later, the first intervention turn came.', blocks: ['c14-b45', 'c4-b110'] },
    edition: '12 steps, not about a thousand.',
  },
  squareHits: {
    text: 'Hits a square takes before it breaks (every hit before the last turns the glider back)', min: 1, max: 4, base: 2,
    book: { says: 'So any wall that can be created in some way can be destroyed in some way.', blocks: ['c4-b9'] },
    edition: 'Two hits, the first reflecting.',
  },
  directions: {
    text: 'Directions a glider may fly: 4 (straight) or 8 (diagonals too)', min: 4, max: 8, base: 4, only: [4, 8],
    edition: 'This edition\'s (the book\'s gliders fly where its cell rule takes them).',
  },
  startTowers: {
    text: 'Towers each side starts with', min: 1, max: 4, base: 2,
    book: { says: 'He drew a few copies of his symbol in the bottom right corner of the board', blocks: ['c4-b94'] },
    edition: 'Placed for you, mirrored, near your own edge (not in a corner).',
  },
  maxTowers: { text: 'Most towers a side may hold (0: no limit)', min: 0, max: 12, base: 0, edition: 'The whole rule.' },
  botTowers: { text: 'The computer players build at most this many towers', min: 1, max: 16, base: 5, edition: "This edition's computer players: 5 in solo-v1, 10 in solo-v2 (2026-10-22, after Luis's play tests)." },
  carryOver: { text: 'Unspent points kept for the next turn, up to this many (0: none)', min: 0, max: 16, base: 0, edition: 'The whole rule.' },
  rockHits: { text: 'Hits a rock takes, under rocks "breakable"', min: 1, max: 6, base: 3, edition: 'The whole rule.' },
  switchAt: {
    text: 'From the first turn to act at or after this step, a second drawn rule replaces the first (0: never)', min: 0, max: 200, base: 0,
    book: { says: 'my opponent was just not prepared for the sudden rule change four thousand turns in', blocks: ['c5-b30'] },
    edition: 'The step is this edition\'s; the second rule is drawn from the same list.',
  },
} satisfies Record<string, SettingSpec>;
export type SettingId = keyof typeof SETTINGS;
export const SETTING_IDS = Object.keys(SETTINGS) as SettingId[];

export interface PieceSpec extends Source {
  text: string;
  base: string;
  /** Each option and what it does. */
  options: Record<string, { text: string; book?: { says: string; blocks: string[] }; edition: string }>;
}

/** Rule pieces: a choice among fixed behaviours, each built into the engine. */
export const PIECES = {
  edges: {
    text: 'What a glider does at the board\'s edge', base: 'bounce',
    edition: 'The book\'s board has edges and corners (c4-b113, c7-b81); what happens there is this edition\'s.',
    options: {
      bounce: { text: 'It turns back and stays put for that step.', edition: 'Play today.' },
      wrap: { text: 'It comes in on the far side.', edition: 'Invented.' },
      vanish: { text: 'It flies off the board and is gone.', edition: 'Invented.' },
    },
  },
  rocks: {
    text: 'What a rock does to a glider', base: 'bounce',
    edition: 'The book has rocks (c4-b84); what they do is this edition\'s except "split".',
    options: {
      bounce: { text: 'Turns it straight back; never breaks.', edition: 'Play today.' },
      absorb: { text: 'Breaks it; the rock stays.', edition: 'Invented.' },
      breakable: { text: 'Turns it back like a square, and breaks after rockHits hits.', book: { says: 'Anything that can be created can be destroyed.', blocks: ['c4-b13'] }, edition: 'The number of hits is this edition\'s.' },
      split: {
        text: 'Turns it back and makes a second glider of the same side, flying a quarter turn to the right (at most 60 gliders on the board).',
        book: { says: 'Gliders flew out, interacted with rock formations, and created more gliders.', blocks: ['c4-b108'] },
        edition: 'One new glider a hit, a quarter turn right, capped at 60.',
      },
    },
  },
  ownTower: {
    text: 'What a glider does to its own side\'s tower', base: 'bounce',
    edition: 'This edition\'s.',
    options: {
      bounce: { text: 'Your own tower turns it straight back.', edition: 'Play today.' },
      destroy: { text: 'Any glider destroys any tower, your own too.', book: { says: "A few stray gliders from Bai accidentally flew into Zei's territory, and wrecked one of his factories.", blocks: ['c4-b109'] }, edition: 'Gliders harm whoever they hit.' },
    },
  },
  sameSide: {
    text: 'Two gliders of the same side meeting', base: 'pass',
    edition: 'This edition\'s.',
    options: {
      pass: { text: 'They pass through each other.', edition: 'Play today.' },
      break: { text: 'They break each other, like opponents\' gliders.', book: { says: "A few stray gliders from Bai accidentally flew into Zei's territory, and wrecked one of his factories.", blocks: ['c4-b109'] }, edition: 'Cells have no owner.' },
    },
  },
  debris: {
    text: 'What a broken square or tower leaves', base: 'none',
    edition: 'This edition\'s.',
    options: {
      none: { text: 'Nothing.', edition: 'Play today.' },
      rock: { text: 'A rock.', book: { says: 'most of the game field had become a high-entropy wasteland', blocks: ['c4-b140', 'c14-b79'] }, edition: 'Debris is a rock.' },
    },
  },
  win: {
    text: 'How a match is won', base: 'towers',
    edition: 'This edition\'s.',
    options: {
      towers: { text: 'Lose your last tower and you lose; at the last step, most towers wins.', book: { says: 'all of Bo\'s symbols were destroyed, and Zei was announced the winner.', blocks: ['c12-b196'] }, edition: 'The step limit is this edition\'s.' },
      'first-blood': { text: 'The first side to destroy a tower wins; both at once is a draw.', edition: 'Invented.' },
    },
  },
} satisfies Record<string, PieceSpec>;
export type PieceId = keyof typeof PIECES;
export const PIECE_IDS = Object.keys(PIECES) as PieceId[];

/**
 * The book edition's pieces (2026-10-31): numbers only a ruleset that wants them sets. None is in BASE,
 * so Play's settings, its saved matches and every version's manifest are exactly as before; absent or
 * 0, the piece is off and the engine never makes one. versions/book-edition.ts turns them on and quotes
 * the book for each.
 */
export const BOOK_SETTINGS = {
  costMirror: { text: 'A mirror wall costs (0: no mirror walls)', min: 0, max: 12, edition: 'Cost is this edition\'s.' },
  mirrorHits: { text: 'Hits a mirror wall takes before it breaks', min: 1, max: 6, edition: 'This edition\'s.' },
  costSeed: { text: 'A symbol glider costs (0: no symbol gliders)', min: 0, max: 12, edition: 'Cost is this edition\'s.' },
  costWall: { text: 'A moving wall costs (0: no moving walls)', min: 0, max: 16, edition: 'Cost is this edition\'s.' },
  costFactory: { text: 'A glider factory costs (0: no factories)', min: 0, max: 12, edition: 'Cost is this edition\'s.' },
  factoryHits: { text: 'Hits a glider factory takes before it breaks', min: 1, max: 4, edition: 'This edition\'s.' },
  ore: { text: 'Gliders a rock can feed to factories before it crumbles (0: rocks hold no ore)', min: 0, max: 9, edition: 'This edition\'s.' },
} satisfies Record<string, { text: string; min: number; max: number; edition: string }>;
export type BookSettingId = keyof typeof BOOK_SETTINGS;

export type Settings = { [K in SettingId]: number } & { [K in PieceId]: string } & Partial<Record<BookSettingId, number>>;
export type Patch = Partial<Settings>;

export const BASE: Settings = Object.fromEntries([
  ...SETTING_IDS.map((k) => [k, SETTINGS[k].base]),
  ...PIECE_IDS.map((k) => [k, PIECES[k].base]),
]) as Settings;

/** A rule drawn at the start of a match: a sentence and the settings it changes. */
export interface DrawnRule { id: string; text: string; set: Patch; book?: { says: string; blocks: string[] } }

/** Play's four drawn rules, as settings (game.ts RULES). */
export const BASE_DRAWN: DrawnRule[] = [
  { id: 'diag', text: 'Gliders may also fly diagonally.', set: { directions: 8 } },
  { id: 'cost3', text: 'Gliders cost 3 points.', set: { costGlider: 3 } },
  { id: 'sight2', text: 'You see only 2 squares around your towers.', set: { sight: 2, reach: 2 } },
  { id: 'every8', text: 'Turns to act come every 8 steps.', set: { every: 8 } },
];

/** Where a change comes from: the book (with its blocks) or invented. Every change must say. */
export interface Change {
  /** A setting or piece id, or "drawn" for the drawn-rule list, or "rocksAt". */
  what: string;
  /** "book": the book's passage, quoted, with blocks. "invented": made up for this version. */
  basis: 'book' | 'invented';
  says?: string;
  blocks?: string[];
}

export interface Version {
  format: 'snowmoon.minpentai.version/1';
  title: string;
  /** One line: what's different from the parent. */
  different: string;
  /** The parent's ruleset ID (0x + 64 hex), or "solo-v1" for Play today. */
  parent: string;
  /** A Farcaster name or an address. */
  author: string;
  /** The words that made it, printable ASCII (other characters as \uXXXX), and the model that read them. */
  prompt: { text: string; model: string; date: string };
  /** Only the settings and pieces that differ from Play today. */
  set: Patch;
  /** Cyan's rocks (x, y from the top left); Amber's half is the same turned 180 degrees. Absent: Play's rocks, scaled to the board. */
  rocksAt?: [number, number][];
  /** The drawn rules (0 to 6). Absent: Play's four. Empty: none drawn. */
  drawn?: DrawnRule[];
  /** Each change, tied to the book or marked invented. */
  changes: Change[];
}

const ASCII = /^[\x20-\x7e]*$/;
/** Non-ASCII characters as literal \uXXXX, so any words fit sorted JSON and read back exactly. */
export const asciiEscape = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

/** Problems with a version, in plain words; empty when it is valid. */
export function check(v: unknown): string[] {
  const out: string[] = [];
  const o = v as Version;
  if (!o || typeof o !== 'object') return ['not an object'];
  if (o.format !== 'snowmoon.minpentai.version/1') out.push('format must be snowmoon.minpentai.version/1');
  for (const k of ['title', 'different', 'parent', 'author'] as const) {
    if (typeof o[k] !== 'string' || !o[k].trim()) out.push(`${k} is missing`);
    else if (!ASCII.test(o[k])) out.push(`${k} must be printable ASCII`);
  }
  if (typeof o.title === 'string' && o.title.length > 60) out.push('title is longer than 60 characters');
  if (typeof o.different === 'string' && o.different.length > 140) out.push('different is longer than 140 characters');
  if (typeof o.parent === 'string' && o.parent !== 'solo-v1' && !/^0x[0-9a-f]{64}$/.test(o.parent)) out.push('parent must be solo-v1 or a ruleset ID');
  if (!o.prompt || typeof o.prompt.text !== 'string' || !ASCII.test(o.prompt.text) || typeof o.prompt.model !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.prompt.date ?? '')) out.push('prompt needs ASCII text, a model and a date');
  out.push(...checkPatch(o.set, 'set'));
  const full = { ...BASE, ...(o.set ?? {}) };
  // A key set to the value it already has changes nothing and would be misread as a change.
  for (const [k, val] of Object.entries(o.set ?? {})) if (BASE[k as keyof Settings] === val) out.push(`set.${k} is already ${val} in Play`);
  const allowed = new Set(Object.keys(o.set ?? {}));
  if (o.drawn !== undefined) {
    if (!Array.isArray(o.drawn) || o.drawn.length > 6) out.push('drawn must be a list of at most 6 rules');
    else {
      const ids = new Set<string>();
      o.drawn.forEach((d, i) => {
        if (!d || typeof d.id !== 'string' || !/^[a-z0-9-]{1,24}$/.test(d.id)) out.push(`drawn[${i}].id must be 1-24 of a-z, 0-9, -`);
        else if (ids.has(d.id)) out.push(`drawn[${i}].id repeats`);
        else ids.add(d.id);
        if (typeof d?.text !== 'string' || !d.text.trim() || !ASCII.test(d.text) || d.text.length > 120) out.push(`drawn[${i}].text must be ASCII, 1-120 characters`);
        out.push(...checkPatch(d?.set, `drawn[${i}].set`));
        if (d?.set && Object.keys(d.set).length === 0) out.push(`drawn[${i}].set changes nothing`);
        for (const [k, val] of Object.entries(d?.set ?? {})) if (full[k as keyof Settings] === val) out.push(`drawn[${i}].set.${k} is already ${val} in this version`);
        for (const k of ['switchAt', 'width', 'height', 'startTowers', 'rocks', 'rockHits'] as const) if (d?.set && k in d.set) out.push(`drawn[${i}].set may not change ${k} (the board is fixed for a version)`);
      });
    }
    allowed.add('drawn');
  }
  if (full.switchAt > 0 && (o.drawn ? o.drawn.length : BASE_DRAWN.length) < 2) out.push('switchAt needs at least 2 drawn rules');
  if (full.switchAt >= full.maxSteps) out.push('switchAt must come before maxSteps');
  if (full.setupPoints < Math.min(full.costGlider, full.costSquare, full.costTower)) out.push('setupPoints buy nothing');
  if (full.costGlider > Math.max(full.points + full.carryOver, full.setupPoints)) out.push('no turn has enough points for a glider');
  if (full.maxTowers > 0 && full.maxTowers < full.startTowers) out.push('maxTowers is below startTowers');
  out.push(...fogProblems(o.set ?? {}, Array.isArray(o.drawn) ? o.drawn : BASE_DRAWN));
  if (o.rocksAt !== undefined) {
    if (!Array.isArray(o.rocksAt) || o.rocksAt.length > 24) out.push('rocksAt must be a list of at most 24 squares');
    else o.rocksAt.forEach((p, i) => {
      if (!Array.isArray(p) || p.length !== 2 || !p.every((n) => Number.isInteger(n) && n >= 0)) out.push(`rocksAt[${i}] must be [x, y]`);
      else if (p[0] >= full.width || p[1] >= full.height) out.push(`rocksAt[${i}] is off the board`);
    });
    allowed.add('rocksAt');
  }
  if (!Array.isArray(o.changes)) out.push('changes must be a list');
  else {
    const said = new Set<string>();
    o.changes.forEach((c, i) => {
      if (!c || typeof c.what !== 'string') { out.push(`changes[${i}].what is missing`); return; }
      said.add(c.what);
      if (!allowed.has(c.what)) out.push(`changes[${i}] names ${c.what}, which this version does not change`);
      if (c.basis === 'book') {
        if (typeof c.says !== 'string' || !c.says.trim() || !ASCII.test(c.says)) out.push(`changes[${i}] cites the book but quotes nothing`);
        if (!Array.isArray(c.blocks) || !c.blocks.length || !c.blocks.every((b) => /^c\d+-b\d+$/.test(b))) out.push(`changes[${i}] cites the book without blocks like c4-b93`);
      } else if (c.basis !== 'invented') out.push(`changes[${i}].basis must be book or invented`);
    });
    for (const k of allowed) if (!said.has(k)) out.push(`the change to ${k} is not tied to the book or marked invented`);
  }
  if (allowed.size === 0) out.push('it changes nothing');
  return out;
}

/**
 * The fog invariant (owner, 2026-10-30): placing reach never exceeds sight. Placement is checked against
 * the real board, so a refusal ("that square is taken") on a square a player can't see would tell them
 * a hidden piece is there. Checked for the version's own settings and for each drawn rule on top of them;
 * a mid-match switch (switchAt) puts one drawn rule in place of another, so every rule in force at any
 * step of any match is one of these.
 */
export function fogProblems(set: Patch, drawn: DrawnRule[]): string[] {
  const out: string[] = [];
  const s0 = { ...BASE, ...set } as Settings;
  if (s0.reach > s0.sight) out.push(`reach (${s0.reach}) is more than sight (${s0.sight}): placing would reveal hidden pieces`);
  for (const d of drawn) {
    const s = { ...s0, ...(d?.set ?? {}) } as Settings;
    if (s.reach > s.sight) out.push(`with drawn rule ${d?.id}, reach (${s.reach}) is more than sight (${s.sight}): placing would reveal hidden pieces`);
  }
  return out;
}

/** The engine's guard: a match may never run with reach above sight, whatever let its settings through. */
export class FogError extends Error {}
export function assertFog(s: Pick<Settings, 'reach' | 'sight'>): void {
  if (s.reach > s.sight) throw new FogError(`reach (${s.reach}) is more than sight (${s.sight}): a match can't run with placing beyond sight`);
}

function checkPatch(p: unknown, where: string): string[] {
  const out: string[] = [];
  if (p === undefined) return out;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return [`${where} must be an object`];
  for (const [k, val] of Object.entries(p)) {
    if (k in SETTINGS) {
      const s: SettingSpec = SETTINGS[k as SettingId];
      if (!Number.isInteger(val)) out.push(`${where}.${k} must be a whole number`);
      else if ((val as number) < s.min || (val as number) > s.max) out.push(`${where}.${k} must be ${s.min} to ${s.max}`);
      else if (s.only && !s.only.includes(val as number)) out.push(`${where}.${k} must be one of ${s.only.join(', ')}`);
    } else if (k in PIECES) {
      if (typeof val !== 'string' || !(val in PIECES[k as PieceId].options)) out.push(`${where}.${k} must be one of ${Object.keys(PIECES[k as PieceId].options).join(', ')}`);
    } else out.push(`${where}.${k} is not a setting or rule piece`);
  }
  return out;
}

/** The JSON Schema the model fills (and the same limits check() enforces). */
export function jsonSchema() {
  const patch = {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries([
      ...SETTING_IDS.map((k) => { const s: SettingSpec = SETTINGS[k]; return [k, s.only ? { enum: s.only, description: s.text } : { type: 'integer', minimum: s.min, maximum: s.max, description: s.text }]; }),
      ...PIECE_IDS.map((k) => [k, { enum: Object.keys(PIECES[k].options), description: PIECES[k].text }]),
    ]),
  };
  const book = { type: 'object', additionalProperties: false, required: ['says', 'blocks'], properties: { says: { type: 'string' }, blocks: { type: 'array', items: { type: 'string', pattern: '^c\\d+-b\\d+$' } } } };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://snowmoon.party/minpentai/version-1.schema.json',
    title: 'A player-made Minpentai version',
    type: 'object',
    additionalProperties: false,
    required: ['format', 'title', 'different', 'parent', 'author', 'prompt', 'set', 'changes'],
    properties: {
      format: { const: 'snowmoon.minpentai.version/1' },
      title: { type: 'string', maxLength: 60 },
      different: { type: 'string', maxLength: 140, description: "One line: what's different from the parent." },
      parent: { type: 'string', pattern: '^(solo-v1|0x[0-9a-f]{64})$' },
      author: { type: 'string' },
      prompt: { type: 'object', required: ['text', 'model', 'date'], properties: { text: { type: 'string' }, model: { type: 'string' }, date: { type: 'string' } } },
      set: patch,
      rocksAt: { type: 'array', maxItems: 24, items: { type: 'array', prefixItems: [{ type: 'integer', minimum: 0 }, { type: 'integer', minimum: 0 }], minItems: 2, maxItems: 2 } },
      drawn: {
        type: 'array', maxItems: 6,
        items: { type: 'object', additionalProperties: false, required: ['id', 'text', 'set'], properties: { id: { type: 'string', pattern: '^[a-z0-9-]{1,24}$' }, text: { type: 'string', maxLength: 120 }, set: patch, book } },
      },
      changes: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['what', 'basis'], properties: { what: { type: 'string' }, basis: { enum: ['book', 'invented'] }, says: { type: 'string' }, blocks: book.properties.blocks } },
      },
    },
  };
}
