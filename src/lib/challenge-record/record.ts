import { createHash } from 'node:crypto';
import { BOOK, buildGraph, type LinkRow, type VersionRow } from '../deep-funding/graph';

/**
 * The challenge record: fingerprints, not copies (docs/proposals/challenge-record.md; owner, 2026-11-01). Pure
 * functions, so scripts/test-challenge-record.ts can prove them on stand-ins.
 *
 * For every entry, and every version an entry was built on, the record holds only:
 * - the sha256 of each picture (its bytes as served; the sha256 the version stores) and of each picture's recipe
 *   (`snowmoon.recipe/1`: the recipe as the version page shows it, in RFC 8785 JSON);
 * - the maker's FID;
 * - when it was published;
 * - what it was built on (its parents, as the deep funding graph reads them).
 * No pictures, words, titles, recipe text or byline names. A version not published at export time is recorded by id
 * only. The build is deterministic: no clock, fixed orders, RFC 8785, so the same rows give the same bytes and CID.
 */

// ---------------------------------------------------------------------------------------------------------------
// RFC 8785 (JSON Canonicalization Scheme)
// ---------------------------------------------------------------------------------------------------------------

/**
 * RFC 8785: object keys sorted by UTF-16 code units (JavaScript's default string order), no whitespace, numbers and
 * strings serialized as ECMAScript's JSON.stringify does (which is what RFC 8785 specifies). Refuses what JSON can't
 * hold exactly: non-finite numbers, undefined, functions, and lone surrogates in strings.
 */
export function canonicalize(v: unknown): string {
  if (v === null || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('RFC 8785: a number that is not finite');
    return JSON.stringify(v);
  }
  if (typeof v === 'string') {
    if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(v)) throw new Error('RFC 8785: a lone surrogate');
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(o[k])}`).join(',')}}`;
  }
  throw new Error(`RFC 8785: cannot hold a ${typeof v}`);
}

export const sha256Hex = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');

// ---------------------------------------------------------------------------------------------------------------
// The recipe as the page shows it: snowmoon.recipe/1
// ---------------------------------------------------------------------------------------------------------------

/**
 * The recipe fields the version page shows (src/app/references/designs/[id]/page.tsx, "How it was made": the prompt,
 * then howMade() in src/lib/images/recipe-lines.ts), with the values as shown:
 * - prompt; model; endpoint; host;
 * - seed (or null: "not recorded"); request_id (or null); cost_usd to 4 decimals (shown "$0.0030"); made_on, the
 *   date only (shown as made_at's first 10 characters);
 * - references: each one's sha256 and `what`, if any (shown in "Made from …");
 * - settings: only `converted` (from, sha256, to) and `derived` (shown); other settings are not on the page;
 * - checks: the prompt check's model and verdict, and the host's safety checker (shown in "Checked by …");
 * - assist: the drafting model and what it drafted (shown in "… was drafted by …").
 * Not shown, so not in it: width, height, the style text (it is in the prompt), other settings.
 * A field absent from the stored recipe is left out, never written as null (except seed and request_id, which the
 * page shows as "not recorded").
 */
export interface StoredRecipe {
  prompt?: unknown;
  model?: unknown;
  endpoint?: unknown;
  host?: unknown;
  seed?: unknown;
  request_id?: unknown;
  cost_usd?: unknown;
  made_at?: unknown;
  references?: unknown;
  settings?: unknown;
  checks?: unknown;
  assist?: unknown;
  [k: string]: unknown;
}

export const RECIPE_SCHEMA = 'snowmoon.recipe/1';

export function pageRecipe(r: StoredRecipe): Record<string, unknown> {
  const out: Record<string, unknown> = { schema: RECIPE_SCHEMA };
  const s = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : undefined);
  out.prompt = s('prompt') ?? '';
  out.model = s('model') ?? '';
  out.endpoint = s('endpoint') ?? '';
  out.host = s('host') ?? '';
  out.seed = typeof r.seed === 'number' ? r.seed : null;
  out.request_id = typeof r.request_id === 'string' ? r.request_id : null;
  out.cost_usd = Number((typeof r.cost_usd === 'number' ? r.cost_usd : 0).toFixed(4));
  out.made_on = (s('made_at') ?? '').slice(0, 10);
  if (Array.isArray(r.references) && r.references.length) {
    out.references = (r.references as { sha256?: unknown; what?: unknown }[]).map((x) => ({ sha256: String(x.sha256 ?? ''), ...(typeof x.what === 'string' ? { what: x.what } : {}) }));
  }
  const st = (r.settings ?? {}) as { converted?: { from?: unknown; sha256?: unknown; to?: unknown }; derived?: unknown };
  const settings: Record<string, unknown> = {};
  if (st.converted && typeof st.converted.sha256 === 'string') settings.converted = { from: String(st.converted.from ?? ''), sha256: st.converted.sha256, to: String(st.converted.to ?? '') };
  if (typeof st.derived === 'string') settings.derived = st.derived;
  if (Object.keys(settings).length) out.settings = settings;
  const c = (r.checks ?? null) as { prompt?: { model?: unknown; verdict?: unknown } | null; host_safety_checker?: unknown } | null;
  if (c) {
    out.checks = {
      prompt: c.prompt ? { model: String(c.prompt.model ?? ''), verdict: String(c.prompt.verdict ?? '') } : null,
      host_safety_checker: typeof c.host_safety_checker === 'string' ? c.host_safety_checker : null,
    };
  }
  const a = (r.assist ?? null) as { model?: unknown; drafted?: unknown } | null;
  if (a && typeof a.model === 'string') out.assist = { model: a.model, drafted: Array.isArray(a.drafted) ? a.drafted.map(String) : [] };
  return out;
}

/** A recipe's fingerprint: lowercase hex sha256 of the RFC 8785 JSON of snowmoon.recipe/1. */
export const recipeSha256 = (r: StoredRecipe) => sha256Hex(canonicalize(pageRecipe(r)));

// ---------------------------------------------------------------------------------------------------------------
// The entries record: snowmoon.challenge.entries/1
// ---------------------------------------------------------------------------------------------------------------

export const ENTRIES_SCHEMA = 'snowmoon.challenge.entries/1';

export interface RecordPicture {
  view: string;
  sha256: string;
  recipe_sha256: string;
}
export interface RecordVersion {
  id: string;
  character: string;
  maker_fid: number;
  published_at: string;
  entry: boolean;
  pictures: RecordPicture[];
  built_on: { version: string; kind: 'remixed_from' | 'uses' | 'fork-origin' }[];
}
export interface RecordHidden {
  id: string;
  hidden_before_export: true;
}
export interface EntriesRecord {
  schema: typeof ENTRIES_SCHEMA;
  challenge: string;
  site: string;
  window: { opens: string; closes: string };
  characters: string[];
  fingerprints: { picture: string; recipe: string };
  replaces: string | null;
  versions: (RecordVersion | RecordHidden)[];
}

/** The exact keys, in order of the plan; the checker refuses any other. */
export const VERSION_KEYS = ['id', 'character', 'maker_fid', 'published_at', 'entry', 'pictures', 'built_on'] as const;
export const PICTURE_KEYS = ['view', 'sha256', 'recipe_sha256'] as const;
export const HIDDEN_KEYS = ['id', 'hidden_before_export'] as const;
export const TOP_KEYS = ['schema', 'challenge', 'site', 'window', 'characters', 'fingerprints', 'replaces', 'versions'] as const;

export const FINGERPRINTS = {
  picture: "sha256 of the picture's bytes as served from the site's storage",
  recipe: 'sha256 of the RFC 8785 JSON of the recipe as the version page shows it (snowmoon.recipe/1)',
};

type Pic = { sha256?: unknown; recipe?: StoredRecipe };

/** A version's pictures in the record's order: front, side, back, then samples (sample-1, sample-2, …). */
function picturesOf(body: unknown): { view: string; p: Pic }[] {
  const b = (body ?? {}) as { views?: Record<string, Pic | undefined>; samples?: Pic[] };
  const out: { view: string; p: Pic }[] = [];
  for (const v of ['front', 'side', 'back']) if (b.views?.[v]) out.push({ view: v, p: b.views[v]! });
  (b.samples ?? []).forEach((p, i) => out.push({ view: `sample-${i + 1}`, p }));
  return out;
}

export class RecordError extends Error {}

/**
 * Builds the entries record from rows: the entries (version id and character slug), every version reachable from
 * them and every link (loadRows in src/lib/deep-funding/load.ts), the character slug of an entity name, and the
 * challenge's fixed details. No clock: the same input gives the same record.
 */
export function buildEntriesRecord(input: {
  challenge: string;
  site: string;
  window: { opens: string; closes: string };
  characters: readonly string[];
  entries: { versionId: string; character: string }[];
  versions: VersionRow[];
  links: LinkRow[];
  slugOf: (entityName: string) => string | null;
}): EntriesRecord {
  const byId = new Map(input.versions.map((v) => [v.id, v]));
  const entryIds = new Set(input.entries.map((e) => e.versionId));
  const parents = new Map<string, RecordVersion['built_on']>();
  for (const e of input.entries) {
    const g = buildGraph({ character: e.character, final: e.versionId, versions: input.versions, links: input.links, eligibility: [], admins: [] });
    for (const n of g.nodes) {
      if (n.kind === 'book' || parents.has(n.id)) continue;
      parents.set(n.id, g.edges.filter((x) => x.from === n.id && x.to !== BOOK).map((x) => ({ version: x.to, kind: x.kind as RecordVersion['built_on'][number]['kind'] })));
    }
  }
  const out: (RecordVersion | RecordHidden)[] = [];
  for (const [id, built_on] of parents) {
    const v = byId.get(id)!;
    if (v.status !== 'published') {
      out.push({ id, hidden_before_export: true });
      continue;
    }
    const character = input.slugOf(v.entity);
    if (!character) throw new RecordError(`version ${id}: its character (${v.entity}) is not a challenge character`);
    out.push({
      id,
      character,
      maker_fid: v.makerFid,
      published_at: new Date(v.createdAt).toISOString(),
      entry: entryIds.has(id),
      pictures: picturesOf(v.body).map(({ view, p }) => {
        if (typeof p.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(p.sha256)) throw new RecordError(`version ${id}: picture ${view} has no sha256`);
        return { view, sha256: p.sha256, recipe_sha256: recipeSha256(p.recipe ?? {}) };
      }),
      built_on,
    });
  }
  // Fixed order: published versions by publish time, then id; versions recorded by id only, by id, last.
  const at = (x: RecordVersion | RecordHidden) => ('published_at' in x ? x.published_at : '~');
  out.sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const problems = recordProblems({ schema: ENTRIES_SCHEMA, challenge: input.challenge, site: input.site, window: input.window, characters: [...input.characters], fingerprints: FINGERPRINTS, replaces: null, versions: out });
  if (problems.length) throw new RecordError(problems.join('; '));
  return { schema: ENTRIES_SCHEMA, challenge: input.challenge, site: input.site, window: input.window, characters: [...input.characters], fingerprints: FINGERPRINTS, replaces: null, versions: out };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const same = (a: string[], b: readonly string[]) => a.length === b.length && a.every((k, i) => k === b[i]);

/**
 * The record's checker: every per-version row has exactly the allowed keys, and every value is of its narrow form
 * (a uuid, a FID, a 64-hex sha256, an ISO time, a slug, a view name, a link kind). So no title, text, prompt, name or
 * address can be in a row, whatever key it hides under. Returns every problem found.
 */
export function recordProblems(r: unknown): string[] {
  const p: string[] = [];
  const o = r as Record<string, unknown>;
  if (!o || typeof o !== 'object') return ['not an object'];
  if (!same(Object.keys(o), TOP_KEYS)) p.push(`top-level keys are ${Object.keys(o).join(',')}`);
  if (o.schema !== ENTRIES_SCHEMA) p.push('wrong schema');
  for (const x of (o.versions ?? []) as Record<string, unknown>[]) {
    const keys = Object.keys(x);
    const id = String(x.id);
    if (!UUID.test(id)) p.push(`a version id is not a uuid: ${id.slice(0, 40)}`);
    if ('hidden_before_export' in x) {
      if (!same(keys, HIDDEN_KEYS) || x.hidden_before_export !== true) p.push(`${id}: a hidden version holds more than its id`);
      continue;
    }
    if (!same(keys, VERSION_KEYS)) p.push(`${id}: keys are ${keys.join(',')}`);
    if (typeof x.character !== 'string' || !/^[a-z0-9-]{1,40}$/.test(x.character)) p.push(`${id}: character is not a slug`);
    if (!Number.isInteger(x.maker_fid) || (x.maker_fid as number) <= 0) p.push(`${id}: maker_fid is not a FID`);
    if (typeof x.published_at !== 'string' || !ISO.test(x.published_at)) p.push(`${id}: published_at is not an ISO time`);
    if (typeof x.entry !== 'boolean') p.push(`${id}: entry is not true or false`);
    for (const pic of (Array.isArray(x.pictures) ? x.pictures : [null]) as Record<string, unknown>[]) {
      if (!pic || !same(Object.keys(pic), PICTURE_KEYS)) {
        p.push(`${id}: a picture holds keys ${pic ? Object.keys(pic).join(',') : 'none'}`);
        continue;
      }
      if (typeof pic.view !== 'string' || !/^(front|side|back|sample-\d{1,3})$/.test(pic.view)) p.push(`${id}: a picture's view is not a view name`);
      if (!HEX64.test(String(pic.sha256)) || !HEX64.test(String(pic.recipe_sha256))) p.push(`${id}: a picture's fingerprint is not a sha256`);
    }
    for (const b of (Array.isArray(x.built_on) ? x.built_on : [null]) as Record<string, unknown>[]) {
      if (!b || !same(Object.keys(b), ['version', 'kind']) || !UUID.test(String(b.version)) || !['remixed_from', 'uses', 'fork-origin'].includes(String(b.kind))) p.push(`${id}: a built_on link is malformed`);
    }
  }
  return p;
}

// ---------------------------------------------------------------------------------------------------------------
// Bytes, sha256 and CID (offline)
// ---------------------------------------------------------------------------------------------------------------

/** The record's file: its RFC 8785 JSON, UTF-8, with no trailing newline. */
export const recordBytes = (r: EntriesRecord) => Buffer.from(canonicalize(r), 'utf8');

/** The fixed IPFS settings (the plan): CIDv1, raw leaves, sha2-256, 1 MiB chunks, balanced layout. */
export const IPFS_SETTINGS = { cidVersion: 1, rawLeaves: true, hash: 'sha2-256', chunker: 'size-1048576', layout: 'balanced' } as const;
export const CHUNK = 1048576;

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/**
 * The CID IPFS gives a file of at most one chunk with the plan's settings: with raw leaves, a single-chunk file is one
 * raw block, so its CID is CIDv1, codec raw (0x55), multihash sha2-256 (0x12, 32 bytes), in base32 ("b…"), what
 * `ipfs add --cid-version=1 --raw-leaves --chunker=size-1048576` prints for it. Computed here with no tool and no
 * network. A larger file needs a UnixFS tree (kubo): null.
 */
export function offlineCid(bytes: Uint8Array): string | null {
  if (bytes.length > CHUNK) return null;
  const digest = createHash('sha256').update(bytes).digest();
  return `b${base32(Uint8Array.from([0x01, 0x55, 0x12, 0x20, ...digest]))}`;
}
