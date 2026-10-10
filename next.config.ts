import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** The commit this build was made from. Vercel provides it; locally, ask git. */
function buildCommit(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

/**
 * The owner's launch order (2026-10-09): image making for everyone does not go live before the
 * Terms and Privacy pages do. Read here, at build time, from the page files themselves, and
 * inlined into the server code as APP_LEGAL_PAGES (src/lib/images/gate.ts). Being inlined, it
 * can't be set by hand on the host; check:principles P6g fails while either page is missing.
 */
function legalPages(): string {
  const has = (p: string) => existsSync(path.join(process.cwd(), 'src/app', p, 'page.tsx'));
  return has('terms') && has('privacy') ? 'terms+privacy' : 'missing';
}

const nextConfig: NextConfig = {
  env: {
    APP_COMMIT: buildCommit(),
    APP_BUILT_AT: new Date().toISOString(),
    APP_LEGAL_PAGES: legalPages(),
  },
  // Files read from disk at runtime (share pages and quote cards are rendered on demand).
  outputFileTracingIncludes: {
    '/**': [
      './content/snowmoon/text/**',
      './content/snowmoon/illustrations/**',
      // Recipes are read at request time too (the first-visit intro's recipe card, narration).
      './content/snowmoon/recipes/**',
      // The style a reader may add to an image prompt (src/lib/images/rules.ts).
      './content/snowmoon/designs/styles/**',
      './config/**',
      './adaptations/**',
      './node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-*-normal.woff',
      './node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-*-italic.woff',
      './node_modules/@fontsource/dm-mono/files/dm-mono-latin-*-normal.woff',
    ],
  },
};

export default nextConfig;
