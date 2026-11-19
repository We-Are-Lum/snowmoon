import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EDITIONS_TEST as T, editionsPagesOn } from '~/lib/editions/config';
import { EW } from '~/lib/editions/wording';
import '../../styles/editions.css';

/**
 * Snowmoon Editions test pages on Sepolia (handoff 18 Nov 2026; layout and words from the mockups made with Nate).
 * Unlisted: linked from nowhere, noindex. Every page opens with the test banner and ends with the affiliation line.
 */
export const metadata: Metadata = { title: { default: EW.title, template: `%s · ${EW.collection}` }, robots: { index: false, follow: false } };

export default function EditionsLayout({ children }: { children: React.ReactNode }) {
  if (!editionsPagesOn()) notFound();
  return (
    <div className="editions">
      <p className="ed-banner" role="note" data-test-banner>
        {EW.banner}
      </p>
      {children}
      <footer className="ed-footer">
        {EW.footer}{' '}
        {T.editions && (
          <a href={`${T.explorer}/address/${T.editions}`} rel="noopener noreferrer" target="_blank">
            {EW.contract}
          </a>
        )}
      </footer>
    </div>
  );
}
