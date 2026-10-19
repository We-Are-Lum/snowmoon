/**
 * A draft adaptation as the person writes it: their idea, their beats, and their text storyboard. Every word in it is
 * the person's own; the assistant's notes are never saved into it. Pure (no server code), so the page, the routes and
 * the tests share it.
 */
export const SHOT_TYPES = ['wide', 'mid', 'close-up', 'extreme close-up', 'over the shoulder', 'two-shot', 'insert', 'point of view'] as const;
export type ShotType = (typeof SHOT_TYPES)[number];

export interface Shot {
  /** Which beat (0-based) the shot belongs to. */
  beat: number;
  type: ShotType;
  /** Who's in frame, in the person's words. */
  who: string;
  /** What we see. */
  see: string;
  /** The line, if any: the person's own words, or the book's. */
  line: string;
}

export interface Draft {
  title: string;
  /** The idea, in the person's own words. */
  idea: string;
  /** The chapters it draws on, for the spoiler limit and for citing the book. */
  upTo: number;
  beats: string[];
  shots: Shot[];
}

export const MAKE = {
  titleMax: 120,
  ideaMax: 2000,
  beatMax: 600,
  beatsMax: 24,
  fieldMax: 400,
  shotsMax: 120,
  /** Drafts per person. */
  draftsMax: 20,
  /** One message to the assistant. */
  messageMax: 1500,
};

export class DraftError extends Error {}

const text = (v: unknown, max: number, what: string): string => {
  const s = typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : '';
  if (s.length > max) throw new DraftError(`${what}: keep it under ${max} characters.`);
  return s;
};

export function cleanDraft(raw: unknown): Draft {
  const d = (raw ?? {}) as Record<string, unknown>;
  const upTo = Number(d.upTo ?? 32);
  if (!Number.isInteger(upTo) || upTo < 1 || upTo > 32) throw new DraftError('Chapters: pick 1 to 32.');
  const beatsRaw = Array.isArray(d.beats) ? d.beats : [];
  if (beatsRaw.length > MAKE.beatsMax) throw new DraftError(`At most ${MAKE.beatsMax} beats.`);
  const beats = beatsRaw.map((b, i) => text(b, MAKE.beatMax, `Beat ${i + 1}`));
  const shotsRaw = Array.isArray(d.shots) ? d.shots : [];
  if (shotsRaw.length > MAKE.shotsMax) throw new DraftError(`At most ${MAKE.shotsMax} shots.`);
  const shots = shotsRaw.map((s, i): Shot => {
    const o = (s ?? {}) as Record<string, unknown>;
    const beat = Number(o.beat);
    if (!Number.isInteger(beat) || beat < 0 || beat >= Math.max(beats.length, 1)) throw new DraftError(`Shot ${i + 1}: pick one of the beats.`);
    const type = String(o.type) as ShotType;
    if (!SHOT_TYPES.includes(type)) throw new DraftError(`Shot ${i + 1}: pick a shot type.`);
    return { beat, type, who: text(o.who, MAKE.fieldMax, `Shot ${i + 1}, who's in frame`), see: text(o.see, MAKE.fieldMax, `Shot ${i + 1}, what we see`), line: text(o.line, MAKE.fieldMax, `Shot ${i + 1}, the line`) };
  });
  return { title: text(d.title, MAKE.titleMax, 'Title'), idea: text(d.idea, MAKE.ideaMax, 'The idea'), upTo, beats, shots };
}

export const emptyDraft = (): Draft => ({ title: '', idea: '', upTo: 32, beats: [], shots: [] });

/** Everything the person wrote, one string: what the no-writing check lets the assistant quote back. */
export function ownWords(d: Draft, extra: string[] = []): string {
  return [d.title, d.idea, ...d.beats, ...d.shots.flatMap((s) => [s.who, s.see, s.line]), ...extra].join('\n');
}
