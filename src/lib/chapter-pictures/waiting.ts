import type { Addition, PictureDecision, PictureVersion } from './shared';
import { isAddedId } from './shared';
import { labelRange, paragraphOrBlock } from '../reading';

/**
 * The drafts waiting on /you/illustrations (owner, 2026-11-19: "an unkept draft waits on /you/illustrations"): every
 * version no decision has ever shown, newest first, with where it sits: the edition picture it would replace, or the
 * block an added picture sits after (and the passage it shows). Each place carries the ¶ number the chapter reader
 * shows for it (src/lib/reading.ts blockFacts, passed in as `labelOf`), or null for a block without one. Pure: tests
 * run it as it is.
 */
export interface WaitingDraft {
  jobId: string;
  versionId: string;
  chapter: number;
  madeAt: string;
  madeByFid: number;
  model: string;
  note: string;
  where:
    | { kind: 'replace'; block: number; label: number | null }
    | { kind: 'added'; after: number; start: number; end: number; labels: { after: number | null; start: number | null; end: number | null } }
    | { kind: 'added-unknown' };
  href: string;
}

/** A block's ¶ number in its chapter, as the reader shows it; null when it has none. */
export type LabelOf = (chapter: number, idx: number) => number | null;

export function waitingDrafts(history: { versions: Map<string, PictureVersion[]>; decisions: Map<string, PictureDecision[]> }, additions: Addition[], labelOf: LabelOf = () => null): WaitingDraft[] {
  const shownEver = new Set([...history.decisions.values()].flat().map((d) => d.versionId).filter((v): v is string => Boolean(v)));
  const placeOf = new Map(additions.map((a) => [a.jobId, a]));
  const out: WaitingDraft[] = [];
  for (const [jobId, versions] of history.versions) {
    for (const v of versions) {
      if (shownEver.has(v.id)) continue;
      const a = placeOf.get(jobId);
      const block = Number(/^c\d+-b(\d+)/.exec(jobId)?.[1] ?? 0);
      const L = (idx: number) => labelOf(v.chapter, idx);
      const where: WaitingDraft['where'] = isAddedId(jobId)
        ? a
          ? { kind: 'added', after: a.after, start: a.start, end: a.end, labels: { after: L(a.after), start: L(a.start), end: L(a.end) } }
          : { kind: 'added-unknown' }
        : { kind: 'replace', block, label: L(block) };
      out.push({ jobId, versionId: v.id, chapter: v.chapter, madeAt: v.madeAt, madeByFid: v.madeByFid, model: v.recipe?.model?.name ?? v.model, note: v.note, where, href: `/chapter/${v.chapter}#c${v.chapter}-b${a ? a.after : block}` });
    }
  }
  return out.sort((x, y) => (x.madeAt < y.madeAt ? 1 : -1));
}

/**
 * Where a waiting draft would go, in the reader's words: "after ¶ 39 (it shows ¶ 37–39)"; a block with no ¶ number is
 * named "block 42", as the reader's passage picker names it, and a passage with such an end reads "block 33 to ¶ 39",
 * as the picker's "from … to …" does. DRAFT wording (coding agent, 2026-11-20).
 */
export function waitingWhere(d: Pick<WaitingDraft, 'chapter' | 'where'>): string {
  const w = d.where;
  if (w.kind === 'replace') return `Would replace the picture at chapter ${d.chapter}, ${paragraphOrBlock(w.label, w.block)}`;
  if (w.kind === 'added-unknown') return `A new picture for chapter ${d.chapter}`;
  const { start, end } = w.labels;
  const shows = start !== null && end !== null ? labelRange(start, end) : w.start === w.end ? paragraphOrBlock(start, w.start) : `${paragraphOrBlock(start, w.start)} to ${paragraphOrBlock(end, w.end)}`;
  return `A new picture for chapter ${d.chapter}, after ${paragraphOrBlock(w.labels.after, w.after)} (it shows ${shows})`;
}
