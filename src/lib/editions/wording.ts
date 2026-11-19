/**
 * Every word on the Snowmoon Editions test pages, in one place. DRAFT copy, written by an AI agent (Claude, made by
 * Anthropic), for Nate to rewrite in his own words. Lines in [brackets] are placeholders for the owner's own words and
 * are shown as placeholders: never fill them with invented story text.
 *
 * Rules (handoff, 18 Nov 2026): say plainly what is bought (a place in the record of a piece of the making; the work
 * stays open); nothing that sounds like an investment (no "price goes up", no "early buyers", no resale talk); no sale
 * Terms or Privacy lines. The test banner is the only legal-style text. scripts/test-editions.ts checks these rules.
 */
import { formatEth, piecesText } from './ladder';

export const EW = {
  banner: 'Test on the Sepolia test network. Nothing here is real or for sale: test ETH has no value.',
  title: 'Editions',
  /** The list's opening lines (draft). */
  listLede: [
    'Pieces from the making of this edition of Snowmoon, released one at a time while the work goes on in the open.',
    'Each edition keeps a place in the record of one piece of the making. The work itself stays open for anyone to build on.',
  ],
  nextEdition: 'Next edition',
  opensIn: (t: string) => `Opens in ${t}`,
  opensAt: (when: string) => `Opens ${when}`,
  remindMe: 'Remind me',
  remindNote: 'Reminders aren’t on in this test.',
  noneYet: 'No editions yet.',
  notDeployed: 'The test contracts aren’t on Sepolia yet. This page fills in once they are deployed.',

  edition: (n: number) => `Edition ${n}`,
  earlier: 'Earlier editions',
  allEditions: 'All editions',
  minted: (sold: number, size: number) => `${sold} of ${size} minted`,
  nextPrice: 'Next price',

  // Placeholders for the owner's words (shown as written, in brackets).
  storyPlaceholder: '[Two or three lines from Nate about this moment in the story]',
  linePlaceholder: '[One line from Nate about this edition]',
  madeByPlaceholder: '[Who made it]',
  builtOnPlaceholder: '[What it was built on]',
  titlePlaceholder: '[Title]',
  earlierPlaceholder: '[An earlier version it grew from: Nate picks]',
  recipientPlaceholder: '[Recipient, from the deep-funding result]',

  madeBy: 'Made by',
  builtOn: 'Built on',
  howMade: 'How it was made',
  playVideo: 'Play',

  // Mint card
  pieceOf: (n: number, size: number) => `Piece ${n} of ${size}`,
  left: (n: number) => (n === 1 ? '1 left' : `${n} left`),
  approx: (usd: string) => `about ${usd}, approximate`,
  quantity: 'How many',
  fewer: 'One fewer',
  more: 'One more',
  total: 'Total',
  mint: (q: number) => (q === 1 ? 'Mint 1 piece' : `Mint ${q} pieces`),
  connect: 'Connect a wallet',
  switchTo: 'Switch to Sepolia',
  noWallet: 'No wallet found in this browser. Open this page in a wallet’s own browser, or in a browser with a wallet extension.',
  wrongNetwork: 'Your wallet is on another network. These test pieces are on Sepolia.',
  notEnough: (need: string) => `Your wallet doesn’t have enough test ETH for this (${need} ETH plus the network fee).`,
  getTestEth: 'Get free test ETH',
  busy: (most: string) =>
    `Pieces are being minted right now, so the price may move up a step before yours goes through. You pay at most ${most} ETH, and any difference comes straight back.`,
  confirmInWallet: 'Confirm in your wallet.',
  waiting: 'Sent. Waiting for the network to confirm it.',
  checking: 'Checking the price…',
  rejected: 'You cancelled in your wallet. Nothing was sent.',
  priceMoved: (now: string) => `Someone else minted first, so the price moved to ${now} ETH. Nothing was minted.`,
  tryAgain: (now: string) => `Try again at ${now} ETH`,
  cannotReceive: 'This wallet can’t hold this kind of collectible (an ERC-1155 piece). Try another wallet, such as a phone wallet or a browser extension.',
  failed: 'The mint didn’t go through. Nothing was minted; only the network fee may have been spent.',
  soldOutNow: 'The last pieces have just gone. Nothing was minted.',
  notOpenYet: 'This edition isn’t open yet.',
  viewTx: 'See it on Etherscan',

  // States
  soldOut: 'Sold out',
  soldOutLine: (size: number) => `All ${size} pieces have been minted.`,
  notOpen: 'Not open yet',

  // Ladder
  ladderTitle: 'The price of each piece',
  ladderLine: 'Each piece costs a little more than the one before, and the next piece is always for sale.',
  legendMinted: 'Minted',
  legendNext: 'Next',
  legendWaiting: 'Waiting',
  ladderAlt: (size: number, first: string, last: string, sold: number) =>
    `${size} bars rising from ${first} ETH for piece 1 to ${last} ETH for piece ${size}; ${sold} minted.`,

  // Story sections
  cameToBe: 'How this piece came to be',
  staysOpen: 'The work stays open: anyone can build on it.',
  money: 'Where the money goes',
  moneyFixed: 'Fixed before the first sale.',
  seeSplit: 'See the split',
  whatYouBuy: 'You’re buying a place in the record of this piece of the making. The work itself stays open.',

  // After a mint
  yours: (first: number, quantity: number) => `${piecesText(first, quantity)} ${quantity > 1 ? 'are' : 'is'} yours`,
  ofEdition: (n: number, title: string) => `Edition ${n} · ${title}`,
  youPaid: (wei: bigint) => `You paid ${formatEth(wei)} ETH, plus the network fee.`,
  cameBack: (wei: bigint) => `${formatEth(wei)} ETH of the cushion came straight back to you.`,
  wentTo: 'Your payment went to',
  seeInStory: 'See it in the story',
  share: 'Share this piece',
  copied: 'Link copied',
  nextPieceIs: (n: number, price: string) => `Next up: piece ${n}, at ${price} ETH.`,
  feedback: 'Two quick questions: where did you hesitate, and what did you just buy?',
  feedbackComing: '[Feedback form: Nate supplies the link]',
  notFound: 'This mint wasn’t found on Sepolia, or isn’t a Snowmoon Editions mint.',
  stillPending: 'Still waiting for the network to confirm this mint. This page refreshes on its own.',
  shareText: (title: string) => `A piece of the making of Snowmoon: ${title}`,
} as const;
