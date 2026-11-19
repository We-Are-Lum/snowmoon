import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EDITIONS_TEST as T } from '~/lib/editions/config';
import { readEdition, readMint } from '~/lib/editions/chain';
import { catalogEntry, displayTitle, kindOf } from '~/lib/editions/catalog';
import { formatEth, returned } from '~/lib/editions/ladder';
import { EW } from '~/lib/editions/wording';
import { RefreshWhilePending } from '~/components/editions/refresh-while-pending';
import { SharePiece } from '~/components/editions/share-piece';
import { EditionMediaView } from '../../../media';
import { EditionsBar } from '../../../bar';
import { splitRows } from '../../../money';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Minted' };

/**
 * After a mint (mockup editions-after-mint-phone), read from the transaction itself, so a refresh or a shared link
 * shows the same thing. The returned-cushion row appears only when money actually came back.
 */
export default async function Minted({ params }: { params: Promise<{ id: string; hash: string }> }) {
  const { id: idText, hash } = await params;
  const id = Number(idText);
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash) || !Number.isInteger(id)) notFound();
  const back = (
    <Link href={`/editions/${id}`} className="ed-bar-back">
      {EW.back}
    </Link>
  );
  const m = await readMint(hash as `0x${string}`).catch(() => ({ status: 'not-found' as const }));
  if (m.status === 'pending')
    return (
      <>
        <EditionsBar wide={false} right={back} />
        <main className="ed-page">
          <RefreshWhilePending />
          <p className="ed-note" role="status">{EW.stillPending}</p>
          <p>
            <a href={`${T.explorer}/tx/${hash}`} rel="noopener noreferrer" target="_blank">{EW.viewTx}</a>
          </p>
        </main>
      </>
    );
  if (m.status !== 'ok' || m.id !== id)
    return (
      <>
        <EditionsBar wide={false} right={back} />
        <main className="ed-page">
          <p className="ed-note" role="alert">{m.status === 'failed' ? EW.failed : EW.notFound}</p>
        </main>
      </>
    );
  const e = await readEdition(id).catch(() => null);
  if (!e) notFound();
  const c = catalogEntry(id);
  const title = displayTitle(c, EW.titlePlaceholder);
  const cost = BigInt(m.cost);
  const cushion = returned(BigInt(m.sent), cost);
  const nextN = e.sold + 1;
  const kind = (kindOf(c) || 'piece').toLowerCase();
  return (
    <>
      <EditionsBar wide={false} right={back} />
      <main className="ed-page ed-after" data-minted={m.firstPiece}>
        <section className="ed-after-head">
          <span className="ed-after-thumb">
            <EditionMediaView media={c?.media ?? null} tile label="THE PIECE" />
          </span>
          <span className="ed-after-title">
            <span className="label">{EW.edition(id)}</span>
            <h1 className="ed-h1">{EW.yours(m.firstPiece, m.quantity)}</h1>
            <span className="ed-after-name">{title}</span>
          </span>
        </section>
        <p className="ed-lede">{EW.inTheRecord(kind)}</p>

        <section className="ed-receipt">
          <p className="ed-receipt-row" data-paid={m.cost}>
            <span>{EW.youPaid}</span>
            <span className="ed-mono">{formatEth(cost)} ETH</span>
          </p>
          {cushion !== null && (
            <p className="ed-receipt-row ed-receipt-back" data-returned={cushion.toString()}>
              <span>{EW.cameBack}</span>
              <span className="ed-mono">{formatEth(cushion)} ETH</span>
            </p>
          )}
          <a href={`${T.explorer}/tx/${hash}`} rel="noopener noreferrer" target="_blank">
            {EW.viewTx}
          </a>
        </section>

        <section className="ed-went" aria-labelledby="ed-went">
          <h2 id="ed-went" className="ed-h2">{EW.wentTo(cost)}</h2>
          <ul className="ed-split">
            {splitRows(c).map((s, i) => (
              <li key={i}>
                <span className={s.name ? '' : 'ed-placeholder'}>{s.name ?? EW.recipientPlaceholder}</span>
                <span className="ed-split-share">{s.share === null ? '[share]' : `${s.share}%`}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="ed-actions">
          {c?.storyUrl ? (
            <Link className="ed-button ed-button-primary" href={c.storyUrl}>
              {EW.seeInStory(c.storyName)}
            </Link>
          ) : (
            <span className="ed-button ed-button-primary ed-button-off" aria-disabled="true">
              {EW.seeInStory(c?.storyName ?? null)} <span className="ed-placeholder">[link: Nate picks]</span>
            </span>
          )}
          <SharePiece path={`/editions/${id}`} title={title} />
          <Link className="ed-button ed-button-plain" href="/editions">
            {EW.allEditions}
          </Link>
        </div>

        <p className="ed-feedback">
          {T.feedbackUrl ? (
            <a href={T.feedbackUrl} rel="noopener noreferrer" target="_blank">
              {EW.feedback}
            </a>
          ) : (
            <span className="ed-placeholder">{EW.feedbackComing}</span>
          )}
        </p>
        {nextN <= e.size && (
          <p className="ed-after-next" data-next-piece={nextN}>
            {EW.nextPieceIs(nextN, formatEth(BigInt(e.prices[nextN - 1])))}
          </p>
        )}
      </main>
    </>
  );
}
