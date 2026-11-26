import type { Metadata } from 'next';
import NotFound from 'next/dist/client/components/builtin/not-found';
import { EphelionSignIn } from '~/components/ephelion-sign-in';
import { EphelionRecorder } from '~/components/ephelion-recorder';

/**
 * /ephelion/record: "Record your own", the four-step recorder (Nate, 2026-11-25 and 26; plan v3, PR 2). The same gate
 * as /ephelion (GET /api/voice/status answers 404 to anyone the voice switch doesn't let in), the same sign-in line
 * signed out. The site's rail, top bar and assistant panel are hidden here (src/components/app-shell.tsx, shell-bare).
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function EphelionRecordPage() {
  return <EphelionRecorder fallback={<NotFound />} signedOut={<EphelionSignIn />} />;
}
