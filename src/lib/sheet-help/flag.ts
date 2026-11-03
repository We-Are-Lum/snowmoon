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

/**
 * "Find a moment", a tab of "Ask for help" (docs/proposals/remix-moments.md §2; owner, 2026-11-04). Its own switch,
 * SHEET_HELP.findMoment, OFF. Even on, it is live only while "Ask for help" is live and Privacy §5 describes it (what it
 * sends: what the person describes, the passages found, and the chapter limit; and that it counts as one of the
 * messages). The draft sentence is in docs/legal/find-a-moment-draft.md. Principle check P6w reads these lines.
 */
export const privacyDescribesFindMoment = (privacy = PRIVACY) => /Find a moment/.test(section(privacy, 5)) && /passages/.test(section(privacy, 5));

export const findMomentLive = (now = new Date(), privacy = PRIVACY) => SHEET_HELP.findMoment && sheetHelpLive(now, privacy) && privacyDescribesFindMoment(privacy);
