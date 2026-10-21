/**
 * Writes docs/minpentai/rulesets/solo-v1.json: the ruleset manifest for solo matches (onchain v1
 * spike), pinned to the last commit that changed any file in replay.ts's import closure, with that
 * commit's file hashes and the exact versions (package-lock.json) of any npm package it reaches.
 * The closure must be committed: a manifest never pins uncommitted code.
 *
 *   npx tsx scripts/build-minpentai-ruleset.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { REPLAY_ENTRY, canonical, importClosure, rulesetId, soloManifestV1 } from '../src/lib/minpentai/onchain/ruleset';

const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const today = importClosure(REPLAY_ENTRY, (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null));
if (today.builtins.length) throw new Error(`the replay reaches Node builtins: ${today.builtins.join(', ')}`);
const paths = Object.keys(today.files);
if (git('status', '--porcelain', '--', ...paths, 'package-lock.json').trim()) throw new Error('commit the closure (and package-lock.json) first');
const commit = git('log', '-1', '--format=%H', '--', ...paths).trim();
const at = (p: string) => { try { return git('show', `${commit}:${p}`); } catch { return null; } };
const closure = importClosure(REPLAY_ENTRY, at);
const lock = JSON.parse(at('package-lock.json') ?? '{}') as { packages?: Record<string, { version?: string }> };
const packages = Object.fromEntries(closure.packages.map((n) => {
  const v = lock.packages?.[`node_modules/${n}`]?.version;
  if (!v) throw new Error(`no exact version for ${n} in package-lock.json at ${commit}`);
  return [n, v];
}));
const m = soloManifestV1({ commit, files: closure.files, packages });
writeFileSync('docs/minpentai/rulesets/solo-v1.json', JSON.stringify(m, null, 2) + '\n');
writeFileSync('docs/minpentai/rulesets/solo-v1.canonical.json', canonical(m));
console.log(`solo-v1: ruleset ID ${rulesetId(m)}\n  engine ${commit}\n  closure: ${Object.keys(closure.files).join(', ')}\n  packages: ${JSON.stringify(packages)}`);
