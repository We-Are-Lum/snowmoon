/**
 * What a remix starts with (owner, 2026-11-04, item 4): everything defaults to the source's, so the least anyone does
 * is type a prompt and press Remix; each preselected option can be opened and changed on the form
 * (src/components/design-form.tsx). Pure: no network, no database; the form and scripts/test-challenge.ts read it.
 *
 * - The style: the source's, while it is still published; else the person's own style pick; else none (they choose).
 * - The reference picture: always the source's front view, when it has one (the server fetches it from our own
 *   bucket and records it in the front view's recipe; the publish route refuses a remix front made without it).
 * - The model: the open default. Hook for branch remix-model-choice (IMAGES.designs.modelChoice, off): once model
 *   choice ships, `modelFor` returns the source's model when it is still offered, so the remix starts on it.
 * - A moment (remix-moments, due 12 Nov): no moment, and nothing shown. Hook: `momentFor` returns the source's moment
 *   once moments ship.
 */
export const OPEN_DEFAULT_MODEL = 'open';

export interface RemixSource {
  /** The style the source's views were made in (body.style.version_id), if any. */
  style?: string | null;
  /** The source's front view, sent as the reference picture. */
  front?: { url: string; sha256: string } | null;
  /** The model the source's views were made with (its recipe's choice), for remix-model-choice. */
  model?: string | null;
  /** The source's moment, for remix-moments. */
  moment?: string | null;
}

export interface RemixDefaults {
  style: string | null;
  reference: { url: string; sha256: string } | null;
  model: string;
  moment: string | null;
}

/** The model a remix starts on: the open default until model choice ships; then the source's, when it is offered. */
export function modelFor(source: RemixSource, offered: readonly string[] = [], modelChoice = false): string {
  return modelChoice && source.model && offered.includes(source.model) ? source.model : OPEN_DEFAULT_MODEL;
}

/** The moment a remix starts with: none until moments ship (nothing is shown); then the source's. */
export function momentFor(source: RemixSource, momentsOn = false): string | null {
  return momentsOn ? (source.moment ?? null) : null;
}

export function remixDefaults(source: RemixSource | null, styles: readonly string[], myStyle: string | null = null, opts: { offeredModels?: readonly string[]; modelChoice?: boolean; momentsOn?: boolean } = {}): RemixDefaults {
  const style = source?.style && styles.includes(source.style) ? source.style : myStyle && styles.includes(myStyle) ? myStyle : null;
  return {
    style,
    reference: source?.front ?? null,
    model: source ? modelFor(source, opts.offeredModels, opts.modelChoice) : OPEN_DEFAULT_MODEL,
    moment: source ? momentFor(source, opts.momentsOn) : null,
  };
}
