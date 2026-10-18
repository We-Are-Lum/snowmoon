import 'server-only';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { remixModelFor, type RemixModelKind } from './model';

/**
 * A shot as Generate needs it, read from the version's editor data (public/editor/<id>/v<n>/, made at
 * build time from committed files by scripts/editor-data.mjs and traced into the Remix routes by
 * next.config.ts): its own prompt from the version's recipe, its cast cards and its plate, each with
 * the bytes as served and their sha256 (the recipe records exactly what was sent).
 */
export interface RemixPicture {
  role: 'layout' | 'card' | 'plate';
  name: string;
  /** The served file, under public/ (null for the live layout, which comes from the person's browser). */
  src: string | null;
  /** The committed file it was made from, and that file's sha256. */
  file: string | null;
  fileSha256: string | null;
  bytes: Buffer;
  sha256: string;
  contentType: string;
  width: number;
  height: number;
}
export interface RemixShot {
  adaptation: number;
  version: number;
  /**
   * The version whose shot (prompt, cast cards, plate) is sent: the version itself, or, for a version whose
   * pictures a closed model redrew from an open-weight one (version 2, the GPT cut), that open-weight version,
   * since Remix draws with the open-weight model (2026-10-18).
   */
  from: number;
  /** The open-weight version this one was redrawn from (version 1 for version 2), whose remixes of the shot its panel also lists. */
  openFrom: number | null;
  /** A closed model that drew the version's own pictures, if any (named in the panel). */
  versionModel: { name: string; maker: string } | null;
  /** What Remix draws this shot with (src/lib/remix/model.ts): 'gpt' only with the flag on, for a version GPT Image drew. */
  model: RemixModelKind;
  id: string;
  n: number;
  who: string[];
  hasCamera: boolean;
  recipeId: string | null;
  recipeSha256: string | null;
  prompt: string | null;
  cards: RemixPicture[];
  plate: RemixPicture | null;
}

type Pic = { src: string; file: string; sha256: string; who?: string; name?: string };
type DataLine = { cue: string; takes?: { id: string }[] };
type DataShot = { id: string; n: number; from: number; to: number; who: string[]; camera: unknown; plate: Pic | null; cards: Pic[]; recipe: { id: string; sha256: string; prompt: string | null } | null; lines: DataLine[] };

type Data = { shots: DataShot[]; openFrom?: number | null; closedModel?: { name: string; maker: string; endpoint?: string } | null };
const cache = new Map<string, Data | null>();
const root = () => path.join(process.cwd(), 'public');

function editorData(adaptation: number, version: number) {
  const key = `${adaptation}/${version}`;
  if (!cache.has(key)) {
    try {
      cache.set(key, JSON.parse(readFileSync(path.join(root(), 'editor', String(adaptation), `v${version}`, 'data.json'), 'utf8')));
    } catch {
      cache.set(key, null);
    }
  }
  return cache.get(key)!;
}

/** Width and height from a PNG's IHDR or a JPEG's first SOF marker; null if it is neither. */
export function pictureSize(b: Buffer): { width: number; height: number; contentType: string } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString('ascii', 12, 16) === 'IHDR') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), contentType: 'image/png' };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5), contentType: 'image/jpeg' };
      i += 2 + len;
    }
  }
  return null;
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function served(p: Pic, role: 'card' | 'plate', name: string): RemixPicture | null {
  if (!/^\/editor\/\d+\/v\d+\/(cards|plates)\/[\w.-]+\.(jpg|png)$/.test(p.src)) return null;
  try {
    const bytes = readFileSync(path.join(root(), p.src));
    const size = pictureSize(bytes);
    if (!size) return null;
    return { role, name, src: p.src, file: p.file, fileSha256: p.sha256, bytes, sha256: sha(bytes), ...size };
  } catch {
    return null;
  }
}

export function remixShot(adaptation: number, version: number, shotId: string): RemixShot | null {
  const own = editorData(adaptation, version);
  if (!own?.shots.some((x) => x.id === shotId)) return null;
  // A version redrawn by a closed model from an open-weight one: with that model (flag on), its own shot; otherwise
  // the open-weight version's shot, for the open-weight model.
  const model = remixModelFor(own.closedModel?.endpoint);
  const from = model === 'gpt' ? version : (own.openFrom ?? version);
  const d = from === version ? own : editorData(adaptation, from);
  const s = d?.shots.find((x) => x.id === shotId);
  if (!s) return null;
  const cards = s.cards.map((c) => served(c, 'card', c.who ?? 'cast')).filter((c): c is RemixPicture => c !== null);
  return {
    adaptation,
    version,
    from,
    openFrom: own.openFrom ?? null,
    versionModel: own.closedModel ? { name: own.closedModel.name, maker: own.closedModel.maker } : null,
    model,
    id: s.id,
    n: s.n,
    who: s.who,
    hasCamera: Boolean(s.camera),
    recipeId: s.recipe?.id ?? null,
    recipeSha256: s.recipe?.sha256 ?? null,
    prompt: s.recipe?.prompt ?? null,
    cards,
    plate: s.plate ? served(s.plate, 'plate', s.plate.name ?? 'plate') : null,
  };
}

/** The live layout as the browser sent it: a PNG data URL of the shot camera's depth view, checked. */
export function layoutPicture(dataUrl: unknown, limits: { width: number; height: number; maxBytes: number }): RemixPicture | null {
  const m = typeof dataUrl === 'string' ? dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/) : null;
  if (!m) return null;
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.length > limits.maxBytes) return null;
  const size = pictureSize(bytes);
  if (!size || size.contentType !== 'image/png' || size.width !== limits.width || size.height !== limits.height) return null;
  return { role: 'layout', name: 'live layout (depth)', src: null, file: null, fileSha256: null, bytes, sha256: sha(bytes), ...size };
}

/** What a storyboard may name in a version: its shots (with their length) and, per line, the takes it may pick. */
export function versionIndex(adaptation: number, version: number): { shots: Map<string, { seconds: number; cues: string[] }>; takes: Map<string, Set<string>> } | null {
  const d = editorData(adaptation, version);
  if (!d) return null;
  const shots = new Map<string, { seconds: number; cues: string[] }>();
  const takes = new Map<string, Set<string>>();
  for (const s of d.shots) {
    shots.set(s.id, { seconds: +(s.to - s.from).toFixed(2), cues: s.lines.map((l) => l.cue) });
    for (const l of s.lines) takes.set(l.cue, new Set(['version', ...(l.takes ?? []).map((t) => t.id)]));
  }
  return { shots, takes };
}
