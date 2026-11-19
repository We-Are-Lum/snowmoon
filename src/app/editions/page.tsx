import Link from 'next/link';
import { EDITIONS_TEST as T, editionsDeployed } from '~/lib/editions/config';
import { readEditions } from '~/lib/editions/chain';
import { catalogEntry, displayTitle } from '~/lib/editions/catalog';
import { formatEth, nextOpening } from '~/lib/editions/ladder';
import { EW } from '~/lib/editions/wording';
import { Countdown } from '~/components/editions/countdown';
import { EditionMediaView } from './media';

export const dynamic = 'force-dynamic';
export const metadata = { title: EW.title };

/** The Editions list: every edition, newest first, and the next opening. */
export default async function EditionsList() {
  const editions = await readEditions().catch(() => null);
  const now = Math.floor(Date.now() / 1000);
  const next = nextOpening((editions ?? []).map((e) => e.startTime), T.nextOpening, now);
  const newestFirst = [...(editions ?? [])].reverse();
  return (
    <main className="ed-page ed-list">
      <h1 className="ed-h1">{EW.title}</h1>
      {EW.listLede.map((l) => (
        <p key={l} className="ed-lede">
          {l}
        </p>
      ))}
      {next !== null && (
        <section className="ed-next" aria-label={EW.nextEdition}>
          <p className="label">{EW.nextEdition}</p>
          <p className="ed-next-time">
            {EW.opensIn('')}
            <Countdown target={next} />
          </p>
          <button type="button" className="ic-secondary" disabled aria-describedby="ed-remind-note">
            {EW.remindMe}
          </button>
          <p id="ed-remind-note" className="ed-note">
            {EW.remindNote}
          </p>
        </section>
      )}
      {!editionsDeployed() || editions === null ? (
        <p className="ed-note">{EW.notDeployed}</p>
      ) : newestFirst.length === 0 ? (
        <p className="ed-note">{EW.noneYet}</p>
      ) : (
        <ol className="ed-items">
          {newestFirst.map((e) => {
            const c = catalogEntry(e.id);
            const title = displayTitle(c, EW.titlePlaceholder);
            return (
              <li key={e.id} className="ed-item" data-edition={e.id}>
                <Link href={`/editions/${e.id}`} className="ed-item-link">
                  <EditionMediaView media={c?.media ?? null} compact />
                  <span className="ed-item-text">
                    <span className="label">
                      {[EW.edition(e.id), c?.label].filter(Boolean).join(' · ')}
                    </span>
                    <span className="ed-item-title">{title}</span>
                    <span className={c?.line ? 'ed-item-line' : 'ed-item-line ed-placeholder'}>{c?.line ?? EW.linePlaceholder}</span>
                    <span className="label ed-item-meta">
                      {EW.minted(e.sold, e.size)}
                      {e.sold < e.size && e.prices.length ? ` · ${EW.nextPrice.toLowerCase()} ${formatEth(BigInt(e.prices[e.sold]))} ETH` : ` · ${EW.soldOut.toLowerCase()}`}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
