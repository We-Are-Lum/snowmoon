import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE, IMAGES } from '../config';
import { bookCharacter, listDesigns } from '../images/designs';
import { chapterChip, momentById, MOMENTS, readerHref, type Moment } from './moments';
import { CARDS } from './cards';
import { MAKE_WORDING as M } from './make-wording';
import { challengeModels, modelChipText, type ModelRowEntry } from './models';
import type { Source } from './pictures';
import { shuffleFresh } from './shuffle';
import { KEEP_LINE, SAME_STYLE, OWN_STYLE_MAX, presetOptions, readStyleChoice, STYLE_PRESETS, type StyleChoice, type StyleOption, type StylePreset } from './styles';

/**
 * The remix screen's server half (branch challenge-moments, 2026-11-05; simplified on branch challenge-simple,
 * 2026-11-08): what the model receives for a challenge picture, and the screen's data.
 *
 * The prompt, exactly as sent and recorded (P1), with the moments off (CHALLENGE.moments; owner, 2026-11-08): the
 * person's change words; that the remixed character is the person in reference image 1; the style's text (a preset, a
 * published style, Random's draw, or the person's own words) followed by KEEP_LINE exactly; then the site's no-lettering
 * line. No scene and no other characters.
 *
 * With the moments on (kept, not shown today): momentPrompt, as before (the others as reference pictures, the scene).
 * Why reference pictures for the others, not their looks as text (test pictures of 2026-11-05, $0.07, scratchpad
 * ledger): with the others' looks written out, the model drew them and dropped or blended the person in the reference
 * picture; with each person as their own reference image, the remixed character stayed the main figure.
 */
export function momentPrompt(p: { words: string; name: string; scene: string; others: string[] }): string {
  return [
    p.words.trim(),
    `${p.name} is the person in reference image 1, the main figure, in the foreground: keep their face, hair and clothes exactly as in reference image 1.`,
    ...p.others.map((n, i) => `${n} is the person in reference image ${i + 2}, behind ${p.name} and smaller: keep their face, hair and clothes as in that image.`),
    `The setting: ${p.scene}`,
    IMAGES.suffix,
  ].join('\n\n');
}

/**
 * The prompt with the moments off (owner, 2026-11-08). The reference line is DRAFT wording (the coding agent's; shown
 * in "How it was made"): it names reference image 1 and leaves keeping the character to KEEP_LINE, the owner's words,
 * so a change of clothes isn't fought by "keep their clothes exactly". The style's text is always followed by KEEP_LINE.
 */
export function remixPrompt(p: { words: string; name: string; style: string; look?: string }): string {
  // The character's look line (src/lib/challenge/looks.ts; owner-approved 2026-11-09) right after the reference line.
  return [p.words.trim(), `${p.name} is the person in reference image 1, the main figure.`, (p.look ?? '').trim(), p.style.trim(), KEEP_LINE, IMAGES.suffix].filter(Boolean).join('\n\n');
}

/** The other challenge characters in the moment (slugs), at most two (the edit model takes three pictures in all). */
export const othersIn = (m: Moment, character: string): string[] => m.characters.filter((c) => c !== character).slice(0, IMAGES.maxReferences - 1);

export type MakeRequest = { ok: true; from: string; moment: Moment | null; words: string; style: StyleChoice; model: string } | { ok: false; error: string };

/**
 * What the request may hold: a version to start from, the person's words, a style (one listed, Random, or their own),
 * a model id (checked against the list by the route), and, only while the moments are on, a moment of the fifteen.
 */
export function readMake(body: unknown, momentsOn: boolean = CHALLENGE.moments): MakeRequest {
  const b = (body && typeof body === 'object' ? body : {}) as { from?: unknown; moment?: unknown; words?: unknown; style?: unknown; model?: unknown };
  const from = typeof b.from === 'string' && /^[0-9a-f-]{36}$/i.test(b.from) ? b.from.toLowerCase() : null;
  if (!from) return { ok: false, error: M.noSource };
  const moment = momentsOn ? momentById(typeof b.moment === 'string' ? b.moment : null) : null;
  if (momentsOn && !moment) return { ok: false, error: M.noMoment };
  const words = typeof b.words === 'string' ? b.words.trim() : '';
  if (!words) return { ok: false, error: M.noWords };
  if (words.length > IMAGES.promptMaxChars) return { ok: false, error: `Describe it in up to ${IMAGES.promptMaxChars} characters` };
  // A request with no style (the moments flow's screen): the first listed style.
  const style = b.style === undefined ? ({ kind: 'style', id: '' } as StyleChoice) : readStyleChoice(b.style);
  if (!style) return { ok: false, error: M.noStyle };
  if ('error' in style) return { ok: false, error: style.error === 'own-empty' ? M.ownEmpty : M.ownLong(OWN_STYLE_MAX) };
  return { ok: true, from, moment, words, style, model: typeof b.model === 'string' ? b.model : '' };
}

const callName = (slug: string) => (bookCharacter(slug)?.name ?? slug).split(' ')[0];

/** A published style, as the row lists it and the prompt uses it. */
export interface PublishedStyle {
  id: string;
  label: string;
  text: string;
  elementId: string;
  versionId: string;
  versionNo: number;
  entity: string;
  title: string;
  byName: string | null;
  byFid: number;
  assist: unknown;
}

/** The site's published styles (studio.entities kind 'style' with a published design), each design at its newest version, newest first. */
export async function publishedStyles(sql: postgres.Sql): Promise<PublishedStyle[]> {
  const rows = await listDesigns(sql, 'style').catch(() => []);
  return rows
    .filter((r) => r.text.trim())
    .map((r) => ({ id: `style:${r.elementId}`, label: r.title.trim() || r.entity, text: r.text, elementId: r.elementId, versionId: r.versionId, versionNo: r.versionNo, entity: r.entity, title: r.title, byName: r.byName, byFid: r.byFid, assist: r.assist }));
}

/** "Random" (owner, 2026-11-08): one of the published styles, drawn uniformly at make time (P5g: the whole list, unweighted). */
export const drawStyle = (published: readonly PublishedStyle[]): PublishedStyle | null => shuffleFresh(published)[0] ?? null;

/** The style a request resolves to: its text for the prompt, and what the recipe records. Null when it names nothing listed. */
export type ResolvedStyle = { choice: 'same' | 'preset' | 'published' | 'random' | 'own'; id: string | null; label: string | null; text: string; design: PublishedStyle | null };
export function resolveStyle(c: StyleChoice, published: readonly PublishedStyle[], presets: readonly StylePreset[] = STYLE_PRESETS, draw: (l: readonly PublishedStyle[]) => PublishedStyle | null = drawStyle): ResolvedStyle | null {
  // "Same as this picture" (owner, 2026-11-09): no style text; the recipe records the choice.
  if (c.kind === 'same') return { choice: 'same', id: null, label: SAME_STYLE.label, text: '', design: null };
  if (c.kind === 'own') return { choice: 'own', id: null, label: null, text: c.text, design: null };
  if (c.kind === 'random') {
    const d = draw(published);
    return d ? { choice: 'random', id: d.id, label: d.label, text: d.text, design: d } : null;
  }
  const first = presetOptions(presets)[0]?.id ?? published[0]?.id ?? '';
  const id = c.id || first;
  const preset = presets.find((p) => `preset:${p.id}` === id);
  if (preset) return { choice: 'preset', id, label: preset.label, text: preset.prompt, design: null };
  const p = published.find((x) => x.id === id);
  return p ? { choice: 'published', id, label: p.label, text: p.text, design: p } : null;
}

/** The moments as the strip shows them: all fifteen, in the book's order, each with its chapter and its quotes. */
export const momentChips = () =>
  MOMENTS.map((m) => ({ id: m.id, title: m.title, chip: chapterChip(m), withCharacters: m.characters, quotes: m.quotes.map((q) => ({ block: q.block, text: q.text, href: readerHref(q.block) })) }));

/**
 * Where a picture made with the moments off is anchored (studio.anchors needs a passage): the character's first passage
 * in the book, its card's first "Where they appear" block (src/lib/challenge/cards.ts). The moments flow anchored to the
 * moment's passage instead.
 */
export function characterAnchor(character: string): { chapter: number; start: number; end: number } {
  const block = CARDS.find((c) => c.slug === character)?.appears[0]?.block ?? 'c1-b1';
  const m = /^c(\d+)-b(\d+)$/.exec(block)!;
  return { chapter: Number(m[1]), start: Number(m[2]), end: Number(m[2]) };
}

/** The remix screen's data: the picture tapped, its styles and models, the moments (only while on), and every word. */
export function makeView(src: Source, opts: { styles: readonly PublishedStyle[]; presets?: readonly StylePreset[]; models?: readonly ModelRowEntry[]; momentsOn?: boolean } = { styles: [] }) {
  const name = callName(src.character);
  const momentsOn = opts.momentsOn ?? CHALLENGE.moments;
  const models = opts.models ?? challengeModels();
  const styles: StyleOption[] = [...presetOptions(opts.presets ?? STYLE_PRESETS), ...opts.styles.map((s) => ({ id: s.id, kind: 'published' as const, label: s.label }))];
  // The picture's own style when it has one that is listed; else the first.
  // "Same as this picture" is the default (owner, 2026-11-09): a remix keeps the look of the picture it starts from.
  const defaultStyle = SAME_STYLE.id;
  return {
    source: { versionId: src.versionId, kind: src.kind, character: src.character, name, url: src.url, moment: momentsOn ? src.moment : null },
    moments: momentsOn ? momentChips() : [],
    styles,
    defaultStyle,
    ownStyleMax: OWN_STYLE_MAX,
    models: models.map((m) => ({ ...m, chip: modelChipText(m) })),
    w: { ...M, remixing: M.remixing(name), picture: M.picture(name), ownStyleLabel: M.ownStyleLabel, wordsLabel: momentsOn ? M.wordsLabel : M.changeLabel(name), wordsPlaceholder: momentsOn ? M.wordsPlaceholder : '' },
  };
}
export type MakeView = ReturnType<typeof makeView>;
