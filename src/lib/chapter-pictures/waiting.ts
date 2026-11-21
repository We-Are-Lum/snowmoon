import type { Addition, PictureDecision, PictureVersion } from './shared';
import { isAddedId } from './shared';

/**
 * The drafts waiting on /you/illustrations (owner, 2026-11-19: "an unkept draft waits on /you/illustrations"): every
 * version no decision has ever shown, newest first, with where it sits: the edition picture it would replace, or the
 * block an added picture sits after (and the passage it shows). Pure: tests run it as it is.
 */
export interface WaitingDraft {
  jobId: string;
  versionId: string;
  chapter: number;
  madeAt: string;
  madeByFid: number;
  model: string;
  note: string;
  where: { kind: 'replace'; block: number } | { kind: 'added'; after: number; start: number; end: number } | { kind: 'added-unknown' };
  href: string;
}

export function waitingDrafts(history: { versions: Map<string, PictureVersion[]>; decisions: Map<string, PictureDecision[]> }, additions: Addition[]): WaitingDraft[] {
  const shownEver = new Set([...history.decisions.values()].flat().map((d) => d.versionId).filter((v): v is string => Boolean(v)));
  const placeOf = new Map(additions.map((a) => [a.jobId, a]));
  const out: WaitingDraft[] = [];
  for (const [jobId, versions] of history.versions) {
    for (const v of versions) {
      if (shownEver.has(v.id)) continue;
      const a = placeOf.get(jobId);
      const block = Number(/^c\d+-b(\d+)/.exec(jobId)?.[1] ?? 0);
      const where: WaitingDraft['where'] = isAddedId(jobId) ? (a ? { kind: 'added', after: a.after, start: a.start, end: a.end } : { kind: 'added-unknown' }) : { kind: 'replace', block };
      out.push({ jobId, versionId: v.id, chapter: v.chapter, madeAt: v.madeAt, madeByFid: v.madeByFid, model: v.recipe?.model?.name ?? v.model, note: v.note, where, href: `/chapter/${v.chapter}#c${v.chapter}-b${a ? a.after : block}` });
    }
  }
  return out.sort((x, y) => (x.madeAt < y.madeAt ? 1 : -1));
}
