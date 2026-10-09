/**
 * Whose words a screen shows. Screens the owner (FID 6786) has written or approved carry
 * `data-wording="FID 6786"` and no "Draft wording" line; the rest stay labelled draft.
 * Decisions, by row of the draft-wording doc: docs/prompts/011-wording-decisions.md.
 */
export const OWNER_WORDING = { by: 'FID 6786', on: '2026-10-08', log: 'docs/prompts/011-wording-decisions.md' } as const;

/** New draft wording on the image screens (restyle, step 3), one row per string for the draft-wording doc. */
export { IMAGE_WORDING_ROWS } from './images/wording';
