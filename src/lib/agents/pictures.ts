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
import { namedAs, sheetCharacter, sheetCharacters, sheetPlace } from '../images/sheets';
import { priceUsd } from '../wallet/credits';
import { sql, type Agent } from './core';
import { checkPlain } from './filter';
import { logGap } from './edits';
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

/**
 * What the draft tools use from outside: the styles on offer and the draft writer. The site passes nothing (the real
 * ones); the assistant trials pass stand-ins, so the same checks run on the same code without a database.
 */
export interface PictureCtx {
  offered?: () => Promise<PictureStyle[]>;
  write?: (kind: PictureKind, title: string, body: PictureBody) => Promise<Record<string, unknown>>;
  gap?: (asked: string, missing: string) => Promise<unknown>;
}
const posInt = (v: unknown, what: string) => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new ToolInputError(`${what} must be a whole number from 1`);
  return v;
};
const slugOf = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !/^[a-z0-9-]{1,60}$/.test(v)) throw new ToolInputError(`${what}: lowercase letters, numbers and hyphens (e.g. bai, minpentai-arena)`);
  return v;
};

const findTerm = (q: string) => glossaryThrough(Number.MAX_SAFE_INTEGER).find((x) => x.slug === q || x.term.toLowerCase() === q || x.aliases.some((a) => a.toLowerCase() === q));
/** The next valid step for a target that didn't match: the attach a word most likely means, or the tools that find one. */
export function suggestTarget(raw: unknown): string {
  const q = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  const slug = q.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (slug && sheetPlace(slug)) return `"${slug}" is a place sheet: use attach {reference: {kind: "place", slug: "${slug}"}}.`;
  if (slug && sheetCharacter(slug)) return `"${slug}" is a character sheet: use attach {reference: {kind: "character", slug: "${slug}"}}.`;
  const t = q ? (findTerm(q) ?? findTerm(slug)) : null;
  if (t) return `"${t.term}" is a glossary term: use attach {glossary: "${t.slug}"}.`;
  return 'Next: get_references with a glossary word lists its sheets (attach {reference: …}); get_glossary lists the terms (attach {glossary: …}); search_book finds a moment (attach {moment: "c<chapter>-b<block>"}).';
}

/** The one thing a picture is attached to. Each target is checked against what exists; nothing is guessed. */
export async function parseAttach(raw: unknown): Promise<Attach> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 1) throw new ToolInputError('attach takes exactly one of: moment ("c4-b70"), shot ({adaptation, version, shot}), reference ({kind: character|place|style, slug}) or glossary (a term)');
  if (keys[0] === 'moment') {
    const m = typeof o.moment === 'string' ? /^c(\d{1,3})-b(\d{1,5})$/.exec(o.moment) : null;
    const ch = m ? loadChapter(Number(m[1])) : null;
    if (!m || !ch || !ch.blocks.some((b) => b.idx === Number(m[2]))) throw new ToolInputError(`attach.moment: no block "${String(o.moment)}" in the book. Next: search_book or get_passage gives each block's id (c<chapter>-b<block>).`);
    return { moment: o.moment as string, chapter: Number(m[1]), block: Number(m[2]) };
  }
  if (keys[0] === 'shot') {
    const s = (o.shot ?? {}) as Record<string, unknown>;
    const adaptation = posInt(s.adaptation, 'attach.shot.adaptation');
    const version = posInt(s.version, 'attach.shot.version');
    const v = await getVersion(version);
    if (!v || v.adaptationId !== adaptation || v.hidden) throw new ToolInputError('attach.shot: no such version you can see. Next: list_scenes lists the versions.');
    if (!editorData(adaptation, version)?.shots.some((x) => x.id === s.shot)) throw new ToolInputError(`attach.shot: no shot "${String(s.shot)}" in that version. Next: get_scene lists its shots.`);
    return { shot: s.shot as string, adaptation, version };
  }
  if (keys[0] === 'reference') {
    const r = (o.reference ?? {}) as Record<string, unknown>;
    const kind = r.kind === 'character' || r.kind === 'place' || r.kind === 'style' ? r.kind : null;
    if (!kind) throw new ToolInputError('attach.reference.kind is character, place or style; get_references with a glossary word gives the kind and slug of its sheets.');
    const slug = slugOf(r.slug, 'attach.reference.slug');
    if (kind === 'character' && !sheetCharacter(slug)) throw new ToolInputError(`attach.reference: no character sheet "${slug}". ${suggestTarget(slug)}`);
    if (kind === 'place' && !sheetPlace(slug)) throw new ToolInputError(`attach.reference: no place sheet "${slug}". ${suggestTarget(slug)}`);
    return { reference: { kind, slug } };
  }
  if (keys[0] === 'glossary') {
    const q = typeof o.glossary === 'string' ? o.glossary.trim().toLowerCase() : '';
    const t = findTerm(q);
    if (!t) throw new ToolInputError(`attach.glossary: no glossary term "${String(o.glossary)}". ${suggestTarget(o.glossary)}`);
    return { glossary: t.slug };
  }
  throw new ToolInputError(`attach: "${keys[0]}" isn't a target; use moment, shot, reference or glossary. ${suggestTarget(o[keys[0]])}`);
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
export async function chooseStyle(raw: unknown, ctx: PictureCtx = {}): Promise<PictureStyle> {
  const offered = await (ctx.offered ?? stylesOffered)();
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

/**
 * A reference picture shows its subject alone (owner, 2026-10-29): a character's on a plain background, a place's with
 * no people. Any other of the book's characters named in its words is refused, with the next valid step.
 */
function alone(attach: Attach, texts: string[], extra: { characters?: string[]; place?: string | null } = {}) {
  if (!('reference' in attach) || attach.reference.kind === 'style') return;
  const { kind, slug } = attach.reference;
  const subject = kind === 'character' ? sheetCharacter(slug)?.name ?? slug : sheetPlace(slug)?.name ?? slug;
  const instead = 'or attach the picture to a moment instead (attach {moment: "c<chapter>-b<block>"}; search_book finds it).';
  for (const c of sheetCharacters()) {
    if (kind === 'character' && c.slug === slug) continue;
    const said = texts.map((t) => namedAs(t, c.names, c.exclusions)).find(Boolean);
    if (said || extra.characters?.includes(c.slug))
      throw new ToolInputError(kind === 'character'
        ? `a reference picture shows ${subject} alone, and this names ${said ?? c.name}. Leave ${said ?? c.name} out, ${instead}`
        : `a place reference shows ${subject} with no people, and this names ${said ?? c.name}. Leave people out, ${instead}`);
  }
  if (kind === 'character' && extra.place) throw new ToolInputError(`a character reference has a plain background: leave sheets.place out, ${instead}`);
}

const model = () => ({ id: IMAGES.model.id, endpoint: IMAGES.model.endpoint, host: IMAGES.model.host });

/** Refused at once, before any draft: a prompt naming a real person on the blocked list (the prompt check runs again on Make it). */
function notBlocked(prompt: string) {
  const name = blockedName(prompt);
  if (name) throw new ToolInputError('No real people: the prompt names someone on the blocked list.');
}

/** What the agent is told after a picture draft: who does what next, plainly. */
export const PICTURE_NEXT = (usd: number) =>
  `Saved as a private draft; nothing is made or spent yet. Next, your person taps Make it on their dashboard (up to $${usd}): that makes the picture privately, inside the draft, seen only by them. Publishing it is a separate step, Keep, which only your person can take.`;

async function save(agent: Agent, kind: PictureKind, title: string, body: PictureBody, answering: unknown, adaptation: number | null = null, ctx: PictureCtx = {}) {
  notBlocked(body.prompt);
  if (agent.person < 0) body.price_usd = priceUsd(body.estimate_usd);
  const t = checkPlain(title, 'title', 120);
  const out = ctx.write ? await ctx.write(kind, t, body) : await draftPiece(agent, kind, t, adaptation, body as unknown as Record<string, unknown>, false, undefined, (typeof answering === 'string' ? { request: answering } : {}) as Answering);
  return { ...out, status: 'draft', style: body.style?.name ?? null, prompt: body.prompt, estimate_usd: body.estimate_usd, next: PICTURE_NEXT(body.estimate_usd) };
}

/**
 * draft_picture: an image for a moment, a shot, a reference or a glossary term. The prompt is the agent's description
 * (never story words); the chosen style's text and any sheets' invented look are added after it, each labelled.
 */
export async function draftPicture(agent: Agent, args: Record<string, unknown>, ctx: PictureCtx = {}) {
  const attach = await parseAttach(args.attach);
  const style = await chooseStyle(args.style, ctx);
  const description = checkPlain(args.prompt, 'prompt', IMAGES.promptMaxChars);
  const sheets = (args.sheets ?? {}) as Record<string, unknown>;
  const chars = Array.isArray(sheets.characters) ? sheets.characters.map((c, i) => slugOf(c, `sheets.characters[${i}]`)) : [];
  if (chars.length > IMAGES.designs.maxCharacters) throw new ToolInputError(`up to ${IMAGES.designs.maxCharacters} characters in one picture`);
  const place = sheets.place === undefined ? null : slugOf(sheets.place, 'sheets.place');
  alone(attach, [description], { characters: chars, place });
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
  return save(agent, 'picture', String(args.title ?? description.slice(0, 80)), { attach, style, parts, prompt, model: model(), estimate_usd: pictureEstimate() }, args.answering, adaptation, ctx);
}

/**
 * draft_sheet: a character sheet's front view, from a look in words: the text of one of the person's character-version
 * drafts (from_version), or the look given here. Side and back views are made from the front later, as on the site.
 */
export async function draftSheet(agent: Agent, args: Record<string, unknown>, ctx: PictureCtx = {}) {
  const slug = slugOf(args.character, 'character');
  const c = sheetCharacter(slug);
  if (!c) throw new ToolInputError(`no character "${slug}" with a sheet. ${suggestTarget(slug)}`);
  const style = await chooseStyle(args.style, ctx);
  let text: string, fromVersion: string | undefined;
  if (args.from_version !== undefined) {
    const v = typeof args.from_version === 'string' && /^[0-9a-f-]{36}$/.test(args.from_version) ? await versionById(args.from_version) : null;
    if (!v || v.person !== agent.person || v.kind !== 'character' || (v.body as { character?: string }).character !== slug) throw new ToolInputError('from_version must be one of your person\'s character versions of this character. Next: list_my_work lists them, or draft_character_version makes one, or give look instead.');
    text = String((v.body as { description?: string }).description ?? '');
    fromVersion = v.id;
  } else text = checkPlain(args.look, 'look', 1200);
  const attach: Attach = args.attach === undefined ? { reference: { kind: 'character', slug } } : await parseAttach(args.attach);
  alone({ reference: { kind: 'character', slug } }, [text]);
  const sText = styleFor(style, attach);
  const parts: PromptPart[] = [
    { part: 'view line (front)', by: SITE, text: VIEW_LINES.front },
    { part: `style: ${style.name}`, by: style.by, text: sText },
    { part: 'look', by: fromVersion ? `the character version ${fromVersion}` : `${agent.name} (the agent), from its person's request`, text },
    { part: 'no-words line', by: SITE, text: IMAGES.suffix },
  ];
  const prompt = viewPrompt(VIEW_LINES.front, sText, text);
  return save(agent, 'sheet', String(args.title ?? `${c.name}: a sheet`), { attach, style, parts, prompt, model: model(), estimate_usd: pictureEstimate(), subject: { kind: 'character', slug, name: c.name, text, ...(fromVersion ? { from_version: fromVersion } : {}) } }, args.answering, null, ctx);
}

/** draft_place: a place's wide view, from its look in words: one of the book's places (slug) or a new one (name). */
export async function draftPlace(agent: Agent, args: Record<string, unknown>, ctx: PictureCtx = {}) {
  const style = await chooseStyle(args.style, ctx);
  const slug = args.place === undefined ? null : slugOf(args.place, 'place');
  const p = slug ? sheetPlace(slug) : null;
  if (slug && !p) throw new ToolInputError(`no place sheet "${slug}". ${suggestTarget(slug)} For a new place, give name and attach instead.`);
  const name = p ? p.name : checkPlain(args.name, 'name (or place, a sheet\'s slug)', 80);
  const text = checkPlain(args.look, 'look', 1200);
  const attach: Attach = args.attach === undefined ? (slug ? { reference: { kind: 'place', slug } } : (() => { throw new ToolInputError('a new place needs attach: the moment, shot or glossary term it belongs to (e.g. attach {moment: "c<chapter>-b<block>"}; search_book finds it).'); })()) : await parseAttach(args.attach);
  if (slug) alone({ reference: { kind: 'place', slug } }, [text]);
  const sText = styleFor(style, attach);
  const parts: PromptPart[] = [
    { part: 'view line (wide)', by: SITE, text: PLACE_VIEW_LINES.front },
    { part: `style: ${style.name}`, by: style.by, text: sText },
    { part: 'look', by: `${agent.name} (the agent), from its person's request`, text },
    { part: 'no-words line', by: SITE, text: IMAGES.suffix },
  ];
  const prompt = viewPrompt(PLACE_VIEW_LINES.front, sText, text);
  return save(agent, 'place', String(args.title ?? `${name}: a place`), { attach, style, parts, prompt, model: model(), estimate_usd: pictureEstimate(), subject: { kind: 'place', slug, name, text } }, args.answering, null, ctx);
}

/**
 * draft_style: a new style in words, and one sample picture of it on the site's first fixed subject (so the sample shows
 * the style, not a scene). Its own text is the style, so it takes no other style.
 */
export async function draftStyle(agent: Agent, args: Record<string, unknown>, ctx: PictureCtx = {}) {
  if (args.style !== undefined) throw new ToolInputError('a new style is its own style: give its words in text, and leave style out.');
  const name = checkPlain(args.name, 'name', 60);
  const text = checkPlain(args.text, 'text', 1200);
  const attach: Attach = args.attach === undefined ? { reference: { kind: 'style', slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'style' } } : await parseAttach(args.attach);
  const parts: PromptPart[] = [
    { part: 'sample subject', by: SITE, text: SAMPLE_SUBJECTS[0] },
    { part: `style: ${name}`, by: `${agent.name} (the agent), from its person's request`, text },
    { part: 'no-words line', by: SITE, text: IMAGES.suffix },
  ];
  const prompt = samplePrompt(SAMPLE_SUBJECTS[0], text);
  return save(agent, 'style', String(args.title ?? `${name}: a style`), { attach, style: null, parts, prompt, model: model(), estimate_usd: pictureEstimate(), subject: { kind: 'style', slug: null, name, text } }, args.answering, null, ctx);
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
export const STYLE_SCHEMA = { type: 'string', description: 'Required: the style your person chose, one of those offered. If they haven\'t said, ask them, naming only these; never pick one yourself.' };

/**
 * What the person asked to make, matched to the tools that make it (owner, 2026-10-29: "when a request matches no tool,
 * log_gap is required before answering"). The agent calls this first. When no tool makes it, the gap is recorded here,
 * as log_gap would, before the agent answers, and the reply says what to tell the person and what can be made instead.
 */
export const MAKES: Record<string, string | null> = {
  'a reference picture of a character': 'get_sheet {kind: "character"}, then draft_sheet (the sheet\'s front view) or draft_picture with attach {reference: {kind: "character", slug}}. The character alone.',
  'a reference picture of a place': 'get_sheet {kind: "place"}, then draft_place, or draft_picture with attach {reference: {kind: "place", slug}}. No people.',
  'a new style': 'draft_style (its name and words; one sample picture).',
  'a picture of a moment in the book': 'search_book or get_passage for the block, then draft_picture with attach {moment: "c<chapter>-b<block>"}.',
  'a picture for a glossary term': 'get_references for its sheets, then draft_picture with attach {glossary: term}, or the sheet\'s reference.',
  'a storyboard from a published scene version': 'list_scenes and get_scene, then draft_storyboard with that version\'s shots.',
  'a change to a shot in their own scene version': 'get_shot, then set_camera (moves in words), try_frame, swap_take, change_timing, mark_speaking or request_video_test.',
  'an idea for an adaptation': 'start_idea.',
  'a new look for a character, in words': 'get_sheet, then draft_character_version.',
  'a comic': null,
  'a video or film of the book': null,
  'music or sound': null,
  'something else': null,
};
export async function matchRequest(agent: Agent, args: Record<string, unknown>, ctx: PictureCtx = {}) {
  const asked = checkPlain(args.asked, 'asked (your person\'s words)', 1000);
  const wants = typeof args.wants === 'string' && args.wants in MAKES ? args.wants : null;
  if (!wants) throw new ToolInputError(`wants is one of: ${Object.keys(MAKES).map((k) => `"${k}"`).join(', ')}`);
  const steps = MAKES[wants];
  if (steps && /draft_(picture|sheet|place)/.test(steps)) {
    const styles = (await (ctx.offered ?? stylesOffered)()).map((x) => x.name);
    return { tools: steps, styles_offered: styles, next: `Do these steps. A picture needs a style your person chose: if they haven't named one, ask, offering only ${styles.map((x) => `"${x}"`).join(', ')}.` };
  }
  if (steps) return { tools: steps, next: 'Do these steps; ask your person one short question when something is missing.' };
  const missing = `No tool makes ${wants}.`;
  await (ctx.gap ? ctx.gap(asked, missing) : logGap(agent, { asked, missing }));
  return {
    tools: null,
    gap_logged: true,
    say: `Tell your person plainly that no tool can make ${wants === 'something else' ? 'this' : wants} yet, and that you've passed their request to the site's owner. Then offer what you can do instead.`,
    can_do_instead: Object.entries(MAKES).filter(([, v]) => v).map(([k]) => k),
  };
}
