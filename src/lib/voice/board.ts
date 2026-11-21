/**
 * The storyboard (Ephelion slice 2, overnight 2026-11-21; DRAFT): an accepted take's word timings become a strip; cuts
 * split it into shots; each shot gets the person's own description, a camera angle and sheets; one picture is kept per
 * shot; the play-through shows the kept pictures over the audio. Pure (no imports): the server, the page and the tests
 * share it.
 *
 * Principle 2: nothing here writes story words or a shot's description. The automatic cuts are placed at sentence ends
 * by a rule, and the notes are rule checks; no AI model is called. A shot's description is always the person's text,
 * passed through unchanged.
 */

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}
export interface TimedSentence {
  n: number;
  start: number;
  end: number;
}
/** The accepted performance as one timeline (the take with any redone sentences spliced in), in seconds. */
export interface Timeline {
  seconds: number;
  words: TimedWord[];
  sentences: TimedSentence[];
}

/**
 * Join the take's words with redone sentences: each redo replaces [start, end) of the take with its own clip (as the
 * player joins the audio), so everything after it moves by the difference in length.
 */
export function joinTimeline(
  take: { words: TimedWord[]; seconds: number },
  redos: { start: number; end: number; seconds: number; words: TimedWord[] }[],
): { seconds: number; words: TimedWord[] } {
  const sorted = [...redos].sort((a, b) => a.start - b.start);
  const out: TimedWord[] = [];
  let shift = 0;
  let cursor = 0;
  for (const r of sorted) {
    if (r.start < cursor) continue;
    for (const w of take.words) if (w.start >= cursor && w.start < r.start) out.push({ ...w, start: w.start + shift, end: w.end + shift });
    for (const w of r.words) out.push({ ...w, start: r.start + shift + w.start, end: r.start + shift + w.end });
    shift += r.seconds - (r.end - r.start);
    cursor = r.end;
  }
  for (const w of take.words) if (w.start >= cursor) out.push({ ...w, start: w.start + shift, end: w.end + shift });
  return { seconds: take.seconds + shift, words: out };
}

export const CAMERA_ANGLES = [
  { id: 'wide', label: 'Wide shot', text: 'a wide shot that shows the whole place' },
  { id: 'medium', label: 'Medium shot', text: 'a medium shot, framed from the waist up' },
  { id: 'close', label: 'Close-up', text: 'a close-up on the face' },
  { id: 'detail', label: 'Detail', text: 'a close detail of an object' },
  { id: 'over', label: 'Over the shoulder', text: 'an over-the-shoulder shot' },
  { id: 'low', label: 'Low angle', text: 'a low-angle shot looking up' },
  { id: 'high', label: 'High angle', text: 'a high-angle shot looking down' },
  { id: 'pov', label: 'Point of view', text: 'a point-of-view shot' },
] as const;
export type AngleId = (typeof CAMERA_ANGLES)[number]['id'];
export const angleById = (id: string) => CAMERA_ANGLES.find((a) => a.id === id) ?? null;

/** Shot lengths the automatic cuts aim for, and the notes' limits (seconds). */
export const SHOT = { target: 8, min: 2, max: 15 } as const;

/**
 * Proposed cuts, at sentence ends only: walk the sentences and cut once a shot has reached the target length, never
 * leaving a shot shorter than the minimum at the end. The person moves, adds or removes them.
 */
export function proposeCuts(t: Timeline, target: number = SHOT.target): number[] {
  const cuts: number[] = [];
  let from = 0;
  for (const s of t.sentences) {
    if (s.end - from >= target && t.seconds - s.end >= SHOT.min) {
      cuts.push(round(s.end));
      from = s.end;
    }
  }
  return cuts;
}

/** Snap a time to the nearest word end (where a cut can sit without cutting a word), or keep it if there are no words. */
export function snapToWordEnd(t: Timeline, at: number): number {
  let best = at;
  let d = Infinity;
  for (const w of t.words) {
    const e = Math.abs(w.end - at);
    if (e < d) {
      d = e;
      best = w.end;
    }
  }
  return round(best);
}

export interface Shot {
  /** Stable across saves: kept pictures are keyed by it. */
  key: string;
  start: number;
  end: number;
  /** The person's own words for what the shot shows. Never written by the site or an AI. */
  description: string;
  angle: AngleId | '';
  styleId: string | null;
  characterIds: string[];
  /** The sha256 of the picture kept for this shot, if any. */
  kept: string | null;
}

/** The shots between cuts, keeping what the person wrote for a shot whose span overlaps most (keys stay stable). */
export function shotsFromCuts(t: Timeline, cuts: number[], previous: Shot[] = []): Shot[] {
  const edges = [0, ...[...new Set(cuts.map(round))].filter((c) => c > 0 && c < t.seconds).sort((a, b) => a - b), round(t.seconds)];
  const used = new Set<string>();
  const out: Shot[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const start = edges[i];
    const end = edges[i + 1];
    let best: Shot | null = null;
    let bestOverlap = 0;
    for (const p of previous) {
      if (used.has(p.key)) continue;
      const o = Math.min(end, p.end) - Math.max(start, p.start);
      if (o > bestOverlap) {
        best = p;
        bestOverlap = o;
      }
    }
    if (best && bestOverlap >= (end - start) / 2) {
      used.add(best.key);
      out.push({ ...best, start, end });
    } else out.push({ key: newKey(out.map((s) => s.key).concat(previous.map((p) => p.key))), start, end, description: '', angle: '', styleId: null, characterIds: [], kept: null });
  }
  return out;
}

function newKey(taken: string[]): string {
  for (let i = 1; ; i++) if (!taken.includes(`s${i}`)) return `s${i}`;
}
const round = (x: number) => Math.round(x * 100) / 100;

/** The words a shot covers (shown under it; the speech's words, not the person's description). */
export const wordsIn = (t: Timeline, s: { start: number; end: number }) => t.words.filter((w) => w.start >= s.start - 0.01 && w.start < s.end - 0.01).map((w) => w.text).join(' ');

export interface Note {
  shot: string | null;
  kind: 'same-angle' | 'too-long' | 'too-short' | 'no-description' | 'no-angle' | 'no-picture';
  text: string;
}

/** Notes before spending: rule checks only (no AI model), and never a suggestion of what a shot should show. */
export function boardNotes(shots: Shot[]): Note[] {
  const notes: Note[] = [];
  shots.forEach((s, i) => {
    const n = i + 1;
    const len = s.end - s.start;
    if (len > SHOT.max) notes.push({ shot: s.key, kind: 'too-long', text: `Shot ${n} is ${len.toFixed(1)} seconds: a cut inside it would keep the pictures moving.` });
    if (len < SHOT.min) notes.push({ shot: s.key, kind: 'too-short', text: `Shot ${n} is only ${len.toFixed(1)} seconds.` });
    if (!s.description.trim()) notes.push({ shot: s.key, kind: 'no-description', text: `Shot ${n} has no description yet.` });
    if (!s.angle) notes.push({ shot: s.key, kind: 'no-angle', text: `Shot ${n} has no camera angle yet.` });
    if (!s.kept) notes.push({ shot: s.key, kind: 'no-picture', text: `Shot ${n} has no picture kept yet.` });
    if (i >= 2 && s.angle && s.angle === shots[i - 1].angle && s.angle === shots[i - 2].angle)
      notes.push({ shot: s.key, kind: 'same-angle', text: `Shots ${n - 2} to ${n} are all ${angleById(s.angle)?.label.toLowerCase()}s.` });
  });
  return notes;
}

/**
 * A shot's picture prompt: the person's description, word for word, then the camera and the chosen sheets' own texts.
 * Every part is shown to the person before it is used, and it is the recipe's prompt.
 */
export function shotPrompt(s: Pick<Shot, 'description' | 'angle'>, style: { title: string; text: string } | null, characters: { title: string; text: string }[]): string {
  const parts = [s.description.trim()];
  const a = angleById(s.angle);
  if (a) parts.push(`Camera: ${a.text}.`);
  if (characters.length) parts.push(`Characters: ${characters.map((c) => `${c.title}: ${c.text}`).join(' ')}`);
  if (style) parts.push(`Style: ${style.text}`);
  return parts.join('\n');
}

/** The shot showing at a time (the play-through). */
export const shotAt = (shots: Shot[], at: number) => shots.find((s) => at >= s.start && at < s.end) ?? shots[shots.length - 1] ?? null;
