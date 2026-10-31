import { CHALLENGE } from '../config';
import { dateText, windowText } from './rules';

/**
 * The remix challenge's words. DRAFT wording: the rules are the plan's draft copy (docs/proposals/remix-challenge-plan.md,
 * "Challenge rules (draft copy)"), with every date built from CHALLENGE.dates (owner, 2026-10-31: no date is written
 * into copy; scripts/test-challenge.ts fails if one is). The rest was drafted by the coding agent (Claude, a closed
 * model by Anthropic) for the owner's review.
 */
const d = (k: Parameters<typeof dateText>[0], time = false) => dateText(k, { time });

export const CHALLENGE_WORDING = {
  title: 'Remix Bai and Zei',
  draft: 'Draft wording: drafted for the owner, not yet approved.',
  intro: () =>
    `From ${windowText()}, make your own version of Bai or Zei on snowmoon.party: start from any existing sheet, or from someone else’s remix, change it, and publish. Your version gets its own page, credited back to what you built on.`,
  nextHead: 'What happens next.',
  next: () =>
    `At the call on ${d('results')}, Nate shows the versions of Bai and Zei he’s taking into Episode 1, built from your remixes and credited to you. AI models and a small jury divide the credit for each one among everything it was built on, and we publish how every model did it. Each version is then minted as an open edition in Snowmoon WIP, from ${d('mintOpens')} to ${d('mintCloses')}. What it raises, plus an extra reward pot, goes to everyone it was built on, through a published split on Ethereum.`,
  bountyHead: 'The bounty.',
  bounty:
    'The poidh bounty goes to the remix that most changes how we see the character while staying true to the book. To be in the running, also post your version’s link as a claim on the bounty.',
  rulesHead: 'The rules.',
  rules: [
    'Make your remix on snowmoon.party with the site’s tools. Every recipe is published.',
    'One entry per person per character. Your latest version counts unless you mark another.',
    'To count as an entry, or get any reward, sign in with a Farcaster account that passes the site’s check, or a wallet linked to one.',
    'Entering is free. Minting isn’t needed for anything.',
    'Post your version anywhere with its link. If you’re remixing someone’s post, quote or reply to it.',
  ],
  adminsLine: 'Admins (the site’s owner and @garance) can make versions too, but aren’t eligible for rewards.',
  notAffiliated: 'An independent adaptation of Snowmoon by Vitalik Buterin (GPL-3.0), not affiliated with him.',
  deadline: () => `Entries close ${d('closes', true)}.`,
  opensOn: () => `Entries open ${d('opens', true)}.`,
  closed: () => `Entries closed ${d('closes', true)}.`,
  startFrom: 'Sheets to start from',
  noSheetYet: (name: string) => `No sheet of ${name} is published yet.`,
  readBook: (name: string) => `What the book says about ${name}`,
  entriesHead: 'Entries so far',
  entriesOrder: 'Newest first.',
  entriesNone: 'No entries yet.',
  entriesOff: 'Entries will be listed here once the challenge starts.',
  adminsHead: 'Made by admins (not eligible for rewards)',
  badge: 'Entry',
  badgeNote: (name: string) => `This is its maker’s entry for ${name} in the remix challenge.`,
  candidateNote: 'Made during the remix challenge. Its maker’s latest version counts unless they mark another.',
  adminNote: 'Made by an admin during the remix challenge: admins aren’t eligible for rewards.',
  mark: 'Mark as my entry',
  marked: 'Marked as your entry.',
  // Share and "Posted on".
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
  seeIt: (network: string) => `See it on ${network}`,
  remove: 'Remove',
};

export const CHALLENGE_CHARACTERS = CHALLENGE.characters;
