import { checkNoWriting } from '../make/no-writing';

/**
 * The pattern check for "Ask for help" (docs/proposals/sheet-help.md): it may write visual prompt text, one part at a
 * time, and never dialogue, narration or story lines (owner, 2026-10-31). Pure. It runs on every reply before the
 * guard model (config/prompts/sheet-help-guard.md); either one flagging a reply means it is not shown (one retry with
 * a reminder, then a decline).
 *
 * The suggested words (`after`) go into a picture prompt, so they are held to more than the coach's notes:
 * - quoted:  any quotation mark at all (words in quotes would be drawn as text, or are a line);
 * - speech:  words that put speech, thought, narration or lettering in the picture ("says", "whispers", "narrator",
 *            "caption", "speech bubble", "the words", "a sign reading");
 * - story:   words that tell a story rather than show a look: time passing or events ("then", "later", "suddenly",
 *            "after the match", "remembers", "decides");
 * - and the coach's own shapes (speaker lines, script markers, filled-in Line:/Narration:/Caption: fields), from
 *   src/lib/make/no-writing.ts.
 * The note that comes with it (`why`) gets the coach's check, except its "describe" rule: here describing the look is
 * the job. Quoting the person's own words back is allowed there.
 */
export type StoryReason = 'quoted' | 'speech' | 'story' | 'speaker' | 'script' | 'label';

const QUOTE_MARK = /["“”«»„]|(?:^|\s)'[^']+'(?=\s|$|[.,;:!?])/;
export const SPEAKER_LINE = /^\s*[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)?\s*(?:\([^)]*\))?\s*:\s*\S/u;
const SPEECH = /\b(?:says?|said|saying|speaks?|speaking|spoke|whisper\w*|shout\w*|yell\w*|asks?|asked|replies|replied|tells?|told|mutters?|murmurs?|exclaims?|narrat\w*|narrator|dialogue|monologue|voice-?over|caption\w*|subtitles?|speech bubbles?|word balloons?|thought bubbles?|lettering|inscription|the words?|text (?:reading|that reads|saying)|(?:a )?sign (?:reading|that reads|saying)|reads? aloud)\b/i;
const STORY = /\b(?:then|later|afterwards?|suddenly|meanwhile|once upon|days? later|years? later|after (?:the|he|she|they|his|her)|remembers?|remembered|decides?|decided|realis(?:es|ed)|realiz(?:es|ed)|wonders?|wondered|feels? that|knows? that|in this chapter|in the story|the moment (?:when|where))\b/i;

export interface StoryCheck {
  ok: boolean;
  reasons: { reason: StoryReason; text: string }[];
}

/** The suggested words: visual prompt text only. */
export function checkPromptWords(after: string): StoryCheck {
  const reasons: StoryCheck['reasons'] = [];
  const q = after.match(QUOTE_MARK);
  if (q) reasons.push({ reason: 'quoted', text: after.slice(0, 80) });
  const sp = after.match(SPEECH);
  if (sp) reasons.push({ reason: 'speech', text: sp[0] });
  const st = after.match(STORY);
  if (st) reasons.push({ reason: 'story', text: st[0] });
  const sl = after.match(SPEAKER_LINE);
  if (sl) reasons.push({ reason: 'speaker', text: sl[0] });
  for (const r of checkNoWriting(after, '').reasons) if (r.reason !== 'describe' && r.reason !== 'quoted') reasons.push({ reason: r.reason, text: r.text });
  return { ok: reasons.length === 0, reasons };
}

/** The note with it: the coach's check without its "describe" rule; the person's own words may be quoted back. */
export function checkNote(why: string, own: string): StoryCheck {
  const reasons = checkNoWriting(why, own).reasons.filter((r) => r.reason !== 'describe').map((r) => ({ reason: r.reason as StoryReason, text: r.text }));
  return { ok: reasons.length === 0, reasons };
}
