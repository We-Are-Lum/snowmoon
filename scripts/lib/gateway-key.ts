/**
 * The gateway credential for batch jobs, and nothing else (owner, 2026-10-11: batch jobs call
 * the model only through the Vercel AI Gateway, never with the site's Groq key). Takes
 * AI_GATEWAY_API_KEY from the environment, or reads that one line from .env.local (this worktree's,
 * then the main checkout's); the rest of
 * the file (which may hold the site's Groq key) is never loaded. scripts/lib/batch-model.ts
 * then refuses to run if it is still missing.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function loadGatewayKey(): void {
  if (process.env.AI_GATEWAY_API_KEY) return;
  // This worktree's .env.local, then the main checkout's (worktrees share its .git directory).
  const files = [path.join(process.cwd(), '.env.local')];
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
    files.push(path.join(path.dirname(common), '.env.local'));
  } catch {}
  for (const file of files) {
    if (!existsSync(file)) continue;
    const m = readFileSync(file, 'utf8').match(/^\s*AI_GATEWAY_API_KEY\s*=\s*"?([^"\r\n]+)"?\s*$/m);
    if (m) { process.env.AI_GATEWAY_API_KEY = m[1].trim(); return; }
  }
}

/** A prompt from config/prompts, without its leading comment (as the site reads it). */
export function promptFile(name: string): string {
  return readFileSync(path.join(process.cwd(), 'config', 'prompts', name), 'utf8').replace(/^<!--[\s\S]*?-->\s*/, '');
}
