import { CHALLENGE } from '../config';
import { phase } from './rules';

/**
 * Principle 9's recorded exception for the remix challenge (owner, 2026-11-05, answer 1; docs/principles.md, P9g):
 * while the challenge runs, /challenge and its remix screens show the six characters' cards and the curated moments
 * from the whole book, whatever the reader has read. The first layer is written without the book's major turns; every
 * moment chip shows its chapter. Since 2026-11-09 (owner) nothing on the challenge's pages is marked as a spoiler: people
 * work on the whole story there. The exception ends when entries close: after that, the hub carries no deeper layer and no moments, the
 * passages API answers "not found", and the remix screen takes no moment (P9g proves it on a planted clock).
 */
export const spoilerExceptionOn = (now: Date = new Date(), dates: { opens: string; closes: string } = CHALLENGE.dates) => phase(now, dates) !== 'closed';
