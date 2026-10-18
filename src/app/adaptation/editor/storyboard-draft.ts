'use client';

/**
 * A storyboard being made (owner, 2026-10-18): kept in this browser until it is saved, one per
 * version. Each item is a shot shown as the version's own frame or as one of the person's remix
 * frames, for a length in seconds; `takes` picks the converted take each line plays ('version': the
 * take heard in the version; or a take id from the line's other existing takes). Saved, it becomes a
 * studio.storyboards row (POST /api/remix/storyboard) and this draft is cleared.
 */
export interface DraftItem {
  key: string;
  shot: string;
  frame: { id: string; url: string } | null;
  seconds: number;
}
export interface Draft {
  title: string;
  items: DraftItem[];
  takes: Record<string, string>;
}

export const DRAFT_EVENT = 'snowmoon:storyboard';
const key = (adaptation: number, version: number) => `snowmoon.storyboard.${adaptation}.v${version}`;
const empty = (): Draft => ({ title: '', items: [], takes: {} });

export function readDraft(adaptation: number, version: number): Draft {
  try {
    const d = JSON.parse(localStorage.getItem(key(adaptation, version)) ?? 'null') as Draft | null;
    return d && Array.isArray(d.items) ? { title: d.title ?? '', items: d.items, takes: d.takes ?? {} } : empty();
  } catch {
    return empty();
  }
}

export function writeDraft(adaptation: number, version: number, d: Draft) {
  try {
    localStorage.setItem(key(adaptation, version), JSON.stringify(d));
  } catch {
    /* storage blocked: the draft lasts this page only */
  }
  window.dispatchEvent(new Event(DRAFT_EVENT));
}

export function clearDraft(adaptation: number, version: number) {
  try {
    localStorage.removeItem(key(adaptation, version));
  } catch {
    /* nothing kept */
  }
  window.dispatchEvent(new Event(DRAFT_EVENT));
}

export function addToDraft(adaptation: number, version: number, item: Omit<DraftItem, 'key'>) {
  const d = readDraft(adaptation, version);
  d.items.push({ ...item, key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` });
  writeDraft(adaptation, version, d);
  return d.items.length;
}
