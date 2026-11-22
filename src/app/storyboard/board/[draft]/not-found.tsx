import NotFound from 'next/dist/client/components/builtin/not-found';
import { VoiceBoard } from '~/components/voice-board';

/** The site's usual "not found"; the storyboard in its place for the draft's own person. */
export default function BoardNotFound() {
  return <VoiceBoard fallback={<NotFound />} />;
}
