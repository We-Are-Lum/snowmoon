/**
 * A screen block's words as its screen shows them, the part that runs anywhere (no server-only import), so the
 * word-for-word quote checks can share it: the agents' book lines (src/lib/agents/filter.ts, bookLineOk) and the
 * challenge's quotes (src/lib/challenge/book-quotes.ts, quoteProblems), as well as search_book and get_passage
 * (src/lib/book-search.ts, which re-exports it). Screens are device HTML: a table's cells, a list's items and a
 * screen's lines must stay apart, or "civic duty" and "Does not meet" in c1-b55 read as "civic dutyDoes".
 */

/** Tags that sit inside a word or line on a screen (CO<sub>2</sub>, <em>all</em>): removed with no space. */
const INLINE_TAG = /<\/?(?:b|i|em|strong|span|sub|sup|code|u|s|small|mark)\b[^>]*>/gi;

/**
 * A screen block's words as its screen shows them: table cells, list items, lines and buttons
 * apart (each block-level tag or line break is a space), inline tags removed, &nbsp; and the
 * other entities read.
 */
export function screenText(content: string): string {
  return content
    .replace(INLINE_TAG, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
