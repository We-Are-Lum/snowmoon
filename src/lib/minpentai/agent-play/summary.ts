import type { Engine, Kills, Placement, AnyPiece, Side, World } from '../versions/engine';
import type { Settings } from '../versions/schema';

/**
 * The turn summary (owner, 2026-11-02: "a text turn summary in get_view, built only from my fog frames: launches, hits,
 * kills, squares chipped, pieces leaving or entering sight, last-seen positions of my own gliders").
 *
 * Built step by step while the turn runs, from what side `me` sees at each step (engine.fog, the same view its AI
 * gets) and from its own pieces' fates where it can see them. Out of sight it says nothing, except what the ruleset
 * reports anyway (book-4's kill reports, from kills.log). Its own gliders are followed by their real number only while
 * in its sight, to say where each was last seen; enemy pieces only by position, frame to frame.
 */
const DIR: Record<string, string> = { '0,-1': 'north', '1,-1': 'north-east', '1,0': 'east', '1,1': 'south-east', '0,1': 'south', '-1,1': 'south-west', '-1,0': 'west', '-1,-1': 'north-west' };
const NAME: Record<string, [string, string]> = { g: ['glider', 'gliders'], s: ['square', 'squares'], t: ['tower', 'towers'], m: ['mirror', 'mirrors'], e: ['symbol glider', 'symbol gliders'], w: ['moving wall', 'moving walls'], f: ['factory', 'factories'] };
const at = (x: number, y: number) => `(${x}, ${y})`;
/** What side o sees (engine.sees where the engine has it: book-4's gliders that see; otherwise its towers' sight). */
const seen = (e: Engine, w: World, s: Settings, o: Side): Set<number> => { const x = e as Engine & { sees?: (w: World, s: Settings, o: Side) => Set<number> }; return x.sees ? x.sees(w, s, o) : e.lit(w, o, s.sight); };
type Log = { o: Side; k: number; step: number }[];
const logOf = (k: Kills): Log | undefined => (k as Kills & { log?: Log }).log;
const dir = (dx: number, dy: number) => DIR[`${dx},${dy}`] ?? 'still';

export class TurnWatch {
  private lines: string[] = [];
  private mine = new Map<number, { x: number; y: number; dx: number; dy: number; step: number; seed: boolean; visible: boolean; from: string; bounced?: boolean }>();
  private prev: World;
  private squares: Record<number, number>;
  private towers: Set<number>;
  private kills0: number;

  constructor(private e: Engine, private s: Settings, private me: Side, w: World, private kills: Kills, placed: Placement<AnyPiece>[]) {
    // What was placed this turn, by kind (and direction, for what flies).
    const groups = new Map<string, Placement<AnyPiece>[]>();
    for (const p of placed) { const k = `${p.t}|${p.dx || p.dy ? dir(p.dx, p.dy) : ''}`; groups.set(k, [...(groups.get(k) ?? []), p]); }
    for (const [k, ps] of groups) {
      const [t, d] = k.split('|'), [one, many] = NAME[t] ?? [t, t + 's'];
      this.lines.push(`You placed ${ps.length === 1 ? `a ${one}` : `${ps.length} ${many}`}${d && t !== 'm' ? ` heading ${d}` : ''} at ${ps.map((p) => at(p.x, p.y)).join(', ')}.`);
    }
    this.prev = e.fog(w, s, me);
    this.squares = Object.fromEntries(Object.entries(w.sq).filter(([, q]) => q.o === me).map(([k, q]) => [k, q.hp]));
    this.towers = new Set(e.towers(w, me));
    this.kills0 = logOf(kills)?.length ?? 0;
    this.look(w, true);
  }

  /** Call after the placements are applied and after every step. */
  look(w: World, first = false) {
    const { e, s, me } = this, see = seen(e, w, s, me), v = e.fog(w, s, me), step = w.step;
    // Its own gliders: where each was last in sight.
    const alive = new Set<number>();
    for (const g of w.gl) {
      if (g.o !== me) continue;
      alive.add(g.id);
      const inSight = see.has(e.K(g.x, g.y)), was = this.mine.get(g.id);
      // Its first turn-around in sight (off an edge, a rock, a square, a tower of its own, a mirror…), said once.
      if (inSight && was?.visible && !was.bounced && (g.dx !== was.dx || g.dy !== was.dy)) { was.bounced = true; this.lines.push(`Your ${g.seed ? 'symbol glider' : 'glider'} from ${was.from} turned at ${at(g.x, g.y)} at step ${step}, now heading ${dir(g.dx, g.dy)}.`); }
      if (inSight) this.mine.set(g.id, { x: g.x, y: g.y, dx: g.dx, dy: g.dy, step, seed: !!g.seed, visible: true, from: was?.from ?? at(g.x, g.y), bounced: was?.bounced });
      else if (was?.visible) { was.visible = false; this.lines.push(`Your ${was.seed ? 'symbol glider' : 'glider'} from ${was.from} left your sight at ${at(was.x, was.y)}, heading ${dir(was.dx, was.dy)}, at step ${was.step}.`); }
    }
    if (!first) for (const [id, g] of this.mine) if (!alive.has(id) && g.visible) {
      g.visible = false;
      // Gone between two steps. Said to be stopped only where its next square is in sight; otherwise it may just have
      // flown out of sight, and saying it stopped would tell of something hidden there.
      const nx = g.x + g.dx, ny = g.y + g.dy, nextSeen = !e.inb(nx, ny) || see.has(e.K(nx, ny));
      if (g.seed && v.sd?.[e.K(g.x, g.y)]) this.lines.push(`Your symbol glider from ${g.from} came to rest at ${at(g.x, g.y)} at step ${step}.`);
      else if (nextSeen) this.lines.push(`Your ${g.seed ? 'symbol glider' : 'glider'} from ${g.from} was stopped near ${at(g.x, g.y)} at step ${step}.`);
      else this.lines.push(`Your ${g.seed ? 'symbol glider' : 'glider'} from ${g.from} left your sight at ${at(g.x, g.y)}, heading ${dir(g.dx, g.dy)}, at step ${g.step}.`);
    }
    // Its own squares and towers (it always sees its towers; squares where it sees them).
    for (const k of Object.keys(this.squares).map(Number)) {
      const q = w.sq[k];
      if (!see.has(k)) continue;
      if (!q || q.o !== me) { this.lines.push(`Your square at ${at(...e.XY(k))} was destroyed at step ${step}.`); delete this.squares[k]; }
      else if (q.hp < this.squares[k]) { this.lines.push(`Your square at ${at(...e.XY(k))} was chipped at step ${step} (${q.hp} hit${q.hp === 1 ? '' : 's'} left).`); this.squares[k] = q.hp; }
    }
    for (const k in w.sq) if (w.sq[k].o === me && this.squares[+k] === undefined) this.squares[+k] = w.sq[k].hp;
    const towersNow = new Set(e.towers(w, me));
    for (const k of this.towers) if (!towersNow.has(k)) this.lines.push(`You lost your tower at ${at(...e.XY(k))} at step ${step}.`);
    for (const k of towersNow) if (!this.towers.has(k) && !first && w.fs?.[k]?.o === me) this.lines.push(`Your symbol formed a tower at ${at(...e.XY(k))} at step ${step}: wall it in on your next turn or it goes.`);
    this.towers = towersNow;
    // Enemy pieces coming into and leaving sight, frame to frame, by position only.
    if (!first) {
      const them = (x: World) => x.gl.filter((g) => g.o !== me);
      const before = them(this.prev), now = them(v);
      for (const g of now) if (!before.some((b) => b.x + b.dx === g.x && b.y + b.dy === g.y) && !before.some((b) => b.x === g.x && b.y === g.y)) this.lines.push(`An enemy ${g.seed ? 'symbol glider' : 'glider'} came into sight at ${at(g.x, g.y)}, heading ${dir(g.dx, g.dy)}, at step ${step}.`);
      for (const b of before) if (!now.some((g) => (b.x + b.dx === g.x && b.y + b.dy === g.y) || (g.x === b.x && g.y === b.y) || Math.abs(g.x - b.x) + Math.abs(g.y - b.y) <= 2) && !see.has(e.K(b.x + b.dx, b.y + b.dy))) this.lines.push(`An enemy glider left your sight from ${at(b.x, b.y)}, heading ${dir(b.dx, b.dy)}, at step ${step}.`);
      const enemyTowers = (x: World) => Object.keys(x.tw).map(Number).filter((k) => x.tw[k] !== me);
      const tb = new Set(enemyTowers(this.prev));
      for (const k of enemyTowers(v)) if (!tb.has(k)) this.lines.push(`An enemy tower came into sight at ${at(...e.XY(k))} at step ${step}.`);
      for (const k of tb) if (!v.tw[k] && see.has(k)) this.lines.push(`The enemy tower at ${at(...e.XY(k))} was destroyed at step ${step}, in your sight.`);
    }
    this.prev = v;
  }

  /** The summary, with the turn's kill reports (rulesets that report kills) and towers destroyed so far. */
  done(): string[] {
    const { e, s, me } = this, out = [...this.lines];
    if ((s as Settings & { killReports?: number }).killReports) {
      for (const x of (logOf(this.kills) ?? []).slice(this.kills0)) if (x.o === me) out.push(`Your glider destroyed an enemy tower at ${at(...e.XY(x.k))} at step ${x.step}.`);
      out.push(`Towers destroyed so far: you ${this.kills[me]}, the opponent ${this.kills[me === 'C' ? 'A' : 'C']}.`);
    }
    if (!out.length) out.push('Nothing came into or left your sight this turn.');
    return out.slice(0, 24);
  }
}
