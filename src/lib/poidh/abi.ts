import { parseAbi } from 'viem';

/**
 * The parts of PoidhV3 (POIDH.core, on Base) this app calls, copied from the verified source as warplore's comic bounty
 * did (Basescan exact match, 2026-10-21). Client-safe. Only createClaim is ever sent, from the maker's own wallet;
 * bounties() is read to check the bounty is the owner's; ClaimCreated is read from the claim's receipt. Voting,
 * accepting and withdrawing are never called here: they happen on poidh.xyz.
 */
export const POIDH_ABI = parseAbi([
  'function createClaim(uint256 bountyId, string name, string description, string uri)',
  'function bounties(uint256 bountyId) view returns (uint256 id, address issuer, string name, string description, uint256 amount, address claimer, uint256 createdAt, uint256 claimId)',
  'event ClaimCreated(uint256 indexed id, address indexed issuer, uint256 indexed bountyId, address bountyIssuer, string title, string description, uint256 createdAt, string imageUri, uint256 round)',
  'error IssuerCannotClaim()',
  'error BountyNotFound()',
  'error BountyClaimed()',
  'error BountyClosed()',
]);
