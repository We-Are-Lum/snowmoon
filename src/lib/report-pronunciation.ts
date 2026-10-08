import { REPO_URL } from './config';

/**
 * Reporting a mispronunciation, with no table and no text field of our own
 * (owner, 2026-10-08; docs/pronunciation-fixes.md). Inside Farcaster: a cast to the
 * /snowmoon channel. Outside: a prefilled GitHub issue labelled "pronunciation".
 * The wording is model-drafted, for the owner to rewrite.
 */
const SITE = 'https://snowmoon.party';
export const REPORT_CHANNEL = 'snowmoon';

export interface ReportTarget {
  chapter: number;
  /** The block being read, if any; a chapter-level report has none. */
  idx?: number;
  /** The ¶ number readers see. */
  label?: number | null;
}

export function blockUrl(t: ReportTarget): string {
  return t.idx === undefined ? `${SITE}/chapter/${t.chapter}` : `${SITE}/chapter/${t.chapter}#c${t.chapter}-b${t.idx}`;
}

function where(t: ReportTarget): string {
  return `Chapter ${t.chapter}${t.label ? `, ¶ ${t.label}` : ''}`;
}

export function castText(t: ReportTarget): string {
  return `Mispronunciation in the Snowmoon narration, ${where(t)}: `;
}

export function issueUrl(t: ReportTarget): string {
  const body = [
    `${where(t)}${t.idx !== undefined ? ` (block c${t.chapter}-b${t.idx})` : ''}`,
    blockUrl(t),
    '',
    'Which word was said wrong, and how should it sound?',
    '',
  ].join('\n');
  const q = new URLSearchParams({ title: `Mispronunciation: ${where(t)}`, body, labels: 'pronunciation' });
  return `${REPO_URL}/issues/new?${q}`;
}
