/**
 * Writes content/snowmoon/glossary.json from committed sources (rules in scripts/lib/glossary.ts).
 * No model, no network, no clock: the same sources give the same file, byte for byte
 * (npm run test:glossary rebuilds and compares).
 *
 *   npm run build:glossary
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { GLOSSARY_FILE, buildGlossary, loadBlocks, serialize, verifyGlossary } from './lib/glossary';

const ROOT = path.resolve(import.meta.dirname, '..');
const g = buildGlossary(ROOT);
const problems = verifyGlossary(g, loadBlocks(ROOT));
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
writeFileSync(path.join(ROOT, GLOSSARY_FILE), serialize(g));
console.log(`${GLOSSARY_FILE}: ${JSON.stringify(g.counts)}`);
