/**
 * The server-side "never writes for you" check for "Make your own" (owner's spec: "can cite the book, but never writes
 * prose, dialogue or narration"; "beats, in my words, with the assistant giving notes only"). Pure, so the tests can run
 * it on any text. It runs on every reply before the guard model (config/prompts/make-guard.md); either one flagging a
 * reply means it is not shown (one retry with a reminder, then a decline).
 *
 * It catches the shapes written text takes, not its meaning (the guard model reads for meaning):
 * - quoted:  a quoted span of three words or more that isn't the person's own words (a line written for them);
 * - speaker: a script-style speaker line ("ZEI: …", "Bai (V.O.): …", a name and a colon before a quote);
 * - script:  screenplay markers (INT./EXT., FADE IN, CUT TO:, V.O., O.S.);
 * - label:   a filled-in field the person must write themselves (Line:, Dialogue:, Narration:, Caption:, Logline:,
 *            Title:, Tagline:, What we see:, Who's in frame:), or two or more "Beat N:" / "Shot N:" / "Option N:"
 *            headings (a list of beats, shots or options written for them);
 * - describe: a sentence that describes the shot the way a storyboard or script would ("We see …", "Close on …",
 *            "The camera pushes in …", "Open on …"), five words or more, not a question and not the person's own.
 * Owner, 2026-10-19: "coach may suggest visual details as questions or options, never written description". So
 * "would a clenched jaw show it?" and "a storm cloud, or bright sun?" pass (a question; short options), and "We see
 * her jaw clench as the lights flicker below." does not. The guard model reads the rest of that boundary.
 * Quoting the person's own words back is allowed (matched case- and space-insensitively).
 */
export type WritingReason = 'quoted' | 'speaker' | 'script' | 'label' | 'describe';

export interface WritingCheck {
  ok: boolean;
  reasons: { reason: WritingReason; text: string }[];
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const words = (s: string) => norm(s).split(' ').filter(Boolean).length;

const QUOTED = /["“”«»„]([^"“”«»„\n]{1,400})["“”«»„]|(?:^|[\s(])'([^'\n]{1,400}?)'(?=[\s.,;:!?)]|$)/g;
const SPEAKER = /^\s*[-*•>]?\s*(?:\*\*)?[A-Z][\p{L}'-]{1,20}(?:\s+[A-Z][\p{L}'-]{1,20})?(?:\s*\((?:V\.?O\.?|O\.?S\.?|O\.?C\.?|cont'?d|whisper\w*|shout\w*)\))?(?:\*\*)?\s*:\s*(?:\*\*)?\s*["“(]/mu;
const SCREAMING_NAME_LINE = /^\s*[A-Z]{2,}(?:\s+[A-Z]{2,})?\s*(?:\((?:V\.?O\.?|O\.?S\.?|CONT'?D)\))?\s*$\n\s*\S/m;
const SCRIPT = /(^|\n)\s*(?:INT\.|EXT\.|INT\/EXT\.|FADE (?:IN|OUT)|CUT TO:|SMASH CUT|DISSOLVE TO|MATCH CUT)|\((?:V\.O\.|O\.S\.|O\.C\.)\)|\bV\.O\.(?=\s|:|$)/;
const LABEL = /^\s*[-*•]?\s*(?:\*\*|__)?(?:Line|Lines|Dialogue|Narration|Narrator|Caption|Voice-?over|Logline|Title|Tagline|What we see|Who'?s in frame|Scene text|Monologue)(?:\*\*|__)?\s*[:–—]\s*\S/im;
// At the start of a line or a sentence, capitalised (running text says "beat 2").
const NUMBERED = /(?:^|\n|[.;!?]\s+)\s*[-*•]?\s*(?:\*\*|__)?(?:Beat|Shot|Scene|Panel|Option|Version|BEAT|SHOT|SCENE|PANEL|OPTION|VERSION)\s+(?:\d+|[A-C])(?:\*\*|__)?\s*[:.–—)]/g;
// A sentence that starts the way a storyboard or script describes a shot. Sentences are split on . ! ? and line ends.
const DESCRIBE = /^(?:[-*•>]\s*)?(?:\*\*|__)?(?:we (?:see|hear|watch|glimpse|follow|find|open on)|the camera\b|camera (?:pans|tracks|pushes|pulls|holds|lingers|moves|cuts|tilts|cranes|drifts|follows|finds)|(?:close|open|fade|push|pull|cut|hold|pan|tilt|zoom|linger) (?:on|in on|out on|out from|back on|to|up to|down to)\b|the (?:shot|frame|scene) (?:opens|starts|begins|ends|shows|holds|lingers|cuts)|in the (?:foreground|background|frame)\b)/i;

export function checkNoWriting(reply: string, own: string): WritingCheck {
  const reasons: WritingCheck['reasons'] = [];
  const mine = norm(own);
  for (const m of reply.matchAll(QUOTED)) {
    const span = (m[1] ?? m[2] ?? '').trim();
    if (words(span) < 3) continue;
    if (mine && mine.includes(norm(span))) continue;
    reasons.push({ reason: 'quoted', text: span.slice(0, 80) });
  }
  const sp = reply.match(SPEAKER) ?? reply.match(SCREAMING_NAME_LINE);
  if (sp) reasons.push({ reason: 'speaker', text: sp[0].trim().slice(0, 80) });
  const sc = reply.match(SCRIPT);
  if (sc) reasons.push({ reason: 'script', text: sc[0].trim().slice(0, 80) });
  const lb = reply.match(LABEL);
  if (lb) reasons.push({ reason: 'label', text: lb[0].trim().slice(0, 80) });
  const numbered = reply.match(NUMBERED) ?? [];
  if (numbered.length >= 2) reasons.push({ reason: 'label', text: numbered.slice(0, 2).map((s) => s.trim()).join(' … ') });
  for (const sentence of reply.split(/(?<=[.!?])\s+|\n+/)) {
    const t = sentence.trim();
    const d = t.match(DESCRIBE);
    if (!d || t.endsWith('?') || words(t) < 5) continue;
    // Their own "what we see", read back to them ("We see Bai turn from the railing" when they wrote it).
    if (mine && (mine.includes(norm(t)) || mine.includes(norm(t.slice(d[0].length))))) continue;
    reasons.push({ reason: 'describe', text: t.slice(0, 80) });
    break;
  }
  return { ok: reasons.length === 0, reasons };
}
