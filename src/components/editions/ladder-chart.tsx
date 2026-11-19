'use client';

import { formatEth, ladderGroups, ladderTicks, type GroupBar } from '~/lib/editions/ladder';
import { EW } from '~/lib/editions/wording';
import { useEditionLive } from './edition-sale';

function Bars({ bars, className }: { bars: GroupBar[]; className: string }) {
  return (
    <div className={`ed-bars ${className}`} aria-hidden="true">
      {bars.map((b) => (
        <span key={b.first} className={`ed-lb ed-lb-${b.status}`} style={{ height: `max(4px, ${(b.height * 100).toFixed(3)}%)` }} data-status={b.status} />
      ))}
    </div>
  );
}

/**
 * The price ladder, as the mockups draw it: pieces grouped into bars (64 on a phone, 128 on desktop), to true scale
 * (each bar's height is its price over the top price, at least 4px). Minted bars are ink, the next one is the accent
 * with a marker above it, waiting bars are pale: told apart by more than colour, with words in the legend.
 */
export function LadderChart() {
  const { prices, size, live } = useEditionLive();
  const sold = live.sold;
  if (!size) return null;
  const tick = (n: number) => (
    <span key={n} data-piece={n}>
      {n}
      <br />
      {formatEth(prices[n - 1])}
      {n === size ? ' ETH' : ''}
    </span>
  );
  return (
    <section className="ed-ladder" aria-labelledby="ed-ladder-title">
      <div className="ed-ladder-head">
        <h2 id="ed-ladder-title" className="ed-h2">{EW.ladderTitle}</h2>
        <p className="ed-ladder-line">{EW.ladderLine(size)}</p>
      </div>
      <div className="ed-ladder-chart" role="img" aria-label={EW.ladderAlt(size, formatEth(prices[0]), formatEth(prices[size - 1]), sold)}>
        <Bars bars={ladderGroups(prices, sold, 64)} className="ed-bars-phone" />
        <Bars bars={ladderGroups(prices, sold, 128)} className="ed-bars-wide" />
      </div>
      <div className="ed-ticks label ed-ticks-phone">{ladderTicks(size).map(tick)}</div>
      <div className="ed-ticks label ed-ticks-wide">{ladderTicks(size, true).map(tick)}</div>
      <ul className="ed-legend label">
        <li>
          <span className="ed-swatch ed-lb-minted" aria-hidden="true" />
          {EW.legendMinted}
        </li>
        {sold < size && (
          <li>
            <span className="ed-swatch ed-lb-next" aria-hidden="true" />
            {EW.legendNext(sold + 1)}
          </li>
        )}
        <li>
          <span className="ed-swatch ed-lb-waiting" aria-hidden="true" />
          {EW.legendWaiting}
        </li>
      </ul>
    </section>
  );
}
