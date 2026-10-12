/**
 * The planning coach's code checks (owner-approved design change 2, 2026-10-11), shared by the
 * eval and its test. They flag, for the reviewer: cited block ids that don't exist or are past
 * the reader's chapter; phrases that offer wording; quoted spans that are neither the person's
 * words nor the book's; and any quoted words or on-screen text in the picture slots.
 */
export const CANT = "I can't check this within your chapter.";
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const section = (reply: string, name: string) => reply.match(new RegExp(`${name}:\\s*\\n([\\s\\S]*?)(?=\\n[A-Z ]{4,}:\\s*\\n|$)`))?.[1] ?? '';

export function codeFlags(reply: string, draft: string, limit: number, book: { byId: Map<string, { chapter: number }>; bookNorm: string; allowedNorm?: string }): string[] {
  const out: string[] = [];
  for (const id of reply.match(/c\d+-b\d+/g) ?? []) {
    const b = book.byId.get(id);
    if (!b) out.push(`cites ${id}, which is not a block of the book`);
    else if (b.chapter > limit) out.push(`cites ${id}, past the chapter limit (${limit})`);
  }
  const offer = reply.match(/(you could (write|say|use)(?! aloud)|something like|for (example|instance)[,:]\s*["“]|try (writing|saying)|replace [^.]* with ["“]|change [^.]* to ["“]|e\.g\.)/gi);
  if (offer) out.push(`offers wording: ${[...new Set(offer.map((x) => x.toLowerCase()))].join('; ')}`);
  const draftNorm = norm(draft);
  // Pair every quotation first (straight with straight, curly with curly), then keep the long ones:
  // skipping short quotations would let a closing mark open a false quotation.
  for (const q of (reply.match(/"[^"\n]*"|“[^”]*”/g) ?? []).filter((x) => x.length >= 14)) {
    // a quotation shortened with an ellipsis is checked part by part; words quoted from the craft guide
    // (Design's own questions, such as "What would we see?") are allowed too
    const parts = q.split(/…|\.\.\./).map(norm).filter((x) => x.split(' ').length >= 3);
    const known = (x: string) => draftNorm.includes(x) || book.bookNorm.includes(x) || (book.allowedNorm ?? '').includes(x);
    if (parts.length && !parts.every(known) && !q.includes(CANT)) out.push(`quotes words that are neither the person's nor the book's: ${q.slice(0, 90)}`);
  }
  // Picture slots carry no words at all: no quotation marks, no on-screen text.
  const slots = section(reply, 'PICTURE SLOTS');
  for (const q of (slots.match(/"[^"\n]*"|“[^”]*”|‘[^’]*’/g) ?? []).filter((x) => x.length >= 4)) out.push(`picture slot has quoted words: ${q.slice(0, 60)}`);
  const onScreen = slots.match(/\b(sign|screen|banner|poster|caption|lettering|speech bubble|subtitle|headline|text)s?\b[^.\n]*\b(reads?|says?|saying|reading|shows? the words?|with the words?)\b/gi);
  if (onScreen) out.push(`picture slot names on-screen text: ${onScreen.map((x) => x.slice(0, 60)).join('; ')}`);
  return [...new Set(out)];
}
