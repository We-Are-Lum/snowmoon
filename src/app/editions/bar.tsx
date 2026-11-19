import Link from 'next/link';
import { EDITIONS_TEST as T } from '~/lib/editions/config';
import type { EditionView } from '~/lib/editions/chain';
import { nextOpening } from '~/lib/editions/ladder';
import { EW } from '~/lib/editions/wording';
import { Countdown } from '~/components/editions/countdown';

/** The next opening, and the number of the edition that opens: an edition on the contract with a future start, else
 *  the configured time for the edition after the last one. */
export function nextEdition(editions: EditionView[] | null): { at: number; no: number } | null {
  const now = Math.floor(Date.now() / 1000);
  const list = editions ?? [];
  const at = nextOpening(list.map((e) => e.startTime), T.nextOpening, now);
  if (at === null) return null;
  const onChain = list.find((e) => e.startTime === at);
  return { at, no: onChain ? onChain.id : list.length + 1 };
}

/** The mockups' bar: "Snowmoon Editions", and on the right what this page needs (a count, the countdown, a way back). */
export function EditionsBar({ right, next, wide = true }: { right?: React.ReactNode; next?: { at: number; no: number } | null; wide?: boolean }) {
  return (
    <header className="ed-bar">
      <Link href="/editions" className="ed-bar-name">
        {EW.collection}
      </Link>
      <nav className="ed-bar-right">
        {wide && (
          <Link href="/editions" className="ed-bar-all">
            {EW.allEditions}
          </Link>
        )}
        {right}
        {next && (
          <span className="label ed-bar-next" data-next-opening={next.at}>
            <span className="ed-bar-next-long">{EW.opensIn(next.no)} </span>
            <span className="ed-bar-next-short">{EW.nextIn} </span>
            <Countdown target={next.at} />
          </span>
        )}
      </nav>
    </header>
  );
}
