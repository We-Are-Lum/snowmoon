import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { SUPPORT } from '~/lib/config';
import { SUPPORT_WORDING as W } from '~/lib/support-wording';
import { SupportAddress, SupportSend } from '~/components/support';
import '../you/you.css';

/**
 * "Support this site" (owner, 2026-10-30; branch support-page). The address (SUPPORT.address, the only place it lives),
 * its QR code (drawn here, on our server, from that constant: no outside service), a copy button, the networks it lives
 * on and a warning about any other, a link to the Split on Splits, one line on what it pays for, and "Send with your
 * wallet" on Base. Nothing is recorded. Linked from About and the footer line, not the main menu.
 */
export const metadata: Metadata = { title: 'Support this site', description: W.paysFor };

export default async function Support() {
  const qr = await QRCode.toString(SUPPORT.address, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return (
    <main className="you support" data-wording="draft">
      <p className="you-kicker label">{W.link}</p>
      <h1 className="you-title">{W.title}</h1>
      <p className="you-lede">{W.paysFor}</p>
      <section className="you-section" aria-labelledby="s-address">
        <h2 id="s-address">{W.address}</h2>
        <div className="support-qr" role="img" aria-label={W.qrAlt(SUPPORT.address)} data-qr-of={SUPPORT.address} dangerouslySetInnerHTML={{ __html: qr }} />
        <SupportAddress address={SUPPORT.address} />
      </section>
      <section className="you-section" aria-labelledby="s-networks">
        <h2 id="s-networks">{W.networksHead}</h2>
        <p>{W.networksLine(SUPPORT.networks.map((n) => n.name))}</p>
        <p className="support-warning" role="note">{W.warning}</p>
      </section>
      <section className="you-section" aria-labelledby="s-where">
        <h2 id="s-where">{W.whereHead}</h2>
        <p>
          {W.where}{' '}
          {SUPPORT.networks.map((n, i) => (
            <span key={n.chainId}>
              {i > 0 && ' · '}
              <a href={SUPPORT.splitsUrl(n.chainId)} rel="noopener noreferrer">{W.splitOn(n.name)}</a>
            </span>
          ))}
        </p>
        <p className="you-note">{W.gift}</p>
      </section>
      <section className="you-section" aria-labelledby="s-send">
        <h2 id="s-send">{W.sendHead}</h2>
        <SupportSend />
      </section>
      <p className="you-note">{W.recorded}</p>
      <p className="as-draft">Draft wording</p>
    </main>
  );
}
