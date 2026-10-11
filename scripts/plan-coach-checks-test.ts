/**
 * Proves the planning coach's code checks catch what they should, and pass a clean reply.
 *   npx tsx scripts/plan-coach-checks-test.ts      fails (exit 1) if any case goes the wrong way
 */
import { codeFlags, norm } from './lib/plan-coach-checks';

const book = { byId: new Map([['c4-b53', { chapter: 4 }], ['c20-b8', { chapter: 20 }]]), bookNorm: norm('seventeen streets two hundred meters apart') };
const draft = 'F1 Zei walks down Hun Min street toward the pyramid.';
const cases: { name: string; reply: string; expect: RegExp | null }[] = [
  { name: 'a clean reply', reply: 'NOTES:\n1. [F1] What to change: show the street first. Why: place before faces. Passages: [c4-b53]\n\nORDER:\nKeep your order.\n\nPICTURE SLOTS:\n- After F1: Hun Min street; Zei; walking toward the pyramid.\n\nQUESTION:\nWhat does Zei want here?\n\nWORLD CHECK:\n- F1 Hun Min street: matches.', expect: null },
  { name: 'quoted words in a picture slot', reply: 'PICTURE SLOTS:\n- After F1: a shop sign, "Fresh Batteries", above Zei.\n\nQUESTION:\nWhy?', expect: /picture slot has quoted words/ },
  { name: 'on-screen text in a picture slot', reply: 'PICTURE SLOTS:\n- After F1: the screen reads the match score as Zei arrives.\n\nQUESTION:\nWhy?', expect: /on-screen text/ },
  { name: 'offered wording', reply: 'NOTES:\n1. You could write that he hurries.', expect: /offers wording/ },
  { name: 'a block past the limit', reply: 'NOTES:\n1. See [c20-b8].', expect: /past the chapter limit/ },
  { name: 'an invented quotation', reply: 'NOTES:\n1. Consider "the grid hums under his feet tonight".', expect: /neither the person's nor the book's/ },
];
let bad = 0;
for (const c of cases) {
  const flags = codeFlags(c.reply, draft, 4, book);
  const ok = c.expect ? flags.some((f) => c.expect!.test(f)) : flags.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name}: ${flags.length ? flags.join('; ') : 'no flags'}`);
}
if (bad) process.exit(1);
