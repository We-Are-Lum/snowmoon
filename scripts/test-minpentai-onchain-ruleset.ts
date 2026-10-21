/**
 * The ruleset manifest (onchain v1 spike): docs/minpentai/rulesets/solo-v1.json is what the builder
 * makes from its pinned commit; it pins replay.ts's whole import closure (files and npm versions);
 * that closure today is unchanged (if not, the engine changed: make a new ruleset); it holds only
 * integers and ASCII strings, so its canonical JSON is RFC 8785 (JCS); its ID is the keccak256 of
 * that, and an independent Python implementation (scripts/minpentai_ruleset_id.py) agrees; every
 * rule is from the book (blocks that exist) or invented; every computer player has its own hash.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { keccak256, toBytes } from 'viem';
import { REPLAY_ENTRY, canonical, closureHash, hashText, importClosure, rulesetId, soloManifestV1, type SoloManifestV1 } from '../src/lib/minpentai/onchain/ruleset';

let failed = 0, passed = 0;
const check = (name: string, f: () => string | void) => { let bad: string | void; try { bad = f(); } catch (e) { bad = (e as Error).message; } if (bad) { failed++; console.log(`FAIL ${name}: ${bad}`); } else passed++; };
const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const FILE = 'docs/minpentai/rulesets/solo-v1.json';
const m = JSON.parse(readFileSync(FILE, 'utf8')) as SoloManifestV1;
const at = (p: string) => { try { return git('show', `${m.engine.commit}:${p}`); } catch { return null; } };

check('the engine commit is a full 40-character commit that exists', () => {
  if (!/^[0-9a-f]{40}$/.test(m.engine.commit)) return m.engine.commit;
  git('cat-file', '-e', `${m.engine.commit}^{commit}`);
});
check('each closure file, as it is at the pinned commit (git show <commit>:<path>), hashes to the manifest\'s hash', () => {
  const c = importClosure(REPLAY_ENTRY, at);
  const listed = Object.keys(m.engine.files).sort().join(), found = Object.keys(c.files).sort().join();
  if (listed !== found) return `closure at the commit: ${found}; manifest: ${listed}`;
  for (const f of Object.keys(m.engine.files)) {
    const text = git('show', `${m.engine.commit}:${f}`);
    if (hashText(text) !== (m.engine.files as Record<string, string>)[f]) return f;
  }
});
check('the manifest is what the builder makes from its pinned commit (the closure read there, versions from its lockfile)', () => {
  const c = importClosure(REPLAY_ENTRY, at);
  if (canonical(soloManifestV1({ commit: m.engine.commit, files: c.files, packages: m.engine.packages })) !== canonical(m)) return 'rebuild with npx tsx scripts/build-minpentai-ruleset.ts';
  const lock = JSON.parse(at('package-lock.json') ?? '{}') as { packages?: Record<string, { version?: string }> };
  for (const n of c.packages) if (m.engine.packages[n] !== lock.packages?.[`node_modules/${n}`]?.version) return `package ${n} not pinned to its lockfile version`;
  if (Object.keys(m.engine.packages).sort().join() !== c.packages.join()) return 'packages differ from the closure';
});
check("replay.ts's import closure today is the one pinned (same files, same hashes, same package versions)", () => {
  const c = importClosure(REPLAY_ENTRY, (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as { packages: Record<string, { version?: string }> };
  const pk = Object.fromEntries(c.packages.map((n) => [n, lock.packages[`node_modules/${n}`]?.version ?? '?']));
  if (closureHash(c.files, pk) !== m.engine.closureHash) {
    const now = Object.fromEntries(Object.entries(c.files).map(([f, t]) => [f, hashText(t)]));
    const diff = [...new Set([...Object.keys(now), ...Object.keys(m.engine.files)])].filter((f) => now[f] !== (m.engine.files as Record<string, string>)[f]);
    return `changed since ${m.engine.commit.slice(0, 7)}: ${diff.join(', ') || 'package versions'} (a new ruleset is needed)`;
  }
});
check('the closure reaches no Node builtins', () => {
  const c = importClosure(REPLAY_ENTRY, (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null));
  if (c.builtins.length) return c.builtins.join(', ');
});
check('every integer in the manifest is at most 2^53 - 1 (and none is negative or fractional)', () => {
  const bad: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'number') { if (!Number.isInteger(v) || v < 0 || v > Number.MAX_SAFE_INTEGER) bad.push(`${path}=${v}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(m, '$');
  if (Number.MAX_SAFE_INTEGER !== 2 ** 53 - 1) return 'MAX_SAFE_INTEGER';
  return bad.join(', ') || undefined;
});
check('only integers and ASCII strings (so the canonical JSON is RFC 8785 / JCS)', () => {
  const bad: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'string') { if (!/^[\x20-\x7e]*$/.test(v)) bad.push(path); }
    else if (typeof v === 'number') { if (!Number.isSafeInteger(v)) bad.push(path); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (!/^[\x20-\x7e]+$/.test(k)) bad.push(`${path}.<key>`); walk(x, `${path}.${k}`); }
    else if (typeof v !== 'boolean' && v !== null) bad.push(path);
  };
  walk(m, '$');
  return bad.join(', ') || undefined;
});
check('the canonical file is the manifest, and the ID is its keccak256', () => {
  const c = readFileSync('docs/minpentai/rulesets/solo-v1.canonical.json', 'utf8');
  if (c !== canonical(m)) return 'solo-v1.canonical.json is stale';
  if (rulesetId(m) !== keccak256(toBytes(c))) return 'ID mismatch';
});
check('an independent implementation (Python: its own JCS and its own Keccak-256) computes the same ID', () => {
  const py = execFileSync('python3', ['-I', 'scripts/minpentai_ruleset_id.py', FILE], { encoding: 'utf8' }).trim();
  if (py !== rulesetId(m)) return `Python ${py}, TS ${rulesetId(m)}`;
});
check('every rule has a book part, this edition\'s details, or both; each book part is stated or implied, with blocks that exist', () => {
  const passages = readFileSync('docs/minpentai/passages.md', 'utf8');
  const bad: string[] = [];
  for (const r of [...m.rules, ...m.drawnRules]) {
    if (!r.book && !r.edition) bad.push(`${r.id}: no source`);
    if (!r.book) continue;
    if (r.book.basis !== 'stated' && r.book.basis !== 'implied') bad.push(`${r.id}: basis`);
    if (!r.book.says || !r.book.blocks.length) bad.push(`${r.id}: empty book part`);
    for (const b of r.book.blocks) if (!passages.includes(`**${b}**`)) bad.push(`${r.id}: ${b} not in passages.md`);
  }
  return bad.join('; ') || undefined;
});
check('six computer players (levels 0-5): each hash is the closure hash with its level, all different', () => {
  if (m.computerPlayers.map((p) => p.level).join() !== '0,1,2,3,4,5') return 'levels';
  for (const p of m.computerPlayers) if (p.codeHash !== keccak256(toBytes(`${m.engine.closureHash}:level:${p.level}`))) return `level ${p.level}`;
  if (new Set(m.computerPlayers.map((p) => p.codeHash)).size !== 6) return 'not all different';
});
console.log(failed ? `ruleset: ${failed} failed, ${passed} passed` : `ruleset: ${passed} checks passed (solo-v1 ${rulesetId(m)})`);
process.exit(failed ? 1 : 0);
