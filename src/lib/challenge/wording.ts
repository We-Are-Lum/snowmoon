import { CHALLENGE } from '../config';
import { dateText, windowText } from './rules';

/**
 * The remix challenge's words. DRAFT wording: the rules are the plan's draft copy (docs/proposals/remix-challenge-plan.md,
 * "Challenge rules (draft copy)"), with every date built from CHALLENGE.dates (owner, 2026-10-31: no date is written
 * into copy; scripts/test-challenge.ts fails if one is). The rest was drafted by the coding agent (Claude, a closed
 * model by Anthropic) for the owner's review.
 */
const d = (k: Parameters<typeof dateText>[0], time = false) => dateText(k, { time });
/** The characters' call names, in the owner's order, from CHALLENGE.characters (their files' slugs). */
const callNames = () => CHALLENGE.characters.map((s) => s.charAt(0).toUpperCase() + s.slice(1));
const listed = (xs: string[], last = 'or') => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${last} ${xs[xs.length - 1]}`);
const numberWord = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);

export const CHALLENGE_WORDING = {
  title: 'Remix the cast',
  draft: 'Draft wording: drafted for the owner, not yet approved.',
  intro: () =>
    `From ${windowText()}, make your own version of ${listed(callNames())} on snowmoon.party: start from a published sheet, or from someone else’s remix, change it, and publish. Your version gets its own page, credited back to what you built on.`,
  nextHead: 'What happens next.',
  next: () =>
    `At the call on ${d('results')}, Nate shows the versions he’s taking into Episode 1, built from your remixes and credited to you. AI models and a small jury divide the credit for each one among everything it was built on, and we publish how every model did it. We plan to mint each final version as an open edition, with what it raises going to everyone it was built on. Details come with the mint page.`,
  bountyHead: 'The bounty.',
  bounty:
    'There is one poidh bounty for the whole challenge. It goes to the remix that most changes how we see a character while staying true to the book. To be in the running, also post your version’s link as a claim on the bounty.',
  rulesHead: 'The rules.',
  rules: () => [
    'Make your remix on snowmoon.party with the site’s tools. Every recipe is published.',
    'Only remixes count: start from a published sheet or someone else’s remix. A new sheet made from scratch isn’t an entry.',
    'One entry per person per character. Your latest version counts unless you mark another.',
    'To count as an entry, sign in with a Farcaster account that passes the site’s check. It’s checked once, when you publish.',
    `Each character needs at least ${numberWord(CHALLENGE.minEntrants)} different people with an entry. A character with fewer gets no final version, credit test or mint.`,
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
  entrants: (n: number) => `${n} ${n === 1 ? 'person has' : 'people have'} entered`,
  entrantsNeeded: (n: number) => (n >= CHALLENGE.minEntrants ? 'enough for a final version' : `${CHALLENGE.minEntrants - n} more needed for a final version`),
  held: (name: string) => `${name}’s starting sheet is held for a check before it’s published.`,
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
