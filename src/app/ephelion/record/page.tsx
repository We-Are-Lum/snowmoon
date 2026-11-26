import type { Metadata } from 'next';
import NotFound from 'next/dist/client/components/builtin/not-found';
import { EphelionSignIn } from '~/components/ephelion-sign-in';
import { VoiceRecord } from '~/components/voice-record';

/**
 * /ephelion/record: "Record your own" (plan v3). Until the new four-step recorder lands (PR 2), this is today's voice
 * page, unchanged, moved here from /ephelion: the same gate (GET /api/voice/status answers 404 to anyone the voice
 * switch doesn't let in), the same sign-in line signed out.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function EphelionRecordPage() {
  return <VoiceRecord fallback={<NotFound />} signedOut={<EphelionSignIn />} />;
}
