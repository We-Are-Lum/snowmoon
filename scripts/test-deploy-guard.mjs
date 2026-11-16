// test:deploy-guard: the deploy guard (scripts/deploy-guard.mjs) refuses a production build that isn't main through git,
// and lets everything else through; .vercelignore keeps the env files out and the build's files in.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const sha = 'a'.repeat(40);
const run = (env) => { try { execFileSync(process.execPath, ['scripts/deploy-guard.mjs'], { env: { PATH: process.env.PATH, ...env }, stdio: 'ignore' }); return 0; } catch (e) { return e.status ?? 1; } };
const cases = [
  ['a local build passes', {}, 0],
  ['a preview from a branch passes', { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feature', VERCEL_GIT_COMMIT_SHA: sha }, 0],
  ['production from main passes', { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main', VERCEL_GIT_COMMIT_SHA: sha }, 0],
  ['production from a branch is refused', { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'feature', VERCEL_GIT_COMMIT_SHA: sha }, 1],
  ['production without git details is refused', { VERCEL: '1', VERCEL_ENV: 'production' }, 1],
];
const fails = cases.filter(([, env, want]) => run(env) !== want).map(([n]) => n);
const ignore = readFileSync('.vercelignore', 'utf8').split('\n').map((l) => l.trim());
for (const must of ['.env', '.env.*', '.vercel']) if (!ignore.includes(must)) fails.push(`.vercelignore doesn't list ${must}`);
for (const keep of ['src', 'public', 'content', 'scripts', 'package.json', 'next.config.ts']) if (ignore.some((l) => l.replace(/\/$/, '') === keep)) fails.push(`.vercelignore leaves out ${keep}, which the build needs`);
if (!/deploy-guard\.mjs/.test(JSON.parse(readFileSync('package.json', 'utf8')).scripts.prebuild ?? '')) fails.push('prebuild no longer runs the deploy guard');
if (fails.length) { console.error(`DEPLOY GUARD TESTS FAILED:\n- ${fails.join('\n- ')}`); process.exit(1); }
console.log(`deploy guard: ${cases.length + 4} checks pass`);
