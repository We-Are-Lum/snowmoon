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

/** A glider of the side's, followed from frame to frame. */
interface Story { label: string; events: string[]; end: string | null; seed: boolean; x: number; y: number; dx: number; dy: number; turns: number }
/** The static pieces a view shows, by kind: what a square holds. */
type Statics = Map<string, { o: Side; hp?: number; dx?: number; dy?: number }>;
const STATIC_NAME: Record<string, string> = { tw: 'tower', sq: 'square', mir: 'mirror', fa: 'factory', sd: 'resting symbol glider' };

/** The book-moment kinds the live page leads with (owner, 2026-11-04). */
export interface Moments { kills: { at: string; seed: boolean }[]; reported: string[]; lost: string[]; spotted: string[]; formed: string[] }

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
  private moments: Moments = { kills: [], reported: [], lost: [], spotted: [], formed: [] };
  /** Towers its side destroyed in its sight this turn, and towers it lost. */
  killsSeen = 0;
  lost = 0;

  /**
   * `before`: the board as the turn opens, before the placements appear. Then appear() once they have, and look() after
   * every step.
   */
  constructor(private e: Engine, private s: Settings, private me: Side, before: World, private kills: Kills, private placed: Placement<AnyPiece>[]) {
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
    for (const [key] of this.statics(this.prev, false)) this.named.add(key);
    for (const g of this.prev.gl) if (g.o === me) this.live.set(g.id, this.story(g, 'earlier'));
  }

  /** A line said first (e.g. that the person took the turn on the live page). */
  say(line: string) { this.opening.unshift(line); }

  private sight = (g: Pick<Glider, 'seed'>) => (g.seed ? this.s.symbolGliderSight ?? 0 : this.s.gliderSight ?? 0);
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

  /** Its own squares, mirrors, factories and resting symbol gliders: chipped or destroyed where it sees them. */
  private noteMine(v: World, see: Set<number>, step: number | null) {
    const now = this.statics(v, true);
    for (const [key, was] of this.mine) {
      const k = this.sqOf(key), kind = key.split('@')[0];
      if (kind === 'tw' || !see.has(k)) continue;
      const is = now.get(key);
      if (!is) { if (step !== null && kind !== 'sd') this.lines.push(`Your ${STATIC_NAME[kind]} at ${at(...this.e.XY(k))} was destroyed at step ${step}.`); this.mine.delete(key); }
      else if (step !== null && is.hp !== undefined && was.hp !== undefined && is.hp < was.hp) this.lines.push(`Your ${STATIC_NAME[kind]} at ${at(...this.e.XY(k))} was chipped at step ${step} (${is.hp} hit${is.hp === 1 ? '' : 's'} left).`);
    }
    for (const [key, is] of now) if (key.split('@')[0] !== 'tw') this.mine.set(key, is);
  }

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
    for (const g0 of v0.gl) {
      if (g0.o !== me) continue;
      const st = this.live.get(g0.id);
      if (!st) continue;
      const g1 = appearing ? g0 : sim.gl.find((g) => g.id === g0.id);
      if (g1) {
        const there = mineNow.find((g) => !taken.has(g.id) && g.x === g1.x && g.y === g1.y && !!g.seed === !!g0.seed);
        if (there) {
          taken.add(there.id);
          if ((there.dx !== st.dx || there.dy !== st.dy) && ++st.turns <= 3) st.events.push(`turned ${dir(there.dx, there.dy)} at ${at(there.x, there.y)} at step ${step}`);
          Object.assign(st, { x: there.x, y: there.y, dx: there.dx, dy: there.dy });
          next.set(there.id, st);
          continue;
        }
        // Not where the sandbox put it: out of sight if it could be, else stopped by something the view didn't show.
        const q = e.K(g1.x, g1.y);
        if (!this.sight(g0) && !see.has(q)) st.end = `left your sight at ${at(g0.x, g0.y)}, heading ${dir(g0.dx, g0.dy)}, at step ${step - 1}`;
        else st.end = this.reportedKill(g0, step) ?? `was destroyed near ${at(g1.x, g1.y)} at step ${step} (head-on, by something out of your sight)`;
        continue;
      }
      st.end = this.stopped(g0, v0, sim, simKills, step, see, v);
    }
    // Gliders new to its view: placed now, fired by its factory, or sent earlier and now in sight.
    for (const g of mineNow) {
      if (taken.has(g.id)) continue;
      const placedHere = appearing && this.placed.some((p) => (p.t === 'g' || p.t === 'e') && p.x === g.x && p.y === g.y);
      const fac = Object.keys(v.fa ?? {}).map(Number).find((k) => v.fa![k].o === me && e.XY(k)[0] + v.fa![k].dx === g.x && e.XY(k)[1] + v.fa![k].dy === g.y && v.fa![k].dx === g.dx && v.fa![k].dy === g.dy);
      const st = placedHere ? this.story(g, 'placed') : fac !== undefined && !appearing ? this.story(g, 'factory', fac) : this.story(g, 'earlier');
      if (!placedHere && fac === undefined) { st.label = `Your ${g.seed ? 'symbol glider' : 'glider'} sent earlier`; st.events.push(`came into sight at ${at(g.x, g.y)}, heading ${dir(g.dx, g.dy)}, at step ${step}`); }
      next.set(g.id, st);
    }
    this.live = next;
    // Placements that cancelled with the enemy's on the same square (both in reach, so in sight).
    if (appearing) for (const p of this.placed) {
      const k = e.K(p.x, p.y);
      const there = p.t === 'g' || p.t === 'e' ? v.gl.some((g) => g.o === me && g.x === p.x && g.y === p.y) : p.t === 's' ? v.sq[k]?.o === me : p.t === 't' ? v.tw[k] === me : p.t === 'm' ? v.mir?.[k]?.o === me : p.t === 'f' ? v.fa?.[k]?.o === me : (v.mw ?? []).some((m) => m.o === me && m.x === p.x && m.y === p.y);
      if (!there) this.lines.push(`Your ${(NAME[p.t] ?? [p.t])[0]} at ${at(p.x, p.y)} didn't appear: the enemy placed on the same square, and the two cancelled out.`);
    }
    // ---- its own pieces ----
    this.noteMine(v, see, step);
    const towers0 = new Set(e.towers(v0, me)), towers1 = new Set(e.towers(v, me));
    for (const k of towers0) if (!towers1.has(k)) {
      if (appearing && v0.fs?.[k]?.o === me) this.lines.push(`Your symbol at ${name(k)} wasn't walled in, so it is gone.`);
      else { this.lines.push(`You lost your tower at ${name(k)} at step ${step}.`); this.lost++; this.moments.lost.push(name(k)); }
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
      if (kind === 'tw' && appearing) this.lines.push(`The enemy's symbol at ${name(k)} wasn't walled in, so it is gone.`);
      else this.lines.push(`The enemy ${STATIC_NAME[kind]} at ${name(k)} was destroyed at step ${step}, in your sight.`);
    }
    for (const m of v.mw ?? []) {
      if (m.o === me) continue;
      const cells = e.wallCells(m).filter(([x, y], i) => m.c[i] && e.inb(x, y)), key = `mw@${m.dx},${m.dy}@${m.dx ? m.y : m.x}`;
      if (this.named.has(key)) continue;
      this.named.add(key);
      this.lines.push(`${appearing && cells.some(([x, y]) => this.prevSee.has(e.K(x, y))) ? 'The enemy placed a moving wall' : 'An enemy moving wall came into sight'} at ${cells.map(([x, y]) => at(x, y)).join(', ')}, moving ${dir(m.dx, m.dy)}${appearing ? '' : `, at step ${step}`}.`);
    }
    // Enemy gliders: by where the step took them in the sandbox.
    const theirG = v.gl.filter((g) => g.o !== me), matched = new Set<number>();
    for (const g0 of v0.gl) {
      if (g0.o === me) continue;
      const g1 = appearing ? g0 : sim.gl.find((g) => g.id === g0.id);
      if (!g1) continue;
      const there = theirG.find((g) => !matched.has(g.id) && g.x === g1.x && g.y === g1.y);
      if (there) { matched.add(there.id); continue; }
      if (!see.has(e.K(g1.x, g1.y)) && left(g1.x, g1.y)) this.lines.push(`An enemy ${g0.seed ? 'symbol glider' : 'glider'} left your sight at ${at(g0.x, g0.y)}, heading ${dir(g0.dx, g0.dy)}, at step ${step - 1}.`);
    }
    for (const g of theirG) {
      if (matched.has(g.id)) continue;
      const fac = Object.keys(v.fa ?? {}).map(Number).find((k) => v.fa![k].o !== me && e.XY(k)[0] + v.fa![k].dx === g.x && e.XY(k)[1] + v.fa![k].dy === g.y && v.fa![k].dx === g.dx && v.fa![k].dy === g.dy);
      if (fac !== undefined && !appearing) { this.factoryFired.set(fac, [...(this.factoryFired.get(fac) ?? []), step]); continue; }
      const k = e.K(g.x, g.y);
      this.lines.push(appearing && this.prevSee.has(k) ? `The enemy launched a ${g.seed ? 'symbol glider' : 'glider'} at ${at(g.x, g.y)}, heading ${dir(g.dx, g.dy)}.` : `An enemy ${g.seed ? 'symbol glider' : 'glider'} came into sight at ${at(g.x, g.y)}, heading ${dir(g.dx, g.dy)}, at step ${step}.`);
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
  private stopped(g: Glider, v0: World, sim: World, simKills: Kills, step: number, see: Set<number>, v: World): string {
    const { e, s, me } = this;
    const off = !e.inb(g.x + g.dx, g.y + g.dy);
    if (off && s.edges === 'vanish') return `flew off the board at step ${step}`;
    const n = off ? e.K(g.x, g.y) : e.K(g.x + g.dx, g.y + g.dy), [nx, ny] = e.XY(n), there = at(nx, ny);
    // A tower destroyed: in the sandbox, and (book-4) in the kill reports, or in sight now.
    if ((simKills.log ?? []).some((x) => x.o === me && x.k === n)) {
      const reported = (logOf(this.kills) ?? []).slice(this.kills0).some((x) => x.o === me && x.k === n && x.step === step);
      if (this.s.killReports ? reported : see.has(n) && !v.tw[n]) return this.kill(g, n, step);
      return this.sight(g) || see.has(n) ? `was destroyed near ${there} at step ${step}` : `left your sight at ${at(g.x, g.y)}, heading ${dir(g.dx, g.dy)}, at step ${step - 1}`;
    }
    // Head-on: another glider the earlier view showed was stopped with it, on a meeting square.
    const tgt = (h: Glider) => (e.inb(h.x + h.dx, h.y + h.dy) ? [h.x + h.dx, h.y + h.dy] : [h.x, h.y]);
    const [ax, ay] = tgt(g);
    const met = v0.gl.find((h) => h.id !== g.id && (h.o !== g.o || s.sameSide !== 'pass') && !sim.gl.some((x) => x.id === h.id) && (() => { const [bx, by] = tgt(h); return (bx === ax && by === ay) || (2 * g.x + (ax - g.x) === 2 * h.x + (bx - h.x) && 2 * g.y + (ay - g.y) === 2 * h.y + (by - h.y)); })());
    if (met) return `was destroyed head-on with ${met.o === me ? 'another of your gliders' : `an enemy ${met.seed ? 'symbol glider' : 'glider'}`} at step ${step}, near ${at(g.x, g.y)}`;
    // Came to rest (and maybe joined two others in a symbol, which takes the three resting gliders away).
    const formed = Object.keys(sim.fs ?? {}).map(Number).find((k) => sim.fs![k].o === me && sim.fs![k].at === step - 1 && Math.abs(e.XY(k)[0] - g.x) <= 2 && Math.abs(e.XY(k)[1] - g.y) <= 2);
    if (g.seed && (sim.sd?.[e.K(g.x, g.y)] === me || formed !== undefined)) {
      return formed !== undefined ? `came to rest at ${at(g.x, g.y)} at step ${step} and formed your symbol at ${at(...e.XY(formed))}` : `came to rest at ${at(g.x, g.y)} at step ${step}`;
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
    const { e, s, me } = this, out = [...this.opening];
    // Gliders sent earlier that only flew on (book-4's symbol gliders bounce off the edges for many turns): one line.
    const quiet = this.stories.filter((st) => st.end === null && st.label.includes('as the turn opened') && st.events.every((x) => x.startsWith('turned')));
    for (const st of this.stories) {
      if (quiet.length > 1 && quiet.includes(st)) continue;
      const end = st.end ?? `still flying at ${at(st.x, st.y)}, heading ${dir(st.dx, st.dy)}`;
      const more = st.turns > 3 ? [`turned ${st.turns - 3} more time${st.turns - 3 === 1 ? '' : 's'}`] : [];
      out.push(`${st.label}: ${[...st.events, ...more, end].join('; ')}.`);
    }
    if (quiet.length > 1) out.push(`${quiet.length} of your ${quiet.every((x) => x.seed) ? 'symbol gliders' : 'gliders'} sent earlier are still flying, now at ${(() => { const xs = quiet.map((x) => `${at(x.x, x.y)} heading ${dir(x.dx, x.dy)}`); return xs.length > 6 ? `${xs.slice(0, 5).join(', ')} and ${xs.length - 5} more` : and(xs); })()}.`);
    out.push(...this.lines);
    for (const [k, steps] of this.factoryFired) {
      const f = this.prev.fa?.[k];
      out.push(`The enemy factory at ${at(...e.XY(k))} fired ${steps.length === 1 ? 'a glider' : `${steps.length} gliders`}${f ? ` ${dir(f.dx, f.dy)}` : ''} at step${steps.length === 1 ? '' : 's'} ${and(steps.map(String))}.`);
    }
    if (s.killReports) {
      this.moments.reported = [];
      for (const x of (logOf(this.kills) ?? []).slice(this.kills0)) {
        if (x.o !== me || this.claimed.has(`tw@${x.k}@${x.step}`)) continue;
        out.push(`Kill report: your side destroyed the enemy tower at ${at(...e.XY(x.k))} at step ${x.step}, out of your sight.`);
        this.moments.reported.push(at(...e.XY(x.k)));
      }
      out.push(`Towers destroyed so far: you ${this.kills[me]}, the opponent ${this.kills[me === 'C' ? 'A' : 'C']}.`);
    }
    if (out.length === this.opening.length) out.push('Nothing came into or left your sight this turn.');
    return out.length > MAX_LINES ? [...out.slice(0, MAX_LINES - 1), `… and ${out.length - MAX_LINES + 1} more lines.`] : out;
  }

  /**
   * The turn's big moments for the live page (owner, 2026-11-04): towers destroyed (in sight, or by kill report), towers
   * lost, enemy towers spotted (and not destroyed in the same turn), symbols formed; up to `n`, the most important
   * first. Call after done().
   */
  big(n = 3): string[] {
    const m = this.moments, out: string[] = [];
    const list = (xs: string[]) => (xs.length > 4 ? `${xs.slice(0, 3).join(', ')} and ${xs.length - 3} more` : and(xs));
    if (m.kills.length) {
      const seeds = m.kills.filter((x) => x.seed).length, who = seeds === m.kills.length ? 'symbol glider' : seeds ? '' : 'glider';
      out.push(m.kills.length === 1 ? `Your ${who} destroyed the enemy tower at ${m.kills[0].at}.` : `Your ${who ? `${who}s` : 'gliders and symbol gliders'} destroyed ${m.kills.length} enemy towers: ${list(m.kills.map((x) => x.at))}.`);
    }
    if (m.reported.length) out.push(`${m.reported.length === 1 ? 'An enemy tower' : `${m.reported.length} enemy towers`} destroyed out of your sight (kill report): ${list(m.reported)}.`);
    if (m.lost.length) out.push(m.lost.length === 1 ? `You lost your tower at ${m.lost[0]}.` : `You lost ${m.lost.length} towers: ${list(m.lost)}.`);
    const gone = new Set([...m.kills.map((x) => x.at), ...m.reported]), spotted = m.spotted.filter((x) => !gone.has(x));
    if (spotted.length) out.push(spotted.length === 1 ? `Enemy tower spotted at ${spotted[0]}.` : `${spotted.length} enemy towers spotted: ${list(spotted)}.`);
    if (m.formed.length) out.push(`Your symbol formed a tower at ${and(m.formed)}.`);
    return out.slice(0, n);
  }
}
