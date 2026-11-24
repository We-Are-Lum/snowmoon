import { VOICE } from '../config';

/**
 * Converting a recording again (fix 7, Nate 2026-11-24: "it let me click convert again. Wasting a conversion. Should
 * only do that if I don't like the first conversion"). Drafted by the coding agent (Claude, a closed model by Anthropic);
 * reread by Nate on 2026-11-24, as drafted (relayed by the coordinator: "reread: "Not happy with it? Convert this
 * recording again: it uses one of today's 2 takes", with "Convert again" and "Keep this one""). No "Draft wording"
 * mark. The number follows the take cap.
 */
export const CONVERT_AGAIN = {
  line: `Not happy with it? Convert this recording again: it uses one of today's ${VOICE.caps.perPersonConversions} takes.`,
  again: 'Convert again',
  keep: 'Keep this one',
} as const;
