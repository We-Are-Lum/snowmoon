import { markdownFile } from '~/lib/minpentai/markdown-route';

/** The book's passages about Minpentai: docs/minpentai/passages.md, as text/markdown. Built once at deploy time. */
export const dynamic = 'force-static';

export function GET() {
  return markdownFile('docs/minpentai/passages.md');
}
