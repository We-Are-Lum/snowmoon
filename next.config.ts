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

/**
 * Minpentai in a Farcaster cast (the snap, owner 2026-10-22): one link for both. A request that asks
 * for a snap (Accept: application/vnd.farcaster.snap+json) gets the snap's JSON from /snap/minpentai;
 * any other gets the page, unchanged, with a Link header naming the snap, as the snap spec requires
 * (https://docs.farcaster.xyz/snap/http-headers). The same for a challenge link, /minpentai/c/<…>.
 * The `Vary: Accept` here doesn't reach the page: Next and Vercel set a page's Vary themselves (a
 * middleware can't add to it either; tried 2026-10-22). Caches still key correctly, since the choice
 * is made here in routing, before Vercel's cache, and the snap's own responses carry Vary: Accept.
 */
const SNAP_MEDIA = 'application/vnd.farcaster.snap+json';
const ASKS_FOR_SNAP = [{ type: 'header' as const, key: 'accept', value: '.*application/vnd\\.farcaster\\.snap\\+json.*' }];
const IS_PREFLIGHT = [{ type: 'header' as const, key: 'access-control-request-method' }];
const snapAlternate = (path: string) => [
  { key: 'Link', value: `<${path}>; rel="alternate"; type="${SNAP_MEDIA}"` },
  { key: 'Vary', value: 'Accept' },
];

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
    // …and, for a shot made in code, its saved layout (set/, owner 2026-10-22).
    '/api/remix/**': ['./public/editor/*/v*/data.json', './public/editor/*/v*/plates/**', './public/editor/*/v*/cards/**', './public/editor/*/v*/set/**'],
    // An agent's frame try or video test, made when its person approves it (src/lib/agents/approve.ts): the same, and
    // the shot's frame for a video test.
    '/api/drafts': ['./public/editor/*/v*/data.json', './public/editor/*/v*/plates/**', './public/editor/*/v*/cards/**', './public/editor/*/v*/set/**', './public/editor/*/v*/frames/**'],
    // The agent read API reads the same editor data (src/lib/agent/data.ts).
    '/api/agent/**': ['./public/editor/*/v*/data.json'],
    '/api/mcp': ['./public/editor/*/v*/data.json'],
    // A moment page reads each version's shot (its frame, times and lines) from the same data.
    '/adaptation/**': ['./public/editor/*/v*/data.json'],
  },
  // The end card's "make your own" link (owner, 2026-10-14): the repository for now; temporary (307),
  // since /make may become a page of its own.
  async redirects() {
    return [{ source: '/make', destination: 'https://github.com/We-Are-Lum/snowmoon', permanent: false }];
  },
  async headers() {
    return [
      { source: '/minpentai', missing: ASKS_FOR_SNAP, headers: snapAlternate('/minpentai') },
      { source: '/minpentai/play', missing: ASKS_FOR_SNAP, headers: snapAlternate('/minpentai/play') },
      { source: '/minpentai/c/:seg', missing: ASKS_FOR_SNAP, headers: snapAlternate('/minpentai/c/:seg') },
    ];
  },
  // Adaptation pages (docs/proposals/adaptation-urls.md). A folder named `@…` is a parallel-route slot
  // in the App Router, so the public /@<fname>/… URLs are rewritten to /adaptation/<id>/by/<fname>/….
  // These run after the app's own pages and files, so no existing route is shadowed; /<id> is digits only.
  async rewrites() {
    // The snap first (before the app's pages: /minpentai is a page), then the adaptation pages.
    const beforeFiles = [
      // A browser client (Farcaster's web app) sends X-Snap-Payload with the snap request, so it asks first
      // (a CORS preflight: OPTIONS, without the snap Accept). The static page's own answer allows no
      // headers and the browser never sends the request (2026-10-23: no snap in the web composer), so
      // preflights go to the snap route, which allows them.
      ...['/minpentai', '/minpentai/play', '/minpentai/c/:seg'].map((source) => ({ source, has: IS_PREFLIGHT, destination: '/snap/minpentai' })),
      { source: '/minpentai', has: ASKS_FOR_SNAP, destination: '/snap/minpentai' },
      { source: '/minpentai/play', has: ASKS_FOR_SNAP, destination: '/snap/minpentai' },
      { source: '/minpentai/c/:seg', has: ASKS_FOR_SNAP, destination: '/snap/minpentai?c=:seg' },
    ];
    const afterFiles = [
      { source: '/@:handle/:id/v/:n', destination: '/adaptation/:id/by/:handle/v/:n' },
      // A fixed version's own editor and storyboard (its frames and labels, whatever the chosen version is).
      { source: '/@:handle/:id/v/:n/shot/:shot', destination: '/adaptation/:id/by/:handle/v/:n/shot/:shot' },
      { source: '/@:handle/:id/v/:n/storyboard', destination: '/adaptation/:id/by/:handle/v/:n/storyboard' },
      { source: '/@:handle/:id/shot/:shot', destination: '/adaptation/:id/by/:handle/shot/:shot' },
      // A moment: one shot, every version side by side (owner, 2026-10-19).
      { source: '/@:handle/:id/m/:shot', destination: '/adaptation/:id/by/:handle/m/:shot' },
      { source: '/@:handle/:id/storyboard', destination: '/adaptation/:id/by/:handle/storyboard' },
      { source: '/@:handle/:id', destination: '/adaptation/:id/by/:handle' },
      // A person's public profile (owner, 2026-10-18, the You page): one segment only, so /@<handle>/<id> above is never caught here.
      { source: '/@:handle', destination: '/profile/:handle' },
      { source: '/:id(\\d{1,9})', destination: '/adaptation/:id' },
    ];
    return { beforeFiles, afterFiles, fallback: [] };
  },
};

export default nextConfig;
