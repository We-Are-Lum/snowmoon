import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * A committed Markdown file served as it is, as text/markdown (/minpentai/agents.md, /minpentai/passages.md).
 * The routes are static: the file is read once, at build time.
 */
export function markdownFile(file: string): Response {
  return new Response(readFileSync(path.join(process.cwd(), file), 'utf8'), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
