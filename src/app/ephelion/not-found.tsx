import NotFound from 'next/dist/client/components/builtin/not-found';
import { EphelionSignIn } from '~/components/ephelion-sign-in';
import { VoiceRecord } from '~/components/voice-record';
import { learnMoreView } from '~/lib/challenge/learn-more-view';
import { EPHELION_LEARN_MORE } from '~/lib/voice/learn-more';

/** /ephelion (was /storyboard/record): the site's usual "not found"; the voice page in its place for those the switch lets in. */
export default function EphelionNotFound() {
  // "Learn more about Lord Ephelion" (Nate, 2026-11-22): the remix challenge's expander, with his own texts.
  const learn = learnMoreView('ephelion', 'Lord Ephelion', EPHELION_LEARN_MORE);
  return <VoiceRecord fallback={<NotFound />} signedOut={<EphelionSignIn />} learn={learn} />;
}
