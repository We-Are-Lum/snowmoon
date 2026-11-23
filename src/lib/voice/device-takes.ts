/**
 * The raw take kept on the performer's own device (Nate, 2026-11-22: "keep the raw take in the browser's own storage
 * (IndexedDB) until I press Remove"): in this browser's IndexedDB, never on our servers. It leaves the device only when
 * the performer presses Convert. Kept under the signed-in FID: another sign-in on the same browser neither sees nor
 * converts it. One take per person and speech; recording again replaces it. The browser may clear it on its own.
 * Browser only.
 */
export interface DeviceTake {
  key: string;
  fid: number;
  speechId: string;
  blob: Blob;
  seconds: number;
  type: string;
  savedAt: number;
  /** The take's sha256, to find the draft its conversion became (the recipe keeps only this). */
  sha256: string;
}

const DB = 'snowmoon-voice-takes';
const STORE = 'takes';
export const takeKey = (fid: number, speechId: string) => `${fid}:${speechId}`;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('This browser has no storage for recordings'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'key' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('The browser storage could not be opened'));
  });
}
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error ?? new Error('The browser storage failed'));
      t.onabort = () => reject(t.error ?? new Error('The browser storage failed'));
    });
  } finally {
    db.close();
  }
}

export async function sha256Of(blob: Blob): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Keep (or replace) this person's take of this speech on the device. */
export async function saveTake(fid: number, speechId: string, blob: Blob, seconds: number): Promise<DeviceTake> {
  const t: DeviceTake = { key: takeKey(fid, speechId), fid, speechId, blob, seconds, type: blob.type, savedAt: Date.now(), sha256: await sha256Of(blob) };
  await tx('readwrite', (s) => s.put(t));
  return t;
}

/** This person's take of this speech, if one is on the device. Never another sign-in's. */
export async function loadTake(fid: number, speechId: string): Promise<DeviceTake | null> {
  const t = (await tx('readonly', (s) => s.get(takeKey(fid, speechId)))) as DeviceTake | undefined;
  return t && t.fid === fid && t.speechId === speechId ? t : null;
}

export async function removeTake(fid: number, speechId: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(takeKey(fid, speechId)));
}
