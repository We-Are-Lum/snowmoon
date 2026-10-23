import { IMAGES } from '../config';

/**
 * What a Pictures Generate reserves, the one place both the composer's price and the charge come from (owner,
 * 2026-10-23: "If a pick raises the price, the Generate price must include it"). A picked style or sheet adds text
 * only: the same model, the same picture size, so the same worst case. Reference pictures (a picked sheet's views,
 * when the person asks) switch to the edit model, whose worst case grows with each picture sent.
 * No server-only imports: the composer uses it too.
 */

/** How many reference pictures a Generate sends: each chosen sheet's views (front, side, back) in turn, up to IMAGES.maxReferences. */
export const referenceCount = (viewsPerSheet: number[]): number => Math.min(IMAGES.maxReferences, viewsPerSheet.reduce((a, n) => a + Math.max(0, n), 0));

/** A Generate's worst case, reserved before it: text to image, or the edit model with this many reference pictures. */
export const generateReserveUsd = (references: number): number => (references > 0 ? IMAGES.editReserveUsd(references) : IMAGES.reserveUsd);

/** How many Generates a balance pays for at this price, counted in millionths of a dollar so $0.018 / $0.009 is 2. */
export const paysFor = (balanceUsd: number, priceUsd: number): number => (priceUsd > 0 ? Math.max(0, Math.floor(Math.round(balanceUsd * 1e6) / Math.round(priceUsd * 1e6))) : 0);
