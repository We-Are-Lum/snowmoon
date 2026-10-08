/**
 * Design values live in one place. Fails (exit 1) on any problem.
 *
 *   npx tsx scripts/check-tokens.ts
 *   npx tsx scripts/check-tokens.ts --css=/tmp/planted.css   a planted mismatch must fail
 *
 * - src/lib/tokens.ts (the colours JavaScript needs) equals src/styles/tokens.css.
 * - No other app stylesheet defines --paper, --ink, --muted or --rule.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { PAPER, PAPER_DARK } from '../src/lib/tokens';

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const CSS = arg('css') ?? path.join(process.cwd(), 'src', 'styles', 'tokens.css');
const failures: string[] = [];

const css = readFileSync(CSS, 'utf8');
const light = css.slice(0, css.indexOf(":root[data-theme='dark']"));
const dark = css.slice(css.indexOf('prefers-color-scheme: dark'));
// The chosen-dark block and the system-dark block must say the same thing.
const vars = (block: string) => [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => `${m[1]}=${m[2].trim()}`).join('|');
const chosen = css.slice(css.indexOf(":root[data-theme='dark']"), css.indexOf('prefers-color-scheme: dark'));
if (vars(chosen) !== vars(dark)) failures.push('the data-theme="dark" block and the system dark block differ');
const value = (block: string, name: string) => block.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
if (value(light, 'paper')?.toUpperCase() !== PAPER.toUpperCase()) failures.push(`light --paper ${value(light, 'paper')} ≠ tokens.ts ${PAPER}`);
if (value(dark, 'paper')?.toUpperCase() !== PAPER_DARK.toUpperCase()) failures.push(`dark --paper ${value(dark, 'paper')} ≠ tokens.ts ${PAPER_DARK}`);

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? cssFiles(p) : n.endsWith('.css') ? [p] : [];
  });
}
if (!arg('css')) {
  for (const f of cssFiles(path.join(process.cwd(), 'src'))) {
    if (f.endsWith(path.join('styles', 'tokens.css'))) continue;
    const s = readFileSync(f, 'utf8');
    for (const t of ['paper', 'ink', 'muted', 'rule']) {
      if (new RegExp(`--${t}\\s*:`).test(s)) failures.push(`${path.relative(process.cwd(), f)} defines --${t}; it belongs in src/styles/tokens.css`);
    }
  }
}

if (failures.length) {
  console.error(`FAIL (${failures.length})`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('tokens: one source, and tokens.ts agrees with tokens.css');
