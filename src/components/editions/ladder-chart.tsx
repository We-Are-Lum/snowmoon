'use client';

import { useMemo } from 'react';
import { formatEth, ladderBars, ladderTicks } from '~/lib/editions/ladder';
import { EW } from '~/lib/editions/wording';

/**
 * Every piece's price as a bar, to true scale (linear: the early pieces are short because they are cheap). Minted
 * pieces are solid, the next piece is solid in the link colour with a marker above it, waiting pieces are hollow: told
 * apart by fill and marker, not by colour alone. Prices are marked at a few pieces.
 */
export function LadderChart({ prices, sold }: { prices: string[]; sold: number }) {
  const p = useMemo(() => prices.map((x) => BigInt(x)), [prices]);
  const bars = ladderBars(p, sold);
  const size = p.length;
  const W = 1000;
  const H = 260;
  const top = 26; // room for the marker
  const gap = size > 64 ? 0.18 : 0.3;
  const bw = W / size;
  const ticks = ladderTicks(size);
  if (!size) return null;
  return (
    <section className="ed-ladder" aria-labelledby="ed-ladder-title">
      <h2 id="ed-ladder-title" className="ed-h2">{EW.ladderTitle}</h2>
      <p className="ed-ladder-line">{EW.ladderLine}</p>
      <svg viewBox={`0 0 ${W} ${H + top}`} preserveAspectRatio="none" role="img" aria-label={EW.ladderAlt(size, formatEth(p[0]), formatEth(p[size - 1]), sold)} className="ed-ladder-svg">
        {bars.map((b) => {
          const h = Math.max(b.height * H, 1.5);
          const x = (b.n - 1) * bw + (bw * gap) / 2;
          const w = bw * (1 - gap);
          const y = top + H - h;
          return (
            <rect
              key={b.n}
              x={x}
              y={y}
              width={w}
              height={h}
              className={`ed-bar ed-bar-${b.status}`}
              vectorEffect="non-scaling-stroke"
              data-status={b.status}
            />
          );
        })}
        {sold < size && (() => {
          const x = Math.min(W - 9, Math.max(9, (sold + 0.5) * bw));
          return <path d={`M ${x - 9} 4 L ${x + 9} 4 L ${x} 20 Z`} className="ed-marker" />;
        })()}
      </svg>
      <ol className="ed-ticks" aria-label="Prices at some pieces">
        {ticks.map((n) => (
          <li key={n} style={{ left: `${((n - 0.5) / size) * 100}%` }} data-piece={n}>
            <span className="label">#{n}</span>
            <span className="label">{formatEth(p[n - 1])}</span>
          </li>
        ))}
      </ol>
      <ul className="ed-legend">
        <li>
          <span className="ed-swatch ed-bar-minted" aria-hidden="true" /> {EW.legendMinted}
        </li>
        <li>
          <span className="ed-swatch ed-bar-next" aria-hidden="true" />▼ {EW.legendNext}
        </li>
        <li>
          <span className="ed-swatch ed-bar-waiting" aria-hidden="true" /> {EW.legendWaiting}
        </li>
      </ul>
    </section>
  );
}
