/**
 * Writes docs/minpentai/rulesets/solo-v1.json: the ruleset manifest for solo matches (onchain v1
 * spike), pinned to the last commit that changed the engine files, with that commit's file hashes.
 * The engine files must be committed (a manifest never pins uncommitted code).
 *
 *   npx tsx scripts/build-minpentai-ruleset.ts
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { ENGINE_FILES, canonical, rulesetId, soloManifestV1 } from '../src/lib/minpentai/onchain/ruleset';

const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' });
if (git('status', '--porcelain', '--', ...ENGINE_FILES).trim()) throw new Error('commit the engine files first');
const commit = git('log', '-1', '--format=%H', '--', ...ENGINE_FILES).trim();
const files = Object.fromEntries(ENGINE_FILES.map((f) => [f, git('show', `${commit}:${f}`)]));
const m = soloManifestV1({ commit, files });
writeFileSync('docs/minpentai/rulesets/solo-v1.json', JSON.stringify(m, null, 2) + '\n');
writeFileSync('docs/minpentai/rulesets/solo-v1.canonical.json', canonical(m));
console.log(`solo-v1: ruleset ID ${rulesetId(m)} (engine ${commit.slice(0, 7)})`);
