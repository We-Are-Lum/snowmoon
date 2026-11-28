import { RECORDER as W } from './recorder-wording';

/**
 * A speech as plain text, for "Download the text" (Garance, via Nate 2026-11-26): its title, its credit (an invented
 * speech) or its book citation (the book's speech), its words paragraph by paragraph, and where it's from. Made in the
 * browser; nothing is sent.
 */
export interface SpeechForText {
  title: string;
  version: number;
  credit: string | null;
  label: { kind: 'book'; block: string } | { kind: 'invented' };
  paragraphs: string[];
}

export function speechAsText(sp: SpeechForText): string {
  const head = sp.label.kind === 'book' ? W.downloadBook(sp.label.block) : W.downloadInvented(sp.credit, sp.version);
  return [sp.title, head, '', ...sp.paragraphs.flatMap((p) => [p, '']), W.downloadFrom].join('\n');
}

export const speechFileName = (title: string) => `${title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'speech'}.txt`;
