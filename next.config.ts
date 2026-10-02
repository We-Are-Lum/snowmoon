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
  // Chapter JSON is read from disk at build time; make sure it ships with any server output too.
  outputFileTracingIncludes: { '/**': ['./content/snowmoon/text/**'] },
};

export default nextConfig;
