/**
 * Every check that talks to a deployment refuses to run without --url (scripts/lib/target.ts; owner, 2026-10-31).
 *   npm run test:check-targets
 * Each is started with no target, and with a target that isn't a URL; it must exit 1 with the "no target"
 * words, within seconds, before it sends anything.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHECKS = ['check:principles', 'check:snap-live', 'check:miniapp', 'check:podcast', 'check:ui', 'check:shipped'];
let failed = 0, checks = 0;
for (const c of CHECKS) for (const args of [[], ['--url=snowmoon.party'], ['--url=']]) {
  checks++;
  const t0 = Date.now();
  // As each is run: through its npm script (with its own loader flags).
  const r = spawnSync('npm', ['run', '-s', c, '--', ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60_000, env: { ...process.env, NEXT_PUBLIC_URL: 'https://snowmoon.party' } });
  const ok = r.status === 1 && /no target/.test(r.stderr) && Date.now() - t0 < 30_000;
  if (!ok) { failed++; console.error(`FAIL ${c} ${args.join(' ') || '(no args)'}: exit ${r.status}, ${r.stderr.slice(0, 200)}`); }
}
console.log(failed ? `check targets: ${failed} of ${checks} failed` : `check targets: ${checks} checks passed (${CHECKS.length} checks refuse to run without a URL)`);
process.exit(failed ? 1 : 0);
