/**
 * Every word on the Snowmoon Editions test pages, in one place. DRAFT copy, for Nate's pass. It follows the mockups
 * made with Nate (LUM project, claude/mockups/editions-*.dc.html, 18 Nov 2026); the rest was written by an AI agent
 * (Claude, made by Anthropic). Lines in [brackets] are placeholders for the owner's own words and are shown as
 * placeholders: never fill them with invented story text.
 *
 * Rules (handoff, 18 Nov 2026): say plainly what is bought (a place in the record of the making; the work stays open);
 * nothing that sounds like an investment (no "price goes up", no "early buyers", no resale talk); no sale Terms or
 * Privacy lines. The test banner is the only legal-style text. scripts/test-editions.ts checks these rules.
 */
import { formatEth, piecesText } from './ladder';

/** Edition numbers as the mockups write them: 01, 02, … */
export const editionNo = (n: number) => String(n).padStart(2, '0');

export const EW = {
  banner: 'Test on the Sepolia test network. Nothing here is real or for sale: test ETH has no value.',
  collection: 'Snowmoon Editions',
  title: 'Editions',
  soFar: (n: number) => `${n} so far`,
  /** The list's opening line (the mockup's). */
  listLede: ['Snowmoon is being made in the open. Each edition is one piece of it: a character, a storyboard, a scene.'],
  opensIn: (n: number) => `Edition ${editionNo(n)} opens in`,
  nextIn: 'Next in',
  nextPiecePlaceholder: '[What the next piece is, in a few words]',
  remindMe: 'Remind me',
  remindNote: 'Reminders aren’t on in this test.',
  noneYet: 'No editions yet.',
  notDeployed: 'The test contracts aren’t on Sepolia yet. This page fills in once they are deployed.',
  footer: 'An independent adaptation of Snowmoon by Vitalik Buterin (GPL-3.0), not affiliated with him.',
  contract: 'Contract',

  edition: (n: number) => `Edition ${editionNo(n)}`,
  earlier: 'Earlier editions',
  allEditions: 'All editions',
  minted: (sold: number, size: number) => `${sold} of ${size} minted`,
  nextAt: (price: string) => `Next ${price} ETH`,

  // Placeholders for the owner's words (shown as written, in brackets).
  storyPlaceholder: '[Two or three lines in the owner’s own words: who this is at this point in the story, and what this version is trying to get right.]',
  linePlaceholder: '[One or two lines in the owner’s words about this piece of the story.]',
  madeByPlaceholder: '[who]',
  builtOnPlaceholder: '[what it was built on]',
  titlePlaceholder: '[Title]',
  recipientPlaceholder: '[The people this was built on]',

  credits: (by: string, on: string) => `Made by ${by}, built on ${on}.`,
  howMade: 'See how it was made',
  play: 'Play the piece',

  // Mint card
  pieceOf: (n: number, size: number) => `Piece ${n} of ${size}`,
  left: (n: number) => `${n} left`,
  about: (usd: string) => (String(usd).startsWith('under') ? String(usd) : `about ${usd}`),
  quantity: 'How many',
  fewer: 'One fewer',
  more: 'One more',
  totalFor: (q: number) => `Total for ${q}`,
  mint: (q: number) => `Mint ${q}`,
  connect: 'Connect a wallet',
  switchTo: 'Switch to Sepolia',
  noWallet: 'No wallet found in this browser. Open this page in a wallet’s own browser, or in a browser with a wallet extension.',
  wrongNetwork: 'Your wallet is on another network. These test pieces are on Sepolia.',
  notEnough: (need: string) => `Your wallet doesn’t have enough test ETH for this (${need} ETH plus the network fee).`,
  getTestEth: 'Get free test ETH',
  busy: (most: string) =>
    `Someone minted a moment ago, so the price may move up a step before yours goes through. You pay at most ${most} ETH, and any difference comes straight back to you.`,
  waiting: 'Sent. Waiting for the network to confirm it.',
  checking: 'Checking the price…',
  rejected: 'You cancelled in your wallet. Nothing was sent.',
  priceMoved: (now: string) => `Someone else minted first, so the price moved to ${now} ETH. Nothing was minted.`,
  feeSpent: 'The network fee for that attempt was spent.',
  tryAgain: (now: string) => `Try again at ${now} ETH`,
  cannotReceive: 'This wallet can’t hold this collectible. Try another wallet, such as a phone wallet or a browser extension.',
  failed: 'The mint didn’t go through. Nothing was minted; only the network fee may have been spent.',
  soldOutNow: 'The last pieces have just gone. Nothing was minted.',
  notOpenYet: 'This edition isn’t open yet.',
  viewTx: 'View the transaction',

  // States
  soldOut: 'Sold out',
  soldOutLine: (size: number) => `All ${size} pieces have been minted.`,
  notOpen: 'Not open yet. Opens in',

  // Ladder
  ladderTitle: 'The price ladder',
  ladderLine: (size: number) => `${size} pieces. Each one costs a little more than the one before. The next piece is always for sale.`,
  legendMinted: 'Minted',
  legendNext: (n: number) => `Next: piece ${n}`,
  legendWaiting: 'Waiting',
  ladderAlt: (size: number, first: string, last: string, sold: number) =>
    `Price ladder: ${size} pieces rising from ${first} to ${last} ETH; ${sold} minted.`,

  // Story sections
  cameToBe: 'How this piece came to be',
  steps: ['Original sheet', 'A remix it grew from', 'This version'],
  cameToBeLine: 'Every step is open, with its recipe. Minting a piece puts you in the record of the making. The work itself stays free for anyone to build on.',
  money: 'Where the money goes',
  moneyFixed: 'Fixed before the first sale.',
  seeSplit: 'See the split',

  // After a mint
  back: 'Back to the edition',
  yours: (first: number, quantity: number) => `${piecesText(first, quantity)} ${quantity > 1 ? 'are' : 'is'} yours`,
  inTheRecord: (kind: string) => `You are now in the record of how this ${kind} was made. Thank you for supporting the making.`,
  youPaid: 'You paid',
  cameBack: 'Sent as a cushion and returned',
  wentTo: (paid: bigint) => `Where your ${formatEth(paid)} ETH went`,
  seeInStory: (name: string | null) => (name ? `See ${name} in the story` : 'See it in the story'),
  share: 'Share the piece',
  copied: 'Link copied',
  nextPieceIs: (n: number, price: string) => `The next piece of this edition is piece ${n}, at ${price} ETH.`,
  feedback: 'Two quick questions: where did you hesitate, and what did you just buy?',
  feedbackComing: '[Feedback form: Nate supplies the link]',
  notFound: 'This mint wasn’t found on Sepolia, or isn’t a Snowmoon Editions mint.',
  stillPending: 'Still waiting for the network to confirm this mint. This page refreshes on its own.',
  shareText: (title: string) => `A piece of the making of Snowmoon: ${title}`,
} as const;
