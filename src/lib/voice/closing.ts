/**
 * The storyboard's closing card and the publish rule (Ephelion slice 4, 2026-11-21; DRAFT; Nate's brief): pure, so the
 * server, the page, the video and the tests share it.
 *
 * The card's text is set by the site, from the recipe, never by the person or a model: fixed credits (who did what,
 * people and AI apart), the snowmoon.party mark, the not-affiliated line and the AI labels. Only its look is the
 * person's: their own words prompt the background picture (shot key 'end', through the same picture flow as the shots),
 * and the site draws the text over it, so a model can't change a word of it.
 */
import type { Shot } from './board';

export const CLOSING = {
  /** The picture key the closing background is kept under (shot keys are s1, s2, …). */
  key: 'end',
  /** How long the card shows after the speech, in the play-through and the video. */
  seconds: 6,
  mark: 'snowmoon.party',
  notAffiliated: 'An independent, open adaptation of Snowmoon by Vitalik Buterin (GPL-3.0). Not affiliated with or endorsed by the author.',
} as const;

/** The closing card's choices on a saved board: the person's own words for its look, a style sheet, the kept background. */
export interface Closing {
  description: string;
  styleId: string | null;
  kept: string | null;
}
export const emptyClosing = (): Closing => ({ description: '', styleId: null, kept: null });

export interface PictureModel {
  id: string;
  name: string;
  maker: string;
  open: boolean;
}
export interface CreditsInput {
  /** The speech: a book block, or the team's invented speech (its version; the writers' credit, DRAFT until Nate gives it). */
  speech: { title: string; block: string | null; invented?: { version: number | null; credit: string | null } };
  /** The performer's name here, or null when they asked not to be named. */
  performer: string | null;
  preset: string;
  voiceModel: { name: string; maker: string };
  transcribeModel: { name: string; maker: string };
  /** One per kept picture (the shots' and the closing background's), in order; stand-ins included. */
  pictures: PictureModel[];
  shots: number;
  /** A person's converted performance, or the ready-made reading (ElevenLabs' text-to-speech; no performer). */
  voice?: 'performance' | 'reading';
}

export interface CreditLine {
  /** 'people' lines are what people did; 'ai' lines are what models did; 'book' is the source; 'site' is fixed. */
  who: 'book' | 'invented' | 'people' | 'ai' | 'site';
  text: string;
}

const modelLabel = (m: { name: string; maker: string; open?: boolean }) => `${m.name} by ${m.maker} (${m.open ? 'open' : 'closed'} model)`;

/** The credits, in the order the card shows them. The same function makes the card, the page and the video's card. */
export function closingCredits(c: CreditsInput): CreditLine[] {
  const by = c.performer ? `@${c.performer}` : 'a reader (not named, at their wish)';
  const standIns = c.pictures.filter((p) => p.id === 'stand-in').length;
  const real = new Map<string, PictureModel>();
  for (const p of c.pictures) if (p.id !== 'stand-in') real.set(p.id, p);
  const reading = c.voice === 'reading';
  const lines: CreditLine[] = [
    c.speech.invented
      ? { who: 'invented', text: `Words: “${c.speech.title}”, written for this edition${c.speech.invented.version ? ` (version ${c.speech.invented.version})` : ''}; invented, not from the book. ${c.speech.invented.credit ?? 'DRAFT: the writers’ credit, wording to come'}` }
      : { who: 'book', text: `Words: ${c.speech.title}, from Snowmoon by Vitalik Buterin${c.speech.block ? ` (${c.speech.block})` : ''}, word for word.` },
    ...(reading ? [] : [{ who: 'people' as const, text: `Performed by ${by}, in the voice “${c.preset}”.` }]),
    { who: 'people', text: `Storyboard by ${by}: the cuts, the ${c.shots} shots’ descriptions and cameras, the pictures kept.` },
    reading
      ? { who: 'ai', text: `Voice: a ready-made reading by ${modelLabel(c.voiceModel)}, in the voice “${c.preset}”. No performer. Word timings by ${modelLabel(c.transcribeModel)}.` }
      : { who: 'ai', text: `Voice converted by ${modelLabel(c.voiceModel)}; checked word for word with ${modelLabel(c.transcribeModel)}.` },
  ];
  if (real.size) lines.push({ who: 'ai', text: `Pictures made by ${[...real.values()].map(modelLabel).join(', ')}, from the storyboard’s own words.` });
  if (standIns) lines.push({ who: 'site', text: `${standIns} stand-in card${standIns === 1 ? '' : 's'} in place of pictures (no model).` });
  lines.push(
    reading
      ? { who: 'site', text: `People did the storyboard and the words for each picture. AI did ${real.size ? 'the reading, the word timings and the pictures' : 'the reading and the word timings'}. No AI video.` }
      : { who: 'site', text: `People did the performance and the words for each picture. AI did ${real.size ? 'the voice conversion, the word check and the pictures' : 'the voice conversion and the word check'}. No AI video.` },
  );
  lines.push({ who: 'site', text: CLOSING.notAffiliated });
  return lines;
}

export interface PublishFacts {
  unmatched: number[];
  sentences: number;
  shots: Shot[];
  keptShots: Set<string>;
  closing: Closing | null;
  closingKept: boolean;
  standIns: number;
  /** Stand-in pictures may be published only on a local test copy (never on Vercel). */
  standInsAllowed: boolean;
  dirty?: boolean;
  /** An invented speech, while its publishing waits for Nate's word (VOICE.publishInvented). */
  inventedHeld?: boolean;
}

/**
 * Why a storyboard can't be published yet (empty: it can). The rule for unmatched sentences (DRAFT, for Nate): every
 * sentence must match the speech word for word, after any redo (names heard by sound count, as the word check lists
 * them), because story words stay the book's. Accepting a draft with a mismatch is allowed; publishing it isn't.
 */
export function publishProblems(f: PublishFacts): string[] {
  const out: string[] = [];
  if (f.unmatched.length) out.push(`${f.unmatched.length === 1 ? 'Sentence' : 'Sentences'} ${f.unmatched.map((n) => n + 1).join(', ')} ${f.unmatched.length === 1 ? 'doesn’t' : 'don’t'} match the speech word for word: redo ${f.unmatched.length === 1 ? 'it' : 'them'} and accept again.`);
  f.shots.forEach((s, i) => {
    if (!s.description.trim()) out.push(`Shot ${i + 1} has no description.`);
    if (!s.kept || !f.keptShots.has(`${s.key}:${s.kept}`)) out.push(`Shot ${i + 1} has no picture kept.`);
  });
  if (!f.closing || !f.closing.description.trim() || !f.closing.kept || !f.closingKept) out.push('The closing card has no background kept yet.');
  if (f.standIns && !f.standInsAllowed) out.push('Stand-in cards can’t be published: make real pictures first.');
  if (f.dirty) out.push('Save the storyboard first.');
  if (f.inventedHeld) out.push('Storyboards of the invented speeches can’t be published yet: that waits for Nate’s word.');
  return out;
}

/** Wrap text into lines of at most `width` characters (the card and the video draw the same lines). */
export function wrapLines(text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + ' ' + w).length > width) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}
