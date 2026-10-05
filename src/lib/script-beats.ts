/**
 * Reads the beats of an adaptation script (docs/adaptation-format.md): each
 * beat's fields as written (the model-drafted working notes), its candidate
 * book lines, and its narration and dialogue lines with their author tags.
 */

export interface Tagged {
  line: number; // 1-based line in script.md
  tag: string | null; // the backticked tag at the start, if any
  text: string; // the rest, with any trailing *(note)* removed
}

export interface Beat {
  n: number;
  title: string;
  bookLines: Tagged[];
  narration: Tagged[];
  dialogue: Tagged[];
  /** Text written on the field's own line, other than the empty marker. */
  inline: { field: 'narration' | 'dialogue'; line: number; text: string }[];
  /** Every field's markdown as written, in order (working notes). */
  fields: { name: string; markdown: string }[];
}

export const EMPTY = '*(empty until a person writes it)*';
export const NARRATION_MAX_WORDS = 25;

/** `book c30-b61` (the author's words) or `by FID 6786 on 2026-10-06` (a signed-in person's). */
export const BOOK_TAG = /^book (c\d+-b\d+)$/;
export const PERSON_TAG = /^by FID (\d+) on (\d{4}-\d{2}-\d{2})$/;

const FIELD = /^- \*\*([a-z ]+):\*\*\s*(.*)$/;
const ITEM = /^\s+- (?:`([^`]+)`\s*)?(.*)$/;
const NOTE = /\s*\*\([^)]*\)\*\s*$/;

export function parseBeats(markdown: string): Beat[] {
  const beats: Beat[] = [];
  let beat: Beat | null = null;
  let field = '';
  markdown.split('\n').forEach((raw, i) => {
    const line = i + 1;
    const head = raw.match(/^## Beat (\d+) · (.+)$/);
    if (head) {
      beat = { n: Number(head[1]), title: head[2], bookLines: [], narration: [], dialogue: [], inline: [], fields: [] };
      beats.push(beat);
      field = '';
      return;
    }
    if (!beat) return;
    const b: Beat = beat;
    if (/^(---|## )/.test(raw)) {
      field = '';
      return;
    }
    const f = raw.match(FIELD);
    if (f) {
      field = f[1];
      b.fields.push({ name: field, markdown: f[2] });
      const rest = f[2].trim();
      if ((field === 'narration' || field === 'dialogue') && rest && rest !== EMPTY) {
        b.inline.push({ field, line, text: rest });
      }
      return;
    }
    if (field && raw.trim()) b.fields[b.fields.length - 1].markdown += '\n' + raw;
    const it = raw.match(ITEM);
    if (!it) return;
    const entry: Tagged = { line, tag: it[1] ?? null, text: it[2].replace(NOTE, '').trim() };
    if (field === 'book lines') b.bookLines.push(entry);
    else if (field === 'narration') b.narration.push(entry);
    else if (field === 'dialogue') b.dialogue.push(entry);
  });
  return beats;
}

/** A block's plain text: tags removed, entities decoded, markdown emphasis removed, spaces collapsed. */
export function plainBlock(content: string): string {
  return content
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\*\*|__/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True if every part of `text` between `…` cuts appears, in order, in the block. */
export function isVerbatim(text: string, block: string): boolean {
  const parts = text.split('…').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return false;
  let from = 0;
  for (const p of parts) {
    const at = block.indexOf(p, from);
    if (at < 0) return false;
    from = at + p.length;
  }
  return true;
}

export const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
