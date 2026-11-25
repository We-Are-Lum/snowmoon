/**
 * Three ways in (Nate, 2026-11-24; branch voice-three-ways; words reread 2026-11-24): the first screen of the Ephelion challenge offers
 * three ways to make a storyboard.
 *
 * - From scratch: your speech (recorded, or a ready-made reading) and your own pictures, as before.
 * - New pictures for an existing recording: a ready-made reading now, and published takes once publishing is on, each
 *   credited to its performer.
 * - Your voice over an existing storyboard: pick one (team-made, or published and credited), record your take, then make
 *   each picture shorter or longer to fit, by dragging or by asking the guide ("make shot 3 longer").
 *
 * Pure (no imports but the board's): the server, the pages and the tests share it. Nothing here writes story words: a
 * reused storyboard keeps its pictures and their recipes as they are, and only the timing of each shot changes, by a rule
 * (fitShots, nudgeShot) the person moves on from. The guide's part is only to propose a timing change, which the person
 * accepts; it never writes a description, a prompt or the speech's words.
 */
import { SHOT, snapToWordEnd, type Shot, type Timeline } from './board';

export type WayId = 'scratch' | 'pictures' | 'voice';

/**
 * The three choices' words: reread by Nate on 2026-11-24, with his changes to way 1 ("Record the speech yourself, then
 * make your own pictures."; "Everything is yours: the performance, the cuts, the scene and every picture.").
 */
export const WAYS: readonly { id: WayId; title: string; line: string; more: string }[] = [
  {
    id: 'scratch',
    title: 'Start from scratch',
    line: 'Record the speech yourself, then make your own pictures.',
    more: 'Everything is yours: the performance, the cuts, the scene and every picture.',
  },
  {
    id: 'pictures',
    title: 'New pictures for a recording',
    line: 'Pick a recording that already exists and storyboard it with your own pictures.',
    more: 'Ready-made readings now; published takes once publishing opens, each credited to its performer.',
  },
  {
    id: 'voice',
    title: 'Your voice over a storyboard',
    line: 'Pick a storyboard, record your take, then make each picture shorter or longer to fit your voice.',
    more: 'Team-made storyboards now; published ones once publishing opens, each credited to its maker.',
  },
];
export const WAYS_HEADING = 'Three ways in';

/** Where a reused storyboard came from: kept with the new board (voice_boards.source) and shown in its credits. */
export interface BoardSource {
  kind: 'team' | 'published';
  /** The storyboard's own draft and maker (the person whose board it was), and the version reused. */
  draftId: string;
  fid: number;
  version: number;
  /** For a published one: the publication. */
  publicationId: string | null;
  /** The maker's name as shown when it was reused (null: not named at their wish). */
  by: string | null;
  title: string;
}

const round = (x: number) => Math.round(x * 100) / 100;

/** The cut points between shots (each shot's end but the last). */
export const cutsOf = (shots: Pick<Shot, 'end'>[]) => shots.slice(0, -1).map((s) => round(s.end));

/**
 * Fit a storyboard's shots to a new take: the same shots, in the same order, with the same pictures; only where each one
 * starts and ends changes. When the source's cuts sit at sentence ends and the new take has those sentences (a word for
 * word take), each cut moves to the same sentence's end in the new take. Otherwise (an improvised take, or cuts inside a
 * sentence) the cuts keep their share of the length, snapped to a word's end. No shot is left shorter than SHOT.min.
 */
export function fitShots(source: Shot[], from: Timeline, to: Timeline): { cuts: number[]; shots: Shot[]; by: 'sentences' | 'length' } {
  const n = source.length;
  if (!n) return { cuts: [], shots: [], by: 'length' };
  const srcCuts = cutsOf(source);
  const bySentence = srcCuts.map((c) => {
    const s = from.sentences.find((x) => Math.abs(x.end - c) < 0.35);
    const t = s ? to.sentences.find((x) => x.n === s.n) : undefined;
    return t ? round(t.end) : null;
  });
  let by: 'sentences' | 'length' = 'sentences';
  let cuts: number[];
  if (bySentence.every((c): c is number => c !== null) && valid(bySentence, to.seconds)) cuts = bySentence as number[];
  else {
    by = 'length';
    cuts = srcCuts.map((c) => (to.words.length ? snapToWordEnd(to, (c / from.seconds) * to.seconds) : round((c / from.seconds) * to.seconds)));
    cuts = spread(cuts, to.seconds);
  }
  const edges = [0, ...cuts, round(to.seconds)];
  return { cuts, by, shots: source.map((s, i) => ({ ...s, start: edges[i], end: edges[i + 1] })) };
}

/** Cuts are strictly increasing and leave every shot at least SHOT.min long. */
function valid(cuts: number[], seconds: number): boolean {
  const e = [0, ...cuts, seconds];
  for (let i = 1; i < e.length; i++) if (e[i] - e[i - 1] < SHOT.min - 1e-6) return false;
  return true;
}

/** Push cuts apart so every shot is at least SHOT.min long (or as long as the take allows, shared evenly). */
function spread(cuts: number[], seconds: number): number[] {
  if (valid(cuts, seconds)) return cuts;
  const n = cuts.length + 1;
  const min = Math.min(SHOT.min, seconds / n);
  const out: number[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const lo = (out[i - 1] ?? 0) + min;
    const hi = seconds - (cuts.length - i) * min;
    out.push(round(Math.min(Math.max(cuts[i], lo), hi)));
  }
  return out;
}

/** How far "longer" or "shorter" moves a shot's edge by default, in seconds (the guide may say how much). */
export const NUDGE = { seconds: 1.5, min: 0.3, max: 10 } as const;

/**
 * Make one shot longer or shorter: its end moves (or, for the last shot, its start), to the nearest word's end that
 * keeps every shot at least SHOT.min long. The neighbour gives or takes the time. Null when it can't move that way.
 */
export function nudgeShot(t: Timeline, shots: Shot[], key: string, change: 'longer' | 'shorter', seconds: number = NUDGE.seconds): number[] | null {
  const i = shots.findIndex((s) => s.key === key);
  if (i < 0 || shots.length < 2) return null;
  const cuts = cutsOf(shots);
  const last = i === shots.length - 1;
  const c = last ? i - 1 : i;
  // Longer: the end moves later (the last shot: its start moves earlier). Shorter: the other way.
  const dir = (change === 'longer' ? 1 : -1) * (last ? -1 : 1);
  const lo = (cuts[c - 1] ?? 0) + SHOT.min;
  const hi = (cuts[c + 1] ?? t.seconds) - SHOT.min;
  const want = cuts[c] + dir * Math.min(Math.max(seconds, NUDGE.min), NUDGE.max);
  const ends = t.words.map((w) => round(w.end)).filter((e) => e >= lo - 1e-6 && e <= hi + 1e-6 && (dir > 0 ? e > cuts[c] + 0.05 : e < cuts[c] - 0.05));
  let at: number | null = null;
  if (ends.length) at = ends.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
  else if (!t.words.length) {
    const x = round(Math.min(Math.max(want, lo), hi));
    if ((dir > 0 && x > cuts[c] + 0.05) || (dir < 0 && x < cuts[c] - 0.05)) at = x;
  }
  if (at === null) return null;
  const out = [...cuts];
  out[c] = at;
  return out;
}

/** A reused storyboard's shots at new cuts, kept in order (by position, never by overlap), or null if the cuts don't fit. */
export function retimed(shots: Shot[], cuts: number[], seconds: number): Shot[] | null {
  const c = [...cuts].map(round).sort((a, b) => a - b);
  if (c.length !== shots.length - 1 || !valid(c, seconds)) return null;
  const edges = [0, ...c, round(seconds)];
  return shots.map((s, i) => ({ ...s, start: edges[i], end: edges[i + 1] }));
}

/**
 * On a reused storyboard only the timing may change (Nate, 2026-11-24): the same shots in the same order, each with the
 * same picture, words, camera, style, characters and insert as saved. What a save may not change, or [] if nothing.
 */
export function reusedProblems(saved: Shot[], given: Shot[]): string[] {
  if (given.length !== saved.length) return [`a reused storyboard keeps its ${saved.length} shots: only their timing changes`];
  const out: string[] = [];
  given.forEach((g, i) => {
    const s = saved[i];
    if (g.key !== s.key) out.push(`shot ${i + 1} is not the same shot`);
    else if (g.kept !== s.kept || g.description !== s.description || g.angle !== s.angle || g.styleId !== s.styleId || (g.insert ?? false) !== (s.insert ?? false) || g.characterIds.join() !== s.characterIds.join())
      out.push(`shot ${i + 1}'s picture, words or camera changed: on a reused storyboard only the timing changes`);
  });
  return out;
}

/** A guide's timing proposal (the guide step 'timing'): which shot, longer or shorter, and by how much. */
export interface TimingDraft {
  timing: { shot: number; change: 'longer' | 'shorter'; seconds: number };
}

/** Read the shot number and direction from plain words ("make shot 3 longer"), for the stand-in guide and tests. */
export function timingFromWords(text: string): { shot: number; change: 'longer' | 'shorter'; seconds: number } | null {
  const m = text.toLowerCase().match(/shot\s*(\d{1,2})\b[^.]*?\b(longer|shorter|extend|lengthen|shorten|trim)\b/) ?? text.toLowerCase().match(/\b(longer|shorter|extend|lengthen|shorten|trim)\b[^.]*?shot\s*(\d{1,2})\b/);
  if (!m) return null;
  const [num, word] = /\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
  const s = text.match(/(\d+(?:\.\d+)?)\s*(?:s\b|sec|second)/i);
  return { shot: Number(num), change: /longer|extend|lengthen/.test(word) ? 'longer' : 'shorter', seconds: s ? Math.min(Math.max(Number(s[1]), NUDGE.min), NUDGE.max) : NUDGE.seconds };
}
