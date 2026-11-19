import Link from 'next/link';
import { editionsDeployed } from '~/lib/editions/config';
import { readEditions } from '~/lib/editions/chain';
import { catalogEntry, displayTitle, kindOf } from '~/lib/editions/catalog';
import { formatEth } from '~/lib/editions/ladder';
import { EW, editionNo } from '~/lib/editions/wording';
import { Countdown } from '~/components/editions/countdown';
import { EditionMediaView } from './media';
import { EditionsBar, nextEdition } from './bar';

export const dynamic = 'force-dynamic';
export const metadata = { title: EW.title };

/** The Editions list (mockup editions-list-phone): the next opening, then every edition, newest first. */
export default async function EditionsList() {
  const editions = await readEditions().catch(() => null);
  const next = nextEdition(editions);
  const newestFirst = [...(editions ?? [])].reverse();
  return (
    <>
      <EditionsBar wide={false} right={<span className="label">{EW.soFar(editions?.length ?? 0)}</span>} />
      <main className="ed-page ed-list">
        <h1 className="ed-h1">{EW.title}</h1>
        {EW.listLede.map((l) => (
          <p key={l} className="ed-lede">
            {l}
          </p>
        ))}
        {next && (
          <section className="ed-next" aria-label={EW.opensIn(next.no)}>
            <span className="label ed-next-label">{EW.opensIn(next.no)}</span>
            <span className="ed-next-time">
              <Countdown target={next.at} />
            </span>
            <span className="ed-next-row">
              <span className="ed-placeholder ed-next-what">{EW.nextPiecePlaceholder}</span>
              <button type="button" className="ed-remind" disabled aria-describedby="ed-remind-note">
                {EW.remindMe}
              </button>
            </span>
            <span id="ed-remind-note" className="label ed-next-note">
              {EW.remindNote}
            </span>
          </section>
        )}
        {!editionsDeployed() || editions === null ? (
          <p className="ed-note">{EW.notDeployed}</p>
        ) : newestFirst.length === 0 ? (
          <p className="ed-note">{EW.noneYet}</p>
        ) : (
          <div className="ed-items">
            {newestFirst.map((e) => {
              const c = catalogEntry(e.id);
              const kind = kindOf(c);
              const pct = Math.round((e.sold / e.size) * 100);
              return (
                <article key={e.id} className="ed-item" data-edition={e.id}>
                  <Link href={`/editions/${e.id}`} className="ed-item-media" aria-label={`${EW.edition(e.id)}: ${displayTitle(c, EW.titlePlaceholder)}`}>
                    <EditionMediaView media={c?.media ?? null} tile label={c?.media?.type.toUpperCase()} />
                  </Link>
                  <span className="label ed-kicker">{[`Edition ${editionNo(e.id)}`, kind].filter(Boolean).join(' · ')}</span>
                  <h2 className="ed-item-title">
                    <Link href={`/editions/${e.id}`}>{displayTitle(c, EW.titlePlaceholder)}</Link>
                  </h2>
                  <p className={c?.line ? 'ed-item-line' : 'ed-item-line ed-placeholder'}>{c?.line ?? EW.linePlaceholder}</p>
                  <span className="ed-progress" aria-hidden="true">
                    <span style={{ width: `${pct}%` }} />
                  </span>
                  <span className="label ed-item-meta">
                    <span>{EW.minted(e.sold, e.size)}</span>
                    <span className="ed-item-next">{e.sold < e.size ? EW.nextAt(formatEth(BigInt(e.prices[e.sold]))) : EW.soldOut}</span>
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
