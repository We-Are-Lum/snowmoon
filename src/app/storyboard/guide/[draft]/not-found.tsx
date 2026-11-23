import NotFound from 'next/dist/client/components/builtin/not-found';
import { VoiceGuide } from '~/components/voice-guide';

/** The site's usual "not found"; the guided storyboard in its place for the draft's own person. */
export default function GuideNotFound() {
  return <VoiceGuide fallback={<NotFound />} />;
}
