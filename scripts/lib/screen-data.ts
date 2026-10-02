/**
 * Structured data for `screen` and `figure` blocks (text_blocks.data).
 *
 *   setting from the most recent dateline in the chapter (e.g. "Meldan, Veridia" -> "veridia")
 *   device  PROVISIONAL. What the text says shows the screen, found by keyword in the
 *           paragraphs just before it, with the block index and an exact quote as evidence.
 *           null when the text does not say. A deterministic heuristic, not a reading;
 *           `device_provisional: true` says so in the data. Milestone 2 replaces it with
 *           the device's owner, with evidence.
 *   frame   the source's own layout classes and inline style
 *   fields  what the screen shows, in order: headings, text, tables, lists, controls, SVGs
 */
import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

export type Field =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'rule' }
  | { type: 'button'; label: string }
  | { type: 'slider'; labels: string[] }
  | { type: 'table'; header: Cell[][]; rows: Cell[][] }
  | {
      type: 'svg';
      file: string;
      viewBox: string | null;
      width: string | null;
      height: string | null;
      labels: string[];
      animated: boolean;
      /** Smallest effective font size of any visible text, in SVG user units; null if no text. */
      min_text: number | null;
    };

export type Cell = string | { text: string; controls: Field[] };

export interface Evidence {
  idx: number;
  quote: string;
}

export interface ScreenData {
  setting: string | null;
  setting_evidence: Evidence | null;
  device: string | null;
  device_evidence: Evidence | null;
  /** Always true until Milestone 2 records each screen's device and owner from the analysis. */
  device_provisional: true;
  frame: {
    width: 'narrow' | 'wide';
    align: 'center' | 'left';
    style: string | null;
    /** Smallest text inside the screen (outside SVGs) relative to the screen's base size; 1 if none is smaller. */
    min_font_scale: number;
  };
  fields: Field[];
}

/** Base size the source assumes for a screen, used to turn absolute px sizes into a scale. */
const SCREEN_BASE_PX = 14;

export function minFontScale($: cheerio.CheerioAPI, root: Element): number {
  let min = 1;
  const walk = (el: Element, scale: number) => {
    if (el.tagName === 'svg') return; // figures are sized by min_text
    let own = scale;
    if (el !== root) {
      const raw = ($(el).attr('style') ?? '').match(/font-size:\s*([^;]+)/)?.[1]?.trim();
      const m = raw?.match(/^([\d.]+)\s*(px|em|%)?$/);
      if (m) {
        const n = Number(m[1]);
        own = m[2] === '%' ? (scale * n) / 100 : m[2] === 'em' ? scale * n : n / SCREEN_BASE_PX;
      }
    }
    if (el.children.some((c) => c.type === 'text' && (c as unknown as { data: string }).data.trim())) min = Math.min(min, own);
    for (const c of el.children) if (c.type === 'tag') walk(c as Element, own);
  };
  walk(root, 1);
  return Math.round(min * 1000) / 1000;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// fields
// ---------------------------------------------------------------------------

const INLINE = new Set(['span', 'em', 'i', 'strong', 'sub', 'sup', 'code', 'a', 'br', 'small', 'tspan']);
const BLOCK_SELECTOR = 'table, ul, ol, svg, hr, button, input, h3, p, pre, blockquote, div, center';

function hasBlockish($: cheerio.CheerioAPI, el: Element): boolean {
  return $(el).find(BLOCK_SELECTOR).length > 0;
}

const SVG_DEFAULT_FONT = 16;

/** A font-size from an attribute or inline style, resolved against the parent's size. */
function ownFontSize($: cheerio.CheerioAPI, el: Element, parent: number): number {
  const raw = $(el).attr('font-size') ?? ($(el).attr('style') ?? '').match(/font-size:\s*([^;]+)/)?.[1];
  if (!raw) return parent;
  const m = raw.trim().match(/^([\d.]+)\s*(px|em|%)?$/);
  if (!m) return parent;
  const n = Number(m[1]);
  return m[2] === 'em' ? n * parent : m[2] === '%' ? (n * parent) / 100 : n;
}

/** Smallest effective font size among text elements that show characters. */
function minTextSize($: cheerio.CheerioAPI, svg: Element): number | null {
  let min: number | null = null;
  const walk = (el: Element, size: number) => {
    const own = ownFontSize($, el, size);
    if ((el.tagName === 'text' || el.tagName === 'tspan') && el.children.some((c) => c.type === 'text' && (c as unknown as { data: string }).data.trim())) {
      min = min === null ? own : Math.min(min, own);
    }
    for (const c of el.children) if (c.type === 'tag') walk(c as Element, own);
  };
  walk(svg, SVG_DEFAULT_FONT);
  return min === null ? null : Math.round((min as number) * 100) / 100;
}

function sliderLabels($: cheerio.CheerioAPI, input: Element): string[] {
  // The source puts the -5 / 0 / 5 labels in a flex div right after the range input.
  const next = $(input).nextAll('div').first();
  return next.find('span').map((_, s) => squash($(s).text())).get();
}

function controlsIn($: cheerio.CheerioAPI, el: Element): Field[] {
  const out: Field[] = [];
  $(el)
    .find('input[type="range"], button')
    .each((_, c) => {
      const e = c as Element;
      if (e.tagName === 'button') out.push({ type: 'button', label: squash($(e).text()) });
      else out.push({ type: 'slider', labels: sliderLabels($, e) });
    });
  return out;
}

function cellOf($: cheerio.CheerioAPI, td: Element): Cell {
  const controls = controlsIn($, td);
  const clone = $(td).clone();
  clone.find('input, button').each((_, c) => {
    if ((c as Element).tagName === 'input') $(c).next('div').remove();
    $(c).remove();
  });
  const text = squash(clone.text());
  return controls.length ? { text, controls } : text;
}

export function extractFields($: cheerio.CheerioAPI, root: Element, svgFile: (k: number) => string): Field[] {
  const fields: Field[] = [];
  let svgCount = 0;
  let run = '';
  const flush = () => {
    const t = squash(run);
    if (t) fields.push({ type: 'text', text: t });
    run = '';
  };

  const visit = (nodes: AnyNode[]) => {
    for (const node of nodes) {
      if (node.type === 'text') {
        run += (node as unknown as { data: string }).data;
        continue;
      }
      if (node.type !== 'tag') continue;
      const el = node as Element;
      const tag = el.tagName;
      if (INLINE.has(tag)) {
        run += tag === 'br' ? ' ' : $(el).text();
        continue;
      }
      flush();
      switch (tag) {
        case 'h3':
          fields.push({ type: 'heading', text: squash($(el).text()) });
          break;
        case 'b':
          fields.push({ type: 'heading', text: squash($(el).text()) });
          break;
        case 'p':
        case 'pre':
        case 'blockquote':
          if (hasBlockish($, el)) visit(el.children);
          else fields.push({ type: 'text', text: squash($(el).text()) });
          break;
        case 'hr':
          fields.push({ type: 'rule' });
          break;
        case 'ul':
        case 'ol':
          fields.push({ type: 'list', items: $(el).children('li').map((_, li) => squash($(li).text())).get() });
          break;
        case 'button':
          fields.push({ type: 'button', label: squash($(el).text()) });
          break;
        case 'input':
          if ($(el).attr('type') === 'range') fields.push({ type: 'slider', labels: sliderLabels($, el) });
          break;
        case 'table': {
          const rowCells = (tr: Element) => $(tr).children('th, td').map((_, c) => [cellOf($, c as Element)]).get() as Cell[];
          const header = $(el).find('> thead > tr').map((_, tr) => [rowCells(tr as Element)]).get() as Cell[][];
          const body = $(el).find('> tbody > tr, > tr').map((_, tr) => [rowCells(tr as Element)]).get() as Cell[][];
          fields.push({ type: 'table', header, rows: body });
          break;
        }
        case 'svg': {
          svgCount++;
          const s = $(el);
          fields.push({
            type: 'svg',
            file: svgFile(svgCount),
            viewBox: s.attr('viewBox') ?? null,
            width: s.attr('width') ?? null,
            height: s.attr('height') ?? null,
            labels: s.find('text').map((_, t) => squash($(t).text())).get().filter(Boolean),
            animated: s.find('animate, animateTransform, animateMotion').length > 0,
            min_text: minTextSize($, el),
          });
          break;
        }
        case 'div':
        case 'center':
          if ($(el).prev('input[type="range"]').length) break; // slider labels, read by the slider
          if (hasBlockish($, el)) visit(el.children);
          else if (squash($(el).text())) fields.push({ type: 'text', text: squash($(el).text()) });
          break;
        default:
          visit(el.children);
      }
    }
  };
  visit(root.children);
  flush();
  return fields;
}

// ---------------------------------------------------------------------------
// setting and device
// ---------------------------------------------------------------------------

export interface PriorBlock {
  idx: number;
  kind: string;
  content: string;
  data?: ScreenData;
}

/** Most specific first. Each pattern must match the raw block Markdown. */
const DEVICE_KEYWORDS: [RegExp, string][] = [
  [/hand device/i, 'hand_device'],
  [/\bwatch\b(?!ed|ing|es)/i, 'watch'],
  [/\bglasses\b/i, 'glasses'],
  [/\bheadset\b/i, 'headset'],
  [/\bposter\b/i, 'poster'],
  [/\btabletop\b/i, 'tabletop'],
  [/\bcomputer\b/i, 'computer'],
  [/\brobot\b/i, 'robot'],
  [/green circle|circle (?:beeped|buzzed)/i, 'green_circle'],
  [/\b(?:big|large) screen\b|front wall|\bslide\b/i, 'wall_screen'],
  [/\bpage\b|\bbook\b/i, 'page'],
  [/\bscreen\b|onscreen/i, 'screen'],
];

/** The sentence in `content` that contains position `at`. Always an exact substring. */
function sentenceAround(content: string, at: number): string {
  const starts = [...content.slice(0, at).matchAll(/[.!?]["”]?\s+/g)];
  const start = starts.length ? starts[starts.length - 1].index! + starts[starts.length - 1][0].length : 0;
  const endMatch = content.slice(at).match(/[.!?:]["”]?(?=\s|$)/);
  const end = endMatch ? at + endMatch.index! + endMatch[0].length : content.length;
  return content.slice(start, end).trim();
}

const LOOKBACK_PARAGRAPHS = 3;

/**
 * Walk back from the screen: stop at a scene break or dateline, look at up to three
 * paragraphs, and inherit from an earlier screen if one is reached first.
 */
export function inferDevice(prior: PriorBlock[]): { device: string | null; evidence: Evidence | null } {
  let seen = 0;
  for (let i = prior.length - 1; i >= 0 && seen < LOOKBACK_PARAGRAPHS; i--) {
    const b = prior[i];
    if (b.kind === 'break' || b.kind === 'dateline' || b.kind === 'heading') break;
    if ((b.kind === 'screen' || b.kind === 'figure') && b.data) {
      if (b.data.device) return { device: b.data.device, evidence: b.data.device_evidence };
      continue;
    }
    if (b.kind !== 'paragraph') continue;
    seen++;
    // The match closest to the end of the paragraph wins; ties go to the more specific keyword.
    let best: { at: number; device: string } | null = null;
    for (const [re, device] of DEVICE_KEYWORDS) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      for (const m of b.content.matchAll(g)) {
        if (!best || m.index! > best.at) best = { at: m.index!, device };
      }
    }
    if (best) return { device: best.device, evidence: { idx: b.idx, quote: sentenceAround(b.content, best.at) } };
  }
  return { device: null, evidence: null };
}
