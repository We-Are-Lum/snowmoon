import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * A version's committed editor data (public/editor/<id>/v<n>/data.json, made at build time by
 * scripts/editor-data.mjs and traced into the agent routes by next.config.ts). The agent API reads the same
 * files the editor and the moment pages show anyone.
 */
export type DataShot = Record<string, unknown> & { id: string; n: number; from: number; to: number; lines?: Record<string, unknown>[] };
export type EditorData = Record<string, unknown> & { adaptation: number; version: number; title: string; shots: DataShot[] };

const cache = new Map<string, EditorData | null>();
export function editorData(adaptation: number, version: number): EditorData | null {
  if (!Number.isInteger(adaptation) || !Number.isInteger(version) || adaptation <= 0 || version <= 0) return null;
  const key = `${adaptation}/${version}`;
  if (!cache.has(key)) {
    try {
      cache.set(key, JSON.parse(readFileSync(path.join(process.cwd(), 'public', 'editor', String(adaptation), `v${version}`, 'data.json'), 'utf8')));
    } catch {
      cache.set(key, null);
    }
  }
  return cache.get(key)!;
}
