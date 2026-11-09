/**
 * The remix flow's memory, in this browser tab only (sessionStorage; branch challenge-moments, 2026-11-05): the words
 * typed for a picture, so going back finds them; the picture made and its signed record until it is published (Privacy
 * §3: drafts of images you make are kept on your device until you publish them); and a mark that a picture started from
 * this one was published, so coming back to the remix screen goes to the hub. Nothing here is sent anywhere by itself.
 */
import type { MakeView } from './make';

export interface FlowDraft {
  id: string;
  from: string;
  character: string;
  name: string;
  sourceUrl: string;
  /** The moment chosen, only while the moments are on (CHALLENGE.moments); null otherwise. */
  moment: { id: string; title: string; chip: string } | null;
  words: string;
  /** The Style and Model rows' choices as sent (branch challenge-simple), so Try again sends the same. */
  style?: { kind: 'style'; id: string } | { kind: 'random' } | { kind: 'own'; text: string } | null;
  modelId?: string;
  /** The style used, as "How it was made" names it (Random: the one drawn). */
  styleLine?: string | null;
  ticket: string;
  image: string;
  prompt: string;
  model: string;
  w: MakeView['w'];
}

const PREFIX = 'snowmoon.challenge.';
export const flowKeys = (from: string) => ({ words: `${PREFIX}words.${from}`, published: `${PREFIX}published.${from}` });
const draftKey = (id: string) => `${PREFIX}draft.${id}`;

export function saveDraft(d: FlowDraft): boolean {
  try {
    // One draft at a time per tab: an older one is dropped first (a picture is a few hundred kilobytes).
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(`${PREFIX}draft.`) && k !== draftKey(d.id)) sessionStorage.removeItem(k);
    }
    sessionStorage.setItem(draftKey(d.id), JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(id: string): FlowDraft | null {
  try {
    const s = sessionStorage.getItem(draftKey(id));
    return s ? (JSON.parse(s) as FlowDraft) : null;
  } catch {
    return null;
  }
}

export function deleteDraft(id: string) {
  try {
    sessionStorage.removeItem(draftKey(id));
  } catch {}
}

/** After publishing: the draft goes, and the remix screen for its picture will send the person to the hub. */
export function markPublished(d: FlowDraft, versionId: string) {
  deleteDraft(d.id);
  try {
    sessionStorage.setItem(flowKeys(d.from).published, versionId);
  } catch {}
}
