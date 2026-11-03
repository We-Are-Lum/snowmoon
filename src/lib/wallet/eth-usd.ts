import { parseAbi, type PublicClient } from 'viem';
import { IMAGES } from '../config';

const FEED = parseAbi(['function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)']);

/**
 * Chainlink's ETH/USD on Base right now, for the support page's "≈ $" estimate (owner, 2026-10-31): the feed's answer
 * (8 decimals) and when it was last updated. Null when the feed is older than two hours, reads zero or can't be read,
 * so the page shows no estimate rather than a wrong one. Asks Base for nothing but the feed. The caller passes the
 * server's Base client (src/lib/wallet/chain.ts).
 */
export async function ethUsdNow(client: Pick<PublicClient, 'readContract'>): Promise<{ usd: number; updatedAt: number } | null> {
  try {
    const [, answer, , updatedAt] = await client.readContract({ address: IMAGES.prepaid.ethUsdFeed, abi: FEED, functionName: 'latestRoundData' });
    const at = Number(updatedAt);
    if (answer <= 0n || Date.now() / 1000 - at > 2 * 3600) return null;
    return { usd: Number(answer) / 1e8, updatedAt: at };
  } catch {
    return null;
  }
}
