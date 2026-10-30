import 'server-only';
import { AGENT_API, appUrl } from '../config';
import { blockId, chapterNumbers, loadChapter } from '../book';
import { glossaryThrough } from '../glossary';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { plainText, searchBook } from '../book-search';
import { authorVersions, editorVersion, getAdaptation, getVersion, ownMedia, publicCatalogue, sceneHandleFor, sceneOwner, type Version } from '../adaptation-pages';
import { editorData, type DataShot } from './data';

/**
 * The agent interface's read-only tools (owner, 2026-10-19; design: "Snowmoon: agent interface" v1 and v2).
 * One set of tools, served as MCP (/api/mcp) and as REST (/api/agent/v1/<tool>). Each reads only what the site
 * already shows anyone: the book's text (GPL-3.0; agents aren't held to a reader's spoiler limit), and published
 * scenes, their shots, lines and recipes. Nothing hidden, nothing private, no person beyond a published byline.
 * Every answer carries its licence and, for anything a model made, its AI label.
 */
export class ToolInputError extends Error {}

type Schema = { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Schema;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

const int = (args: Record<string, unknown>, k: string, opts: { min?: number; max?: number; optional?: boolean } = {}): number | undefined => {
  const v = args[k];
  if (v === undefined || v === null) {
    if (opts.optional) return undefined;
    throw new ToolInputError(`${k} is required`);
  }
  const n = typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || (opts.min !== undefined && n < opts.min) || (opts.max !== undefined && n > opts.max)) throw new ToolInputError(`${k} must be a whole number${opts.min !== undefined ? ` from ${opts.min}` : ''}${opts.max !== undefined ? ` to ${opts.max}` : ''}`);
  return n;
};
const str = (args: Record<string, unknown>, k: string, re: RegExp, what: string) => {
  const v = args[k];
  if (typeof v !== 'string' || !re.test(v)) throw new ToolInputError(`${k} must be ${what}`);
  return v;
};
const only = (args: Record<string, unknown>, keys: string[]) => {
  const extra = Object.keys(args).filter((k) => !keys.includes(k));
  if (extra.length) throw new ToolInputError(`unknown argument: ${extra.join(', ')}`);
};

const BOOK = { title: 'Snowmoon', author: 'Vitalik Buterin', licence: 'GPL-3.0', source: 'https://vitalik.eth.limo/snowmoon/' };
const SITE = 'An independent adaptation, not affiliated with the author.';
const abs = (u: string | null | undefined) => (u ? (u.startsWith('/') ? `${appUrl()}${u}` : u) : null);

/** The public facts of a version, as on its scene page. */
async function versionFacts(v: Version) {
  const handle = await sceneHandleFor(v.author);
  const r = v.recipe;
  return {
    version: v.id,
    parent_version: v.parentId,
    by: handle ? `@${handle}` : null,
    created: v.createdAt,
    page: handle ? `${appUrl()}/@${handle}/${v.adaptationId}/v/${v.id}` : null,
    video: ownMedia(r.video_url),
    poster: ownMedia(r.poster_url ?? null),
    ai_label: r.ai_label ?? null,
    closed_model: r.closed_model ? { name: r.closed_model.name, maker: r.closed_model.maker, date: r.closed_model.date, made: r.closed_model.made, closed: true } : null,
    after_chapter: r.after_chapter ?? null,
    spoilers_through: r.spoilers_through ?? null,
    licence: 'GPL-3.0',
  };
}

async function publicVersion(adaptation: number, version: number) {
  const v = await getVersion(version);
  if (!v || v.adaptationId !== adaptation || v.hidden) throw new ToolInputError('no such public version of that adaptation');
  return v;
}

function shotOf(adaptation: number, editorVersionId: number, shot: string): { shot: DataShot; title: string; closedModel: unknown } {
  const d = editorData(adaptation, editorVersionId);
  const s = d?.shots.find((x) => x.id === shot);
  if (!d || !s) throw new ToolInputError('no such shot in that version');
  return { shot: s, title: d.title, closedModel: d.closedModel ?? null };
}

const lineOut = (l: Record<string, unknown>) => {
  const voice = l.voice as { src?: string; name?: string; sha256?: string; model?: { id?: string; name?: string; licence?: string } } | null | undefined;
  return {
    cue: l.cue,
    at: l.at,
    speaker: l.speaker,
    text: l.text,
    // Whose words: the book's (with its block), or a person's (their handle and date).
    by: l.by,
    voice: voice?.src ? { url: abs(voice.src), name: voice.name ?? null, sha256: voice.sha256 ?? null, model: voice.model ?? null, label: "Synthetic voice: a person's performance, AI-converted, not by the author" } : null,
  };
};

export const TOOLS: Tool[] = [
  {
    name: 'search_book',
    title: 'Search the book',
    description: "Find words in Snowmoon (Vitalik Buterin, GPL-3.0). Returns passages with their chapter and block id (c<chapter>-b<block>), the site's citation form. 3 to 80 characters.",
    inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 3, maxLength: 80 }, limit: { type: 'integer', minimum: 1, maximum: AGENT_API.maxHits } }, required: ['query'], additionalProperties: false },
    run: async (args) => {
      only(args, ['query', 'limit']);
      const q = str(args, 'query', /^[\s\S]{3,80}$/, '3 to 80 characters');
      const limit = int(args, 'limit', { min: 1, max: AGENT_API.maxHits, optional: true }) ?? 10;
      const r = searchBook(q, limit);
      if (!r.ok) throw new ToolInputError(r.error);
      return { book: BOOK, query: r.q, more: r.more, hits: r.hits.map((h) => ({ ...h, block_id: blockId(h.chapter, h.idx), url: `${appUrl()}/chapter/${h.chapter}#${blockId(h.chapter, h.idx)}` })) };
    },
  },
  {
    name: 'get_passage',
    title: 'Read a passage of the book',
    description: `Blocks of one chapter of Snowmoon, from one block to another (at most ${AGENT_API.maxBlocks}), each with its id, kind and plain text. The book is GPL-3.0.`,
    inputSchema: { type: 'object', properties: { chapter: { type: 'integer', minimum: 1 }, from: { type: 'integer', minimum: 0 }, to: { type: 'integer', minimum: 0 } }, required: ['chapter', 'from', 'to'], additionalProperties: false },
    run: async (args) => {
      only(args, ['chapter', 'from', 'to']);
      const chapter = int(args, 'chapter', { min: 1, max: 999 })!;
      const from = int(args, 'from', { min: 0, max: 99999 })!, to = int(args, 'to', { min: 0, max: 99999 })!;
      if (to < from) throw new ToolInputError('to must not be before from');
      const ch = loadChapter(chapter);
      if (!ch) throw new ToolInputError(`no chapter ${chapter}; chapters are ${chapterNumbers()[0]} to ${chapterNumbers().at(-1)}`);
      const blocks = ch.blocks.filter((b) => b.idx >= from && b.idx <= to);
      if (blocks.length > AGENT_API.maxBlocks) throw new ToolInputError(`at most ${AGENT_API.maxBlocks} blocks at once`);
      const last = ch.blocks.at(-1)?.idx ?? 0;
      return { book: BOOK, chapter, url: `${appUrl()}/chapter/${chapter}`, blocks_in_chapter: ch.blocks.length, last_block: last, more_after: to < last, blocks: blocks.map((b) => ({ id: blockId(chapter, b.idx), kind: b.kind, text: plainText(b.content) })) };
    },
  },
  {
    name: 'get_glossary',
    title: 'Read the glossary',
    description: `The book's invented words (places, groups, things), spoiler-aware: give "through" (the last chapter read, 1 to ${chapterNumbers().at(-1)}; default all) and only what a reader has met by then comes back. Without "term", every term with where it is first met; with "term" (a term, alias or slug), its full entry: the first sentence it appears in, the sentences that explain it, and every mention, each cited by block id (c<chapter>-b<block>). The texts are the book's own words (GPL-3.0); quote them only word for word.`,
    inputSchema: { type: 'object', properties: { through: { type: 'integer', minimum: 1 }, term: { type: 'string' } }, additionalProperties: false },
    run: async (args) => {
      only(args, ['through', 'term']);
      const lastChapter = chapterNumbers().at(-1)!;
      const through = int(args, 'through', { min: 1, max: lastChapter, optional: true }) ?? lastChapter;
      const all = glossaryThrough(through);
      const url = `${appUrl()}/glossary`;
      if (args.term === undefined) {
        return { book: BOOK, through, url, count: all.length, terms: all.map((t) => ({ slug: t.slug, term: t.term, first_chapter: t.first_chapter, first_seen: t.first_seen })) };
      }
      if (typeof args.term !== 'string' || !args.term.trim()) throw new ToolInputError('term must be a word');
      const q = args.term.trim().toLowerCase();
      const t = all.find((x) => x.slug === q || x.term.toLowerCase() === q || x.aliases.some((a) => a.toLowerCase() === q));
      if (!t) throw new ToolInputError(`no glossary term "${args.term}" met by chapter ${through}${through < lastChapter ? ' (it may come later: raise "through")' : ''}`);
      return { book: BOOK, through, url: `${url}/${t.slug}`, ...t };
    },
  },
  {
    name: 'get_sheet',
    title: 'Read a character or place sheet',
    description: 'A character\'s or place\'s sheet as the site keeps it, with what the book says kept apart from what was invented: "book_facts" are the book\'s own words, word for word, each with its block id (c<chapter>-b<block>); "invented_look" is a starting point the edition made up where the book is silent (say so if you use it). Read this before drafting any picture of a character or place. kind: character or place; slug as in get_references or the glossary (zei, bai, minpentai-arena).',
    inputSchema: { type: 'object', properties: { kind: { enum: ['character', 'place'] }, slug: { type: 'string' } }, required: ['kind', 'slug'], additionalProperties: false },
    run: async (args) => {
      only(args, ['kind', 'slug']);
      const kind = args.kind === 'place' ? 'place' : args.kind === 'character' ? 'character' : null;
      const slug = typeof args.slug === 'string' && /^[a-z0-9-]{1,60}$/.test(args.slug) ? args.slug : null;
      if (!kind || !slug) throw new ToolInputError('kind is character or place, and slug is lowercase letters, numbers and hyphens');
      const f = path.join(process.cwd(), 'content', 'snowmoon', 'designs', kind === 'character' ? 'characters' : 'locations', `${slug}.json`);
      if (!existsSync(f)) throw new ToolInputError(`no ${kind} sheet "${slug}"; get_references with a glossary word lists the sheets it has`);
      const d = JSON.parse(readFileSync(f, 'utf8')) as { name: string; about?: string; descriptor?: string; facts?: { chapter: number; idx: number; quote: string; fact?: string }[] };
      return {
        book: BOOK,
        kind,
        slug,
        name: d.name,
        about: d.about ?? null,
        book_facts: (d.facts ?? []).map((x) => ({ block: blockId(x.chapter, x.idx), quote: x.quote, what_it_tells: x.fact ?? null })),
        invented_look: d.descriptor ? { text: d.descriptor, note: 'Invented by this edition as a starting point where the book is silent; not the book.' } : null,
        url: `${appUrl()}/references/designs/${kind === 'character' ? 'character' : 'place'}/${slug}`,
      };
    },
  },
  {
    name: 'get_references',
    title: 'Read a glossary word\'s references',
    description: 'The character and place sheets this site links to a glossary word (from its reviewed references map), and the pictures already made of them in this edition (each with its chapter and block). Use get_sheet on each sheet for what the book says. Uncertain links waiting for review are left out.',
    inputSchema: { type: 'object', properties: { term: { type: 'string', description: 'A glossary word, alias or slug.' } }, required: ['term'], additionalProperties: false },
    run: async (args) => {
      only(args, ['term']);
      if (typeof args.term !== 'string' || !args.term.trim()) throw new ToolInputError('term must be a word');
      const q = args.term.trim().toLowerCase();
      const t = glossaryThrough(chapterNumbers().at(-1)!).find((x) => x.slug === q || x.term.toLowerCase() === q || x.aliases.some((a) => a.toLowerCase() === q));
      if (!t) throw new ToolInputError(`no glossary word "${args.term}"`);
      const mapFile = path.join(process.cwd(), 'content', 'snowmoon', 'references.json');
      const map = existsSync(mapFile) ? (JSON.parse(readFileSync(mapFile, 'utf8')) as { terms: { term: string; designs: { kind: 'character' | 'place'; slug: string; check: boolean }[] }[] }) : { terms: [] };
      const sheets = (map.terms.find((x) => x.term === t.slug)?.designs ?? []).filter((d) => !d.check);
      const published = JSON.parse(readFileSync(path.join(process.cwd(), 'content', 'snowmoon', 'illustrations', 'published.json'), 'utf8')) as { images: { id: string; chapter: number; idx: number; url: string; characters?: string[]; location?: string }[] };
      const pictures = published.images
        .filter((im) => sheets.some((s) => (s.kind === 'character' ? (im.characters ?? []).includes(s.slug) : (im.location ?? '').endsWith(`/${s.slug}.json`))))
        .slice(0, 12)
        .map((im) => ({ id: im.id, block: blockId(im.chapter, im.idx), url: im.url, label: 'AI-generated image, not by the author' }));
      return { book: BOOK, term: t.term, slug: t.slug, first_seen: t.first_seen, sheets: sheets.map((s) => ({ kind: s.kind, slug: s.slug })), pictures, note: sheets.length ? undefined : 'No sheet is linked to this word yet.' };
    },
  },
  {
    name: 'list_scenes',
    title: 'List published scenes',
    description: "Every published adaptation (scene) on snowmoon.party and its public versions, with each version's maker, page, AI label and the model it names if closed.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (args) => {
      only(args, []);
      const cat = await publicCatalogue();
      return { note: SITE, scenes: await Promise.all(cat.map(async (c) => ({ adaptation: c.adaptation.id, title: c.adaptation.title, versions: await Promise.all(c.versions.map(versionFacts)) }))) };
    },
  },
  {
    name: 'get_scene',
    title: 'Get a scene version and its shots',
    description: "One public version of an adaptation: its facts (maker, video, AI label, closed model if any) and its shots in order, each with its id, number, start and end in seconds, who is in it and its frame.",
    inputSchema: { type: 'object', properties: { adaptation: { type: 'integer', minimum: 1 }, version: { type: 'integer', minimum: 1 } }, required: ['adaptation', 'version'], additionalProperties: false },
    run: async (args) => {
      only(args, ['adaptation', 'version']);
      const adaptation = int(args, 'adaptation', { min: 1 })!, version = int(args, 'version', { min: 1 })!;
      const a = await getAdaptation(adaptation);
      if (!a) throw new ToolInputError('no such adaptation');
      const v = await publicVersion(adaptation, version);
      const ed = await editorVersion(v);
      const d = editorData(adaptation, ed.id);
      return {
        title: a.title,
        ...(await versionFacts(v)),
        shots_from_version: ed.id,
        shots: (d?.shots ?? []).map((s) => ({ id: s.id, n: s.n, from: s.from, to: s.to, who: s.who ?? [], scene: s.scene ?? null, frame: abs(s.frame as string | null), lines: (s.lines ?? []).map((l) => l.cue) })),
      };
    },
  },
  {
    name: 'get_shot',
    title: 'Get one shot',
    description: "One shot of a public version: its camera and the people in it (positions in metres on the set's plan), its lines with whose words they are and their converted voices, its frame with the picture's AI label, and a link to its page in the live editor.",
    inputSchema: { type: 'object', properties: { adaptation: { type: 'integer', minimum: 1 }, version: { type: 'integer', minimum: 1 }, shot: { type: 'string', pattern: '^[A-Za-z0-9-]{1,40}$' } }, required: ['adaptation', 'version', 'shot'], additionalProperties: false },
    run: async (args) => {
      only(args, ['adaptation', 'version', 'shot']);
      const adaptation = int(args, 'adaptation', { min: 1 })!, version = int(args, 'version', { min: 1 })!;
      const shot = str(args, 'shot', /^[A-Za-z0-9-]{1,40}$/, 'a shot id');
      const v = await publicVersion(adaptation, version);
      const ed = await editorVersion(v);
      const { shot: s } = shotOf(adaptation, ed.id, shot);
      const handle = await sceneHandleFor(v.author);
      return {
        adaptation, version, shot: s.id, n: s.n, from: s.from, to: s.to,
        scene: s.scene ?? null, setup: s.setup ?? null, set: s.set ?? null, who: s.who ?? [],
        camera: s.camera ?? null,
        frame: abs(s.frame as string | null),
        picture: s.picture ?? null,
        ai_label: v.recipe.ai_label ?? null,
        lines: (s.lines ?? []).map(lineOut),
        editor: handle ? `${appUrl()}/@${handle}/${adaptation}/v/${v.id}/shot/${s.id}` : null,
        licence: 'GPL-3.0',
      };
    },
  },
  {
    name: 'get_recipe',
    title: "Get a shot's picture recipe",
    description: "How a shot's frame was made: the exact prompt, every input picture by sha256, the model (with maker and whether it is closed), seed, size, cost and date. Inputs are open; a closed model's weights are not.",
    inputSchema: { type: 'object', properties: { adaptation: { type: 'integer', minimum: 1 }, version: { type: 'integer', minimum: 1 }, shot: { type: 'string', pattern: '^[A-Za-z0-9-]{1,40}$' } }, required: ['adaptation', 'version', 'shot'], additionalProperties: false },
    run: async (args) => {
      only(args, ['adaptation', 'version', 'shot']);
      const adaptation = int(args, 'adaptation', { min: 1 })!, version = int(args, 'version', { min: 1 })!;
      const shot = str(args, 'shot', /^[A-Za-z0-9-]{1,40}$/, 'a shot id');
      const v = await publicVersion(adaptation, version);
      const ed = await editorVersion(v);
      const { shot: s } = shotOf(adaptation, ed.id, shot);
      if (!s.recipe) throw new ToolInputError('this shot has no model-made frame (its picture was drawn in code)');
      return { adaptation, version, shot: s.id, made: s.made ?? null, picture: s.picture ?? null, ai_label: v.recipe.ai_label ?? null, set_frame: s.setFrame ?? null, plate: s.plate ?? null, cards: s.cards ?? [], recipe: s.recipe, licence: 'GPL-3.0' };
    },
  },
  {
    name: 'get_moment',
    title: 'Get a moment across versions',
    description: "One shot of an adaptation in every public version by its maker, side by side: each version's frame, AI label and its span of the cut, plus the shot's lines.",
    inputSchema: { type: 'object', properties: { adaptation: { type: 'integer', minimum: 1 }, shot: { type: 'string', pattern: '^[A-Za-z0-9-]{1,40}$' } }, required: ['adaptation', 'shot'], additionalProperties: false },
    run: async (args) => {
      only(args, ['adaptation', 'shot']);
      const adaptation = int(args, 'adaptation', { min: 1 })!;
      const shot = str(args, 'shot', /^[A-Za-z0-9-]{1,40}$/, 'a shot id');
      const a = await getAdaptation(adaptation);
      if (!a) throw new ToolInputError('no such adaptation');
      // The maker's public versions, the one their page shows first (as on the moment page; a linked wallet's under its FID).
      const versions = await authorVersions(await sceneOwner(a.owner), adaptation);
      const cols = [];
      let lines: unknown[] = [];
      for (const v of versions) {
        const ed = await editorVersion(v);
        const s = editorData(adaptation, ed.id)?.shots.find((x) => x.id === shot);
        if (!s) continue;
        if (!lines.length) lines = (s.lines ?? []).map(lineOut);
        cols.push({ version: v.id, from: s.from, to: s.to, frame: abs(s.frame as string | null), picture: s.picture ?? null, ai_label: v.recipe.ai_label ?? null, video: ownMedia(v.recipe.video_url) });
      }
      if (!cols.length) throw new ToolInputError('no such shot in this adaptation');
      const handle = await sceneHandleFor(a.owner);
      return { adaptation, title: a.title, shot, page: handle ? `${appUrl()}/@${handle}/${adaptation}/m/${shot}` : null, lines, versions: cols, licence: 'GPL-3.0' };
    },
  },
];

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name) ?? null;
