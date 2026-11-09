/**
 * The words of a challenge picture's page, /challenge/p/<version> (branch challenge-moments, 2026-11-05;
 * docs/proposals/challenge-moments.md §1.3 S4). DRAFT wording, drafted by the coding agent (Claude, a closed model by
 * Anthropic) for the owner's review; the one line near Submit is the owner's (2026-11-05, answer 7). No date here.
 */
export const PICTURE_WORDING = {
  close: 'Close',
  title: (name: string, moment: string, chip: string) => `${name} · ${moment} (${chip})`,
  by: (who: string) => `A remix by ${who}`,
  wordsHead: 'Their words',
  published: 'Published. Now post it:',
  shareHead: 'Post it',
  copy: 'Copy link',
  copied: 'Link copied.',
  /**
   * The maker's ready post (owner, 2026-11-07, approved): "My remix of {name} in “{moment}”, for the Snowmoon Party remix
   * challenge"; with no moment, exactly the line of 2026-11-06: "My remix of {name}, for the Snowmoon Party remix challenge".
   */
  postText: (name: string, moment: string | null) => (moment ? `My remix of ${name} in “${moment}”, for the Snowmoon Party remix challenge` : `My remix of ${name}, for the Snowmoon Party remix challenge`),
  /** For anyone but its maker (owner, 2026-11-07): the button to remix it, the remix pages' "Remix this". */
  remixThis: 'Remix this',
  /**
   * Sharing someone else's picture never says "My remix" (owner, 2026-11-07, approved): the character, the moment's
   * title, and who made it, written by the @ rule (src/lib/challenge/share-makers.ts).
   */
  othersText: (name: string, moment: string, by: string) => `${name} in “${moment}”, a remix by ${by} for the Snowmoon Party remix challenge`,
  /** With the moments off (owner, 2026-11-08, these words): "A remix of Zei by @maker, for the Snowmoon Party remix challenge". */
  othersTextPlain: (name: string, by: string) => `A remix of ${name} by ${by}, for the Snowmoon Party remix challenge`,
  /**
   * For its maker, in place of Submit, from the open date to the close, when the picture was published before entries
   * opened (owner, 2026-11-07, his words, approved; the same words as SUBMIT_WORDING.beforeOpen). "Remix it" links to its
   * remix screen (a maker can remix their own picture: the make route takes any published challenge picture).
   */
  beforeOpen: { text: 'This picture was made before entries opened, so it can’t be entered. ', link: 'Remix it', after: ' to make a new one.' },
  thenSubmit: 'Then submit it as an entry',
  oneADay: 'one a day',
  /** The owner's line (2026-11-05, answer 7), with "Rules" beside it; no other rules text on the flow. */
  signInLine: 'Sign in with Farcaster, Lens or Bluesky to enter.',
  recipe: 'How it was made',
  another: 'Make another',
  /** While pictures aren't the entries yet (CHALLENGE.pictureEntries off: Terms and Privacy don't say so yet). */
  notEntriesYet: 'Pictures can’t be submitted as entries yet.',
};
