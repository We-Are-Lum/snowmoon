import guide from '../../content/snowmoon/world-guide.json';

/**
 * The world guide (content/snowmoon/world-guide.json), filtered to how far someone has read:
 * a line is shown only if every chapter it depends on is at or before the limit. AI-made
 * (its label says so); checked against its cited passages (content/snowmoon/recipes/world-guide.json).
 */
export interface GuideLine {
  id: string;
  section: string;
  entity: string;
  kind: string;
  text: string;
  sources: string[];
  from_chapter: number;
}

export const GUIDE_LABEL = guide.label;

export function guideUpTo(limit: number): GuideLine[] {
  return (guide.lines as GuideLine[]).filter((l) => l.from_chapter <= limit);
}

/** The guide as plain text for a model's context: one line each, with its sources. */
export function guideText(limit: number): string {
  const lines = guideUpTo(limit);
  const out: string[] = [];
  for (const section of guide.sections) {
    const here = lines.filter((l) => l.section === section);
    if (!here.length) continue;
    out.push(`## ${section}`);
    for (const l of here) out.push(`- ${l.entity}${l.kind === 'fact' || l.kind === 'event' ? '' : ` (${l.kind})`}: ${l.text} [${l.sources.join('] [')}]`);
  }
  return out.join('\n');
}
