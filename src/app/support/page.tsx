import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { SUPPORT } from '~/lib/config';
import { SUPPORT_WORDING as W } from '~/lib/support-wording';
import { SupportAddress, SupportSend } from '~/components/support';
import '../dashboard/you.css';

/**
 * "Support this site" (owner, 2026-10-30; simplified the same day: "only this, nothing else"). The title and one line,
 * the address (SUPPORT.address, the only place it lives) with a copy button and its QR code (drawn here, on our
 * server: no outside service), one warning line, then the send: network, token, amount, Send. A small Terms link
 * (§6c) at the end. Nothing is recorded. Not in the main menu.
 */
export const metadata: Metadata = { title: W.title, description: W.line };

export default async function Support() {
  const qr = await QRCode.toString(SUPPORT.address, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return (
    <main className="you support">
      <h1 className="you-title">{W.title}</h1>
      <p className="you-lede">{W.line}</p>
      <SupportAddress address={SUPPORT.address} />
      <div className="support-qr" role="img" aria-label={W.qrAlt(SUPPORT.address)} data-qr-of={SUPPORT.address} dangerouslySetInnerHTML={{ __html: qr }} />
      <p className="support-warning" role="note">{W.warning}</p>
      <SupportSend />
      <p className="support-terms">
        <a href="/terms">{W.terms}</a>
      </p>
    </main>
  );
}
