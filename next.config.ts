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
 * can't be set by hand on the host; check:principles P6n fails while either page is missing.
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
      // A glossary word's share card (src/app/api/glossary-card) reads the glossary on request.
      './content/snowmoon/glossary.json',
      './config/**',
      // Only the scene docs read at request time (src/lib/adaptations.ts), not the frames and sound
      // committed beside them (publish step (a)): those would add ~150 MB to every function.
      './adaptations/*/*.md',
      './adaptations/*/*.json',
      './node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-*-normal.woff',
      './node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-*-italic.woff',
      './node_modules/@fontsource/dm-mono/files/dm-mono-latin-*-normal.woff',
    ],
    // Remix's Generate reads the shot (its prompt, plate and cast cards) from the editor's data,
    // made at build time from committed files (scripts/editor-data.mjs): only those, not the voices.
    '/api/remix/**': ['./public/editor/*/v*/data.json', './public/editor/*/v*/plates/**', './public/editor/*/v*/cards/**'],
  },
  // The end card's "make your own" link (owner, 2026-10-14): the repository for now; temporary (307),
  // since /make may become a page of its own.
  async redirects() {
    return [{ source: '/make', destination: 'https://github.com/We-Are-Lum/snowmoon', permanent: false }];
  },
  // Adaptation pages (docs/proposals/adaptation-urls.md). A folder named `@…` is a parallel-route slot
  // in the App Router, so the public /@<fname>/… URLs are rewritten to /adaptation/<id>/by/<fname>/….
  // These run after the app's own pages and files, so no existing route is shadowed; /<id> is digits only.
  async rewrites() {
    return [
      { source: '/@:handle/:id/v/:n', destination: '/adaptation/:id/by/:handle/v/:n' },
      // A fixed version's own editor and storyboard (its frames and labels, whatever the chosen version is).
      { source: '/@:handle/:id/v/:n/shot/:shot', destination: '/adaptation/:id/by/:handle/v/:n/shot/:shot' },
      { source: '/@:handle/:id/v/:n/storyboard', destination: '/adaptation/:id/by/:handle/v/:n/storyboard' },
      { source: '/@:handle/:id/shot/:shot', destination: '/adaptation/:id/by/:handle/shot/:shot' },
      { source: '/@:handle/:id/storyboard', destination: '/adaptation/:id/by/:handle/storyboard' },
      { source: '/@:handle/:id', destination: '/adaptation/:id/by/:handle' },
      { source: '/:id(\\d{1,9})', destination: '/adaptation/:id' },
    ];
  },
};

export default nextConfig;
