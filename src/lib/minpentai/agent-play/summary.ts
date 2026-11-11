import type { Engine, Kills, Placement, AnyPiece, Side, World, Glider } from '../versions/engine';
import type { Settings } from '../versions/schema';

/**
 * The turn summary (owner, 2026-11-02: "a text turn summary in get_view, built only from my fog frames"; reworked
 * 2026-11-04 after the book-4 playtest: one story per glider, every enemy piece named, kills credited to the glider
 * that made them).
 *
 * Built frame by frame while the turn runs, only from side `me`'s view at each frame (engine.fog, the same view its AI
 * gets) and the squares it sees then (engine.sees). Nothing else from the real board is read, so the summary is the same
 * whatever happens out of sight, except for what the ruleset reports anyway (book-4's kill reports, from kills.log).
 *
 * What happened to a glider between two frames is worked out by running that step on the earlier frame's view in the
 * engine (the side's own sandbox, as simulate does) and comparing with the later frame:
 * - it is in the later frame where the sandbox put it: it flies on (a turn is noted);
 * - the sandbox says it was stopped: by what (a tower it destroyed, a glider met head-on, a square it broke, coming to
 *   rest…), from what the earlier frame showed in front of it;
 * - the sandbox has it flying on, but it isn't there: out of sight if it could have flown out of sight (its square isn't
 *   in sight now and the glider itself doesn't see), else destroyed by something the view didn't show.
 * A glider that sees (book-4's symbol gliders) can't leave sight while it flies, so it is never said to.
 *
 * Across the sight edge (owner, 2026-11-11, after the book-4 playtest v2: fix 3), still only from the views:
 * - a glider not where the sandbox put it, but with the only new glider of its kind in the view within a step of it,
 *   is that glider (something it couldn't see turned it): its story goes on;
 * - a glider that comes back into sight keeps its story when exactly one story of its kind left sight (this turn, or a
 *   glider of its side's memory out of sight, own-seen.ts) near enough to have flown there;
 * - a book-4 kill report goes to the story of the one glider that flew out of sight on a straight line reaching that
 *   tower at that step, when only one does (tieKills): it says no more than the kill report does.
 *
 * After the book-4 playtest v3 (owner, 2026-11-12), still only from the views and the side's own memory:
 * - every loss of its own pieces gets a line with its cause as far as the side saw: the glider the earlier frame showed
 *   flying into that square ("hit by the enemy symbol glider from (2, 10)", "hit by your own glider from …"), or "hit by
 *   something out of your sight"; a piece of its memory out of sight that is gone when seen again: "last seen at step
 *   M, is gone: lost to something out of your sight";
 * - a symbol glider of its own says where it came to rest only when the side saw it come to rest: its square is in
 *   sight, or every square within 2 of it was in sight the frame before (so nothing hidden could have changed how it
 *   stopped). Those out of sight are kept in `rest` (the view lists them, simulate and symbol_launches use them);
 * - an enemy glider not where the sandbox put it is the only new enemy glider of its kind within a step of it (turned by
 *   something out of sight), or came to rest or formed a symbol on its square (said by that piece's line), or flew out
 *   of sight; one that comes back into sight in the same turn is told on the same line as its leaving;
 * - once the match is over, the last turn's summary also says how it ended and what the side lost that turn
 *   (ended(): from the whole board, which may be told then).
 */
const DIR: Record<string, string> = { '0,-1': 'north', '1,-1': 'north-east', '1,0': 'east', '1,1': 'south-east', '0,1': 'south', '-1,1': 'south-west', '-1,0': 'west', '-1,-1': 'north-west' };
const NAME: Record<string, [string, string]> = { g: ['glider', 'gliders'], s: ['square', 'squares'], t: ['tower', 'towers'], m: ['mirror', 'mirrors'], e: ['symbol glider', 'symbol gliders'], w: ['moving wall', 'moving walls'], f: ['factory', 'factories'] };
const at = (x: number, y: number) => `(${x}, ${y})`;
const dir = (dx: number, dy: number) => DIR[`${dx},${dy}`] ?? 'still';
type Log = { o: Side; k: number; step: number }[];
const logOf = (k: Kills): Log | undefined => (k as Kills & { log?: Log }).log;
/** "a, b and c". */
const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** The most lines a summary holds. */
const MAX_LINES = 30;

/** Where a glider of the side's was last seen before it flew out of sight. */
export interface Dark { x: number; y: number; dx: number; dy: number; step: number; seed?: 1 | boolean }
const darkKey = (d: Dark) => `${d.x},${d.y},${d.dx},${d.dy},${d.step},${d.seed ? 1 : 0}`;
/** A glider of the side's, followed from frame to frame. */
interface Story {
  label: string; events: string[]; end: string | null; seed: boolean; x: number; y: number; dx: number; dy: number; turns: number;
  /** Placed this turn, at this step. */
  placed?: number;
  /** Came into sight (not placed, not fired) at this step. */
  entered?: number;
  /** Out of sight now: where it was last seen. */
  dark?: Dark;
  /** From the side's memory at the turn's start: told only if it comes back into sight or a kill report is tied to it. */
  remembered?: boolean;
  /** A kill report tied to it. */
  kill?: string;
}

/**
 * Kill reports tied to gliders that flew out of sight (owner, 2026-11-11): a kill goes to a glider when the glider's
 * straight line from where it was last seen reaches the tower's square exactly at the kill's step, staying on the board,
 * and no other glider's line does, and that glider's line meets no other kill. Only what the side saw and the kill
 * reports, so it says nothing more about the dark. Returns kill index -> glider index.
 */
export function tieKills(e: Pick<Engine, 'inb' | 'XY'>, gl: Dark[], kills: { k: number; step: number }[]): Map<number, number> {
  const fits = (g: Dark, x: { k: number; step: number }) => {
    const n = x.step - g.step, [kx, ky] = e.XY(x.k);
    if (n < 1 || (g.dx === 0 && g.dy === 0)) return false;
    for (let i = 1; i <= n; i++) if (!e.inb(g.x + g.dx * i, g.y + g.dy * i)) return false;
    return g.x + g.dx * n === kx && g.y + g.dy * n === ky;
  };
  const out = new Map<number, number>();
  kills.forEach((x, i) => {
    const gs = gl.map((g, j) => (fits(g, x) ? j : -1)).filter((j) => j >= 0);
    if (gs.length === 1 && kills.filter((y) => fits(gl[gs[0]], y)).length === 1) out.set(i, gs[0]);
  });
  return out;
}
/** The static pieces a view shows, by kind: what a square holds. */
type Statics = Map<string, { o: Side; hp?: number; dx?: number; dy?: number; seen?: number }>;
/** One of its own standing pieces out of sight as its memory holds it (own-seen.ts, and `rest`): kind@square, hits, step. */
export interface Held { kind: 'sq' | 'mir' | 'fa' | 'sd'; k: number; hp?: number; step: number }
/** What a watcher is given about the side's own pieces out of sight as the turn opens. */
export interface WatchMemory {
  /** Its gliders out of sight, as its memory last saw them (own-seen.ts). */
  dark?: Dark[];
  /** Its standing pieces out of sight, as its memory last saw them. */
  held?: Held[];
  /**
   * Its symbol gliders it saw come to rest on squares out of sight now (square -> step): updated as the turn runs (a
   * square seen again leaves it: the view tells from then on; a glider seen coming to rest out of sight joins it).
   */
  rest?: Record<number, number>;
}
const STATIC_NAME: Record<string, string> = { tw: 'tower', sq: 'square', mir: 'mirror', fa: 'factory', sd: 'resting symbol glider' };

/** The book-moment kinds the live page leads with (owner, 2026-11-04). */
export interface Moments { kills: { at: string; seed: boolean }[]; reported: string[]; lost: string[]; spotted: string[]; formed: string[]; symbolGone: string[]; enemySymbolGone: string[]; wallsLost: string[] }

export class TurnWatch {
  private opening: string[] = [];
  private lines: string[] = [];
  private stories: Story[] = [];
  /** Stories of gliders in the current frame, by their number in that frame's view. */
  private live = new Map<number, Story>();
  /** Gliders the last frame showed, by their number in it, with where the step will take them. */
  private prev: World;
  private prevSee: Set<number>;
  /** Its own static pieces as last seen (squares' hits, to say a square was chipped when it is seen again). */
  private mine: Statics = new Map();
  /** Enemy pieces already named this turn ("tw@k"). */
  private named = new Set<string>();
  /** Kills a glider's story tells ("k@step"), so the kill reports don't tell them again. */
  private claimed = new Set<string>();
  private kills0: number;
  private factoryFired = new Map<number, number[]>();
  private moments: Moments = { kills: [], reported: [], lost: [], spotted: [], formed: [], symbolGone: [], enemySymbolGone: [], wallsLost: [] };
  private finished: string[] | null = null;
  /** How the match ended, once it has (ended()): said after the opening lines. */
  private ending: string[] = [];
  /** Enemy gliders that flew out of sight this turn: the line that says so, to be joined by their coming back. */
  private enemyGone: { line: number; x: number; y: number; seed: boolean; step: number }[] = [];
  private rest: Record<number, number>;
  /** Its gliders out of sight its view lists as the turn ends (listed()). */
  private listed: Set<string> | null = null;
  /** Towers its side destroyed in its sight this turn, and towers it lost. */
  killsSeen = 0;
  lost = 0;

  /**
   * `before`: the board as the turn opens, before the placements appear. Then appear() once they have, and look() after
   * every step. `dark`: the side's own gliders out of sight as the turn opens, as its memory last saw them (own-seen.ts).
   */
  constructor(private e: Engine, private s: Settings, private me: Side, before: World, private kills: Kills, private placed: Placement<AnyPiece>[], mem: WatchMemory = {}) {
    const dark = mem.dark ?? [];
    this.rest = mem.rest ?? {};
    // What was placed this turn, by kind (and direction, for what flies).
    const groups = new Map<string, Placement<AnyPiece>[]>();
    for (const p of placed) { const k = `${p.t}|${p.dx || p.dy ? dir(p.dx, p.dy) : ''}`; groups.set(k, [...(groups.get(k) ?? []), p]); }
    for (const [k, ps] of groups) {
      const [t, d] = k.split('|'), [one, many] = NAME[t] ?? [t, t + 's'];
      this.opening.push(`Your side placed ${ps.length === 1 ? `a ${one}` : `${ps.length} ${many}`}${d && t !== 'm' ? ` heading ${d}` : ''} at ${ps.map((p) => at(p.x, p.y)).join(', ')}.`);
    }
    this.prev = e.fog(before, s, me);
    this.prevSee = e.sees(before, s, me);
    this.kills0 = logOf(kills)?.length ?? 0;
    this.noteMine(this.prev, this.prevSee, null);
    // Its standing pieces out of sight, as last seen: told if they are gone or chipped when seen again.
    for (const h of mem.held ?? []) if (!this.prevSee.has(h.k)) this.mine.set(`${h.kind}@${h.k}`, { o: me, ...(h.hp !== undefined ? { hp: h.hp } : {}), seen: h.step });
    for (const k in this.rest) if (!this.prevSee.has(+k)) this.mine.set(`sd@${k}`, { o: me, seen: this.rest[+k] });
    for (const [key] of this.statics(this.prev, false)) this.named.add(key);
    for (const g of this.prev.gl) if (g.o === me) this.live.set(g.id, this.story(g, 'earlier'));
    for (const d of dark) {
      const st = this.story({ x: d.x, y: d.y, dx: d.dx, dy: d.dy, seed: d.seed ? 1 : undefined } as Glider, 'earlier');
      Object.assign(st, { label: `Your ${d.seed ? 'symbol glider' : 'glider'} last seen at ${at(d.x, d.y)}, heading ${dir(d.dx, d.dy)}, at step ${d.step}`, dark: { ...d }, remembered: true });
    }
  }

  /** A line said first (e.g. that the person took the turn on the live page). */
  say(line: string) { this.opening.unshift(line); }
  /**
   * The match is over (owner, 2026-11-12): how it ended and what the side lost this turn, said after the opening lines.
   * From the whole board, which may be told once it's over: `before` is the real board as the turn opened, `w` the
   * real board at the end. Call only once the match is over.
   */
  ended(before: World, w: World, how: { win: Side | 'D'; byTime: boolean }) {
    const { e, s, me } = this, them: Side = me === 'C' ? 'A' : 'C';
    const mine = e.towers(w, me).length, theirs = e.towers(w, them).length, step = w.step;
    const result = how.win === me ? 'so you won' : how.win === 'D' ? 'a draw' : 'so you lost';
    const why = s.win === 'first-blood' ? `the first tower destroyed decides (towers destroyed ${this.kills[me]} to ${this.kills[them]})`
      : !mine && !theirs ? 'both sides\' last towers fell at once'
        : !theirs ? 'every enemy tower destroyed'
          : !mine ? 'every tower of yours destroyed'
            : `${mine} of your towers standing to their ${theirs}${mine === theirs && s.tieBreak && this.kills[me] !== this.kills[them] ? `, and towers destroyed ${this.kills[me]} to ${this.kills[them]}` : ''}`;
    this.ending.push(`The match ended at step ${step}${how.byTime ? ' on the clock' : ''}: ${why}, ${result}.`);
    // What it lost this turn: its towers and standing pieces on the board as the turn opened, or placed this turn.
    const had = new Map<string, number>();
    {
      const b = before;
      for (const k in b.tw) if (b.tw[k] === me) had.set(`tower@${k}`, +k);
      for (const k in b.sq) if (b.sq[k].o === me) had.set(`square@${k}`, +k);
      for (const k in b.mir ?? {}) if (b.mir![k].o === me) had.set(`mirror@${k}`, +k);
      for (const k in b.fa ?? {}) if (b.fa![k].o === me) had.set(`factory@${k}`, +k);
      for (const k in b.sd ?? {}) if (b.sd![k] === me) had.set(`resting symbol glider@${k}`, +k);
    }
    for (const p of this.placed) { const n = ({ t: 'tower', s: 'square', m: 'mirror', f: 'factory' } as Record<string, string>)[p.t]; if (n) had.set(`${n}@${e.K(p.x, p.y)}`, e.K(p.x, p.y)); }
    const still = (key: string, k: number) => { const n = key.split('@')[0]; return n === 'tower' ? w.tw[k] === me : n === 'square' ? w.sq[k]?.o === me : n === 'mirror' ? w.mir?.[k]?.o === me : n === 'factory' ? w.fa?.[k]?.o === me : w.sd?.[k] === me; };
    const lost = new Map<string, number[]>();
    for (const [key, k] of had) if (!still(key, k)) { const n = key.split('@')[0]; lost.set(n, [...(lost.get(n) ?? []), k]); }
    const plural = (n: string, c: number) => (c === 1 ? `a ${n}` : `${c} ${n === 'factory' ? 'factories' : `${n}s`}`);
    const parts = [...lost].map(([n, ks]) => `${plural(n, ks.length)}, at ${and(ks.sort((a, b) => a - b).map((k) => at(...e.XY(k))))}`);
    this.ending.push(parts.length ? `What you lost this turn: ${parts.join('; ')}.` : 'What you lost this turn: no tower, square, mirror, factory or resting symbol glider.');
  }

  private sight = (g: Pick<Glider, 'seed'>) => (g.seed ? this.s.symbolGliderSight ?? 0 : this.s.gliderSight ?? 0);
  /** A glider flew out of sight this step: where it was last seen (fix 3.3: the square it flew from, which was in sight). */
  private leave(st: Story, g0: Glider, step: number) {
    st.dark = { x: g0.x, y: g0.y, dx: g0.dx, dy: g0.dy, step: step - 1, seed: !!g0.seed };
    return `flew out of your sight from ${at(g0.x, g0.y)}, heading ${dir(g0.dx, g0.dy)}, at step ${step}`;
  }
  /** An enemy square, mirror or factory on square k that a glider of the side's chipped this step, in sight. */
  private chipped(v0: World, v: World, k: number, see: Set<number>, step: number): string | null {
    if (!see.has(k)) return null;
    for (const [kind, a, b] of [['sq', v0.sq[k], v.sq[k]], ['mir', v0.mir?.[k], v.mir?.[k]], ['fa', v0.fa?.[k], v.fa?.[k]]] as const) {
      if (!a || !b || a.o === this.me || b.o !== a.o || b.hp >= a.hp) continue;
      this.claimed.add(`chip@${kind}@${k}@${step}`);
      return `chipped the enemy ${STATIC_NAME[kind]} at ${at(...this.e.XY(k))} at step ${step} (${b.hp} hit${b.hp === 1 ? '' : 's'} left)`;
    }
    return null;
  }
  private story(g: Glider, how: 'placed' | 'earlier' | 'factory', from?: number): Story {
    const kind = g.seed ? 'symbol glider' : 'glider';
    const label = how === 'placed' ? `Your ${kind} from ${at(g.x, g.y)}, heading ${dir(g.dx, g.dy)}`
      : how === 'factory' ? `A glider from your factory at ${at(...this.e.XY(from!))}`
        : `Your ${kind} sent earlier (at ${at(g.x, g.y)} as the turn opened)`;
    const st: Story = { label, events: [], end: null, seed: !!g.seed, x: g.x, y: g.y, dx: g.dx, dy: g.dy, turns: 0 };
    this.stories.push(st);
    return st;
  }

  /** The static pieces of one side ("mine" or the enemy's) a view shows, keyed "kind@square". */
  private statics(v: World, mine: boolean): Statics {
    const out: Statics = new Map(), ours = (o: Side) => (o === this.me) === mine;
    for (const k in v.tw) if (ours(v.tw[k])) out.set(`tw@${k}`, { o: v.tw[k] });
    for (const k in v.sq) if (ours(v.sq[k].o)) out.set(`sq@${k}`, { o: v.sq[k].o, hp: v.sq[k].hp });
    for (const k in v.mir ?? {}) if (ours(v.mir![k].o)) out.set(`mir@${k}`, { o: v.mir![k].o, hp: v.mir![k].hp });
    for (const k in v.fa ?? {}) if (ours(v.fa![k].o)) out.set(`fa@${k}`, { o: v.fa![k].o, hp: v.fa![k].hp, dx: v.fa![k].dx, dy: v.fa![k].dy });
    for (const k in v.sd ?? {}) if (ours(v.sd![k])) out.set(`sd@${k}`, { o: v.sd![k] });
    return out;
  }
  private sqOf = (key: string) => +key.split('@')[1];

  /**
   * Its own squares, mirrors, factories and resting symbol gliders: chipped or destroyed where it sees them, each with
   * its cause as far as the side saw (owner, 2026-11-12). `v0`: the frame before (null as the turn opens).
   */
  private noteMine(v: World, see: Set<number>, step: number | null, v0: World | null = null) {
    const now = this.statics(v, true);
    for (const [key, was] of this.mine) {
      const k = this.sqOf(key), kind = key.split('@')[0], where = at(...this.e.XY(k)), name = STATIC_NAME[kind];
      if (kind === 'tw' || !see.has(k)) continue;
      const is = now.get(key);
      // Seen the frame before too (so it went this step), or out of sight until now (gone some time since it was last seen).
      const watched = this.prevSee.has(k) && v0 !== null;
      if (!is) {
        this.mine.delete(key);
        if (step === null) continue;
        if (!watched) {
          this.lines.push(`Your ${name} at ${where}, last seen at step ${was.seen ?? step}, is gone: lost to something out of your sight.`);
          this.moments.wallsLost.push(`${name} at ${where}`);
          continue;
        }
        // A resting symbol glider taken into a symbol of its own this step: the glider's story tells it.
        if (kind === 'sd' && Object.keys(v.fs ?? {}).map(Number).some((j) => v.fs![j].o === this.me && v.tw[j] === this.me && v.fs![j].at === step - 1 && Math.max(Math.abs(this.e.XY(j)[0] - this.e.XY(k)[0]), Math.abs(this.e.XY(j)[1] - this.e.XY(k)[1])) <= 2)) continue;
        const by = this.hitBy(v0!, k, false);
        this.lines.push(`Your ${name} at ${where} was destroyed at step ${step}, ${by.text}.`);
        this.moments.wallsLost.push(`${name} at ${where}${by.own ? ' (by your own glider)' : ''}`);
      } else if (step !== null && is.hp !== undefined && was.hp !== undefined && is.hp < was.hp) {
        const left = `${is.hp} hit${is.hp === 1 ? '' : 's'} left`;
        this.lines.push(watched ? `Your ${name} at ${where} was chipped at step ${step} (${left}).` : `Your ${name} at ${where}, last seen at step ${was.seen ?? step} with ${was.hp} hits left, now has ${left}: hit out of your sight.`);
      }
    }
    for (const [key, is] of now) if (key.split('@')[0] !== 'tw') this.mine.set(key, { ...is, seen: v.step });
  }
  /**
   * What hit square k this step, from the frame before: a glider it showed flying into k (towers: any enemy glider, and
   * its own where its own towers break; other pieces: plain gliders, since a symbol glider comes to rest against them),
   * the first in the engine's order; else something out of sight.
   */
  private hitBy(v0: World, k: number, tower: boolean): { text: string; own: boolean } {
    const { e, me, s } = this, [kx, ky] = e.XY(k);
    const h = v0.gl.filter((g) => e.inb(g.x + g.dx, g.y + g.dy) && g.x + g.dx === kx && g.y + g.dy === ky && (tower ? g.o !== me || s.ownTower === 'destroy' : !g.seed)).sort((a, b) => a.id - b.id)[0];
    if (!h) return { text: 'hit by something out of your sight', own: false };
    const kind = h.seed ? 'symbol glider' : 'glider';
    return { text: `hit by ${h.o === me ? 'your own' : 'the enemy'} ${kind} from ${at(h.x, h.y)}`, own: h.o === me };
  }

  /** Its gliders out of sight as the view lists them once the turn has run (solo.ts darkGliders): call before done(). */
  listedNow(dark: Dark[]) { this.listed = new Set(dark.map(darkKey)); }

  /** The placements have appeared (both sides', at once). */
  appear(w: World) { this.frame(w, true); }
  /** After every step. */
  look(w: World) { this.frame(w, false); }

  private frame(w: World, appearing: boolean) {
    const { e, s, me } = this, v = e.fog(w, s, me), see = e.sees(w, s, me), step = v.step, v0 = this.prev;
    const name = (k: number) => at(...e.XY(k));
    // What this frame's step did, run on the last frame's view (no step when the placements appear).
    const sim = e.clone(v0), simKills: Kills = { C: 0, A: 0, log: [] };
    if (!appearing) e.step(sim, s, simKills);
    const left = (x: number, y: number) => e.inb(x, y);
    // ---- its own gliders ----
    const mineNow = v.gl.filter((g) => g.o === me), taken = new Set<number>(), next = new Map<number, Story>();
    // A glider of its own its factory just fired (where a factory fires, facing its way).
    const fired = (g: Glider) => Object.keys(v.fa ?? {}).map(Number).find((k) => v.fa![k].o === me && e.XY(k)[0] + v.fa![k].dx === g.x && e.XY(k)[1] + v.fa![k].dy === g.y && v.fa![k].dx === g.dx && v.fa![k].dy === g.dy);
    const goOn = (st: Story, there: Glider, g0: Glider) => {
      taken.add(there.id);
      const chip = appearing || !e.inb(g0.x + g0.dx, g0.y + g0.dy) ? null : this.chipped(v0, v, e.K(g0.x + g0.dx, g0.y + g0.dy), see, step);
      const turned = there.dx !== st.dx || there.dy !== st.dy;
      // A hit on an enemy piece in sight (fix 3: "chipped the enemy square at (16, 9)") is always told; turns, the first three.
      if (chip) st.events.push(`${chip}${turned ? ` and turned ${dir(there.dx, there.dy)}` : ''}`);
      else if (turned && ++st.turns <= 3) st.events.push(`turned ${dir(there.dx, there.dy)} at ${at(there.x, there.y)} at step ${step}`);
      Object.assign(st, { x: there.x, y: there.y, dx: there.dx, dy: there.dy });
      next.set(there.id, st);
    };
    const rest: [Glider, Story, Glider | undefined][] = [];
    for (const g0 of v0.gl) {
      if (g0.o !== me) continue;
      const st = this.live.get(g0.id);
      if (!st) continue;
      const g1 = appearing ? g0 : sim.gl.find((g) => g.id === g0.id);
      const there = g1 && mineNow.find((g) => !taken.has(g.id) && g.x === g1.x && g.y === g1.y && !!g.seed === !!g0.seed);
      if (there) goOn(st, there, g0);
      else rest.push([g0, st, g1]);
    }
    for (const [g0, st, g1] of rest) {
      // Not where the sandbox put it. The only new glider of its kind within a step of it is it: something it couldn't
      // see turned it (fix 3.1 and 3.4: no "left your sight" then "sent earlier" for one glider).
      const near = mineNow.filter((g) => !taken.has(g.id) && !!g.seed === !!g0.seed && Math.abs(g.x - g0.x) <= 1 && Math.abs(g.y - g0.y) <= 1 && (appearing || fired(g) === undefined));
      if (g1 && near.length === 1) { goOn(st, near[0], g0); continue; }
      if (g1) {
        // Out of sight if it could be, else stopped by something the view didn't show.
        const q = e.K(g1.x, g1.y);
        if (!this.sight(g0) && !see.has(q)) st.end = this.leave(st, g0, step);
        else st.end = this.reportedKill(g0, step) ?? `was destroyed near ${at(g1.x, g1.y)} at step ${step} (head-on, by something out of your sight)`;
        continue;
      }
      st.end = this.stopped(st, g0, v0, sim, simKills, step, see, v);
    }
    // Gliders new to its view: placed now, fired by its factory, back in sight, or sent earlier and now in sight.
    const gone = this.stories.filter((st) => st.dark && (st.end !== null || st.remembered));
    for (const g of mineNow) {
      if (taken.has(g.id)) continue;
      const placedHere = appearing && this.placed.some((p) => (p.t === 'g' || p.t === 'e') && p.x === g.x && p.y === g.y);
      const fac = appearing ? undefined : fired(g);
      if (placedHere) { const st = this.story(g, 'placed'); st.placed = step; next.set(g.id, st); continue; }
      if (fac !== undefined) { next.set(g.id, this.story(g, 'factory', fac)); continue; }
      // Back in sight: the one story of its kind that flew out of sight near enough to be here now (fix 3: it keeps its name).
      const back = gone.filter((st) => st.dark && !!st.dark.seed === !!g.seed && Math.max(Math.abs(st.dark.x - g.x), Math.abs(st.dark.y - g.y)) <= step - st.dark.step);
      if (back.length === 1) {
        const st = back[0];
        gone.splice(gone.indexOf(st), 1);
        if (st.end) st.events.push(st.end);
        st.events.push(`came back into sight at ${at(g.x, g.y)}, heading ${dir(g.dx, g.dy)}, at step ${step}`);
        Object.assign(st, { end: null, dark: undefined, remembered: false, x: g.x, y: g.y, dx: g.dx, dy: g.dy });
        next.set(g.id, st);
        continue;
      }
      const st = this.story(g, 'earlier');
      st.label = `Your ${g.seed ? 'symbol glider' : 'glider'} sent earlier`;
      st.entered = step;
      st.events.push(`came into sight at ${at(g.x, g.y)}, heading ${dir(g.dx, g.dy)}, at step ${step}`);
      next.set(g.id, st);
    }
    this.live = next;
    // Placements that cancelled with the enemy's on the same square: said only where it sees the square now. A placement
    // out of sight as they appear (its symbol's tower went then, and with it the sight) can't be told apart (fix 3.5).
    if (appearing) for (const p of this.placed) {
      const k = e.K(p.x, p.y);
      const there = p.t === 'g' || p.t === 'e' ? v.gl.some((g) => g.o === me && g.x === p.x && g.y === p.y) : p.t === 's' ? v.sq[k]?.o === me : p.t === 't' ? v.tw[k] === me : p.t === 'm' ? v.mir?.[k]?.o === me : p.t === 'f' ? v.fa?.[k]?.o === me : (v.mw ?? []).some((m) => m.o === me && m.x === p.x && m.y === p.y);
      if (there) continue;
      const what = `Your ${(NAME[p.t] ?? [p.t])[0]} at ${at(p.x, p.y)}`;
      if (p.t === 't' || see.has(k)) this.lines.push(`${what} didn't appear: the enemy placed on the same square, and the two cancelled out.`);
      else this.lines.push(`${what} was out of your sight once the placements appeared, so you can't tell yet whether it stands.`);
    }
    // ---- its own pieces ----
    this.noteMine(v, see, step, v0);
    // Resting symbol gliders out of sight: a square seen again leaves `rest` (the view tells from then on).
    for (const k of Object.keys(this.rest).map(Number)) if (see.has(k)) delete this.rest[k];
    const towers0 = new Set(e.towers(v0, me)), towers1 = new Set(e.towers(v, me));
    for (const k of towers0) if (!towers1.has(k)) {
      if (appearing && v0.fs?.[k]?.o === me) { this.lines.push(`Your symbol at ${name(k)} wasn't walled in, so it is gone.`); this.moments.symbolGone.push(name(k)); }
      else { this.lines.push(`You lost your tower at ${name(k)} at step ${step}, ${this.hitBy(v0, k, true).text}.`); this.lost++; this.moments.lost.push(name(k)); }
    }
    for (const k of towers1) if (!towers0.has(k) && v.fs?.[k]?.o === me) { this.lines.push(`Your symbol formed a tower at ${name(k)} at step ${step}: wall it in on your next turn or it goes.`); this.moments.formed.push(name(k)); }
    // ---- enemy pieces: named as they come into sight, appear, or go ----
    const theirs0 = this.statics(v0, false), theirs1 = this.statics(v, false);
    for (const [key, p] of theirs1) {
      if (this.named.has(key)) continue;
      this.named.add(key);
      const kind = key.split('@')[0], k = this.sqOf(key), wasSeen = this.prevSee.has(k);
      const what = kind === 'fa' ? `factory at ${name(k)}, firing ${dir(p.dx!, p.dy!)}` : `${STATIC_NAME[kind]} at ${name(k)}`;
      if (appearing && wasSeen) this.lines.push(`The enemy placed a ${what}.`);
      else if (kind === 'sd' && wasSeen) this.lines.push(`An enemy symbol glider came to rest at ${name(k)} at step ${step}.`);
      else if (kind === 'tw' && wasSeen && v.fs?.[k]) this.lines.push(`An enemy symbol formed a tower at ${name(k)} at step ${step}.`);
      else this.lines.push(`An enemy ${what} came into sight at step ${step}.`);
      if (kind === 'tw') this.moments.spotted.push(name(k));
    }
    for (const [key] of theirs0) {
      const k = this.sqOf(key), kind = key.split('@')[0];
      if (theirs1.has(key) || !see.has(k) || !this.prevSee.has(k)) continue;
      this.named.delete(key);
      if (this.claimed.has(`${key}@${step}`)) continue;
      if (kind === 'sd') continue; // joined a symbol, or broken: the glider's own line, or nothing to say
      if (kind === 'tw' && appearing) { this.lines.push(`The enemy's symbol at ${name(k)} wasn't walled in, so it is gone.`); this.moments.enemySymbolGone.push(name(k)); }
      else this.lines.push(`The enemy ${STATIC_NAME[kind]} at ${name(k)} was destroyed at step ${step}, in your sight.`);
    }
    // Enemy pieces chipped in sight that no glider's story told (fix 3: hits on enemy squares are reported).
    for (const [key, p0] of theirs0) {
      const k = this.sqOf(key), kind = key.split('@')[0], p1 = theirs1.get(key);
      if (!p1 || p0.hp === undefined || p1.hp === undefined || p1.hp >= p0.hp || !see.has(k) || !this.prevSee.has(k) || this.claimed.has(`chip@${kind}@${k}@${step}`)) continue;
      this.lines.push(`The enemy ${STATIC_NAME[kind]} at ${name(k)} was chipped at step ${step} (${p1.hp} hit${p1.hp === 1 ? '' : 's'} left).`);
    }
    for (const m of v.mw ?? []) {
      if (m.o === me) continue;
      const cells = e.wallCells(m).filter(([x, y], i) => m.c[i] && e.inb(x, y)), key = `mw@${m.dx},${m.dy}@${m.dx ? m.y : m.x}`;
      if (this.named.has(key)) continue;
      this.named.add(key);
      this.lines.push(`${appearing && cells.some(([x, y]) => this.prevSee.has(e.K(x, y))) ? 'The enemy placed a moving wall' : 'An enemy moving wall came into sight'} at ${cells.map(([x, y]) => at(x, y)).join(', ')}, moving ${dir(m.dx, m.dy)}${appearing ? '' : `, at step ${step}`}.`);
    }
    // Enemy gliders: by where the step took them in the sandbox.
    const theirG = v.gl.filter((g) => g.o !== me), matched = new Set<number>(), astray: [Glider, Glider][] = [];
    const enemyFired = (g: Glider) => Object.keys(v.fa ?? {}).map(Number).find((k) => v.fa![k].o !== me && e.XY(k)[0] + v.fa![k].dx === g.x && e.XY(k)[1] + v.fa![k].dy === g.y && v.fa![k].dx === g.dx && v.fa![k].dy === g.dy);
    const kind = (g: Pick<Glider, 'seed'>) => (g.seed ? 'symbol glider' : 'glider');
    for (const g0 of v0.gl) {
      if (g0.o === me) continue;
      const g1 = appearing ? g0 : sim.gl.find((g) => g.id === g0.id);
      if (!g1) continue;
      const there = theirG.find((g) => !matched.has(g.id) && g.x === g1.x && g.y === g1.y);
      if (there) { matched.add(there.id); continue; }
      astray.push([g0, g1]);
    }
    for (const [g0, g1] of astray) {
      // Turned by something out of sight: the only new enemy glider of its kind within a step of it (one line, not "flew
      // out of your sight" and "came into sight" on the same square: playtest v2 2.1).
      const near = theirG.filter((g) => !matched.has(g.id) && !!g.seed === !!g0.seed && Math.abs(g.x - g0.x) <= 1 && Math.abs(g.y - g0.y) <= 1 && (appearing || enemyFired(g) === undefined));
      if (!appearing && near.length === 1) {
        matched.add(near[0].id);
        this.lines.push(`An enemy ${kind(g0)} at ${at(g0.x, g0.y)}, heading ${dir(g0.dx, g0.dy)}, turned ${dir(near[0].dx, near[0].dy)} at step ${step}, by something out of your sight.`);
        continue;
      }
      // Came to rest on its square, or formed its side's symbol there, in sight: that piece's own line tells it
      // (playtest v3 3a: never "formed a tower at (15, 2)" and then "flew out of your sight from (15, 2)").
      const k0 = e.K(g0.x, g0.y);
      if (see.has(k0) && (v.sd?.[k0] === g0.o || (v.tw[k0] === g0.o && v.fs?.[k0]))) continue;
      if (!see.has(e.K(g1.x, g1.y)) && left(g1.x, g1.y)) {
        this.enemyGone.push({ line: this.lines.length, x: g0.x, y: g0.y, seed: !!g0.seed, step });
        this.lines.push(`An enemy ${kind(g0)} flew out of your sight from ${at(g0.x, g0.y)}, heading ${dir(g0.dx, g0.dy)}, at step ${step}.`);
      }
    }
    for (const g of theirG) {
      if (matched.has(g.id)) continue;
      const fac = enemyFired(g);
      if (fac !== undefined && !appearing) { this.factoryFired.set(fac, [...(this.factoryFired.get(fac) ?? []), step]); continue; }
      const k = e.K(g.x, g.y);
      if (appearing && this.prevSee.has(k)) { this.lines.push(`The enemy launched a ${kind(g)} at ${at(g.x, g.y)}, heading ${dir(g.dx, g.dy)}.`); continue; }
      // Back in sight: the one enemy glider of its kind that flew out of sight this turn near enough to be here now (it was
      // on the square it flew out from a step before the step that line names). Its
      // leaving and its coming back are one line (owner, 2026-11-12, as for its own gliders).
      const back = appearing ? [] : this.enemyGone.filter((x) => x.seed === !!g.seed && x.step < step && Math.max(Math.abs(x.x - g.x), Math.abs(x.y - g.y)) <= step - (x.step - 1));
      if (back.length === 1) {
        const x = back[0];
        this.enemyGone.splice(this.enemyGone.indexOf(x), 1);
        this.lines[x.line] = `${this.lines[x.line].slice(0, -1)}, and came back into sight at ${at(g.x, g.y)}, heading ${dir(g.dx, g.dy)}, at step ${step}.`;
        continue;
      }
      this.lines.push(`An enemy ${kind(g)} came into sight at ${at(g.x, g.y)}, heading ${dir(g.dx, g.dy)}, at step ${step}.`);
    }
    this.prev = v;
    this.prevSee = see;
  }

  /** A book-4 kill report for the tower a vanished glider was flying at, if there is one. */
  private reportedKill(g: Glider, step: number): string | null {
    if (!this.s.killReports) return null;
    const k = this.e.inb(g.x + g.dx, g.y + g.dy) ? this.e.K(g.x + g.dx, g.y + g.dy) : -1;
    const hit = (logOf(this.kills) ?? []).slice(this.kills0).find((x) => x.o === this.me && x.k === k && x.step === step);
    return hit ? this.kill(g, k, step) : null;
  }
  private kill(g: Pick<Glider, 'seed'>, k: number, step: number) {
    this.claimed.add(`tw@${k}@${step}`);
    this.killsSeen++;
    this.moments.kills.push({ at: at(...this.e.XY(k)), seed: !!g.seed });
    return `destroyed the enemy tower at ${at(...this.e.XY(k))} at step ${step}`;
  }

  /** How a glider the sandbox stopped this step was stopped, from what the earlier view showed in front of it. */
  private stopped(st: Story, g: Glider, v0: World, sim: World, simKills: Kills, step: number, see: Set<number>, v: World): string {
    const { e, s, me } = this;
    const off = !e.inb(g.x + g.dx, g.y + g.dy);
    if (off && s.edges === 'vanish') return `flew off the board at step ${step}`;
    const n = off ? e.K(g.x, g.y) : e.K(g.x + g.dx, g.y + g.dy), [nx, ny] = e.XY(n), there = at(nx, ny);
    // A tower destroyed: in the sandbox, and (book-4) in the kill reports, or in sight now.
    if ((simKills.log ?? []).some((x) => x.o === me && x.k === n)) {
      const reported = (logOf(this.kills) ?? []).slice(this.kills0).some((x) => x.o === me && x.k === n && x.step === step);
      if (this.s.killReports ? reported : see.has(n) && !v.tw[n]) return this.kill(g, n, step);
      return this.sight(g) || see.has(n) ? `was destroyed near ${there} at step ${step}` : this.leave(st, g, step);
    }
    // Head-on: another glider the earlier view showed was stopped with it, on a meeting square.
    const tgt = (h: Glider) => (e.inb(h.x + h.dx, h.y + h.dy) ? [h.x + h.dx, h.y + h.dy] : [h.x, h.y]);
    const [ax, ay] = tgt(g);
    const met = v0.gl.find((h) => h.id !== g.id && (h.o !== g.o || s.sameSide !== 'pass') && !sim.gl.some((x) => x.id === h.id) && (() => { const [bx, by] = tgt(h); return (bx === ax && by === ay) || (2 * g.x + (ax - g.x) === 2 * h.x + (bx - h.x) && 2 * g.y + (ay - g.y) === 2 * h.y + (by - h.y)); })());
    if (met) return `was destroyed head-on with ${met.o === me ? 'another of your gliders' : `an enemy ${met.seed ? 'symbol glider' : 'glider'}`} at step ${step}, near ${at(g.x, g.y)}`;
    // Came to rest (and maybe joined two others in a symbol, which takes the three resting gliders away).
    const formed = Object.keys(sim.fs ?? {}).map(Number).find((k) => sim.fs![k].o === me && sim.fs![k].at === step - 1 && Math.abs(e.XY(k)[0] - g.x) <= 2 && Math.abs(e.XY(k)[1] - g.y) <= 2);
    if (g.seed && (sim.sd?.[e.K(g.x, g.y)] === me || formed !== undefined)) {
      if (formed !== undefined) return `came to rest at ${at(g.x, g.y)} at step ${step} and formed your symbol at ${at(...e.XY(formed))}`;
      // Where it came to rest only when the side saw it (owner, 2026-11-12): its square in sight now, or everything
      // within 2 of it in sight the frame before (nothing hidden could have stopped it otherwise, or taken it into a
      // symbol). Then a square out of sight goes into `rest`, so the view lists it and simulate uses it.
      const k = e.K(g.x, g.y);
      if (see.has(k)) {
        if (v.sd?.[k] === me) return `came to rest at ${at(g.x, g.y)} at step ${step}`;
        if (v.tw[k] === me && v.fs?.[k]) return `came to rest at ${at(g.x, g.y)} at step ${step} and formed your symbol there`;
        return `was destroyed at ${at(g.x, g.y)} at step ${step} as it stopped`;
      }
      let sure = true;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (e.inb(g.x + dx, g.y + dy) && !this.prevSee.has(e.K(g.x + dx, g.y + dy))) sure = false;
      if (!sure) return `stopped at step ${step}, out of your sight: you can't tell whether it came to rest`;
      this.rest[k] = step;
      this.mine.set(`sd@${k}`, { o: me, seen: step });
      return `came to rest at ${at(g.x, g.y)} at step ${step}`;
    }
    const whose = (o: Side) => (o === me ? 'your own' : 'the enemy');
    if (v0.sq[n]) { if (v0.sq[n].o !== me) this.claimed.add(`sq@${n}@${step}`); return `broke ${whose(v0.sq[n].o)} square at ${there} and was destroyed, at step ${step}`; }
    if (v0.mir?.[n]) { if (v0.mir[n].o !== me) this.claimed.add(`mir@${n}@${step}`); return `broke ${whose(v0.mir[n].o)} mirror at ${there} and was destroyed, at step ${step}`; }
    if (v0.fa?.[n]) { if (v0.fa[n].o !== me) this.claimed.add(`fa@${n}@${step}`); return `broke ${whose(v0.fa[n].o)} factory at ${there} and was destroyed, at step ${step}`; }
    if (v0.sd?.[n]) { if (v0.sd[n] !== me) this.claimed.add(`sd@${n}@${step}`); return `broke ${whose(v0.sd[n])} resting symbol glider at ${there} and was destroyed, at step ${step}`; }
    const wall = v0.mw && e.wallAt(v0, n);
    if (wall) return `broke a square of ${whose(wall.m.o)} moving wall at ${there} and was destroyed, at step ${step}`;
    if (v0.rock[n]) return `${s.rocks === 'breakable' && !sim.rock[n] ? 'broke the rock' : 'was stopped by the rock'} at ${there}, at step ${step}`;
    if (v0.tw[n] === me) return `was destroyed against your own tower at ${there} at step ${step}`;
    return `was destroyed near ${at(g.x, g.y)} at step ${step}`;
  }

  /** The summary: opening lines, one story a glider, what else its side saw, the kill reports and the tally. */
  done(): string[] {
    if (this.finished) return this.finished;
    const { e, s, me } = this, out = [...this.opening, ...this.ending];
    // The turn's kill reports not told by a story in sight; each tied to the glider that flew out of sight toward it, when
    // only one did (tieKills), else said on its own line.
    const fresh = s.killReports ? (logOf(this.kills) ?? []).slice(this.kills0).filter((x) => x.o === me && !this.claimed.has(`tw@${x.k}@${x.step}`)) : [];
    const darkNow = this.stories.filter((st) => st.dark && (st.end !== null || st.remembered));
    const ties = tieKills(e, darkNow.map((st) => st.dark!), fresh);
    for (const [i, j] of ties) darkNow[j].kill = `destroyed the enemy tower at ${at(...e.XY(fresh[i].k))} at step ${fresh[i].step} (kill report)`;
    // Gliders sent earlier that only flew on (book-4's symbol gliders bounce off the edges for many turns): one line.
    const quiet = this.stories.filter((st) => st.end === null && !st.remembered && st.label.includes('as the turn opened') && st.events.every((x) => x.startsWith('turned')));
    for (const st of this.stories) {
      if (quiet.length > 1 && quiet.includes(st)) continue;
      // From its memory, and nothing came of it this turn: nothing to tell, unless the memory lets it go now (a turn
      // after it was last seen, own-seen.ts; listed()): then it leaves my_pieces_out_of_sight, and a line says so (owner,
      // 2026-11-12: no piece of yours vanishes without a line).
      if (st.remembered && !st.kill) {
        if (st.dark && this.listed && !this.listed.has(darkKey(st.dark))) out.push(`${st.label}: not seen since; it is no longer listed among your pieces out of sight.`);
        continue;
      }
      // Came into sight and flew out of it again from the same frame, with nothing between (fix 3: lines that say nothing).
      if (st.entered !== undefined && st.dark && st.dark.step === st.entered && st.events.length === 1 && !st.kill) continue;
      if (st.remembered) { out.push(`${st.label}: ${st.kill}.`); continue; }
      // Flew out of sight on its first step (owner, 2026-11-12): "Your glider from (7, 0), heading east, flew straight out of your sight."
      if (st.placed !== undefined && st.dark && st.dark.step === st.placed && !st.events.length) { out.push(`${st.label}, flew straight out of your sight${st.kill ? `; ${st.kill}` : ''}.`); continue; }
      const end = st.end ?? `still flying at ${at(st.x, st.y)}, heading ${dir(st.dx, st.dy)}`;
      const more = st.turns > 3 ? [`turned ${st.turns - 3} more time${st.turns - 3 === 1 ? '' : 's'}`] : [];
      out.push(`${st.label}: ${[...st.events, ...more, end, ...(st.kill ? [st.kill] : [])].join('; ')}.`);
    }
    if (quiet.length > 1) out.push(`${quiet.length} of your ${quiet.every((x) => x.seed) ? 'symbol gliders' : 'gliders'} sent earlier are still flying, now at ${(() => { const xs = quiet.map((x) => `${at(x.x, x.y)} heading ${dir(x.dx, x.dy)}`); return xs.length > 6 ? `${xs.slice(0, 5).join(', ')} and ${xs.length - 5} more` : and(xs); })()}.`);
    out.push(...this.lines);
    for (const [k, steps] of this.factoryFired) {
      const f = this.prev.fa?.[k];
      out.push(`The enemy factory at ${at(...e.XY(k))} fired ${steps.length === 1 ? 'a glider' : `${steps.length} gliders`}${f ? ` ${dir(f.dx, f.dy)}` : ''} at step${steps.length === 1 ? '' : 's'} ${and(steps.map(String))}.`);
    }
    if (s.killReports) {
      this.moments.reported = fresh.map((x) => at(...e.XY(x.k)));
      fresh.forEach((x, i) => { if (!ties.has(i)) out.push(`Kill report: your side destroyed the enemy tower at ${at(...e.XY(x.k))} at step ${x.step}, out of your sight.`); });
      out.push(`Towers destroyed so far: you ${this.kills[me]}, the opponent ${this.kills[me === 'C' ? 'A' : 'C']}.`);
    }
    if (out.length === this.opening.length + this.ending.length) out.push('Nothing came into or left your sight this turn.');
    this.finished = out.length > MAX_LINES ? [...out.slice(0, MAX_LINES - 1), `… and ${out.length - MAX_LINES + 1} more lines.`] : out;
    return this.finished;
  }

  /**
   * The turn's lead lines for the live page (owner, 2026-11-04; reordered 2026-11-11, fix 4: "lead with losses and
   * removals"): a tower of yours lost, your symbol gone, towers destroyed (in sight, then by kill report), an enemy
   * symbol gone, a square, mirror or factory of yours destroyed, then symbols formed and enemy towers spotted; up to `n`.
   * A turn with none of these leads with its first lines after the opening ones: never with who took the turn or what
   * was placed. Call after done().
   */
  big(n = 3): string[] {
    const m = this.moments, out: string[] = [];
    const list = (xs: string[]) => (xs.length > 4 ? `${xs.slice(0, 3).join(', ')} and ${xs.length - 3} more` : and(xs));
    if (m.lost.length) out.push(m.lost.length === 1 ? `You lost your tower at ${m.lost[0]}.` : `You lost ${m.lost.length} towers: ${list(m.lost)}.`);
    if (m.symbolGone.length) out.push(m.symbolGone.length === 1 ? `Your symbol at ${m.symbolGone[0]} wasn't walled in, so it is gone.` : `Your symbols at ${list(m.symbolGone)} weren't walled in, so they are gone.`);
    if (m.kills.length) {
      const seeds = m.kills.filter((x) => x.seed).length, who = seeds === m.kills.length ? 'symbol glider' : seeds ? '' : 'glider';
      out.push(m.kills.length === 1 ? `Your ${who} destroyed the enemy tower at ${m.kills[0].at}.` : `Your ${who ? `${who}s` : 'gliders and symbol gliders'} destroyed ${m.kills.length} enemy towers: ${list(m.kills.map((x) => x.at))}.`);
    }
    if (m.reported.length) out.push(`${m.reported.length === 1 ? 'An enemy tower' : `${m.reported.length} enemy towers`} destroyed out of your sight (kill report): ${list(m.reported)}.`);
    if (m.enemySymbolGone.length) out.push(m.enemySymbolGone.length === 1 ? `The enemy's symbol at ${m.enemySymbolGone[0]} wasn't walled in, so it is gone.` : `The enemy's symbols at ${list(m.enemySymbolGone)} weren't walled in, so they are gone.`);
    if (m.wallsLost.length) out.push(m.wallsLost.length === 1 ? `Your ${m.wallsLost[0]} was destroyed.` : `${m.wallsLost.length} of your pieces were destroyed: ${list(m.wallsLost)}.`);
    if (m.formed.length) out.push(m.formed.length === 1 ? `Your symbol formed a tower at ${m.formed[0]}.` : `Your symbols formed towers at ${and(m.formed)}.`);
    const gone = new Set([...m.kills.map((x) => x.at), ...m.reported]), spotted = m.spotted.filter((x) => !gone.has(x));
    if (spotted.length) out.push(spotted.length === 1 ? `Enemy tower spotted at ${spotted[0]}.` : `${spotted.length} enemy towers spotted: ${list(spotted)}.`);
    if (out.length) return out.slice(0, n);
    // Nothing big: the turn's first lines after the opening ones (who took it, what was placed).
    return this.done().slice(this.opening.length + this.ending.length).filter((l) => !/^(Towers destroyed so far|Nothing came into)/.test(l)).slice(0, Math.min(n, 2));
  }
}
