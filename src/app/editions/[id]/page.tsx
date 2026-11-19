import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EDITIONS_TEST as T, editionsDeployed } from '~/lib/editions/config';
import { readEdition, readEditions, readLive } from '~/lib/editions/chain';
import { catalogEntry, displayTitle } from '~/lib/editions/catalog';
import { formatEth } from '~/lib/editions/ladder';
import { EW } from '~/lib/editions/wording';
import { EditionSale } from '~/components/editions/edition-sale';
import { EditionMediaView } from '../media';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  return { title: displayTitle(catalogEntry(id), EW.edition(id)) };
}

/** A placeholder for the owner's own words, shown as written. */
const Owner = ({ text, placeholder, as: Tag = 'span' }: { text: string | null; placeholder: string; as?: 'span' | 'p' }) =>
  text ? <Tag>{text}</Tag> : <Tag className="ed-placeholder">{placeholder}</Tag>;

/**
 * One edition, story first: the piece, its label, title and story, then the mint card and the ladder, how it came to
 * be, where the money goes, and earlier editions.
 */
export default async function EditionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  if (!editionsDeployed()) {
    return (
      <main className="ed-page">
        <p className="ed-note">{EW.notDeployed}</p>
      </main>
    );
  }
  const [e, live, all] = await Promise.all([readEdition(id), readLive(id), readEditions()]).catch(() => [null, null, []] as const);
  if (!e || !live || !e.ours) notFound();
  const c = catalogEntry(id);
  const title = displayTitle(c, EW.titlePlaceholder);
  const others = [...all].filter((o) => o.id !== id).reverse();
  return (
    <main className="ed-page ed-edition" data-edition={id}>
      <div className="ed-story">
      <figure className="ed-piece">
        <EditionMediaView media={c?.media ?? null} />
      </figure>

      <header className="ed-head">
        <p className="label ed-kicker">
          {[EW.edition(id), c?.label].filter(Boolean).join(' · ')}
        </p>
        <h1 className="ed-h1">{title}</h1>
        <Owner as="p" text={c?.story ?? null} placeholder={EW.storyPlaceholder} />
        <dl className="ed-credits">
          <div>
            <dt className="label">{EW.madeBy}</dt>
            <dd>
              <Owner text={c?.madeBy ?? null} placeholder={EW.madeByPlaceholder} />
            </dd>
          </div>
          <div>
            <dt className="label">{EW.builtOn}</dt>
            <dd>
              <Owner text={c?.builtOn ?? null} placeholder={EW.builtOnPlaceholder} />
            </dd>
          </div>
        </dl>
        {c?.recipeUrl ? (
          <p>
            <a href={c.recipeUrl}>{EW.howMade}</a>
          </p>
        ) : (
          <p className="ed-placeholder">[{EW.howMade}: link to the recipe]</p>
        )}
      </header>
      </div>

      <div className="ed-sale">
        <EditionSale id={id} size={e.size} prices={e.prices} startTime={e.startTime} initial={{ sold: live.sold, lastMintAt: live.lastMintAt, now: live.now }} />
      </div>

      <div className="ed-more">
      <section className="ed-section" aria-labelledby="ed-came">
        <h2 id="ed-came" className="ed-h2">{EW.cameToBe}</h2>
        <ul className="ed-earlier-versions">
          {(c?.earlier ?? [null]).map((v, i) =>
            v ? (
              <li key={i}>
                <a href={v.url}>{v.title}</a>
                {v.recipeUrl && (
                  <>
                    {' · '}
                    <a href={v.recipeUrl}>Recipe</a>
                  </>
                )}
              </li>
            ) : (
              <li key={i} className="ed-placeholder">
                {EW.earlierPlaceholder}
              </li>
            ),
          )}
        </ul>
        <p>{EW.staysOpen}</p>
      </section>

      <section className="ed-section" aria-labelledby="ed-money">
        <h2 id="ed-money" className="ed-h2">{EW.money}</h2>
        <ul className="ed-split">
          {(c?.split ?? []).map((s, i) => (
            <li key={i}>
              <span className={s.name ? '' : 'ed-placeholder'}>{s.name ?? EW.recipientPlaceholder}</span>
              <span className="label">{s.share === null ? '[share]' : `${s.share}%`}</span>
            </li>
          ))}
        </ul>
        <p className="ed-note">
          {EW.moneyFixed}{' '}
          <a href={T.splitsUrl(e.payout)} rel="noopener noreferrer" target="_blank" data-split={e.payout}>
            {EW.seeSplit}
          </a>
        </p>
      </section>

      {others.length > 0 && (
        <section className="ed-section" aria-labelledby="ed-others">
          <h2 id="ed-others" className="ed-h2">{EW.earlier}</h2>
          <ul className="ed-strip">
            {others.map((o) => {
              const oc = catalogEntry(o.id);
              return (
                <li key={o.id}>
                  <Link href={`/editions/${o.id}`}>
                    <EditionMediaView media={oc?.media ?? null} compact />
                    <span className="label">{EW.edition(o.id)}</span>
                    <span className="ed-strip-title">{displayTitle(oc, EW.titlePlaceholder)}</span>
                    <span className="label">{EW.minted(o.sold, o.size)}{o.sold < o.size && o.prices.length ? ` · ${formatEth(BigInt(o.prices[o.sold]))} ETH` : ''}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p>
            <Link href="/editions">{EW.allEditions} →</Link>
          </p>
        </section>
      )}
      </div>
    </main>
  );
}
