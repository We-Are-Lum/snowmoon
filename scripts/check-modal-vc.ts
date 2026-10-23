/**
 * The proof that our Modal conversion deletes each recording (owner, 2026-10-23: "build the proof that the Modal
 * conversion deletes each recording (nothing kept on the volume, no audio in logs), with a test"). Runs without
 * Modal and without spending.
 *
 *   npm run check:modal-vc
 *
 * 1. The static half on modal/chatterbox_vc.py, and the run half (scripts/modal_vc_proof.py: the handler on
 *    127.0.0.1 with a stub model and a stub `modal`; files snapshotted before and after; logs and replies searched
 *    for the input). Both must pass.
 * 2. Each violation in MODAL_VC_PLANTS, planted into a copy, must make it fail.
 * Exit 0 only when both hold. P1h in check:principles runs the same halves.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MODAL_VC_FILE, MODAL_VC_PLANTS, modalVcRun, modalVcStatic } from './lib/modal-vc';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = readFileSync(path.join(ROOT, MODAL_VC_FILE), 'utf8');
let bad = 0;

const st = modalVcStatic(src);
const run = modalVcRun(src);
console.log(`${MODAL_VC_FILE}`);
console.log(`${st.length ? 'FAIL' : 'ok  '} static: storage, platform retention, network, logs, temp folders, kept state`);
for (const p of st) console.log(`  - ${p}`);
const skipped = run.problems.length === 1 && run.problems[0].startsWith('skipped');
console.log(`${skipped ? 'NOT RUN' : run.problems.length ? 'FAIL' : 'ok  '} run: ${run.scenarios.length} scenarios (${run.scenarios.map((s) => s.label).join('; ')})`);
for (const p of run.problems) console.log(`  - ${p}`);
if (st.length || run.problems.length) bad++;

console.log('\nplanted violations (each must be caught):');
for (const { name, plant } of MODAL_VC_PLANTS) {
  const planted = plant(src);
  if (planted === src) {
    console.log(`  PLANT DID NOT APPLY: ${name}`);
    bad++;
    continue;
  }
  const s = modalVcStatic(planted).length;
  const r = skipped ? 0 : modalVcRun(planted).problems.filter((p) => !p.startsWith('skipped')).length;
  console.log(`  ${s || r ? 'caught' : 'MISSED'}: ${name} (static ${s}, run ${r})`);
  if (!s && !r) bad++;
}
console.log(bad ? '\nFAIL' : skipped ? '\nNOT A FULL PASS: python3 not found' : '\nok: the proof passes and catches every planted violation');
process.exit(bad ? 1 : skipped ? 2 : 0);
