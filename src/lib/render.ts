/**
 * Block -> HTML. Pure: used by the reader at build time and by tests.
 * Content comes only from the committed snapshot, which ingest already stripped
 * of scripts and event handlers.
 */
import { marked } from 'marked';
import type { BlockLike } from './reading';
import type { ScreenTemplate } from '~/templates';

/** Smallest text size readers see, in CSS px. */
export const MIN_TEXT_PX = 12;

export function renderMarkdown(b: BlockLike): string {
  const html =
    b.kind === 'paragraph' || b.kind === 'dateline'
      ? (marked.parseInline(b.content, { async: false }) as string)
      : (marked.parse(b.content, { async: false }) as string);
  // Speaker colour spans keep their hue; the theme decides lightness.
  return html.replace(/data-hue="([\d.]+)"/g, 'data-hue="$1" style="--hue:$1"');
}

export type ScreenSource = { from: 'template'; templateId: string } | { from: 'book' };

/**
 * A screen or figure block. Covered blocks are drawn by the take's render element,
 * which is not built yet, so `covered` is always false today.
 */
export function renderScreen(
  b: BlockLike,
  templates: readonly ScreenTemplate[],
  covered = false,
): { html: string; source: ScreenSource } {
  if (!covered) {
    const t = templates.find((t) => t.matches(b));
    if (t) return { html: t.render(b), source: { from: 'template', templateId: t.id } };
  }
  return { html: b.content, source: { from: 'book' } };
}

/**
 * A render version may replace the book text only where its anchor covers screen or
 * figure blocks and nothing else. The database allows any render to replace; the
 * app checks the span with this before writing a `replace` take item.
 */
export function renderMayReplace(blocks: readonly BlockLike[], startIdx: number, endIdx: number): boolean {
  const span = blocks.filter((b) => b.idx >= startIdx && b.idx <= endIdx);
  return span.length === endIdx - startIdx + 1 && span.every((b) => b.kind === 'screen' || b.kind === 'figure');
}

/** Base font size for source screens; raised when a screen's smallest text would fall below MIN_TEXT_PX. */
export const SCREEN_BASE_PX = 14;

export function screenBasePx(b: BlockLike): number {
  const scale = (b.data?.frame as { min_font_scale?: number } | undefined)?.min_font_scale ?? 1;
  return Math.max(SCREEN_BASE_PX, Math.ceil((MIN_TEXT_PX / scale) * 10) / 10);
}

interface SvgField {
  type: 'svg';
  viewBox: string | null;
  width: string | null;
  min_text: number | null;
}

/**
 * Minimum rendered width for a figure so its smallest text is at least MIN_TEXT_PX.
 * Wider than the screen means the figure scrolls sideways inside its frame.
 */
export function figureMinWidth(b: BlockLike): number | null {
  const fields = (b.data?.fields ?? []) as { type: string }[];
  const svg = fields.find((f) => f.type === 'svg') as SvgField | undefined;
  if (!svg?.min_text) return null;
  const vbWidth = Number(svg.viewBox?.split(/[\s,]+/)[2] ?? svg.width);
  if (!vbWidth) return null;
  return Math.ceil((vbWidth * MIN_TEXT_PX) / svg.min_text);
}
