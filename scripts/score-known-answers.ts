/**
 * Scores illustration-check runs against the known answers (owner, 2026-10-23: "make the pilot a test with known
 * answers … Report, per model, how many of the doubles it caught and how many fine ones it flagged, plus the cost").
 *
 *   npx tsx scripts/score-known-answers.ts private/illustration-check/<run>.json [<run>.json …]
 *
 * Known answers: content/snowmoon/illustrations/checks/known-answers.json (written before any model ran). Prints a
 * table per run, then one line per miss and per false flag. Reads only; calls nothing.
 */
import { readFileSync } from 'node:fs';
import type { CheckAnswer } from '../src/lib/illustration-check/schema';

interface Known {
  job: string;
  expect: 'double' | 'problem' | 'fine';
  what: string;
}
interface Run {
  run: string;
  recipe: { model: { gateway_id: string } };
  cost_usd: number;
  results: { job: string; answer: CheckAnswer | null; error?: string; cost_usd?: number }[];
}

const known = (JSON.parse(readFileSync('content/snowmoon/illustrations/checks/known-answers.json', 'utf8')) as { items: Known[] }).items;

export function score(run: Run) {
  const by = new Map(run.results.map((r) => [r.job, r]));
  const lines: string[] = [];
  const s = { doubles: 0, doublesAnyType: 0, doublesOf: 0, problems: 0, problemsOf: 0, fineFlagged: 0, fineNoted: 0, fineOf: 0, verdictAgree: 0, answered: 0, errors: 0 };
  for (const k of known) {
    const r = by.get(k.job);
    const a = r?.answer;
    if (!a) {
      s.errors++;
      lines.push(`  ${k.job}: no answer (${r?.error ?? 'not in the run'})`);
      continue;
    }
    s.answered++;
    const said = a.problems.map((p) => `${p.type}: ${p.detail}`).join(' | ') || 'no problems';
    if (k.expect === 'double') {
      s.doublesOf++;
      const typed = a.problems.some((p) => p.type === 'reference_copy_in_crowd');
      const any = a.problems.length > 0 && a.verdict !== 'matches';
      if (typed) s.doubles++;
      if (typed || any) s.doublesAnyType++;
      if (a.verdict === 'wrong') s.verdictAgree++;
      if (!typed) lines.push(`  MISSED double ${k.job} (${k.what}) — said ${a.verdict}: ${said}`);
    } else if (k.expect === 'problem') {
      s.problemsOf++;
      const caught = a.problems.length > 0 && a.verdict !== 'matches';
      if (caught) s.problems++;
      if (a.verdict !== 'matches') s.verdictAgree++;
      if (!caught) lines.push(`  MISSED problem ${k.job} (${k.what}) — said ${a.verdict}: ${said}`);
    } else {
      s.fineOf++;
      if (a.verdict !== 'matches') {
        s.fineFlagged++;
        lines.push(`  FALSE FLAG ${k.job} — said ${a.verdict}: ${said}`);
      } else {
        s.verdictAgree++;
        if (a.problems.length) {
          s.fineNoted++;
          lines.push(`  (fine, matches, but noted) ${k.job}: ${said}`);
        }
      }
    }
  }
  return { s, lines };
}

for (const file of process.argv.slice(2)) {
  const run = JSON.parse(readFileSync(file, 'utf8')) as Run;
  const { s, lines } = score(run);
  console.log(`\n${run.recipe.model.gateway_id} (${run.run})`);
  console.log(`  doubles caught (as reference_copy_in_crowd): ${s.doubles}/${s.doublesOf}; caught under any type: ${s.doublesAnyType}/${s.doublesOf}`);
  console.log(`  other problems caught: ${s.problems}/${s.problemsOf}`);
  console.log(`  fine ones flagged: ${s.fineFlagged}/${s.fineOf} (problems noted on a "matches": ${s.fineNoted})`);
  console.log(`  verdict agreement: ${s.verdictAgree}/${known.length}; answered ${s.answered}, errors ${s.errors}`);
  console.log(`  cost: $${run.cost_usd.toFixed(4)}`);
  for (const l of lines) console.log(l);
}
