import { IMAGES } from '../config';
import { modelTerms } from './recipe-lines';
import { MODEL_NOTICES } from '../legal';
import { sheetModelsOffered, type SheetModel } from './sheet-models';

/**
 * The remix form's model picker (branch remix-model-choice): only on a character sheet's remix (fork), only while
 * IMAGES.designs.modelChoice is on; otherwise undefined and the form shows no picker. Each label is read from
 * config/models.json ("open weights, Apache-2.0", "a closed model by Google"); the open default first.
 */
export function modelChoicesFor(mode: string, kind: string, on: boolean = IMAGES.designs.modelChoice) {
  if (!on || mode !== 'fork' || kind !== 'character') return undefined;
  return sheetModelsOffered(on).map((m) => ({ id: m.id, name: m.name, terms: choiceTerms(m), open: m.open, maker: m.maker, perRemixUsd: perRemixUsd(m), retention: retentionLabel(m) }));
}

/** A closed model's retention label (MODEL_NOTICES, legal.ts), shown beside it in the picker always; null for the open models. */
export function retentionLabel(m: SheetModel): string | null {
  return m.open || !m.maker ? null : (MODEL_NOTICES[m.maker as keyof typeof MODEL_NOTICES]?.label ?? null);
}

/** The label for a choice: the front's model's, and the views' too when they differ (the open default: both open). */
export function choiceTerms(m: SheetModel): string {
  const a = modelTerms(m.front.id), b = modelTerms(m.views.id);
  return a === b ? a : `${a}; ${b}`;
}

/** Three views (front, side, back) at today's estimates, plus their three prompt checks at the recorded typical cost. */
export const GUARD_TYPICAL_USD = 0.00015;
export const perRemixUsd = (m: SheetModel): number => m.estimateUsd.front + 2 * m.estimateUsd.view + 3 * GUARD_TYPICAL_USD;
