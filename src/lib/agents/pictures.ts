import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ToolInputError } from '../agent/tools';
import { editorData } from '../agent/data';
import { getVersion } from '../adaptation-pages';
import { loadChapter } from '../book';
import { IMAGES } from '../config';
import { glossaryThrough } from '../glossary';
import { blockFacts } from '../reading';
import { listDesigns, startingStyleRetired } from '../images/designs';
import { PLACE_VIEW_LINES, SAMPLE_ASSIST, SAMPLE_SUBJECTS, VIEW_LINES, samplePrompt, viewPrompt } from '../images/design-rules';
import { blockedName, finalPrompt, STYLES, styleText } from '../images/rules';
import { sheetCharacter, sheetPlace } from '../images/sheets';
import { priceUsd } from '../wallet/credits';
import { sql, type Agent } from './core';
import { checkPlain } from './filter';
import { draftPiece, versionById, type Answering } from './pieces';
import type { PictureKind } from './picture-kinds';
export { PICTURE_KINDS, type PictureKind } from './picture-kinds';

/**
 * Pictures an agent drafts for its person (owner, 2026-10-29, Plan A part 2): draft_picture, draft_sheet, draft_place
 * and draft_style. Each one is attached to one thing (a book moment, a shot, a reference sheet or style, or a glossary
 * term) and made in a style the person chose: a picture tool with no style is refused, and the agent asks its person.
 * Here the draft is only words: the exact prompt that will be sent, in parts, each with whose words it is, and an
 * estimate. Nothing is made or spent until the person taps Make it on their dashboard (approve.ts, runPicture), through
 * Pictures' own pipeline: the person's caps, blocked names, the prompt check, the host's safety checker.
 */

export type Attach =
  | { moment: string; chapter: number; block: number }
  | { shot: string; adaptation: number; version: number }
  | { reference: { kind: 'character' | 'place' | 'style'; slug: string } }
  | { glossary: string };

/** One part of a prompt and whose words it is (the recipe shows each). */
export type PromptPart = { part: string; by: string; text: string };

export interface PictureStyle {
  /** The published style's version id, or the project's starting style while it isn't retired. */
  version: string | null;
  starting: string | null;
  name: string;
  by: string;
  text: string;
}

export interface PictureBody {
  attach: Attach;
  style: PictureStyle | null;
  parts: PromptPart[];
  prompt: string;
  model: { id: string; endpoint: string; host: string };
  estimate_usd: number;
  /** A wallet account's exact charge (Terms 6a: "the price shown"), shown on Make it, as for a frame. */
  price_usd?: number;
  /** For draft_sheet and draft_place: what is being designed (a character or a place, and its name); for draft_style, the style's name. */
  subject?: { kind: 'character' | 'place' | 'style'; slug: string | null; name: string; text: string; from_version?: string };
}

export const pictureEstimate = () => IMAGES.reserveUsd;
const posInt = (v: unknown, what: string) => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new ToolInputError(`${what} must be a whole number from 1`);
  return v;
};
const slugOf = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !/^[a-z0-9-]{1,60}$/.test(v)) throw new ToolInputError(`${what}: lowercase letters, numbers and hyphens (e.g. bai, minpentai-arena)`);
  return v;
};

/** The one thing a picture is attached to. Each target is checked against what exists; nothing is guessed. */
export async function parseAttach(raw: unknown): Promise<Attach> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 1) throw new ToolInputError('attach takes exactly one of: moment ("c4-b70"), shot ({adaptation, version, shot}), reference ({kind: character|place|style, slug}) or glossary (a term)');
  if (keys[0] === 'moment') {
    const m = typeof o.moment === 'string' ? /^c(\d{1,3})-b(\d{1,5})$/.exec(o.moment) : null;
    const ch = m ? loadChapter(Number(m[1])) : null;
    if (!m || !ch || !ch.blocks.some((b) => b.idx === Number(m[2]))) throw new ToolInputError(`attach.moment: no block "${String(o.moment)}" in the book (c<chapter>-b<block>, as search_book gives)`);
    return { moment: o.moment as string, chapter: Number(m[1]), block: Number(m[2]) };
  }
  if (keys[0] === 'shot') {
    const s = (o.shot ?? {}) as Record<string, unknown>;
    const adaptation = posInt(s.adaptation, 'attach.shot.adaptation');
    const version = posInt(s.version, 'attach.shot.version');
    const v = await getVersion(version);
    if (!v || v.adaptationId !== adaptation || v.hidden) throw new ToolInputError('attach.shot: no such version you can see (see list_scenes)');
    if (!editorData(adaptation, version)?.shots.some((x) => x.id === s.shot)) throw new ToolInputError(`attach.shot: no shot "${String(s.shot)}" in that version (see get_scene)`);
    return { shot: s.shot as string, adaptation, version };
  }
  if (keys[0] === 'reference') {
    const r = (o.reference ?? {}) as Record<string, unknown>;
    const kind = r.kind === 'character' || r.kind === 'place' || r.kind === 'style' ? r.kind : null;
    if (!kind) throw new ToolInputError('attach.reference.kind is character, place or style');
    const slug = slugOf(r.slug, 'attach.reference.slug');
    if (kind === 'character' && !sheetCharacter(slug)) throw new ToolInputError(`attach.reference: no character sheet "${slug}" (get_references lists them)`);
    if (kind === 'place' && !sheetPlace(slug)) throw new ToolInputError(`attach.reference: no place sheet "${slug}" (get_references lists them)`);
    return { reference: { kind, slug } };
  }
  if (keys[0] === 'glossary') {
    const q = typeof o.glossary === 'string' ? o.glossary.trim().toLowerCase() : '';
    const all = glossaryThrough(Number.MAX_SAFE_INTEGER);
    const t = all.find((x) => x.slug === q || x.term.toLowerCase() === q || x.aliases.some((a) => a.toLowerCase() === q));
    if (!t) throw new ToolInputError(`attach.glossary: no glossary term "${String(o.glossary)}" (get_glossary lists them)`);
    return { glossary: t.slug };
  }
  throw new ToolInputError(`attach: "${keys[0]}" isn't a target; use moment, shot, reference or glossary`);
}

/** The styles a picture may be made in: every published style, and the starting style while it isn't retired. */
export async function stylesOffered(): Promise<PictureStyle[]> {
  const s = sql();
  const published = (await listDesigns(s, 'style')).map((d) => ({ version: d.versionId, starting: null, name: d.title, by: d.byRole === 'maintainer' ? 'the project' : `@${d.byName ?? d.byFid}`, text: d.text }));
  if (await startingStyleRetired(s)) return published;
  const starting = Object.keys(STYLES).map((id) => {
    const f = JSON.parse(readFileSync(path.join(process.cwd(), STYLES[id as keyof typeof STYLES]), 'utf8')) as { name?: string; title?: string };
    return { version: null, starting: id, name: f.title ?? f.name ?? id, by: 'the project', text: styleText(id as keyof typeof STYLES, null) };
  });
  return [...starting, ...published];
}

/** The style the person chose, by name or id. Required: with none, the agent is told to ask its person. */
export async function chooseStyle(raw: unknown): Promise<PictureStyle> {
  const offered = await stylesOffered();
  const names = offered.map((x) => `"${x.name}"`).join(', ');
  if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim()))
    throw new ToolInputError(`style is required: ask your person which style they want (offered: ${names}); don't choose one for them`);
  const q = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  const hit = offered.find((x) => x.version === q || x.starting === q || x.name.toLowerCase() === q);
  if (!hit) throw new ToolInputError(`no style "${String(raw).slice(0, 60)}"; offered: ${names}. Ask your person which one`);
  return hit;
}

const SITE = 'the site (fixed wording)';
const EDITION = `the edition's invented look (${SAMPLE_ASSIST.model}, not the book)`;

function settingFor(attach: Attach): string | null {
  if (!('moment' in attach)) return null;
  const ch = loadChapter(attach.chapter);
  const i = ch ? ch.blocks.findIndex((b) => b.idx === attach.block) : -1;
  return ch && i >= 0 ? (blockFacts(ch.blocks)[i]?.setting ?? null) : null;
}
const styleFor = (style: PictureStyle, attach: Attach) => (style.starting ? styleText(style.starting as keyof typeof STYLES, settingFor(attach)) : style.text);

function lookOf(kind: 'character' | 'place', slug: string): { name: string; text: string } {
  const f = path.join(process.cwd(), 'content', 'snowmoon', 'designs', kind === 'character' ? 'characters' : 'locations', `${slug}.json`);
  if (!existsSync(f)) throw new ToolInputError(`no ${kind} sheet "${slug}"`);
  const d = JSON.parse(readFileSync(f, 'utf8')) as { name: string; descriptor?: string };
  if (!d.descriptor) throw new ToolInputError(`the ${kind} sheet "${slug}" has no look to add; describe it in prompt instead`);
  return { name: d.name, text: d.descriptor };
}

const model = () => ({ id: IMAGES.model.id, endpoint: IMAGES.model.endpoint, host: IMAGES.model.host });

/** Refused at once, before any draft: a prompt naming a real person on the blocked list (the prompt check runs again on Make it). */
function notBlocked(prompt: string) {
  const name = blockedName(prompt);
  if (name) throw new ToolInputError('No real people: the prompt names someone on the blocked list.');
}

async function save(agent: Agent, kind: PictureKind, title: string, body: PictureBody, answering: unknown, adaptation: number | null = null) {
  notBlocked(body.prompt);
  if (agent.person < 0) body.price_usd = priceUsd(body.estimate_usd);
  const out = await draftPiece(agent, kind, checkPlain(title, 'title', 120), adaptation, body as unknown as Record<string, unknown>, false, undefined, (typeof answering === 'string' ? { request: answering } : {}) as Answering);
  return { ...out, status: 'draft', style: body.style?.name ?? null, prompt: body.prompt, estimate_usd: body.estimate_usd, next: `Waiting for your person to approve up to $${body.estimate_usd} on their dashboard; nothing is made or spent before.` };
}

/**
 * draft_picture: an image for a moment, a shot, a reference or a glossary term. The prompt is the agent's description
 * (never story words); the chosen style's text and any sheets' invented look are added after it, each labelled.
 */
export async function draftPicture(agent: Agent, args: Record<string, unknown>) {
  const attach = await parseAttach(args.attach);
  const style = await chooseStyle(args.style);
  const description = checkPlain(args.prompt, 'prompt', IMAGES.promptMaxChars);
  const sheets = (args.sheets ?? {}) as Record<string, unknown>;
  const chars = Array.isArray(sheets.characters) ? sheets.characters.map((c, i) => slugOf(c, `sheets.characters[${i}]`)) : [];
  if (chars.length > IMAGES.designs.maxCharacters) throw new ToolInputError(`up to ${IMAGES.designs.maxCharacters} characters in one picture`);
  const place = sheets.place === undefined ? null : slugOf(sheets.place, 'sheets.place');
  const looks = [...chars.map((c) => ({ ...lookOf('character', c), part: `sheet: ${c}` })), ...(place ? [{ ...lookOf('place', place), part: `sheet: ${place}` }] : [])];
  const sText = styleFor(style, attach);
  const parts: PromptPart[] = [
    { part: 'description', by: `${agent.name} (the agent), from its person's request`, text: description },
    { part: `style: ${style.name}`, by: style.by, text: sText },
    ...looks.map((l) => ({ part: l.part, by: EDITION, text: l.text })),
    { part: 'no-words line', by: SITE, text: IMAGES.suffix },
  ];
  const prompt = finalPrompt(description, sText, looks.map((l) => l.text));
  const adaptation = 'shot' in attach ? attach.adaptation : null;
  return save(agent, 'picture', String(args.title ?? description.slice(0, 80)), { attach, style, parts, prompt, model: model(), estimate_usd: pictureEstimate() }, args.answering, adaptation);
}

/**
 * draft_sheet: a character sheet's front view, from a look in words: the text of one of the person's character-version
 * drafts (from_version), or the look given here. Side and back views are made from the front later, as on the site.
 */
export async function draftSheet(agent: Agent, args: Record<string, unknown>) {
  const slug = slugOf(args.character, 'character');
  const c = sheetCharacter(slug);
  if (!c) throw new ToolInputError(`no character "${slug}" with a sheet (get_references lists them)`);
  const style = await chooseStyle(args.style);
  let text: string, fromVersion: string | undefined;
  if (args.from_version !== undefined) {
    const v = typeof args.from_version === 'string' && /^[0-9a-f-]{36}$/.test(args.from_version) ? await versionById(args.from_version) : null;
    if (!v || v.person !== agent.person || v.kind !== 'character' || (v.body as { character?: string }).character !== slug) throw new ToolInputError('from_version must be one of your person\'s character versions of this character (list_my_work)');
    text = String((v.body as { description?: string }).description ?? '');
    fromVersion = v.id;
  } else text = checkPlain(args.look, 'look', 1200);
  const attach: Attach = args.attach === undefined ? { reference: { kind: 'character', slug } } : await parseAttach(args.attach);
  const sText = styleFor(style, attach);
  const parts: PromptPart[] = [
    { part: 'view line (front)', by: SITE, text: VIEW_LINES.front },
    { part: `style: ${style.name}`, by: style.by, text: sText },
    { part: 'look', by: fromVersion ? `the character version ${fromVersion}` : `${agent.name} (the agent), from its person's request`, text },
    { part: 'no-words line', by: SITE, text: IMAGES.suffix },
  ];
  const prompt = viewPrompt(VIEW_LINES.front, sText, text);
  return save(agent, 'sheet', String(args.title ?? `${c.name}: a sheet`), { attach, style, parts, prompt, model: model(), estimate_usd: pictureEstimate(), subject: { kind: 'character', slug, name: c.name, text, ...(fromVersion ? { from_version: fromVersion } : {}) } }, args.answering);
}

/** draft_place: a place's wide view, from its look in words: one of the book's places (slug) or a new one (name). */
export async function draftPlace(agent: Agent, args: Record<string, unknown>) {
  const style = await chooseStyle(args.style);
  const slug = args.place === undefined ? null : slugOf(args.place, 'place');
  const p = slug ? sheetPlace(slug) : null;
  if (slug && !p) throw new ToolInputError(`no place sheet "${slug}"; for a new place give name instead`);
  const name = p ? p.name : checkPlain(args.name, 'name (or place, a sheet\'s slug)', 80);
  const text = checkPlain(args.look, 'look', 1200);
  const attach: Attach = args.attach === undefined ? (slug ? { reference: { kind: 'place', slug } } : (() => { throw new ToolInputError('a new place needs attach (a moment, shot or glossary term it belongs to)'); })()) : await parseAttach(args.attach);
  const sText = styleFor(style, attach);
  const parts: PromptPart[] = [
    { part: 'view line (wide)', by: SITE, text: PLACE_VIEW_LINES.front },
    { part: `style: ${style.name}`, by: style.by, text: sText },
    { part: 'look', by: `${agent.name} (the agent), from its person's request`, text },
    { part: 'no-words line', by: SITE, text: IMAGES.suffix },
  ];
  const prompt = viewPrompt(PLACE_VIEW_LINES.front, sText, text);
  return save(agent, 'place', String(args.title ?? `${name}: a place`), { attach, style, parts, prompt, model: model(), estimate_usd: pictureEstimate(), subject: { kind: 'place', slug, name, text } }, args.answering);
}

/**
 * draft_style: a new style in words, and one sample picture of it on the site's first fixed subject (so the sample shows
 * the style, not a scene). Its own text is the style, so it takes no other style.
 */
export async function draftStyle(agent: Agent, args: Record<string, unknown>) {
  if (args.style !== undefined) throw new ToolInputError('a new style is its own style: give its words in text, not style');
  const name = checkPlain(args.name, 'name', 60);
  const text = checkPlain(args.text, 'text', 1200);
  const attach: Attach = args.attach === undefined ? { reference: { kind: 'style', slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'style' } } : await parseAttach(args.attach);
  const parts: PromptPart[] = [
    { part: 'sample subject', by: SITE, text: SAMPLE_SUBJECTS[0] },
    { part: `style: ${name}`, by: `${agent.name} (the agent), from its person's request`, text },
    { part: 'no-words line', by: SITE, text: IMAGES.suffix },
  ];
  const prompt = samplePrompt(SAMPLE_SUBJECTS[0], text);
  return save(agent, 'style', String(args.title ?? `${name}: a style`), { attach, style: null, parts, prompt, model: model(), estimate_usd: pictureEstimate(), subject: { kind: 'style', slug: null, name, text } }, args.answering);
}

export const ATTACH_SCHEMA = {
  type: 'object',
  description: 'Exactly one target: {moment: "c4-b70"} (a book block), {shot: {adaptation, version, shot}}, {reference: {kind: "character"|"place"|"style", slug}} or {glossary: "term"}.',
  properties: {
    moment: { type: 'string' },
    shot: { type: 'object', properties: { adaptation: { type: 'integer' }, version: { type: 'integer' }, shot: { type: 'string' } }, required: ['adaptation', 'version', 'shot'], additionalProperties: false },
    reference: { type: 'object', properties: { kind: { enum: ['character', 'place', 'style'] }, slug: { type: 'string' } }, required: ['kind', 'slug'], additionalProperties: false },
    glossary: { type: 'string' },
  },
  additionalProperties: false,
};
export const STYLE_SCHEMA = { type: 'string', description: 'Required: the style your person chose, by its name (e.g. "Techno vistas"). If they haven\'t said, ask them; never pick one yourself.' };
