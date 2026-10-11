/**
 * Browser side of readers' images: opening the composer from anywhere in the reader, and
 * drafts kept on this device only (decision 13), in IndexedDB, never on the server.
 */
export const ADD_IMAGE_EVENT = 'snowmoon:add-image';
export interface AddImageDetail {
  chapter: number;
  start: number;
  end: number;
}

export function openComposer(detail: AddImageDetail) {
  window.dispatchEvent(new CustomEvent<AddImageDetail>(ADD_IMAGE_EVENT, { detail }));
}

export interface Draft {
  key: string;
  chapter: number;
  start: number;
  end: number;
  prompt: string;
  style: string | null;
  ticket: string;
  image: string;
  savedAt: string;
}

const DB = 'snowmoon';
const STORE = 'image-drafts';

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null); // storage blocked: drafts last until the sheet closes
    }
  });
}

export const draftKey = (d: AddImageDetail) => `c${d.chapter}-b${d.start}-b${d.end}`;

export async function saveDraft(d: Draft): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(d);
    tx.oncomplete = tx.onerror = () => resolve();
  });
}

export async function loadDraft(key: string): Promise<Draft | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as Draft) ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function deleteDraft(key: string): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = tx.onerror = () => resolve();
  });
}

/** "Make an image" for a passage (/images/new): only the block range goes in the link. */
export const createHref = (d?: AddImageDetail) => (d ? `/images/new?chapter=${d.chapter}&start=${d.start}&end=${d.end}` : '/images/new');
