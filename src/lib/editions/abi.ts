import { parseAbi } from 'viem';

/** The read and mint functions the pages use, from contracts/snowmoon-editions (SnowmoonEditions, LadderSeller). */
export const EDITIONS_ABI = parseAbi([
  'function editionCount() view returns (uint256)',
  'function nextEditionAllowedAt() view returns (uint256)',
  'function uri(uint256 id) view returns (string)',
  'function payoutOf(uint256 id) view returns (address)',
  'function maxSupplyOf(uint256 id) view returns (uint256)',
  'function totalMinted(uint256 id) view returns (uint256)',
  'function createdAt(uint256 id) view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
]);

/** LadderSeller, with every error either contract (or OpenZeppelin's ERC-1155) can raise during a mint, so a failed
 *  simulation or receipt can be named in plain words. */
export const SELLER_ABI = parseAbi([
  'function mint(uint256 id, uint256 quantity, address to) payable returns (uint256 firstPiece)',
  'function priceOf(uint256 id, uint256 n) view returns (uint256)',
  'function quote(uint256 id, uint256 quantity) view returns (uint256)',
  'function remaining(uint256 id) view returns (uint256)',
  'function sold(uint256 id) view returns (uint256)',
  'function isOpen(uint256 id) view returns (bool)',
  'function ladder(uint256 id) view returns ((uint96 startPrice, uint96 topPrice, uint64 startTime, address payout, uint16 maxSupply, uint16 sold, bool configured, uint128 paid, uint128 released, uint256 lnRatio))',
  'event Minted(uint256 indexed id, address indexed buyer, address indexed to, uint256 firstPiece, uint256 quantity, uint256 cost)',
  'error UnknownEdition(uint256 id)',
  'error NotStarted(uint256 startTime)',
  'error BadQuantity(uint256 quantity)',
  'error NotEnoughLeft(uint256 remaining, uint256 quantity)',
  'error Underpaid(uint256 cost, uint256 sent)',
  'error RefundFailed()',
  'error ReentrancyGuardReentrantCall()',
  'error ERC1155InvalidReceiver(address receiver)',
  'error ExceedsMaxSupply(uint256 id, uint256 minted, uint256 quantity, uint256 maxSupply)',
]);
