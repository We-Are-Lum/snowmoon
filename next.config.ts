import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';

/** The commit this build was made from. Vercel provides it; locally, ask git. */
function buildCommit(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

const nextConfig: NextConfig = {
  env: {
    APP_COMMIT: buildCommit(),
    APP_BUILT_AT: new Date().toISOString(),
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
