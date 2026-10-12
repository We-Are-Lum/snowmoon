/**
 * Proves the planning coach's code checks catch what they should, and pass a clean reply; and that
 * the craft guide's examples are tagged right and dropped past a reader's chapter.
 *   npx tsx scripts/plan-coach-checks-test.ts      fails (exit 1) if any case goes the wrong way
 */
import { readFileSync } from 'node:fs';
import { codeFlags, norm } from './lib/plan-coach-checks';
import { craftUpTo, craftProblems } from './lib/craft-guide';

const book = { byId: new Map([['c4-b53', { chapter: 4 }], ['c20-b8', { chapter: 20 }]]), bookNorm: norm('seventeen streets two hundred meters apart'), allowedNorm: norm('What would we see on the street?') };
const draft = 'F1 Zei walks down Hun Min street toward the pyramid.';
const cases: { name: string; reply: string; expect: RegExp | null }[] = [
  { name: 'a clean reply', reply: 'NOTES:\n1. [F1] What to change: show the street first. Why: place before faces. Passages: [c4-b53]\n\nORDER:\nKeep your order.\n\nPICTURE SLOTS:\n- After F1: Hun Min street; Zei; walking toward the pyramid.\n\nQUESTION:\nWhat does Zei want here?\n\nWORLD CHECK:\n- F1 Hun Min street: matches.', expect: null },
  { name: 'quoted words in a picture slot', reply: 'PICTURE SLOTS:\n- After F1: a shop sign, "Fresh Batteries", above Zei.\n\nQUESTION:\nWhy?', expect: /picture slot has quoted words/ },
  { name: 'on-screen text in a picture slot', reply: 'PICTURE SLOTS:\n- After F1: the screen reads the match score as Zei arrives.\n\nQUESTION:\nWhy?', expect: /on-screen text/ },
  { name: 'offered wording', reply: 'NOTES:\n1. You could write that he hurries.', expect: /offers wording/ },
  { name: 'a block past the limit', reply: 'NOTES:\n1. See [c20-b8].', expect: /past the chapter limit/ },
  { name: 'an invented quotation', reply: 'NOTES:\n1. Consider "the grid hums under his feet tonight".', expect: /neither the person's nor the book's/ },
  { name: 'a short quotation of the draft, then prose, is not a quotation', reply: 'NOTES:\n1. [F1] Consider stopping before "Zei walks." and let "Hun Min street toward the pyramid" carry it. Why: One clear image per beat; End on a question.', expect: null },
  { name: 'curly quotations pair with their own marks', reply: 'NOTES:\n1. [F1] The draft says “Zei walks” and later “toward the pyramid”, then the beat ends. Why: Turn.', expect: null },
  { name: 'a quotation of the draft shortened with an ellipsis is the person\'s words', reply: 'NOTES:\n1. [F1] "Zei walks down … toward the pyramid" asks for two pictures. Why: One clear image per beat.', expect: null },
  { name: 'a question about words to say aloud is not offered wording', reply: 'QUESTION:\nWhat does Zei want, in words you could say aloud?', expect: null },
  { name: 'Design\'s own question, quoted from the craft guide, is allowed', reply: 'NOTES:\n1. [F1] The draft names the feeling. Why: SHOW IT: "What would we see on the street?"', expect: null },
  { name: 'an invented quotation after a short one is still caught', reply: 'NOTES:\n1. After "Zei walks" consider "the grid hums under his feet tonight".', expect: /neither the person's nor the book's/ },
];
let bad = 0;
for (const c of cases) {
  const flags = codeFlags(c.reply, draft, 4, book);
  const ok = c.expect ? flags.some((f) => c.expect!.test(f)) : flags.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name}: ${flags.length ? flags.join('; ') : 'no flags'}`);
}
// The craft guide: the real guide passes; a planted chapter-31 example is dropped for a reader at chapter 7.
const guideMd = readFileSync('docs/craft/visual-storytelling.md', 'utf8');
const ok = (name: string, pass: boolean, detail = '') => {
  if (!pass) bad++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
};
const problems = craftProblems(guideMd);
ok('the craft guide: every example tagged with its latest chapter, no stray block ids', !problems.length, problems.join('; '));
const planted = guideMd.replace('**In the book.**\n', '**In the book.**\n- [ch 31] Planted: the reunion in Northglade (c31-b77).\n');
ok('the planted chapter-31 example is in the guide', planted.includes('c31-b77') && !craftProblems(planted).length);
const seen7 = craftUpTo(planted, 7);
ok('a reader at chapter 7 does not see the chapter-31 example', !seen7.includes('c31-b77') && !/\bc(8|9|[1-3]\d)-b\d+/.test(seen7));
ok('a reader at chapter 7 still sees chapter 7 examples', seen7.includes('c7-b124'));
ok('a principle left with no example says so', craftUpTo(guideMd, 1).includes('No example from the book up to your chapter.'));
ok('a reader at chapter 32 sees every example', craftUpTo(planted, 32).includes('c31-b77') && craftUpTo(guideMd, 32) === guideMd);
const wrongTag = guideMd.replace('- [ch 7] After the final, Bai', '- [ch 4] After the final, Bai');
ok('a wrong tag is caught', craftProblems(wrongTag).some((x) => x.includes('tagged ch 4')));
const stray = guideMd.replace('**The coach asks.** "What does your character do, and what does it cost?"', '**The coach asks.** (see c30-b5) "What does your character do, and what does it cost?"');
ok('a block id outside an example is caught', craftProblems(stray).some((x) => x.includes('outside a tagged example')));

if (bad) process.exit(1);
