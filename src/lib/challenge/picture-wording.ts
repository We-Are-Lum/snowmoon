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
  /** The ready post (approved 2026-11-05 as "My remix of …"; the moment's title added here, draft). */
  postText: (name: string, moment: string) => `${name} at ${moment}, my remix for the Snowmoon Party remix challenge`,
  thenSubmit: 'Then submit it as an entry',
  oneADay: 'one a day',
  /** The owner's line (2026-11-05, answer 7), with "Rules" beside it; no other rules text on the flow. */
  signInLine: 'Sign in with Farcaster, Lens or Bluesky to enter.',
  recipe: 'How it was made',
  another: 'Make another',
  /** While pictures aren't the entries yet (CHALLENGE.pictureEntries off: Terms and Privacy don't say so yet). */
  notEntriesYet: 'Pictures can’t be submitted as entries yet.',
};
