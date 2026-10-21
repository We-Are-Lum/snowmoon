/**
 * The ruleset manifest (onchain v1 spike): docs/minpentai/rulesets/solo-v1.json is what the builder
 * makes, its ID is the keccak256 of its canonical JSON, every rule is marked from the book (with
 * blocks that exist in the book's passages) or invented, every computer player has a code hash,
 * and the engine files today are the ones it pins (if not, the engine changed: make a new ruleset).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ENGINE_FILES, canonical, hashText, rulesetId, soloManifestV1, type SoloManifestV1 } from '../src/lib/minpentai/onchain/ruleset';

let failed = 0, passed = 0;
const check = (name: string, f: () => string | void) => { const bad = f(); if (bad) { failed++; console.log(`FAIL ${name}: ${bad}`); } else passed++; };
const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' });
const m = JSON.parse(readFileSync('docs/minpentai/rulesets/solo-v1.json', 'utf8')) as SoloManifestV1;

check('the manifest is what the builder makes from its pinned commit', () => {
  const files = Object.fromEntries(ENGINE_FILES.map((f) => [f, git('show', `${m.engine.commit}:${f}`)]));
  if (canonical(soloManifestV1({ commit: m.engine.commit, files })) !== canonical(m)) return 'rebuild with npx tsx scripts/build-minpentai-ruleset.ts';
});
check('the canonical file is the manifest, and the ID is its keccak256', () => {
  const c = readFileSync('docs/minpentai/rulesets/solo-v1.canonical.json', 'utf8');
  if (c !== canonical(m)) return 'solo-v1.canonical.json is stale';
  if (rulesetId(m) !== hashText(c)) return 'ID mismatch';
  if (!/^0x[0-9a-f]{64}$/.test(rulesetId(m))) return 'not a bytes32';
});
check('the engine files today are the ones the manifest pins', () => {
  const changed = ENGINE_FILES.filter((f) => hashText(readFileSync(f, 'utf8')) !== m.engine.files[f]);
  if (changed.length) return `changed since ${m.engine.commit.slice(0, 7)}: ${changed.join(', ')} (a new ruleset is needed)`;
});
check('every rule and drawn rule is from the book (blocks that exist) or invented', () => {
  const passages = readFileSync('docs/minpentai/passages.md', 'utf8');
  const bad: string[] = [];
  for (const r of [...m.rules, ...m.drawnRules]) {
    const s = r.source as { book?: string[]; invented?: boolean };
    if (s.invented === true && !s.book) continue;
    if (!s.book?.length) { bad.push(`${r.id}: no source`); continue; }
    for (const b of s.book) if (!passages.includes(b)) bad.push(`${r.id}: ${b} not in passages.md`);
  }
  return bad.join('; ') || undefined;
});
check('six computer players (levels 0–5), each with a code hash, all different', () => {
  const h = m.computerPlayers.map((p) => p.codeHash);
  if (m.computerPlayers.map((p) => p.level).join() !== '0,1,2,3,4,5') return 'levels';
  if (new Set(h).size !== 6 || h.some((x) => !/^0x[0-9a-f]{64}$/.test(x))) return 'code hashes';
});
console.log(failed ? `ruleset: ${failed} failed, ${passed} passed` : `ruleset: ${passed} checks passed (solo-v1 ${rulesetId(m)})`);
process.exit(failed ? 1 : 0);
