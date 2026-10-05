/**
 * Block-ID citations in adaptation docs ("c30-b47"). Pure: used by the
 * /adaptations pages and by scripts/check-adaptations.ts.
 *
 * Illustration job names such as `c30-b041-sticking-patterns` are not
 * citations: an ID followed by "-" and more name is skipped.
 */
export const CITE_PATTERN = /\bc(\d+)-b(\d+)\b(?!-[a-z0-9])/g;

export interface Cite {
  id: string;
  chapter: number;
  idx: number;
}

export function findCites(text: string): Cite[] {
  return [...text.matchAll(CITE_PATTERN)].map((m) => ({ id: m[0], chapter: Number(m[1]), idx: Number(m[2]) }));
}

/** Reader URL for a block; the reader gives every block the id `c{chapter}-b{idx}`. */
export const citeHref = (c: Cite) => `/chapter/${c.chapter}#${c.id}`;

/**
 * Links citations in rendered HTML into the reader. Only text outside tags is
 * touched, and never inside <code> or an existing <a>. Citations that `exists`
 * rejects stay plain text.
 */
export function linkCites(html: string, exists: (chapter: number, idx: number) => boolean): string {
  const parts = html.split(/(<code[\s\S]*?<\/code>|<a\b[\s\S]*?<\/a>|<[^>]+>)/);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // a tag, a code span, or a link
      return part.replace(CITE_PATTERN, (id, ch: string, idx: string) =>
        exists(Number(ch), Number(idx))
          ? `<a class="cite" href="${citeHref({ id, chapter: Number(ch), idx: Number(idx) })}">${id}</a>`
          : id,
      );
    })
    .join('');
}
