import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { blockFacts, READABLE_KINDS, type BlockLike } from '../reading';
import { IMAGE_WORDING } from './wording';

/**
 * Character and place sheets as text (owner, 2026-10-10: "text summaries of key characters and
 * locations … connected to images created from the text"). The project's sheets are the files in
 * content/snowmoon/designs/characters and locations: `about` (a summary) and `descriptor` (this
 * edition's invented look; both drafted by the coding agent, a closed model), and `facts` (the
 * book's own words, verbatim, each at its block).
 *
 * Which sheets a passage involves is decided here, deterministically, with no model:
 * - characters: those the passage names, by full name, a word of it they are called by (titles
 *   left out), or an alias; whole words, case kept; phrases in name_exclusions are not them (the
 *   same rule as scripts/first-appearances.ts, which imports it from here);
 * - the place: from content/snowmoon/designs/scenes.json (npm run designs:scenes), where each part
 *   of a scene takes a location when it holds one of the location's facts or a seeded image of it.
 *
 * No 'server-only' here, so scripts share it; it reads files, so client components never import it.
 */
const ROOT = process.cwd();
const DESIGNS = 'content/snowmoon/designs';
export const SCENES_FILE = `${DESIGNS}/scenes.json`;
const TITLES = /^(Lord|Lady|General|Senator|Doctor|Dr\.?)$/;

export interface Fact {
  chapter: number;
  idx: number;
  quote: string;
  fact?: string;
}
export interface SheetCharacter {
  kind: 'character';
  slug: string;
  name: string;
  setting: string | null;
  about: string;
  descriptor: string;
  facts: Fact[];
  /** Where the book first names them (first_appearance), for covering spoilers. */
  firstChapter: number;
  names: string[];
  exclusions: string[];
}
export interface SheetPlace {
  kind: 'place';
  slug: string;
  name: string;
  setting: string | null;
  about: string;
  descriptor: string;
  facts: Fact[];
}

/** The words a character is called by: the full name, each word of it but titles, and aliases. */
export function namesFor(c: { name: string; aliases?: string[] }): string[] {
  return [...new Set([c.name, ...c.name.split(/\s+/).filter((w) => !TITLES.test(w) && w.length > 1), ...(c.aliases ?? [])])];
}
const wordRe = (n: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u');
/** The name it is called by in this text, if the text names them (exclusions removed first). */
export function namedAs(text: string, names: string[], exclusions: string[] = []): string | null {
  const t = exclusions.reduce((s, x) => s.split(x).join(' '), text);
  return names.find((n) => wordRe(n).test(t)) ?? null;
}

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8')) as T;
const files = (dir: string) => readdirSync(path.join(ROOT, DESIGNS, dir)).filter((f) => f.endsWith('.json')).sort();
const byFact = (a: Fact, b: Fact) => a.chapter - b.chapter || a.idx - b.idx;

let chars: SheetCharacter[] | null = null;
export function sheetCharacters(): SheetCharacter[] {
  chars ??= files('characters').map((f) => {
    const c = readJson<{ slug: string; name: string; setting?: string; about?: string; descriptor?: string; facts?: Fact[]; aliases?: string[]; name_exclusions?: string[]; first_appearance?: { chapter: number } | null }>(`${DESIGNS}/characters/${f}`);
    const facts = [...(c.facts ?? [])].sort(byFact);
    return {
      kind: 'character' as const, slug: c.slug, name: c.name, setting: c.setting ?? null, about: c.about ?? '', descriptor: c.descriptor ?? '', facts,
      firstChapter: c.first_appearance?.chapter ?? facts[0]?.chapter ?? 1, names: namesFor(c), exclusions: c.name_exclusions ?? [],
    };
  });
  return chars;
}
let places: SheetPlace[] | null = null;
export function sheetPlaces(): SheetPlace[] {
  places ??= files('locations').map((f) => {
    const c = readJson<{ slug: string; name: string; setting?: string; about?: string; descriptor?: string; facts?: Fact[] }>(`${DESIGNS}/locations/${f}`);
    return { kind: 'place' as const, slug: c.slug, name: c.name, setting: c.setting ?? null, about: c.about ?? '', descriptor: c.descriptor ?? '', facts: [...(c.facts ?? [])].sort(byFact) };
  });
  return places;
}
export const sheetCharacter = (slug: string) => sheetCharacters().find((c) => c.slug === slug) ?? null;
export const sheetPlace = (slug: string) => sheetPlaces().find((p) => p.slug === slug) ?? null;
/** "Gladias and Seila's house", not "gladias and Seila's house": names start with a capital in a list. */
export const placeTitle = (name: string) => name.replace(/^./, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------------------------
// Scenes and their places (derived by scripts/designs-scenes.ts; the committed file is read here).
// ---------------------------------------------------------------------------------------------
export interface Chapter {
  chapter: number;
  blocks: (BlockLike & { idx: number })[];
}
export interface SeededImage {
  id: string;
  chapter: number;
  idx: number;
  url: string;
  width: number;
  height: number;
  /** A designs/locations path, or null when no place sheet fits. */
  location: string | null;
  characters: string[];
  recipe: string;
}
/** One part of a scene with one place (or none). A scene is split only where its evidence changes place. */
export interface ScenePart {
  chapter: number;
  scene: number;
  /** The part's first and last block (book block ids), and the ¶ numbers readers see. */
  start: number;
  end: number;
  from: number | null;
  to: number | null;
  place: string | null;
  /** The block that gives the place: a seeded image's block or a fact's block, inside the part. */
  evidence: string | null;
  why: string | null;
}
export interface ScenesFile {
  about: string;
  rule: string;
  parts: ScenePart[];
}

export function bookChapters(): Chapter[] {
  const dir = path.join(ROOT, 'content/snowmoon/text');
  return readdirSync(dir)
    .filter((f) => /^chapter-\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as Chapter)
    .sort((a, b) => a.chapter - b.chapter);
}
let seededCache: SeededImage[] | null = null;
export function seededImages(): SeededImage[] {
  const file = path.join(ROOT, 'content/snowmoon/illustrations/published.json');
  seededCache ??= existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { images: SeededImage[] }).images : [];
  return seededCache;
}
export const slugOfLocation = (p: string | null | undefined) => (p ? (p.match(/locations\/([a-z0-9-]+)\.json$/)?.[1] ?? null) : null);

export const SCENE_RULE =
  'Each scene (the text between two breaks) takes the place its evidence gives. Evidence is a seeded image with a location (people chose those) from its own block on, and before a scene’s first seeded image, a block quoted as one of a location’s facts. Where a scene’s evidence changes place, the scene is split at that evidence block; the part before the first evidence takes the first place. A seeded image marked with no location starts a part with no place. A scene with no evidence has no place.';

/** Derive the parts of every scene and their places. Deterministic: the book, the location files, published.json. */
export function deriveScenes(chapters: Chapter[], locs: SheetPlace[], seeded: SeededImage[]): ScenePart[] {
  const out: ScenePart[] = [];
  for (const ch of chapters) {
    const facts = blockFacts(ch.blocks);
    const scenes = new Map<number, { idx: number; label: number | null }[]>();
    ch.blocks.forEach((b, i) => {
      if (b.kind === 'break' || b.kind === 'heading') return;
      const list = scenes.get(facts[i].scene) ?? [];
      list.push({ idx: b.idx, label: facts[i].label });
      scenes.set(facts[i].scene, list);
    });
    for (const [scene, blocks] of scenes) {
      const first = blocks[0].idx, last = blocks[blocks.length - 1].idx;
      const inside = (idx: number) => idx >= first && idx <= last;
      const images = seeded.filter((s) => s.chapter === ch.chapter && inside(s.idx)).sort((a, b) => a.idx - b.idx);
      // Seeded images decide from their own block on; before a scene's first seeded image (or in a scene
      // with none), the locations' facts do (2026-10-10: an image with no place no longer erases the
      // book's own evidence earlier in its scene).
      const firstImage = images.length ? images[0].idx : Infinity;
      const factEvidence = locs
        .flatMap((l) => l.facts.filter((f) => f.chapter === ch.chapter && inside(f.idx) && f.idx < firstImage).map((f) => ({ idx: f.idx, place: l.slug as string | null, why: `a fact of ${l.slug}` })))
        .sort((a, b) => a.idx - b.idx || a.place!.localeCompare(b.place!));
      const evidence: { idx: number; place: string | null; why: string }[] = [
        ...factEvidence,
        ...images.map((s) => ({ idx: s.idx, place: slugOfLocation(s.location), why: `seeded image ${s.id}` })),
      ];
      // Runs of the same place; each change starts a new part at its evidence block.
      const runs: { at: number; place: string | null; evidence: number; why: string }[] = [];
      for (const e of evidence) if (!runs.length || runs[runs.length - 1].place !== e.place) runs.push({ at: e.idx, place: e.place, evidence: e.idx, why: e.why });
      if (!runs.length) runs.push({ at: first, place: null, evidence: -1, why: '' });
      runs[0].at = first;
      runs.forEach((r, k) => {
        const end = k + 1 < runs.length ? Math.max(...blocks.filter((b) => b.idx < runs[k + 1].at).map((b) => b.idx)) : last;
        const labels = blocks.filter((b) => b.idx >= r.at && b.idx <= end && b.label !== null).map((b) => b.label as number);
        out.push({
          chapter: ch.chapter, scene, start: r.at, end, from: labels[0] ?? null, to: labels[labels.length - 1] ?? null,
          place: r.place, evidence: r.evidence >= 0 && r.place ? `c${ch.chapter}-b${r.evidence}` : null, why: r.place ? r.why : r.evidence >= 0 ? r.why : null,
        });
      });
    }
  }
  return out;
}

let scenesCache: ScenesFile | null = null;
export function loadScenes(): ScenesFile {
  scenesCache ??= existsSync(path.join(ROOT, SCENES_FILE)) ? readJson<ScenesFile>(SCENES_FILE) : { about: '', rule: '', parts: [] };
  return scenesCache;
}
/** Where a place appears: its parts, in book order. */
export const partsOf = (slug: string) => loadScenes().parts.filter((p) => p.place === slug);
/** The first chapter a place appears in (scenes.json), else its earliest fact: for covering spoilers. */
export function placeFirstChapter(p: SheetPlace): number {
  return partsOf(p.slug)[0]?.chapter ?? p.facts[0]?.chapter ?? 1;
}

// ---------------------------------------------------------------------------------------------
// A passage: who it names, and the place of the scene it is in.
// ---------------------------------------------------------------------------------------------
export interface InPassage {
  characters: { slug: string; name: string; as: string }[];
  place: { slug: string; name: string; evidence: string } | null;
}
const plain = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\*\*|__/g, '').replace(/\\(.)/g, '$1');

export function inPassageOf(ch: Chapter, start: number, end: number): InPassage {
  const blocks = ch.blocks.filter((b) => b.idx >= start && b.idx <= end && READABLE_KINDS.has(b.kind));
  const text = blocks.map((b) => plain(b.content));
  // In the order the passage first names them.
  const found = sheetCharacters()
    .map((c) => {
      for (let i = 0; i < text.length; i++) {
        const as = namedAs(text[i], c.names, c.exclusions);
        if (as) {
          const t = c.exclusions.reduce((s, x) => s.split(x).join(' '), text[i]);
          return { slug: c.slug, name: c.name, as, at: i * 100_000 + t.search(wordRe(as)) };
        }
      }
      return null;
    })
    .filter((x): x is { slug: string; name: string; as: string; at: number } => x !== null)
    .sort((a, b) => a.at - b.at)
    .map(({ slug, name, as }) => ({ slug, name, as }));
  // The part the passage mostly sits in (ties: the earlier part).
  const parts = loadScenes().parts.filter((p) => p.chapter === ch.chapter && p.end >= start && p.start <= end);
  const ids = ch.blocks.filter((b) => b.idx >= start && b.idx <= end).map((b) => b.idx);
  const part = parts.map((p) => ({ p, n: ids.filter((i) => i >= p.start && i <= p.end).length })).sort((a, b) => b.n - a.n || a.p.start - b.p.start)[0]?.p;
  const loc = part?.place ? sheetPlace(part.place) : null;
  return { characters: found, place: loc && part?.evidence ? { slug: loc.slug, name: loc.name, evidence: part.evidence } : null };
}

let chapterCache: Map<number, Chapter> | null = null;
export function inPassage(chapter: number, start: number, end: number): InPassage {
  chapterCache ??= new Map(bookChapters().map((c) => [c.chapter, c]));
  const ch = chapterCache.get(chapter);
  return ch ? inPassageOf(ch, start, end) : { characters: [], place: null };
}

/**
 * The project's shorthand as it is added to a prompt: the name, then the edition's invented look.
 * The descriptor was drafted by the coding agent (a closed model); recipes say so in `assist`.
 */
export function shorthandLine(s: { kind: 'character' | 'place'; name: string; descriptor: string }): string {
  const d = s.descriptor.trim().replace(/\.$/, '');
  return s.kind === 'character' ? `${s.name}: ${d}.` : `The place, ${s.name}: ${d}.`;
}
export const SHORTHAND_ASSIST_SOURCE = `${DESIGNS}/characters, ${DESIGNS}/locations (descriptor)`;

/**
 * What Generate is asked to add from "In this passage": only characters the passage names and the
 * scene's own place, never an arbitrary id. Refused before anything is counted.
 */
export function askedSheets(found: InPassage, raw: unknown, max: number): { ok: true; characters: string[]; place: string | null } | { ok: false; error: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { characters?: unknown; place?: unknown };
  const characters = [...new Set(Array.isArray(r.characters) ? r.characters.map(String) : [])];
  if (characters.some((slug) => !found.characters.some((c) => c.slug === slug))) return { ok: false, error: IMAGE_WORDING.designs.sheets.notNamed };
  if (characters.length > max) return { ok: false, error: `Up to ${max} characters in one image` };
  const place = r.place === null || r.place === undefined ? null : String(r.place);
  if (place !== null && place !== found.place?.slug) return { ok: false, error: IMAGE_WORDING.designs.sheets.notThisPlace };
  return { ok: true, characters, place };
}

/**
 * The sheets an image records, and the text added for them: the project's shorthand for each chosen
 * character without a picked sheet (a picked sheet's own text replaces it), and for the place.
 * `characters` also names the characters of picked sheets added. Null when there are none.
 */
export function sheetsForImage(asked: { characters: string[]; place: string | null }, pickedEntities: string[]) {
  const picked = new Set(pickedEntities);
  const characters = [...new Set([...asked.characters, ...pickedEntities.map((n) => sheetCharacters().find((c) => c.name === n)?.slug).filter((x): x is string => Boolean(x))])];
  if (!characters.length && !asked.place) return null;
  const added = [
    ...asked.characters.map((slug) => sheetCharacter(slug)).filter((c): c is SheetCharacter => c !== null && !picked.has(c.name)).map((c) => ({ kind: 'character' as const, slug: c.slug, name: c.name, text: shorthandLine(c) })),
    ...[asked.place ? sheetPlace(asked.place) : null].filter((p): p is SheetPlace => p !== null).map((p) => ({ kind: 'place' as const, slug: p.slug, name: p.name, text: shorthandLine(p) })),
  ];
  return { characters, place: asked.place, added };
}
