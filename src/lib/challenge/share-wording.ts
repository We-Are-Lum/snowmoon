/**
 * The words of "Share this version", "Add where you posted it" and "Posted on" that don't name the remix challenge
 * (owner, 2026-11-04: the challenge is admin-only for now). The share buttons are on every sheet page, so their script
 * carries only these; the challenge's own words (src/lib/challenge/wording.ts, which spreads these in) reach a page
 * only when the challenge is shown there. Drafted by the coding agent (Claude, a closed model by Anthropic).
 */
export const SHARE_WORDING = {
  shareHead: 'Share this version',
  shareOn: (network: string) => `Post on ${network}`,
  shareText: (what: string) => `${what}, made on Snowmoon Party`,
  guidance: 'If you’re remixing someone’s post, quote or reply to it on the same network. Always include your version’s link.',
  addHead: 'Add where you posted it',
  addLabel: 'Your post’s address (Farcaster, Bluesky or Lens)',
  addButton: 'Add',
  added: 'Added.',
  already: 'Already listed.',
  postedOnHead: 'Posted on',
  postedOnNote: 'Posts that link to this page, newest first, as their writers or the people who added them listed them. Shown as links only.',
  /** Only a link, never a like, recast or reply count (branch contest, 2026-11-04; CHALLENGE.socialCounts off). Draft wording. */
  seeIt: (network: string) => `See the conversation on ${network}`,
  remove: 'Remove',
};
