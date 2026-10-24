/**
 * Summary of a full illustration-check run for the owner (owner, 2026-10-24): the spend, verdict counts, how many
 * doubles it reports, how each by-eye problem fared (the pilot's 15 and the 7 found on 2026-10-24), and the problems it
 * found on images the by-eye lists don't name, worst first. Reads only; calls nothing.
 *
 *   npx tsx scripts/summarize-check.ts private/illustration-check/<run>.json
 */
import { readFileSync } from 'node:fs';
import { worstFirst, type CheckAnswer } from '../src/lib/illustration-check/schema';

type R = { job: string; chapter: number; idx: number; answer: CheckAnswer | null; error?: string };
const run = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { run: string; cost_usd: number; earlier_spend_usd?: number; results: R[] };
const known = JSON.parse(readFileSync('content/snowmoon/illustrations/checks/known-answers.json', 'utf8')) as {
  items: { job: string; expect: string; what: string }[];
  found_by_eye_2026_10_24: { items: { job: string; expect: string; what: string }[] };
};
const byEye = [...known.items.filter((k) => k.expect !== 'fine').map((k) => ({ ...k, list: 'pilot 15' })), ...known.found_by_eye_2026_10_24.items.map((k) => ({ ...k, list: 'new 7' }))];
const fineKnown = new Set(known.items.filter((k) => k.expect === 'fine').map((k) => k.job));
const by = new Map(run.results.map((r) => [r.job, r]));
const answered = run.results.filter((r) => r.answer);

const counts = { matches: 0, partly: 0, wrong: 0 } as Record<string, number>;
for (const r of answered) counts[r.answer!.verdict]++;
const doubles = answered.filter((r) => r.answer!.problems.some((p) => p.type === 'reference_copy_in_crowd'));
console.log(`run ${run.run}: ${answered.length} answered, ${run.results.length - answered.length} without an answer; spend $${run.cost_usd.toFixed(3)}`);
console.log(`verdicts: matches ${counts.matches}, partly ${counts.partly}, wrong ${counts.wrong}`);
console.log(`images with a double reported (reference_copy_in_crowd): ${doubles.length}`);
for (const r of run.results.filter((x) => !x.answer)) console.log(`  no answer: ${r.job} (${r.error})`);

console.log('\nBy-eye problems:');
for (const k of byEye) {
  const a = by.get(k.job)?.answer;
  const caught = !a ? 'NO ANSWER' : k.expect === 'double' ? (a.problems.some((p) => p.type === 'reference_copy_in_crowd') ? 'caught' : a.verdict !== 'matches' ? 'flagged, not as a double' : 'MISSED') : a.verdict !== 'matches' && a.problems.length ? 'caught' : 'MISSED';
  console.log(`  [${k.list}] ${k.job} (${k.expect}): ${caught}${a ? ` — ${a.verdict}; ${a.why}` : ''}`);
}

console.log('\nNot on the by-eye lists (worst first):');
const listed = new Set(byEye.map((k) => k.job));
const rest = answered
  .filter((r) => !listed.has(r.job) && r.answer!.verdict !== 'matches')
  .map((r) => ({ ...r, verdict: r.answer!.verdict, problems: r.answer!.problems.length }))
  .sort(worstFirst);
for (const r of rest) console.log(`  ${r.job}${fineKnown.has(r.job) ? ' (judged fine by eye)' : ''}: ${r.verdict} — ${r.answer!.why} [${r.answer!.problems.map((p) => p.type).join(', ')}]`);
