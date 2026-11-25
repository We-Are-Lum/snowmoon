import type { Metadata } from 'next';
import NotFound from 'next/dist/client/components/builtin/not-found';
import { EphelionSignIn } from '~/components/ephelion-sign-in';
import { VoiceRecord } from '~/components/voice-record';
import { learnMoreView } from '~/lib/challenge/learn-more-view';
import { EPHELION_LEARN_MORE } from '~/lib/voice/learn-more';

/**
 * /ephelion (was /storyboard/record, which redirects here; Nate 2026-11-24): the Ephelion voice slice. It answers 200
 * (Nate, 2026-11-25: so link previews and Farcaster casts load), and draws, in the browser:
 * - signed out: one line and the sign-in (EphelionSignIn);
 * - signed in and let in by the switch (admins and VOICE.testers; GET /api/voice/status answers 404 to everyone else):
 *   the challenge;
 * - signed in and not let in: the site's usual "not found" screen.
 * Its metadata (the miniapp embed, never indexed) is in ./layout.tsx.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function EphelionPage() {
  // "Learn more about Lord Ephelion" (Nate, 2026-11-22): the remix challenge's expander, with his own texts.
  const learn = learnMoreView('ephelion', 'Lord Ephelion', EPHELION_LEARN_MORE);
  return <VoiceRecord fallback={<NotFound />} signedOut={<EphelionSignIn />} learn={learn} />;
}
