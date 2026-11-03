/**
 * Every check that talks to a deployment needs its target named on the command line (owner, 2026-10-31, after a
 * preview build failed and a follow-up request fell back to production): no default, no environment variable.
 * Without --url=<http(s)://host>, the check prints how to call it and exits 1 before it sends anything.
 */
export function requireTarget(check: string): string {
  const raw = process.argv.slice(2).find((a) => a.startsWith('--url='))?.slice('--url='.length) ?? '';
  if (!/^https?:\/\/[^\s/]+(\/.*)?$/.test(raw)) {
    console.error(`${check}: no target. Name the deployment to check: --url=https://snowmoon.party, a preview's address, or --url=http://localhost:3000. Checks never pick a target on their own.`);
    process.exit(1);
  }
  return raw.replace(/\/$/, '');
}
