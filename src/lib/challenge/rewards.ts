import { CHALLENGE } from '../config';
import { dateText } from './rules';

/**
 * The challenge's rewards (owner, 2026-11-11): a section on /challenge/rules (#rewards) and one line on /challenge,
 * behind CHALLENGE.rewards (off). DRAFT wording, drafted by the coding agent (Claude, a closed model by Anthropic), with
 * the amounts and links left as visible blanks for the owner to fill. scripts/test-rewards.ts refuses CHALLENGE.rewards
 * on while any blank is left. The date comes from CHALLENGE.dates.closes. The site calls the owner's "step 1" its
 * entries (a picture submitted with Submit) and "step 2" a backstory: these words use the site's.
 */
export const BLANK = /\[(amount|link)\]/;

export interface RewardItem {
  /** The words; "[amount]" and "[link]" are blanks for the owner. */
  text: string;
  /** Where its link goes; null while the link is a blank. */
  href: string | null;
}

export const REWARDS_WORDING = {
  head: 'Rewards',
  draft: 'Draft wording',
  items: (): RewardItem[] => [
    { text: 'A backstory bounty of [amount] on poidh: [link].', href: null },
    {
      text: 'A pool of [amount], shared through deep funding among the backstory runners-up, the entries, and the pictures other people remixed. Only remixes made from other people’s accounts count, never your own.',
      href: null,
    },
    { text: 'A pool for the Snowmoon collab, under its own rules, not a prize from this site: [link].', href: null },
    { text: 'Who can receive: accounts that pass the site’s check.', href: null },
    { text: `When: paid after entries close, ${dateText('closes', { time: true })}.`, href: null },
    { text: 'How: in ETH on Base, to a verified address. If you entered with Bluesky only, add one. No payment where the law doesn’t allow it.', href: null },
  ],
  /** The line on /challenge, linking to the section. */
  landing: 'Rewards for entries, backstories and remixes: see the rules.',
  /** With rewards on, what "What happens next." and the rules' prize line say instead of "There is no prize for now." */
  next: 'The rewards are below. How the final version is chosen is added to the rules before entries close.',
  free: 'Entering is free.',
} as const;

/** What's wrong with turning the rewards on with these words: any blank left. */
export function rewardsProblems(on: boolean, items: readonly RewardItem[] = REWARDS_WORDING.items()): string[] {
  if (!on) return [];
  return items.filter((i) => BLANK.test(i.text)).map((i) => `a blank is left: "${i.text.slice(0, 60)}…"`);
}

/** The section, or null while the switch is off. */
export const rewardsSection = (on: boolean = CHALLENGE.rewards) => (on ? { head: REWARDS_WORDING.head, draft: REWARDS_WORDING.draft, items: REWARDS_WORDING.items() } : null);
