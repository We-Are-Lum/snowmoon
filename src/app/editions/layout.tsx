import type { Metadata } from 'next';
import { EDITIONS_TEST as T } from '~/lib/editions/config';
import { readEditions } from '~/lib/editions/chain';
import { nextOpening } from '~/lib/editions/ladder';
import { EW } from '~/lib/editions/wording';
import { Countdown } from '~/components/editions/countdown';
import '../../styles/editions.css';

/**
 * Snowmoon Editions test pages on Sepolia (handoff 18 Nov 2026). Unlisted: linked from nowhere, noindex. Every page
 * opens with the test banner, then the countdown to the next opening when one is scheduled.
 */
export const metadata: Metadata = { title: { default: EW.title, template: `%s · ${EW.title}` }, robots: { index: false, follow: false } };

export default async function EditionsLayout({ children }: { children: React.ReactNode }) {
  const now = Math.floor(Date.now() / 1000);
  const starts = await readEditions().then((es) => es.map((e) => e.startTime), () => [] as number[]);
  const next = nextOpening(starts, T.nextOpening, now);
  return (
    <div className="editions">
      <p className="ed-banner" role="note" data-test-banner>
        {EW.banner}
      </p>
      {next !== null && (
        <p className="ed-topbar label" data-next-opening={next}>
          {EW.nextEdition} · {EW.opensIn('')}
          <Countdown target={next} />
        </p>
      )}
      {children}
    </div>
  );
}
