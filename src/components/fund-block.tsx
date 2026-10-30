import { fundAddress, FUND_WORDING as W } from '~/lib/fund';
import { FundCopy } from './fund-copy';

/**
 * "Fund Snowmoon Party" (owner, 2026-10-30): the wallet address with a copy button, what gifts pay for, what we
 * want to explore, and the facts principle 7 asks for next to any money. Shown nowhere until the owner sets
 * FUND.address (fail closed). No chain read, no database, no QR code, no outside request.
 * Model-drafted wording (src/lib/fund.ts), one "Draft wording" line, until the owner's reread.
 */
export function FundBlock() {
  const address = fundAddress();
  if (!address) return null;
  return (
    <section id="fund" className="fund-block" aria-labelledby="fund-title">
      <h2 id="fund-title">{W.heading}</h2>
      <p>{W.address}</p>
      <p className="fund-address">
        <code data-fund-address>{address}</code>
      </p>
      <FundCopy address={address} label={W.copy} done={W.copied} />
      <p>{W.paysFor}</p>
      <ul className="fund-facts">
        {W.facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <h3>{W.exploreHeading}</h3>
      <ul>
        {W.explore.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <p className="as-draft">{W.draft}</p>
    </section>
  );
}
