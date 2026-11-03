import type { SheetHelpMark } from '../element-body';
import { SHEET_HELP } from '../config';

/**
 * The recipe's mark for accepted "Ask for help" words (owner, 2026-10-31). Agent-pictures part 2 (per-phrase records of
 * whose words each part of a prompt is) had not merged when this was built, so the mark labels the whole prompt
 * ("includes words from AI suggestions"); per-phrase marking is for later. Null when no accepted words are left in it.
 */
export function helpMark(accepted: { model: string }[]): SheetHelpMark | null {
  if (!accepted.length) return null;
  if (SHEET_HELP.marking !== 'whole-prompt') throw new Error('per-phrase marking is not built yet');
  return { tool: 'ask-for-help', model: accepted[0].model, marking: 'whole-prompt' };
}
