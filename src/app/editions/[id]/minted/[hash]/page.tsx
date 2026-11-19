import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EDITIONS_TEST as T } from '~/lib/editions/config';
import { readEdition, readMint } from '~/lib/editions/chain';
import { catalogEntry, displayTitle } from '~/lib/editions/catalog';
import { formatEth, returned } from '~/lib/editions/ladder';
import { EW } from '~/lib/editions/wording';
import { RefreshWhilePending } from '~/components/editions/refresh-while-pending';
import { SharePiece } from '~/components/editions/share-piece';
import { EditionMediaView } from '../../../media';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Minted' };

/**
 * After a mint: read from the transaction itself (its Minted event and the value sent), so a refresh or a shared link
 * shows the same thing. The returned-cushion line appears only when money actually came back.
 */
export default async function Minted({ params }: { params: Promise<{ id: string; hash: string }> }) {
  const { id: idText, hash } = await params;
  const id = Number(idText);
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash) || !Number.isInteger(id)) notFound();
  const m = await readMint(hash as `0x${string}`).catch(() => ({ status: 'not-found' as const }));
  if (m.status === 'pending')
    return (
      <main className="ed-page">
        <RefreshWhilePending />
        <p className="ed-note" role="status">{EW.stillPending}</p>
        <p>
          <a href={`${T.explorer}/tx/${hash}`} rel="noopener noreferrer" target="_blank">{EW.viewTx}</a>
        </p>
      </main>
    );
  if (m.status !== 'ok' || m.id !== id)
    return (
      <main className="ed-page">
        <p className="ed-note" role="alert">{m.status === 'failed' ? EW.failed : EW.notFound}</p>
        <p>
          <Link href={`/editions/${id}`}>{EW.edition(id)}</Link>
        </p>
      </main>
    );
  const e = await readEdition(id).catch(() => null);
  if (!e) notFound();
  const c = catalogEntry(id);
  const title = displayTitle(c, EW.titlePlaceholder);
  const cost = BigInt(m.cost);
  const back = returned(BigInt(m.sent), cost);
  const nextN = e.sold + 1;
  return (
    <main className="ed-page ed-after" data-minted={m.firstPiece}>
      <figure className="ed-piece">
        <EditionMediaView media={c?.media ?? null} />
      </figure>
      <h1 className="ed-h1">{EW.yours(m.firstPiece, m.quantity)}</h1>
      <p className="label">{EW.ofEdition(id, title)}</p>
      <p data-paid={m.cost}>{EW.youPaid(cost)}</p>
      {back !== null && (
        <p className="ed-note" data-returned={back.toString()}>
          {EW.cameBack(back)}
        </p>
      )}
      <p>
        <a href={`${T.explorer}/tx/${hash}`} rel="noopener noreferrer" target="_blank">{EW.viewTx}</a>
      </p>

      <section className="ed-section" aria-labelledby="ed-went">
        <h2 id="ed-went" className="ed-h2">{EW.wentTo}</h2>
        <ul className="ed-split">
          {(c?.split ?? []).map((s, i) => (
            <li key={i}>
              <span className={s.name ? '' : 'ed-placeholder'}>{s.name ?? EW.recipientPlaceholder}</span>
              <span className="label">{s.share === null ? '[share]' : `${s.share}%`}</span>
            </li>
          ))}
        </ul>
        <p className="ed-note">
          <a href={T.splitsUrl(e.payout)} rel="noopener noreferrer" target="_blank">{EW.seeSplit}</a>
        </p>
      </section>

      <div className="ed-actions">
        {c?.storyUrl ? (
          <Link className="ic-primary ed-button" href={c.storyUrl}>
            {EW.seeInStory}
          </Link>
        ) : (
          <span className="ic-secondary ed-button ed-placeholder" aria-disabled="true">
            {EW.seeInStory} [link: Nate picks]
          </span>
        )}
        <SharePiece path={`/editions/${id}`} title={title} />
        <Link className="ic-secondary ed-button" href="/editions">
          {EW.allEditions}
        </Link>
      </div>

      {nextN <= e.size && e.prices.length > 0 && <p data-next-piece={nextN}>{EW.nextPieceIs(nextN, formatEth(BigInt(e.prices[nextN - 1])))}</p>}

      <p className="ed-feedback">
        {T.feedbackUrl ? (
          <a href={T.feedbackUrl} rel="noopener noreferrer" target="_blank">
            {EW.feedback}
          </a>
        ) : (
          <span className="ed-placeholder">{EW.feedbackComing}</span>
        )}
      </p>
    </main>
  );
}
