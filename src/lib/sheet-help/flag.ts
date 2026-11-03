import 'server-only';
import { SHEET_HELP } from '../config';
import { PRIVACY } from '../legal';
import { challengeSheetsOpen } from '../challenge/open-sheets';

/**
 * Whether "Ask for help" is live. SHEET_HELP.on is OFF until the owner's reread (docs/legal/sheet-help-draft.md). Legal
 * texts describe today (owner, 2026-10-18): even with the switch on, it waits for Privacy §5 (what it sends, and to
 * whom) and §6 (the recipe's label) to describe it, and it is open only while the challenge's sheets are open (the
 * entry window, src/lib/challenge/open-sheets.ts). Off, the route answers 404 and the form shows no chat. Principle
 * check P6r reads this line.
 */
const section = (privacy: typeof PRIVACY, n: number) => (privacy.sections.find((s) => s.n === n)?.body ?? []).flat().join(' ');

export const privacyDescribesSheetHelp = (privacy = PRIVACY) => /Ask for help/.test(section(privacy, 5)) && /Ask for help/.test(section(privacy, 6));

export const sheetHelpLive = (now = new Date(), privacy = PRIVACY) => SHEET_HELP.on && privacyDescribesSheetHelp(privacy) && challengeSheetsOpen(now, privacy);
