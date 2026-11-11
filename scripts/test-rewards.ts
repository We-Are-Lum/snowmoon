/**
 * The challenge's rewards (owner, 2026-11-11; src/lib/challenge/rewards.ts), behind CHALLENGE.rewards. Each check runs
 * on the real code and on a planted violation, which it must catch.
 *
 *   npm run test:rewards
 *
 *  R1 off: nothing shows (no section on the rules page, no line on /challenge) and the rules still say "There is no
 *     prize for now.";
 *  R2 on: the section in the owner's order (poidh bounty, the deep-funding pool, the collab pool's line, who, when, how),
 *     the date from CHALLENGE.dates.closes, a line on /challenge linking to it, and the "no prize" lines replaced;
 *  R3 the switch can't be on while any "[amount]" or "[link]" blank is left (this test fails then);
 *  R4 the words use the site's own names (entries, backstory), never "step 1" or "step 2".
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { CHALLENGE } from '../src/lib/config';
import { BLANK, REWARDS_WORDING, rewardsProblems, rewardsSection, type RewardItem } from '../src/lib/challenge/rewards';
import { dateText } from '../src/lib/challenge/rules';
import { CHALLENGE_WORDING as W } from '../src/lib/challenge/wording';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0;
const failed: string[] = [];
const need = (ok: boolean, what: string) => (ok ? [] : [what]);
function proven(name: string, real: string[], planted: string[]) {
  const ok = real.length === 0 && planted.length > 0;
  if (ok) passed++;
  else failed.push(`${name}: ${real.length ? `real: ${real.join('; ')}` : 'the planted violation was not caught'}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${real.length ? ` (${real.join('; ')})` : ''}${planted.length ? '' : ' (plant not caught)'}`);
}
const flip = <T>(on: boolean, f: () => T): T => {
  const was = CHALLENGE.rewards;
  (CHALLENGE as { rewards: boolean }).rewards = on;
  try {
    return f();
  } finally {
    (CHALLENGE as { rewards: boolean }).rewards = was;
  }
};
const rulesBody = read('src/components/challenge-rules-body.tsx'), hubBody = read('src/components/challenge-body.tsx'), view = read('src/lib/challenge/view.ts'), rulesView = read('src/lib/challenge/rules-view.ts');

// R1
const off = () => [
  ...need(CHALLENGE.rewards === false, 'CHALLENGE.rewards is on in the code'),
  ...need(flip(false, () => rewardsSection()) === null, 'the section shows while off'),
  ...need(flip(false, () => W.next()).startsWith('There is no prize for now.') && flip(false, () => W.rules()).includes('Entering is free. There is no prize for now.'), 'the rules lose "There is no prize for now." while off'),
  ...need(/rewardsLine: CHALLENGE\.rewards \? \{ text: REWARDS_WORDING\.landing, href: '\/challenge\/rules#rewards' \} : null,/.test(view) && /\{v\.rewardsLine && \(/.test(hubBody), 'the hub\'s line isn\'t behind the switch'),
  ...need(/rewards: rewardsSection\(\),/.test(rulesView) && /\{v\.rewards && \(/.test(rulesBody), 'the rules page\'s section isn\'t behind the switch'),
];
proven('R1 off: no section on the rules page, no line on /challenge, and the rules still say there is no prize', off(), flip(true, () => need(rewardsSection() === null, 'planted (on): the section shows')));

// R2
const on = flip(true, () => ({ s: rewardsSection(), next: W.next(), rules: W.rules() }));
const order = ['poidh', 'deep funding', 'Snowmoon collab', 'Who can receive', 'When:', 'How:'];
const shape = (items: readonly RewardItem[]) => [
  ...need(items.length === 6 && order.every((k, i) => items[i]?.text.includes(k)), `the order: ${items.map((i) => i.text.slice(0, 20)).join(' | ')}`),
  ...need(items[1]?.text.includes('Only remixes made from other people’s accounts count, never your own.'), 'the pool doesn\'t say only other people\'s remixes count'),
  ...need(items[4]?.text === `When: paid after entries close, ${dateText('closes', { time: true })}.`, `the date isn't from CHALLENGE.dates.closes: ${items[4]?.text}`),
  ...need(/to a verified address\. If you entered with Bluesky only, add one\. No payment where the law doesn’t allow it\./.test(items[5]?.text ?? ''), 'the how line'),
];
proven('R2 on: the section in the owner\'s order, the date from CHALLENGE.dates.closes, a line on /challenge to it, and the "no prize" lines replaced', [
  ...shape(on.s?.items ?? []),
  ...need(on.s?.head === 'Rewards' && /id="rewards"/.test(rulesBody), 'the section\'s head or anchor'),
  ...need(on.next === REWARDS_WORDING.next && !on.next.includes('no prize') && on.rules.includes('Entering is free.') && !on.rules.some((r) => r.includes('no prize')), 'the "no prize" lines stay while on'),
], shape([...(on.s?.items ?? [])].reverse()));

// R3
const filled: RewardItem[] = REWARDS_WORDING.items().map((i) => ({ text: i.text.replace(/\[amount\]/g, '1 ETH').replace(/\[link\]/g, 'here'), href: i.text.includes('[link]') ? 'https://example.org' : null }));
proven('R3 the switch can\'t be on while any "[amount]" or "[link]" blank is left', [
  ...need(!CHALLENGE.rewards || rewardsProblems(true).length === 0, `CHALLENGE.rewards is on with blanks left: ${rewardsProblems(true).join('; ')}`),
  ...need(rewardsProblems(true, filled).length === 0 && rewardsProblems(false).length === 0, 'filled words, or the switch off, are refused'),
  ...need(REWARDS_WORDING.items().some((i) => BLANK.test(i.text)), 'no blanks in the draft (the owner fills them)'),
], rewardsProblems(true));

// R4
const words = (texts: string[]) => texts.flatMap((t) => need(!/step ?[12]|step (one|two)/i.test(t), `"${t.slice(0, 40)}" says step 1 or 2`));
const all = [...REWARDS_WORDING.items().map((i) => i.text), REWARDS_WORDING.landing, REWARDS_WORDING.next];
proven('R4 the site\'s own words (entries, backstory), never "step 1" or "step 2"', [...words(all), ...need(/entries/.test(all.join(' ')) && /backstor/.test(all.join(' ')), 'entries or backstory not named')], words(['A bounty for step 2.']));

console.log(`\ntest:rewards: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
