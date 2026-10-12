/** Cases for scripts/lib/zdr-check.ts: a reply passes only with the zero-retention flag, the
 * "every attempt supports ZDR" plan, and every attempt on the pinned provider. */
import { zdrProblem } from './lib/zdr-check';

const ok = {
  enabledZeroDataRetention: true,
  routing: {
    finalProvider: 'anthropic',
    planningReasoning: 'Provider set restricted to: anthropic. ZDR requested: all 1 attempts support ZDR. Execution order: anthropic(system)',
    modelAttempts: [{ providerAttempts: [{ provider: 'anthropic', success: true }] }],
  },
};
const cases: [string, unknown, boolean][] = [
  ['the test reply passes', ok, true],
  ['no metadata fails', undefined, false],
  ['no zero-retention flag fails', { ...ok, enabledZeroDataRetention: undefined }, false],
  ['flag false fails', { ...ok, enabledZeroDataRetention: false }, false],
  ['another final provider fails', { ...ok, routing: { ...ok.routing, finalProvider: 'bedrock' } }, false],
  ['a plan without the ZDR line fails', { ...ok, routing: { ...ok.routing, planningReasoning: 'Execution order: anthropic(system)' } }, false],
  ['an attempt on another provider fails', { ...ok, routing: { ...ok.routing, modelAttempts: [{ providerAttempts: [{ provider: 'vertex', success: false }, { provider: 'anthropic', success: true }] }] } }, false],
  ['no attempts recorded fails', { ...ok, routing: { ...ok.routing, modelAttempts: [] } }, false],
];
let bad = 0;
for (const [name, gw, pass] of cases) {
  const p = zdrProblem(gw as Parameters<typeof zdrProblem>[0], 'anthropic');
  const good = pass ? p === null : p !== null;
  if (!good) bad++;
  console.log(`${good ? 'ok  ' : 'FAIL'} ${name}${p ? ` (${p})` : ''}`);
}
if (bad) process.exit(1);
console.log(`${cases.length} cases pass`);
