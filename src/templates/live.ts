/**
 * Live voting screens: the slider moves and the screen responds. Nothing is stored or sent.
 *
 * A template that can go live returns a LiveSlider from `live(block)`. The template's HTML
 * stays the server render, exactly the source's state (the thumb where the source's untouched
 * slider sits); the client island (src/components/live-screen.tsx) puts a real range input
 * over the drawn track after it mounts, and a note with a Reset under the screen.
 *
 * What is the source's and what is this edition's (check:principles P8e):
 * - min, max, step, start: the source's own <input type="range"> with its HTML defaults
 *   (no attributes: 0..100, step 1, value at the middle). From the source.
 * - labels: the marks under the slider, in order, evenly spread (the source lays them out
 *   with space-between). From the source.
 * - The reading under the screen: where the thumb sits on those marks. Inferred: the book
 *   never shows a reading. With numeric marks (-5, 0, 5) it is the point on that scale, to
 *   one decimal; with other marks (the Dzego faces) it is the nearest mark.
 * - The Select button stays inert: pressing it would mean sending a vote.
 */

export interface LiveSlider {
  /** Accessible name: the screen's own title. */
  name: string;
  min: number;
  max: number;
  step: number;
  start: number;
  labels: string[];
}

/** New draft wording (the coding agent's, a closed model); one row each for the draft-wording doc. */
export const LIVE_WORDING = {
  note: 'Try the slider. Nothing is saved or sent.',
  reading: 'Slider at',
  reset: 'Reset',
  resetLabel: 'Reset the slider to where the book shows it',
  draftLine: 'Draft wording',
} as const;

/** HTML defaults for a range input with no attributes (the source's sliders have none). */
export const RANGE_DEFAULTS = { min: 0, max: 100, step: 1 } as const;

/** The HTML default value: the middle, snapped to the step. */
export function rangeDefaultValue(min: number, max: number, step: number): number {
  if (max < min) return min;
  return min + Math.round((max - min) / 2 / step) * step;
}

export function clamp(s: LiveSlider, v: number): number {
  const snapped = s.min + Math.round((v - s.min) / s.step) * s.step;
  return Math.min(s.max, Math.max(s.min, snapped));
}

/** 0..1 along the track. */
export function sliderFraction(s: LiveSlider, v: number): number {
  return s.max === s.min ? 0 : (clamp(s, v) - s.min) / (s.max - s.min);
}

const NUMERIC = /^[-+−]?\d+(\.\d+)?$/;
const num = (l: string) => Number(l.replace('−', '-'));

/**
 * Where the thumb sits on the screen's marks (inferred; see the header). Numeric marks:
 * the point on their scale, one decimal, "0" without a sign, "+1.2" and "-0.4" otherwise.
 * Other marks: the nearest one.
 */
export function sliderReading(s: LiveSlider, v: number): string {
  const f = sliderFraction(s, v);
  const ls = s.labels;
  if (ls.length >= 2 && ls.every((l) => NUMERIC.test(l))) {
    const lo = num(ls[0]);
    const hi = num(ls[ls.length - 1]);
    const x = Math.round((lo + f * (hi - lo)) * 10) / 10;
    return x === 0 ? '0' : `${x > 0 ? '+' : '-'}${Math.abs(x).toFixed(1)}`;
  }
  return ls[Math.round(f * (ls.length - 1))] ?? '';
}

/** The island's state. It starts at the source's value; Reset returns there. */
export type LiveAction = { type: 'set'; value: number } | { type: 'reset' };
export const initialValue = (s: LiveSlider) => s.start;
export function liveReducer(s: LiveSlider) {
  return (value: number, a: LiveAction): number => (a.type === 'reset' ? initialValue(s) : clamp(s, a.value));
}
