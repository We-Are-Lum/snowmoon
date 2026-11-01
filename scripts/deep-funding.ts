/**
 * The deep funding test's runner (docs/proposals/deep-funding-runner.md; the plan's "Deep funding test", build item 7).
 * Three steps, each writing to deep-funding-out/ (git-ignored; the owner publishes the results file):
 *
 *   npm run deep-funding -- plan --character bai [--final <version id>]
 *     Reads the graph from the database (a read-only transaction; never writes), writes every prompt, and prints the
 *     cost estimate. No model call.
 *
 *   npm run deep-funding -- run --character bai [--final <id>] --spend-ok [--runs 3] [--budget 25]
 *     Calls each model (src/lib/deep-funding/models.ts JUDGES) on each node DEEP_FUNDING.runsPerModel times, through
 *     the Vercel AI Gateway only (AI_GATEWAY_API_KEY from .env.local; never printed), each request pinned to one
 *     provider with zero data retention. Refuses to start if the estimate is over the budget (DEEP_FUNDING.budgetUsd,
 *     $25, the plan's "stop and report"), and stops before any call that could take the total over it.
 *
 *   npm run deep-funding -- decide --character bai [--character zei …] [--addresses <file>]
 *     Reads the recorded calls and the jurors' answers (database, read-only; jurors by number, never FID), scores the
 *     models, takes the top three's average and the fitted mix, and writes the results JSON. Final payouts are
 *     refused while DEEP_FUNDING.bookRecipient is unset, and without a checked address file (fid → { address, usable }).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEEP_FUNDING } from '../src/lib/config';
import { db } from '../src/lib/db';
import { bookCharacter } from '../src/lib/images/designs';
import { askModel, type CallRecord } from '../src/lib/deep-funding/call';
import { askedNodes, type CreditGraph } from '../src/lib/deep-funding/graph';
import { answersByNumber } from '../src/lib/deep-funding/jurors-db';
import { loadGraph } from '../src/lib/deep-funding/load';
import { JUDGES, estimateUsd } from '../src/lib/deep-funding/models';
import { BOOK_RECIPIENT_UNSET } from '../src/lib/deep-funding/payout';
import { nodePrompt, type BookContext, type NodePrompt } from '../src/lib/deep-funding/prompt';
import { decide } from '../src/lib/deep-funding/results';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'deep-funding-out');
const args = process.argv.slice(2);
const step = args[0];
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const all = (name: string) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));

function bookContext(slug: string): BookContext {
  const c = bookCharacter(slug);
  if (!c) throw new Error(`no book character ${slug}`);
  return { name: c.name, quotes: c.quotes.map((q) => ({ block: `c${q.chapter}-b${q.idx}`, quote: q.quote })) };
}

async function readGraph(character: string, final: string): Promise<CreditGraph> {
  const sql = db();
  if (!sql) throw new Error('no database configured (.env.local)');
  try {
    return (await sql.begin('read only', (tx) => loadGraph(tx as unknown as typeof sql, character, final))) as CreditGraph;
  } finally {
    await sql.end();
  }
}

const promptsFor = (g: CreditGraph, slug: string): NodePrompt[] => askedNodes(g).map((n) => nodePrompt(g, n.id, bookContext(slug)));
const file = (character: string, what: string) => path.join(OUT, `${character}.${what}.json`);

async function main() {
  if (!['plan', 'run', 'decide'].includes(step ?? '')) {
    console.log('usage: deep-funding plan|run|decide --character <slug> [--final <version id>] (see the file header)');
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });
  const characters = all('character');
  if (!characters.length) throw new Error('--character is required');

  if (step === 'plan' || step === 'run') {
    const character = characters[0];
    const final = opt('final') ?? DEEP_FUNDING.finals[character];
    if (!final) throw new Error(`no final version for ${character}: pass --final or set DEEP_FUNDING.finals`);
    const g = await readGraph(character, final);
    const prompts = promptsFor(g, character);
    const runs = Number(opt('runs') ?? DEEP_FUNDING.runsPerModel);
    const budget = Number(opt('budget') ?? DEEP_FUNDING.budgetUsd);
    const est = estimateUsd(JUDGES, runs, prompts.length);
    writeFileSync(file(character, 'plan'), JSON.stringify({ graph: g, prompts, estimate: est, budgetUsd: budget, models: JUDGES }, null, 1));
    console.log(`${character}: ${g.nodes.length} nodes (${prompts.length} asked), ${JUDGES.length} models × ${runs} runs = ${JUDGES.length * runs * prompts.length} calls`);
    console.log(`estimate $${est.total.toFixed(2)} (budget $${budget}); written ${path.relative(ROOT, file(character, 'plan'))}`);
    if (step === 'plan') return;

    if (!args.includes('--spend-ok')) throw new Error('run calls paid models: pass --spend-ok once the owner has approved the estimate');
    if (budget > DEEP_FUNDING.budgetUsd) throw new Error(`budget $${budget} is over DEEP_FUNDING.budgetUsd ($${DEEP_FUNDING.budgetUsd}); stop and report`);
    if (est.total > budget) throw new Error(`estimate $${est.total.toFixed(2)} is over the budget $${budget}; stop and report`);
    const key = process.env.AI_GATEWAY_API_KEY;
    if (!key) throw new Error('AI_GATEWAY_API_KEY is not set (.env.local)');
    const calls: CallRecord[] = existsSync(file(character, 'calls')) ? JSON.parse(readFileSync(file(character, 'calls'), 'utf8')) : [];
    let spent = calls.reduce((s, c) => s + c.costUsd, 0);
    for (let run = 1; run <= runs; run++) {
      for (const m of JUDGES) {
        const perCall = est.perCall.find((p) => p.id === m.id)!.usd;
        for (const p of prompts) {
          if (calls.some((c) => c.model === m.id && c.node === p.node && c.run === run && c.answer)) continue;
          if (spent + perCall * 2 > budget) {
            writeFileSync(file(character, 'calls'), JSON.stringify(calls, null, 1));
            throw new Error(`stopped: $${spent.toFixed(2)} spent, the next call could pass the $${budget} budget; report to the owner`);
          }
          const r = await askModel(m, p, run, key);
          calls.push(r);
          spent += r.costUsd;
          console.log(`${m.id} run ${run} ${p.node.slice(0, 8)}: ${r.error ?? 'ok'} ($${r.costUsd.toFixed(4)}; total $${spent.toFixed(2)})`);
          writeFileSync(file(character, 'calls'), JSON.stringify(calls, null, 1));
        }
      }
    }
    console.log(`done: $${spent.toFixed(2)} spent`);
    return;
  }

  // decide
  const sql = db();
  if (!sql) throw new Error('no database configured (.env.local)');
  const input = [];
  try {
    for (const character of characters) {
      const plan = JSON.parse(readFileSync(file(character, 'plan'), 'utf8')) as { graph: CreditGraph; prompts: NodePrompt[] };
      const calls = JSON.parse(readFileSync(file(character, 'calls'), 'utf8')) as CallRecord[];
      const jurors = await sql.begin('read only', (tx) => answersByNumber(tx as unknown as typeof sql, character));
      input.push({ graph: plan.graph, prompts: plan.prompts, calls, jurors });
    }
  } finally {
    await sql.end();
  }
  const addrFile = opt('addresses');
  const book: Record<string, { address: string; usable: boolean }> = addrFile ? JSON.parse(readFileSync(addrFile, 'utf8')) : {};
  const results = decide(input, { addressOf: (fid) => book[String(fid)]?.address ?? null, usable: (a) => Object.values(book).some((b) => b.address.toLowerCase() === a.toLowerCase() && b.usable === true) });
  if (!addrFile) for (const c of results.characters) c.payout = { ok: false, refused: 'Refused: no checked address file (--addresses); every address must be checked on mainnet and screened first' };
  const out = path.join(OUT, `results-${results.made.replace(/[:.]/g, '-')}.json`);
  writeFileSync(out, JSON.stringify(results, null, 1));
  console.log(`leaderboard: ${results.leaderboard.map((r) => `${r.rank}. ${r.model} ${r.loss.toFixed(3)}`).join('; ')}`);
  for (const c of results.characters) console.log(`${c.character}: ${c.payout?.ok ? `${c.payout.recipients.length} recipients` : (c.payout?.refused ?? 'no final weights')}`);
  if (DEEP_FUNDING.bookRecipient === null) console.log(BOOK_RECIPIENT_UNSET);
  console.log(`written ${path.relative(ROOT, out)}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
