import { markdownFile } from '~/lib/minpentai/markdown-route';

/** For an agent starting to build on Minpentai: docs/minpentai/agents.md, as text/markdown. Built once at deploy time. */
export const dynamic = 'force-static';

export function GET() {
  return markdownFile('docs/minpentai/agents.md');
}
