import { VOICE } from '../config';

/**
 * The storyboard allowance's words (Nate, 2026-11-23: "20 storyboard pictures a person a day … and a $20-a-day
 * storyboard pool"; the takes: 2 a person a day and everyone's daily budget). Drafted by the coding agent (Claude, a
 * closed model by Anthropic) from the launch list v3; reread by Nate on 2026-11-24, with one change: the fifth line,
 * "Today's voice conversions for everyone are used up. …" (was "Today's recordings for everyone …"). {reset} is 00:00 UTC, written by the browser in the person's own time (never by the server). No
 * prepaid line until prepaid storyboard pictures exist (Nate, 2026-11-23).
 */
export const ALLOWANCE_WORDING = {
  /** Before it runs out: the count left. */
  left: (n: number) => `${n} storyboard ${n === 1 ? 'picture' : 'pictures'} left today`,
  /** This person's allowance used up. */
  limit: `You've made today's ${VOICE.pictures.perPersonPerDay} storyboard pictures. Your storyboard is saved: make the rest from {reset}.`,
  /** Everyone's pool used up. */
  pool: "Today's storyboard pictures for everyone are used up. Your storyboard is saved: make the rest from {reset}.",
  /** Takes: this person's whole takes used up (the number follows VOICE.caps.perPersonConversions). */
  takes: `You've converted today's ${VOICE.caps.perPersonConversions} takes. Your drafts are kept, and your recording stays on this device: convert it again from {reset}.`,
  /** Takes: everyone's daily budget used up. */
  takesPool: "Today's voice conversions for everyone are used up. Your recording stays on this device: convert it from {reset}.",
} as const;
