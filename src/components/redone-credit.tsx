import { LocalDate } from './local-date';
import type { Redone } from '~/lib/chapter-pictures/view';

/**
 * Under a chapter picture an admin redid and kept, wherever it shows (owner, 2026-11-18/19): " · Redone by @handle ·
 * 18 Nov 2026 · GPT Image 2.5 Sunburst, a closed model by OpenAI", the date in the reader's own time. The same words
 * as the chapter page's caption (principles 3 and 5). DRAFT wording (coding agent, 2026-11-18).
 */
export function RedoneCredit({ redone, lead = true }: { redone: Pick<Redone, 'by' | 'at' | 'model' | 'versionId'>; lead?: boolean }) {
  return (
    <span className="seed-replaced" data-replaced={redone.versionId}>
      {lead ? ' · ' : ''}
      {redone.by} · <LocalDate iso={redone.at} /> · {redone.model}
    </span>
  );
}
