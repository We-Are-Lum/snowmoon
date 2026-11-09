/**
 * The remix screen's Style row (owner, 2026-11-08, the simpler challenge): what a person may pick, and how a style's
 * words reach the prompt. Plain data and pure functions, so scripts/test-challenge-moments.ts proves them; the
 * published styles themselves are read on the server (src/lib/challenge/make.ts, publishedStyles).
 *
 * The row, in order:
 * - the presets (STYLE_PRESETS): this edition's own short style lines, each describing qualities only, never a studio,
 *   film or artist. EMPTY for now: the owner picks which presets ship after test pictures (owner, 2026-11-08), and the
 *   coordinator sends the chosen texts. A test runs every preset's label and prompt through the same blocked-name check
 *   and prompt-check stand-in as "Write your own".
 * - the site's published styles (studio.entities kind 'style' with a published design), kept as they are;
 * - "Random": the server draws one of the published styles at make time, uniformly (P5g's exception for it:
 *   `shuffleFresh(published)` in src/lib/challenge/make.ts only, on the whole list); the recipe records both "Random"
 *   and the style drawn;
 * - "Write your own": a short text, at most OWN_STYLE_MAX characters, checked by the prompt check with the rest of the
 *   prompt (no named artists, studios, films or real people), even when the change words are empty.
 * Every style's text is followed by KEEP_LINE, exactly (owner, 2026-11-08).
 */

/** After every style's text, exactly (owner, 2026-11-08; the words of 2026-11-09, after the look test). */
export const KEEP_LINE = 'Keep the face recognisable; change anything else the words describe.';

/** "Write your own": at most this many characters. */
export const OWN_STYLE_MAX = 120;

/** A preset: this edition's own words, qualities only (no studio, film or artist name). */
export interface StylePreset {
  id: string;
  label: string;
  prompt: string;
}

/** EMPTY until the owner picks which presets ship (owner, 2026-11-08). Don't add texts here without his choice. */
export const STYLE_PRESETS: readonly StylePreset[] = [];

/** One choice in the row as the screen shows it: a preset or a published style. Random and Write your own are not listed here. */
export interface StyleOption {
  /** "preset:<id>" or "style:<design element id>". */
  id: string;
  kind: 'preset' | 'published';
  label: string;
}

/** What the screen sends: one of the listed styles, Random, or the person's own words. */
export type StyleChoice = { kind: 'style'; id: string } | { kind: 'random' } | { kind: 'own'; text: string };

/** Reads the request's style; null when it isn't one of the three shapes (the route then refuses it). */
export function readStyleChoice(x: unknown): StyleChoice | { error: 'own-empty' | 'own-long' } | null {
  const o = (x && typeof x === 'object' ? x : {}) as { kind?: unknown; id?: unknown; text?: unknown };
  if (o.kind === 'random') return { kind: 'random' };
  if (o.kind === 'style' && typeof o.id === 'string' && /^(preset|style):[A-Za-z0-9_.-]{1,64}$/.test(o.id)) return { kind: 'style', id: o.id };
  if (o.kind === 'own') {
    const text = typeof o.text === 'string' ? o.text.trim().replace(/\s+/g, ' ') : '';
    if (!text) return { error: 'own-empty' };
    if (text.length > OWN_STYLE_MAX) return { error: 'own-long' };
    return { kind: 'own', text };
  }
  return null;
}

export const presetOptions = (presets: readonly StylePreset[] = STYLE_PRESETS): StyleOption[] => presets.map((p) => ({ id: `preset:${p.id}`, kind: 'preset', label: p.label }));
