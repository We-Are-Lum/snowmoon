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
  // The scene's fourth camera (Nate, 2026-11-22): the same medium, from 30 degrees to his left (his front side of the line).
  { id: 'left', label: 'Medium, from his left', text: 'a medium shot, framed from the waist up, from 30 degrees to his left' },
  { id: 'close', label: 'Close-up', text: 'a close-up on the face' },
  { id: 'detail', label: 'Detail', text: 'a close detail of an object' },
  { id: 'over', label: 'Over the shoulder', text: 'an over-the-shoulder shot' },
  { id: 'low', label: 'Low angle', text: 'a low-angle shot looking up' },
  { id: 'high', label: 'High angle', text: 'a high-angle shot looking down' },
  { id: 'pov', label: 'Point of view', text: 'a point-of-view shot' },
] as const;
export type AngleId = (typeof CAMERA_ANGLES)[number]['id'];
export const angleById = (id: string) => CAMERA_ANGLES.find((a) => a.id === id) ?? null;

/** Shot lengths the automatic cuts aim for, the notes' limits (seconds), and at most 12 shots (Nate, 2026-11-21). */
export const SHOT = { target: 8, min: 2, max: 15, maxShots: 12 } as const;

/**
 * Proposed cuts, at sentence ends only: walk the sentences and cut once a shot has reached the target length, never
 * leaving a shot shorter than the minimum at the end. The person moves, adds or removes them.
 */
export function proposeCuts(t: Timeline, target: number = Math.max(SHOT.target, t.seconds / SHOT.maxShots)): number[] {
  const cuts: number[] = [];
  let from = 0;
  for (const s of t.sentences) {
    if (cuts.length < SHOT.maxShots - 1 && s.end - from >= target && t.seconds - s.end >= SHOT.min) {
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
  /**
   * An insert: a shot outside the scene (Nate, 2026-11-22), about what the speech says while his voice goes on. Only the
   * person makes one: a new shot is always in the scene. An insert sends neither the scene nor a previous shot.
   */
  insert?: boolean;
  /** Who set the camera: the coverage rule (until the person picks one), or the person. */
  angleBy?: 'rule' | 'person';
  /** The kept scene's sha256 the person confirmed this shot's kept picture with, after the scene was changed. */
  sceneConfirmed?: string | null;
}

/**
 * The scene (Nate, 2026-11-22, "a storyboard is one scene, shot as if with several cameras"): the person's own words for
 * the setting, and the establishing picture kept for it (a board picture under the key 'scene'). Every shot in the scene
 * sends it as a reference, with the look and the last kept shot in the scene.
 */
export interface Scene {
  setting: string;
  kept: string | null;
}
export const SCENE = { key: 'scene', angle: 'wide' as const } as const;
export const emptyScene = (): Scene => ({ setting: '', kept: null });

/**
 * The default camera coverage, as a multi-camera shoot would have (Nate, 2026-11-22; proposal v2, section 3): a rule,
 * no AI model. Five cameras, all on his front side of the line: A the wide master, B a medium, C a close-up, D the medium
 * from his left, E a low angle. The first and last shots in the scene get A; those between cycle B, C, D, C, E; a shot
 * of 4 seconds or less gets C (unless the shot before it is a C); no camera comes twice in a row. Inserts are skipped: the cycle runs over the shots in
 * the scene only. Only shots whose camera the person hasn't picked are filled in.
 */
export const COVERAGE = { name: 'scene-coverage', version: 1, cycle: ['medium', 'close', 'left', 'close', 'low'] as const, shortSeconds: 4 } as const;
export function coverageAngles(shots: Pick<Shot, 'start' | 'end' | 'insert'>[]): (AngleId | '')[] {
  const inScene = shots.map((s, i) => ({ s, i })).filter((x) => !x.s.insert);
  const out: (AngleId | '')[] = shots.map(() => '');
  let prev: AngleId | '' = '';
  inScene.forEach(({ s, i }, k) => {
    let a: AngleId;
    if (k === 0 || (k === inScene.length - 1 && inScene.length >= 3)) a = 'wide';
    else if (s.end - s.start <= COVERAGE.shortSeconds && prev !== 'close') a = 'close';
    else {
      // The cycle's camera for this place, or the next one in the cycle if it would repeat the shot before.
      let j = k - 1;
      a = COVERAGE.cycle[j % COVERAGE.cycle.length];
      while (a === prev) a = COVERAGE.cycle[++j % COVERAGE.cycle.length];
    }
    out[i] = a;
    prev = a;
  });
  return out;
}
/** Fill the rule's cameras into the shots the person hasn't set (inserts keep theirs, or none). */
export function applyCoverage<T extends Shot>(shots: T[]): T[] {
  const rule = coverageAngles(shots);
  return shots.map((s, i) => (s.insert || s.angleBy === 'person' ? s : { ...s, angle: rule[i], angleBy: 'rule' as const }));
}

/**
 * What a shot sends as reference pictures (proposal v2, sections 2 and 3b), in order:
 * - a shot in the scene: the kept scene and the look (the anchors, every time), then the last kept shot in the scene
 *   before it (continuity; never an insert); shot 1 has no previous shot;
 * - an insert: the look only if a character is chosen for it; never the scene, never a previous shot.
 */
export function shotReferences(shots: Shot[], key: string): { insert: boolean; scene: boolean; continuity: string | null } {
  const i = shots.findIndex((s) => s.key === key);
  const s = shots[i];
  if (!s) return { insert: false, scene: true, continuity: null };
  if (s.insert) return { insert: true, scene: false, continuity: null };
  const prev = shots.slice(0, i).reverse().find((x) => !x.insert && x.kept);
  return { insert: false, scene: true, continuity: prev?.key ?? null };
}
/** The one line a shot in the scene adds to its prompt, so the anchors are read as the same place and person. */
export const SAME_SCENE_LINE = 'The same place, light, clothes and person as the first reference pictures.';

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
    } else out.push({ key: newKey(out.map((s) => s.key).concat(previous.map((p) => p.key))), start, end, description: '', angle: '', angleBy: 'rule', insert: false, styleId: null, characterIds: [], kept: null });
  }
  // New shots (and shots the person hasn't set a camera for) take the default coverage.
  return applyCoverage(out);
}

function newKey(taken: string[]): string {
  for (let i = 1; ; i++) if (!taken.includes(`s${i}`)) return `s${i}`;
}
const round = (x: number) => Math.round(x * 100) / 100;

/** The words a shot covers (shown under it; the speech's words, not the person's description). */
export const wordsIn = (t: Timeline, s: { start: number; end: number }) => t.words.filter((w) => w.start >= s.start - 0.01 && w.start < s.end - 0.01).map((w) => w.text).join(' ');

export interface Note {
  shot: string | null;
  kind: 'same-angle' | 'too-long' | 'too-short' | 'no-description' | 'no-angle' | 'no-picture' | 'no-scene' | 'old-scene';
  text: string;
}

/**
 * Shots kept with an earlier scene than the one kept now (proposal v2: changing the kept scene marks them): a shot in the
 * scene whose kept picture's recipe names another scene picture, unless the person has confirmed it with this scene.
 * madeWith: each shot key's kept picture's scene sha256 (from its recipe).
 */
export function oldSceneShots(shots: Shot[], scene: Scene | null, madeWith: Record<string, string | null>): number[] {
  if (!scene?.kept) return [];
  return shots.flatMap((s, i) => (!s.insert && s.kept && madeWith[s.key] && madeWith[s.key] !== scene.kept && s.sceneConfirmed !== scene.kept ? [i] : []));
}

/** Notes before spending: rule checks only (no AI model), and never a suggestion of what a shot should show. */
export function boardNotes(shots: Shot[], scene: Scene | null = null, madeWith: Record<string, string | null> = {}): Note[] {
  const notes: Note[] = [];
  if (scene !== null && !scene.kept) notes.push({ shot: null, kind: 'no-scene', text: scene.setting.trim() ? 'The scene has no picture kept yet: shots in the scene need it first.' : 'The scene has no setting yet: write where he is, then make the scene.' });
  for (const i of oldSceneShots(shots, scene, madeWith)) notes.push({ shot: shots[i].key, kind: 'old-scene', text: `Shot ${i + 1} was made with an earlier scene: make it again, or keep it with this scene.` });
  shots.forEach((s, i) => {
    const n = i + 1;
    const len = s.end - s.start;
    if (len > SHOT.max) notes.push({ shot: s.key, kind: 'too-long', text: `Shot ${n} is ${len.toFixed(1)} seconds: a cut inside it would keep the pictures moving.` });
    if (len < SHOT.min) notes.push({ shot: s.key, kind: 'too-short', text: `Shot ${n} is only ${len.toFixed(1)} seconds.` });
    if (!s.description.trim()) notes.push({ shot: s.key, kind: 'no-description', text: `Shot ${n} has no description yet.` });
    if (!s.angle && !s.insert) notes.push({ shot: s.key, kind: 'no-angle', text: `Shot ${n} has no camera angle yet.` });
    if (!s.kept) notes.push({ shot: s.key, kind: 'no-picture', text: `Shot ${n} has no picture kept yet.` });
    if (i >= 2 && s.angle && !s.insert && s.angle === shots[i - 1].angle && s.angle === shots[i - 2].angle)
      notes.push({ shot: s.key, kind: 'same-angle', text: `Shots ${n - 2} to ${n} are all ${angleById(s.angle)?.label.toLowerCase()}s.` });
  });
  return notes;
}

/**
 * A shot's picture prompt: the person's description, word for word, then the camera and the chosen sheets' own texts.
 * Every part is shown to the person before it is used, and it is the recipe's prompt.
 */
export function shotPrompt(s: Pick<Shot, 'description' | 'angle'>, style: { title: string; text: string } | null, characters: { title: string; text: string }[], sameScene = false): string {
  const parts = [s.description.trim()];
  const a = angleById(s.angle);
  if (a) parts.push(`Camera: ${a.text}.`);
  if (sameScene) parts.push(SAME_SCENE_LINE);
  if (characters.length) parts.push(`Characters: ${characters.map((c) => `${c.title}: ${c.text}`).join(' ')}`);
  if (style) parts.push(`Style: ${style.text}`);
  return parts.join('\n');
}

/** The shot showing at a time (the play-through). */
export const shotAt = (shots: Shot[], at: number) => shots.find((s) => at >= s.start && at < s.end) ?? shots[shots.length - 1] ?? null;

/**
 * The speech's own sentences a shot covers (Nate, 2026-11-21: "the play-through shows the speech's own words, timed,
 * never the transcription's"). A sentence begins where the one before it ends (where "New shot starts here" puts a cut,
 * sentenceBoundaries), so it belongs to the shot that holds that point; its own heard start isn't used, as heard spans
 * can overlap. The words shown are the speech's text, never what was heard.
 */
export function sentencesIn(t: Timeline, s: { start: number; end: number }): number[] {
  return t.sentences.filter((x, i) => {
    const begins = i === 0 ? 0 : round(t.sentences[i - 1].end);
    return begins >= s.start - 0.35 && begins < s.end - 0.35;
  }).map((x) => x.n);
}
/** The sentence being spoken at a time (or the last one before it). */
export function sentenceAt(t: Timeline, at: number): number | null {
  let best: number | null = null;
  for (const x of t.sentences) if (x.start <= at + 0.01) best = x.n;
  return best;
}

/** Where a new shot can start on a phone: between each pair of sentences, at the first one's end. */
export const sentenceBoundaries = (t: Timeline) => t.sentences.slice(0, -1).map((x, i) => ({ after: x.n, before: t.sentences[i + 1].n, at: round(x.end) }));
/** The cut at a boundary, if there is one (a cut moved on the desktop strip counts when it is within a third of a second). */
export const cutNear = (cuts: number[], at: number) => cuts.find((c) => Math.abs(c - at) < 0.35) ?? null;

/** Why "Make the picture" can't be pressed, in one line (Nate, 2026-11-21), or null when it can. */
export function pictureBlocked(o: { real: boolean; standIn: boolean; description: string; angle: string; tries: number; maxTries: number; insert?: boolean; sceneKept?: boolean }): string | null {
  if (!o.real && !o.standIn) return 'Real pictures are off for now.';
  if (o.tries >= o.maxTries) return `No tries left for this shot (${o.maxTries} of ${o.maxTries} made): keep one of them.`;
  // A shot in the scene is made with the scene (Nate, 2026-11-22); an insert isn't.
  if (o.sceneKept === false && !o.insert) return 'No scene kept yet: make and keep the scene first (step 1).';
  if (!o.description.trim()) return 'No description yet: write what the shot shows first.';
  return null;
}
