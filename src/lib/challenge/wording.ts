import { CHALLENGE, IMAGES } from '../config';
import { dateText, windowText } from './rules';
import { SHARE_WORDING } from './share-wording';

/**
 * The remix challenge's words. DRAFT wording: the rules are the plan's draft copy (docs/proposals/remix-challenge-plan.md,
 * "Challenge rules (draft copy)"), with every date built from CHALLENGE.dates (owner, 2026-10-31: no date is written
 * into copy; scripts/test-challenge.ts fails if one is). The rest was drafted by the coding agent (Claude, a closed
 * model by Anthropic) for the owner's review.
 */
const d = (k: Parameters<typeof dateText>[0], time = false) => dateText(k, { time });
/** The characters' call names, most named in the book first, from CHALLENGE.characters (their files' slugs). */
const callNames = () => CHALLENGE.characters.map((s) => s.charAt(0).toUpperCase() + s.slice(1));
const listed = (xs: string[], last = 'or') => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${last} ${xs[xs.length - 1]}`);
const numberWord = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);

export const CHALLENGE_WORDING = {
  // The challenge's name (owner, 2026-11-06): "Remix challenge" (was "Remix the cast").
  title: 'Remix challenge',
  draft: 'Draft wording: drafted for the owner, not yet approved.',
  /** The short marker, where a page has only one new line (the home page's row). */
  draftShort: 'Draft wording',
  /** The home page's row for /challenge (owner, 2026-11-03: a link on the home page). Draft wording. */
  homeLine: () => `The remix challenge, ${windowText()}: remix a character and publish it`,
  /**
   * Who can enter, said up front: on /challenge and before the consent screen of a challenge fork (owner, 2026-11-03,
   * these exact words). The score is the one already looked up at Generate: no new Neynar lookup.
   */
  // Draft wording (owner, 2026-11-05 evening): Farcaster, Lens and Bluesky, as the Submit line and the sign-in release say.
  whoCanEnter: () => `Entering needs a Farcaster, Lens or Bluesky account that passes the site’s check; we check when you press ${CHALLENGE.pictureEntries ? 'Make it' : 'Generate'}.`,
  intro: () =>
    CHALLENGE.pictureEntries
      ? // Draft wording (2026-11-06): the intro for pictures as the entries; not yet approved.
        `From ${windowText()}, make your own picture of ${listed(callNames())} on snowmoon.party: start from one of its pictures, set it at a moment from the book, change what you like, and publish. Your picture gets its own page, credited back to what you built on.`
      : `From ${windowText()}, make your own version of ${listed(callNames())} on snowmoon.party: start from a published sheet, or from someone else’s remix, change it, and publish. Your version gets its own page, credited back to what you built on.`,
  nextHead: 'What happens next.',
  // Draft wording (owner, 2026-11-05 evening): no prize for now, and nothing promised about what follows.
  next: () => 'There is no prize for now. How the final version is chosen, and any prize, are added to the rules before entries close.',
  rulesHead: 'The rules.',
  rules: () => [
    'Make your remix on snowmoon.party with the site’s tools. Every recipe is published.',
    // Draft wording (owner, 2026-11-04: one base per character, three for Deluin and Gladias; was three each, 2026-11-03).
    // Entries as pictures (branch challenge-moments, CHALLENGE.pictureEntries; draft wording, switched with it).
    CHALLENGE.pictureEntries
      ? 'Only remixes count: start from one of a character’s pictures on the challenge page and set it at one of the moments. A picture made from scratch isn’t an entry.'
      : 'Only remixes count: for each character, start from one of its bases, or someone else’s remix. A new sheet made from scratch isn’t an entry.',
    // Draft wording (owner, 2026-11-04: Submit and the post link; branch contest, 2026-11-04: one a day, no total cap).
    'A remix becomes an entry only when you press Submit on its page, with a link to your own post about it on Farcaster, Bluesky or Lens. You can submit one remix a day (Pacific time), for any character, as many days as you like. Until entries close you can withdraw a submission; that day’s submission isn’t given back.',
    // Draft wording (owner, 2026-11-03: make it clear an account below the check can't remix; launch rehearsal item 3).
    `To remix at all, sign in with a Farcaster, Lens or Bluesky account that passes the site’s check. An account below it can’t make the pictures, so it can’t remix or enter. It’s checked when you press ${CHALLENGE.pictureEntries ? 'Make it' : 'Generate'}, and again when you publish.`,
    // Draft wording (owner, 2026-11-04: free remixes count remixes, not pictures).
    CHALLENGE.pictureEntries
      ? `Remixing is free: ${numberWord(IMAGES.generationsPerDay)} pictures a day.`
      : `Remixing is free: ${numberWord(IMAGES.designs.remixesPerDay)} remixes a day. A remix is one sheet’s three views; if one of them fails, make it again inside the same remix without using another.`,
    'Entering is free. There is no prize for now.',
    'Post your version anywhere with its link. If you’re remixing someone’s post, quote or reply to it.',
    `A Farcaster account passes the site’s check with a Neynar score of at least ${CHALLENGE.neynarMinScore}, fixed for the whole challenge; Lens and Bluesky accounts pass their own checks, the same ones that let them make pictures.`,
  ],
  adminsLine: 'Admins (the site’s owner and @garance) can make pictures too, but theirs aren’t entries.',
  notAffiliated: 'An independent adaptation of Snowmoon by Vitalik Buterin (GPL-3.0), not affiliated with him.',
  deadline: () => `Entries close ${d('closes', true)}.`,
  opensOn: () => `Entries open ${d('opens', true)}.`,
  closed: () => `Entries closed ${d('closes', true)}.`,
  startFrom: 'Sheets to start from',
  /** Once a character's bases are picked (CHALLENGE.bases). Draft wording (owner, 2026-11-03). */
  startFromBases: 'Bases to start from',
  noSheetYet: (name: string) => `No sheet of ${name} is published yet.`,
  readBook: (name: string) => `What the book says about ${name}`,
  entriesHead: 'Entries so far',
  entriesOrder: 'Newest first.',
  entriesNone: 'No entries yet.',
  entriesOff: 'Entries will be listed here once the challenge starts.',
  entrants: (n: number) => `${n} ${n === 1 ? 'person has' : 'people have'} entered`,
  adminsHead: 'Made by admins (not entries)',
  badge: 'Entry',
  /** An entry's row: the character, then the sheet's name when it has one (launch rehearsal, 2026-11-02: an untitled sheet read "Bai: Bai"). */
  entryLabel: (name: string, title: string) => (title.trim() ? `${name}: ${title.trim()}` : name),
  /** Draft wording (owner, 2026-11-04: a person may have up to three entries, so "an entry", not "its maker's entry"). */
  badgeNote: (name: string) => `Submitted as an entry for ${name} in the remix challenge.`,
  /** On a challenge character's sheet that isn't an entry, while the window is open (launch rehearsal, 2026-11-02: no page but an entry linked to /challenge). */
  sheetInvite: (name: string) => `${name} is in the remix challenge: remix this sheet, change it and publish to enter.`,
  /** A remix that can be entered but isn't yet (owner, 2026-11-04: only Submit makes an entry). Draft wording. */
  candidateNote: (name: string) => `Made during the remix challenge. It isn’t an entry for ${name} unless its maker submits it.`,
  /** A candidate's note once entries are closed: Submit is refused then (launch rehearsal, 2026-11-02). Draft wording. */
  candidateClosedNote: (name: string) => `Made during the remix challenge. Entries are closed: it wasn’t submitted as an entry for ${name}.`,
  adminNote: 'Made by an admin during the remix challenge: admins’ pictures and versions aren’t entries.',
  // Submit (owner, 2026-11-04). Draft wording.
  submitHead: 'Submit as an entry',
  submitNote: () => 'A remix becomes an entry only when you submit it, with the link to your post about it on Farcaster, Bluesky or Lens; the post must be yours and link to this page. You can submit one remix a day (Pacific time).',
  submitLabel: 'Your post’s address (Farcaster, Bluesky or Lens)',
  submit: 'Submit',
  // "Post it first" on Submit (overnight run 2026-11-05, item 4): the head, the note, the button labels and the post's
  // words, approved as drafted (owner, 2026-11-05, "reviewed by the coordinator, approved by the owner"). Each button opens that network's own compose screen with the words and
  // this page's link filled in; nothing is posted or stored by us, and the person pastes the post's link below.
  submitPostHead: 'Post it first',
  submitPostNote: 'Each button opens that network with a short post and this page’s link filled in. Post it there, then paste your post’s address below.',
  submitPostOn: (network: string) => `Post on ${network}`,
  submitPostText: (name: string) => `My remix of ${name}, for the Snowmoon Party remix challenge`,
  submitted: 'Submitted: this is now one of your entries.',
  submissionsLeft: (n: number) => (n > 0 ? 'You can submit one remix today.' : 'You’ve submitted today. You can submit again tomorrow (Pacific time).'),
  withdraw: 'Withdraw',
  withdrawNote: 'Until entries close you can withdraw it. Withdrawing doesn’t give back today’s submission.',
  withdrawn: 'Withdrawn: it is no longer an entry.',
  // Share and "Posted on": the words that don't name the challenge are in ./share-wording.ts.
  ...SHARE_WORDING,
  /** While entries are open, on a challenge character's sheet (owner, 2026-11-03: the share text mentions the challenge). Draft wording. */
  // The share text (owner, 2026-11-06), exactly: "My remix of {name}, for the Snowmoon Party remix challenge".
  shareTextOpen: (name: string) => `My remix of ${name}, for the Snowmoon Party remix challenge`,
  /**
   * The publish confirmation of a version that can be entered (owner, 2026-11-04: only Submit makes an entry; it
   * replaces the owner's 2026-11-03 line "This is your entry for …"). Draft wording.
   */
  publishedCandidate: (name: string) => `To enter it for ${name}, press Submit on its page, with the link to your post about it.`,
  /**
   * The publish confirmation when Neynar didn't answer at publish (decision 'unchecked'): the version is published but
   * doesn't count (owner, 2026-11-03: accept it, and say so on the spot). Draft wording.
   */
  publishedUnchecked: (name: string) =>
    `This version won’t count as your entry for ${name}: Neynar, which scores Farcaster accounts, didn’t answer when you published, so the site couldn’t check your account. Publish another version later and submit that one; an entry you already submitted still counts.`,
};

export const CHALLENGE_CHARACTERS = CHALLENGE.characters;
