'use client';

/**
 * Your changes to a version's shots, kept in this browser only (owner, 2026-10-18: "Play with my
 * changes"). Nothing here is sent anywhere: the replay on the scene page and in the editor reads it
 * back from this browser. One entry per shot you changed:
 * - camera: the camera and the people as you set them in the live editor (restored when you reopen the shot);
 * - layout: the grey layout from that camera, a small JPEG drawn in the browser (no model, no cost);
 * - remix: your newest Remix frame of the shot (already saved by the site when it was made; only its
 *   address is remembered here, so the replay can show it).
 * Bounded: at most MAX_LAYOUTS layout pictures per version; the oldest go first, and again if the
 * browser's storage is full.
 */
export interface RemixRef {
  id: string;
  url: string;
  page: string;
  by: string;
  words: string;
  at: number;
  /** The model it was made with, as the Remix panel named it (for the AI label's recipe sheet). */
  model?: { name: string; licence: string; where: string } | null;
}
export interface ShotChange {
  at: number;
  camera?: unknown;
  layout?: { src: string; at: number };
  remix?: RemixRef;
}
export type Changes = Record<string, ShotChange>;

export const CHANGES_EVENT = 'snowmoon:changes';
export const MAX_LAYOUTS = 40;
/** The layout picture's size: 16:9, like the video. */
export const LAYOUT_SIZE = { width: 640, height: 360, quality: 0.72 } as const;
export const changesKey = (adaptation: number, version: number) => `snowmoon.changes.v1.${adaptation}.v${version}`;

export function readChanges(adaptation: number, version: number): Changes {
  try {
    const raw = JSON.parse(localStorage.getItem(changesKey(adaptation, version)) ?? 'null') as { shots?: Changes } | null;
    const shots = raw && typeof raw.shots === 'object' && raw.shots ? raw.shots : {};
    return Object.fromEntries(Object.entries(shots).filter(([, c]) => c && (c.layout?.src || c.remix?.url)));
  } catch {
    return {};
  }
}

/** Drop the oldest layout picture (and the entry, if nothing else is in it). False when there is none to drop. */
function dropOldest(c: Changes): boolean {
  const oldest = Object.entries(c)
    .filter(([, s]) => s.layout)
    .sort(([, a], [, b]) => (a.layout!.at ?? 0) - (b.layout!.at ?? 0))[0];
  if (!oldest) return false;
  const [id, s] = oldest;
  if (s.remix) c[id] = { at: s.at, remix: s.remix };
  else delete c[id];
  return true;
}

function writeChanges(adaptation: number, version: number, c: Changes) {
  while (Object.values(c).filter((s) => s.layout).length > MAX_LAYOUTS) dropOldest(c);
  for (let tries = 0; tries < 8; tries++) {
    try {
      if (Object.keys(c).length) localStorage.setItem(changesKey(adaptation, version), JSON.stringify({ shots: c }));
      else localStorage.removeItem(changesKey(adaptation, version));
      break;
    } catch {
      // Storage full (or blocked): make room by dropping the oldest layout, then try again.
      if (!dropOldest(c)) break;
    }
  }
  try {
    window.dispatchEvent(new Event(CHANGES_EVENT));
  } catch {
    /* no window */
  }
}

/** The camera you set for a shot and its grey layout; null clears them (back to the version's own camera). */
export function saveLayout(adaptation: number, version: number, shot: string, change: { camera: unknown; src: string } | null) {
  const c = readChanges(adaptation, version);
  const was = c[shot];
  if (!change) {
    if (!was?.layout) return;
    if (was.remix) c[shot] = { at: was.at, remix: was.remix };
    else delete c[shot];
  } else {
    const now = Date.now();
    c[shot] = { ...was, at: now, camera: change.camera, layout: { src: change.src, at: now } };
  }
  writeChanges(adaptation, version, c);
}

/** Your newest Remix frame of a shot (null: you have none, or you hid it). */
export function saveRemix(adaptation: number, version: number, shot: string, remix: RemixRef | null) {
  const c = readChanges(adaptation, version);
  const was = c[shot];
  if (!remix) {
    if (!was?.remix) return;
    if (was.layout) c[shot] = { at: was.at, camera: was.camera, layout: was.layout };
    else delete c[shot];
  } else {
    if (was?.remix?.id === remix.id && was.remix.url === remix.url) return;
    c[shot] = { ...was, at: Math.max(was?.at ?? 0, remix.at), remix };
  }
  writeChanges(adaptation, version, c);
}

/** What the replay shows for a changed shot: your remix frame if it is newer than your layout, else the layout. */
export function shownFor(s: ShotChange): { kind: 'remix'; src: string; remix: RemixRef } | { kind: 'layout'; src: string } | null {
  if (s.remix && (!s.layout || s.remix.at >= s.layout.at)) return { kind: 'remix', src: s.remix.url, remix: s.remix };
  if (s.layout) return { kind: 'layout', src: s.layout.src };
  return null;
}
