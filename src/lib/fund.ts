import { isAddress } from 'viem';
import { FUND } from './config';

/**
 * The address the "Fund Snowmoon Party" block shows, or null (then nothing is shown: fail closed).
 * FUND.address when it is set and valid. Locally only (never on Vercel, where VERCEL is set), the env
 * var FUND.testAddressEnv stands in for it, so the UI check can see the block before the owner gives
 * an address. Read at build time on /about, which is static.
 */
export function fundAddress(): string | null {
  const local = !process.env.VERCEL ? process.env[FUND.testAddressEnv]?.trim() : undefined;
  const a = FUND.address ?? local ?? null;
  return a && isAddress(a, { strict: true }) ? a : null;
}

/**
 * Model-drafted wording, for the owner's reread (one "Draft wording" line on the block).
 * What it pays for: the site's real costs as named in Privacy section 7 and src/lib/config.ts.
 * What we want to explore: docs/next-version.md (branch next-version), in its own words where possible.
 * The facts principle 7 asks for sit next to the address.
 */
export const FUND_WORDING = {
  heading: 'Fund Snowmoon Party',
  address: `Gifts in ${FUND.accepts}, on ${FUND.chain} only, to the project owner’s wallet:`,
  copy: 'Copy address',
  copied: 'Copied',
  paysFor:
    'Gifts pay for what the site spends money on: the image and video models on fal.ai, the assistant’s models on Groq and Vercel AI Gateway, and hosting and storage on Vercel, Cloudflare and Supabase.',
  exploreHeading: 'What we want to explore',
  explore: [
    'Adaptations as owned, forkable works: the maker has final cut, and anyone can fork, with a visible “forked from”.',
    'References: one or more images for every glossary item, made by the community: a visual glossary.',
    'More image models, as many as their licences allow, with the recipe logged for every one.',
    'More logins: Bluesky and Lens, beside Farcaster and wallets.',
    'Social threads: what people say about anything published, gathered on its page.',
    'Agents that can do everything a person can, while publishing stays a human step.',
  ],
  facts: [
    'A gift is a gift: it buys nothing here.',
    'It changes no order, no default and no one’s standing on the site.',
    'There is no token. Nothing here is an investment.',
    'Gifts are final and are not tax-deductible.',
    'This site keeps no record of who gave. A gift is a public transaction on the blockchain.',
  ],
  draft: 'Draft wording',
} as const;
