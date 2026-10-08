'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { blockUrl, castText, issueUrl, REPORT_CHANNEL, type ReportTarget } from '~/lib/report-pronunciation';

/**
 * "Report a mispronunciation": a GitHub issue link that, inside Farcaster, opens the cast
 * composer to /snowmoon instead. Nothing is stored here.
 */
export function ReportPronunciation({ target, className, children }: { target: ReportTarget; className?: string; children?: React.ReactNode }) {
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    sdk.isInMiniApp().then(setInApp).catch(() => setInApp(false));
  }, []);
  return (
    <a
      className={className}
      href={issueUrl(target)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (!inApp) return;
        e.preventDefault();
        sdk.actions.composeCast({ text: castText(target), embeds: [blockUrl(target)], channelKey: REPORT_CHANNEL }).catch(() => {
          window.open(issueUrl(target), '_blank', 'noopener');
        });
      }}
    >
      {children ?? 'Report a mispronunciation'}
    </a>
  );
}
