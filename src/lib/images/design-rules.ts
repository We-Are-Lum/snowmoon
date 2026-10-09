import { IMAGES } from '../config';

/**
 * Styles and character sheets (step 4, docs/proposals/style-guides-and-sheets.md): what a sample
 * picture or a sheet view is asked for, shown in full on the screen before anything is made. The
 * subjects and view lines were drafted by the coding agent (a closed model); recipes say so.
 * Safe in the browser: no file or database access here.
 */

/** One fixed subject per sample slot, so samples show the style, not a reader's scene. */
export const SAMPLE_SUBJECTS = [
  'A wide street with tall trees and low buildings, a few people walking, daytime.',
  'A small room with a desk, a window and a plant, seen from the doorway.',
  'A footpath through tall trees, a small drone flying overhead.',
  'A market square at dusk, seen from above.',
] as const;

export type ViewSlot = 'front' | 'side' | 'back';
export const VIEW_SLOTS: ViewSlot[] = ['front', 'side', 'back'];

/** The front view is made from the sheet text; side and back from the front view, with the edit model. */
export const VIEW_LINES: Record<ViewSlot, string> = {
  front: 'Character reference picture: one person, full body, standing, seen from the front, plain light grey background.',
  side: 'The same person as in the reference picture, full body, standing, seen from the side, plain light grey background. Keep the face, hair and clothes the same.',
  back: 'The same person as in the reference picture, full body, standing, seen from behind, plain light grey background. Keep the hair and clothes the same.',
};

/** The exact prompt for a sample or a view: the fixed subject, the design's text, the no-words line. */
export function samplePrompt(subject: string, text: string): string {
  return [subject, text.trim(), IMAGES.suffix].filter(Boolean).join('\n\n');
}

/** Who drafted the fixed wording in a sample's prompt (recorded in the sample's recipe). */
export const SAMPLE_ASSIST = { model: 'claude-coding-agent', drafted: ['sample subject or view line'], source: 'src/lib/images/design-rules.ts' } as const;

/** Words a character is called by in the book, for "is this character in the passage?" (whole words, case kept). */
export function callNames(name: string): string[] {
  return name.split(/\s+/).filter((w) => !/^(Lord|Lady|General|Senator|Doctor|Dr\.?)$/.test(w) && w.length > 1);
}

export function mentions(passage: string, name: string): boolean {
  return callNames(name).some((w) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(passage));
}

/**
 * A word-level difference: the second text's words, each marked changed or not against the first.
 * Used to shade a fork's own words (Design 4c) and a newer version's changes (Design 6).
 */
export function wordDiff(a: string, b: string): { text: string; changed: boolean }[] {
  const x = a.split(/(\s+)/).filter((t) => t !== '');
  const y = b.split(/(\s+)/).filter((t) => t !== '');
  const n = x.length, m = y.length;
  if (n * m > 250_000) return [{ text: b, changed: a !== b }];
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { text: string; changed: boolean }[] = [];
  let i = 0, j = 0;
  const push = (text: string, changed: boolean) => {
    const last = out[out.length - 1];
    if (last && last.changed === changed) last.text += text;
    else out.push({ text, changed });
  };
  while (j < m) {
    if (i < n && x[i] === y[j]) {
      push(y[j], false);
      i++;
      j++;
    } else if (i < n && L[i + 1][j] >= L[i][j + 1]) i++;
    else {
      push(y[j], !/^\s+$/.test(y[j]));
      j++;
    }
  }
  // A space between two changed words is shaded with them, so a changed phrase reads as one.
  const merged: { text: string; changed: boolean }[] = [];
  out.forEach((part, k) => {
    const between = !part.changed && /^\s+$/.test(part.text) && out[k - 1]?.changed && out[k + 1]?.changed;
    const p = between ? { ...part, changed: true } : part;
    const last = merged[merged.length - 1];
    if (last && last.changed === p.changed) last.text += p.text;
    else merged.push({ ...p });
  });
  return merged;
}
