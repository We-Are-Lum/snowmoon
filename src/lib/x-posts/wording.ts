/**
 * Every word the X posts cards show in Discord (plan docs/proposals/x-posts.md, section 3). DRAFT, this edition's own,
 * pending the owner's reread. Drafted by the coding agent (Claude, a closed model by Anthropic). Nothing here is posted
 * to X: the post is the proposer's own text.
 */

export const LEADS_TEXT = 'Nate, Garance or Luis';

export const COMMAND = {
  name: 'xpost',
  description: 'Propose a post for the Snowmoon X account',
  text: 'The post, as it will appear on X',
  link: 'A link to add at the end (a post with a link costs more)',
  confirm: 'Yes, I mean the @ mention (it tags that X account)',
} as const;

export const CARD = {
  teamTitle: 'Proposed post',
  siteTitle: 'Suggested by snowmoon.party',
  proposedBy: (name: string) => `Proposed by ${name}`,
  redraftOf: (link: string, name: string) => `Redraft of ${link}, by ${name}.`,
  approvedBy: (names: string[], n: number, of: number) => (names.length ? `Approved by ${names.join(', ')} · ${n} of ${of}` : `${n} of ${of} approvals`),
  needsLead: `Needs ${LEADS_TEXT}`,
  length: (count: number, max: number, usd: number) => `${count} of ${max} characters · costs about $${usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2)} to post`,
  footer: (account: string, of: number) => `Posts to @${account} once ${of} people approve, one of them ${LEADS_TEXT}.`,
  wouldPost: 'Would post now (posting is off).',
  posting: 'Posting to X…',
  withdrawn: (name: string, date: string) => `Withdrawn by ${name}, ${date}.`,
  posted: (date: string, link: string, names: string[]) => `Posted on X, ${date}: ${link}. Approved by ${names.join(', ')}.`,
  deleted: (name: string, date: string) => `Deleted from X by ${name}, ${date}.`,
  redrafted: (name: string, date: string, link: string) => `Deleted from X by ${name}, ${date}, and redrafted: ${link}.`,
  deletedOnHide: (date: string) => `Deleted from X by snowmoon.party, ${date}: the work it links to was hidden on the site.`,
  failed: (reason: string) => `X refused this post: ${reason}. Nothing was posted.`,
  unknown: (account: string) => `X didn't answer. Check @${account} before trying again.`,
  held: (limit: number) => `Held: this month's X budget ($${limit}) is used up. ${LEADS_TEXT} can post it with Try again next month.`,
  heldDay: (perDay: number) => `Held: ${perDay} posts have gone out today. ${LEADS_TEXT} can post it with Try again tomorrow.`,
  edited: (name: string) => `Edited by ${name}. Approvals start again.`,
} as const;

export const BUTTON = {
  approve: 'Approve',
  edit: 'Edit',
  withdraw: 'Withdraw',
  delete: 'Delete from X',
  redraft: 'Delete and redraft',
  retry: 'Try again',
} as const;

export const CONFIRM = {
  withdraw: "Withdraw this proposal? It can't be undone.",
  delete: "Delete this post from X? It can't be undone.",
  redraft: 'Delete this post from X and start a new card with its text? The new card needs 3 approvals again.',
} as const;

export const EDIT_BOX = { title: 'Edit the post', post: 'Post', link: 'Link (optional)' } as const;

/** Replies only the clicker sees. */
export const REPLY = {
  notTeam: `Only the X posts team can do this. Ask ${LEADS_TEXT} for the role.`,
  approved: (n: number, of: number) => `Approved: ${n} of ${of}.`,
  unapproved: 'Your approval is taken back.',
  notProposer: 'Only the person who proposed this can do that.',
  notLead: `Only ${LEADS_TEXT} can withdraw a suggestion.`,
  notDeleter: `Only someone who approved this post, or ${LEADS_TEXT}, can delete it.`,
  notRetrier: `Only someone who approved this post, or ${LEADS_TEXT}, can try again.`,
  tooLong: (count: number, max: number) => `This is ${count} characters on X; the most is ${max}.`,
  empty: 'The post is empty.',
  badLink: 'The link must start with https:// and have no spaces.',
  mention: (name: string) => `This mentions @${name}, which tags that X account. Propose it again with confirm set if you mean it.`,
  proposed: 'Your card is in #x-posts.',
  savedEdit: 'Saved. Approvals start again.',
  withdrawnDone: 'Withdrawn.',
  deletedDone: 'Deleted from X.',
  redraftedDone: 'Deleted from X. The new card is in #x-posts, ready to edit.',
  deleteFailed: (reason: string) => `X didn't delete this post: ${reason}. Nothing changed.`,
  tryingAgain: 'Trying again.',
  // A late click on a card whose state has moved on: said plainly, and nothing is changed (owner, 2026-11-25).
  already: {
    posting: 'This is being posted to X right now, so it can’t change.',
    posted: 'This is already posted on X, so it can’t change. Use Delete from X or Delete and redraft.',
    deleted: 'This post was deleted from X, so it can’t change.',
    withdrawn: 'This proposal was withdrawn, so it can’t change.',
    failed: 'X refused this post. Use Try again or Withdraw.',
    unknown: 'X didn’t answer for this post. Check the account, then use Try again.',
    open: 'This post isn’t on X, so there is nothing to delete.',
  },
  notRedraftable: 'Only a post that is on X can be deleted and redrafted.',
  gone: 'This card isn’t in the site’s records.',
  off: 'X posts are switched off on the site.',
  postOff: 'Posting is off on the site, so nothing goes to X yet.',
  deleting: 'Deleting from X…',
  notReady: 'This needs 3 approvals, one of them from Nate, Garance or Luis, before it can post.',
  wrongServer: 'This only works in the Snowmoon server.',
} as const;
