import Link from 'next/link';
import { notFound } from 'next/navigation';
import { appUrl } from '~/lib/config';
import { EDITIONS_TEST as T, editionsDeployed } from '~/lib/editions/config';
import { PAPER } from '~/lib/tokens';
import { readEdition, readEditions, readLive } from '~/lib/editions/chain';
import { catalogEntry, displayTitle } from '~/lib/editions/catalog';
import { formatEth } from '~/lib/editions/ladder';
import { EW, editionNo } from '~/lib/editions/wording';
import { EditionLive, MintCard } from '~/components/editions/edition-sale';
import { LadderChart } from '~/components/editions/ladder-chart';
import { EditionMediaView } from '../media';
import { EditionsBar, nextEdition } from '../bar';
import { MoneyRows } from '../money';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const c = catalogEntry(id);
  const url = `${appUrl()}/editions/${id}`;
  // A cast of this link opens this page inside the Farcaster app, where the Farcaster wallet is the wallet.
  const embed = JSON.stringify({
    version: '1',
    imageUrl: c?.media?.type === 'image' ? c.media.url : `${appUrl()}/embed.png`,
    button: { title: 'Open the test edition', action: { type: 'launch_frame', name: EW.collection, url, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER } },
  });
  return { title: displayTitle(c, EW.edition(id)), other: { 'fc:miniapp': embed, 'fc:frame': embed } };
}

/**
 * One edition, story first (mockups editions-mint-phone and -desktop): the piece, its label, title, story and credits,
 * the mint card, the price ladder, how it came to be, where the money goes, and earlier editions.
 */
export default async function EditionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  if (!editionsDeployed()) {
    return (
      <>
        <EditionsBar />
        <main className="ed-page">
          <p className="ed-note">{EW.notDeployed}</p>
        </main>
      </>
    );
  }
  const [e, live, all] = await Promise.all([readEdition(id), readLive(id), readEditions()]).catch(() => [null, null, []] as const);
  if (!e || !live) notFound();
  const c = catalogEntry(id);
  const title = displayTitle(c, EW.titlePlaceholder);
  const others = [...all].filter((o) => o.id !== id).reverse();
  const steps = [c?.earlier?.[0] ?? null, c?.earlier?.[1] ?? null];
  return (
    <>
      <EditionsBar next={nextEdition([...all])} />
      <EditionLive id={id} size={e.size} prices={e.prices} startTime={e.startTime} initial={{ sold: live.sold, lastMintAt: live.lastMintAt, now: live.now }}>
        <main className="ed-page ed-edition" data-edition={id}>
          <div className="ed-left">
            <figure className="ed-piece">
              <EditionMediaView media={c?.media ?? null} label="THE PIECE" />
            </figure>
            <section className="ed-came" id="recipe" aria-labelledby="ed-came">
              <h2 id="ed-came" className="ed-h2">{EW.cameToBe}</h2>
              <div className="ed-steps">
                {steps.map((v, i) =>
                  v ? (
                    <a key={i} href={v.recipeUrl ?? v.url} className="ed-step-tile">
                      {v.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.image} alt="" className="ed-tile" />
                      ) : null}
                      <span className="label">{v.title}</span>
                    </a>
                  ) : (
                    <span key={i} className="ed-step-tile ed-step-empty">
                      <span className="label">{EW.steps[i]}</span>
                    </span>
                  ),
                )}
                <span className="ed-step-tile ed-step-this">
                  <EditionMediaView media={c?.media ?? null} tile />
                  <span className="label">{EW.steps[2]}</span>
                </span>
              </div>
              <p className="ed-came-line">{EW.cameToBeLine}</p>
            </section>
          </div>

          <div className="ed-aside">
            <header className="ed-head">
              <span className="label ed-kicker">{[`Edition ${editionNo(id)}`, ...(c?.label ? c.label.split('·').map((x) => x.trim()) : [])].join(' · ')}</span>
              <h1 className="ed-h1">{title}</h1>
              <p className={c?.story ? 'ed-story' : 'ed-story ed-placeholder'}>{c?.story ?? EW.storyPlaceholder}</p>
              <p className="ed-credits">
                {EW.credits(c?.madeBy ?? EW.madeByPlaceholder, c?.builtOn ?? EW.builtOnPlaceholder)}{' '}
                <a href={c?.recipeUrl ?? '#recipe'}>{EW.howMade}</a>
              </p>
            </header>
            <MintCard />
            <section className="ed-money" aria-labelledby="ed-money">
              <h2 id="ed-money" className="ed-h2">{EW.money}</h2>
              <MoneyRows c={c} />
              <p className="ed-money-line">
                {EW.moneyFixed}{' '}
                <a href={T.splitsUrl(e.payout)} rel="noopener noreferrer" target="_blank" data-split={e.payout}>
                  {EW.seeSplit}
                </a>
              </p>
            </section>
          </div>

          <div className="ed-wide">
            <LadderChart />
          </div>

          {others.length > 0 && (
            <section className="ed-earlier" aria-labelledby="ed-others">
              <div className="ed-earlier-head">
                <h2 id="ed-others" className="ed-h2">{EW.earlier}</h2>
                <Link href="/editions">{EW.allEditions}</Link>
              </div>
              <ul className="ed-strip">
                {others.map((o) => {
                  const oc = catalogEntry(o.id);
                  return (
                    <li key={o.id}>
                      <Link href={`/editions/${o.id}`}>
                        <EditionMediaView media={oc?.media ?? null} tile label={oc?.media?.type ?? ''} />
                        <span className="label">{EW.edition(o.id)}</span>
                        <span className="ed-strip-title">{displayTitle(oc, EW.titlePlaceholder)}</span>
                        <span className="label">
                          {EW.minted(o.sold, o.size)}
                          <span className="ed-strip-next">{o.sold < o.size ? ` · next ${formatEth(BigInt(o.prices[o.sold]))} ETH` : ''}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </main>
      </EditionLive>
    </>
  );
}
