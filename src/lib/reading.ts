/**
 * Per-block reading facts, derived from the block list alone (no database, no
 * server-only imports, so ingest scripts can share it).
 *
 *   setting  from the most recent dateline: "Meldan, Veridia" -> "veridia"
 *   label    the ¶ number readers see. Counts readable blocks only (paragraph,
 *            quote, screen, figure), so headings, datelines, and breaks leave no
 *            gaps. Block IDs (c{chapter}-b{idx}) are unchanged and stay the anchor.
 *   scene    1 + the number of breaks before the block
 */
export interface BlockLike {
  idx: number;
  kind: string;
  content: string;
  data?: Record<string, unknown>;
}

export interface BlockFacts {
  setting: string | null;
  label: number | null;
  scene: number;
}

export const READABLE_KINDS: ReadonlySet<string> = new Set(['paragraph', 'quote', 'screen', 'figure']);

/** "**Meldan, Veridia** · 3724 Snowmoon 3" -> "veridia"; "**Veridia** · …" -> "veridia". */
export function settingOfDateline(content: string): string | null {
  const m = content.match(/^\*\*(.+?)\*\*/);
  if (!m) return null;
  const region = m[1].split(',').pop()!.replace(/\\(.)/g, '$1').trim();
  return region.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || null;
}

export function blockFacts(blocks: readonly BlockLike[]): BlockFacts[] {
  let setting: string | null = null;
  let label = 0;
  let scene = 1;
  return blocks.map((b) => {
    if (b.kind === 'dateline') setting = settingOfDateline(b.content) ?? setting;
    if (b.kind === 'break') scene++;
    const readable = READABLE_KINDS.has(b.kind);
    if (readable) label++;
    return { setting, label: readable ? label : null, scene };
  });
}

/** "¶ 4" or "¶ 4–9". */
export function labelRange(from: number, to: number): string {
  return from === to ? `¶ ${from}` : `¶ ${from}–${to}`;
}
