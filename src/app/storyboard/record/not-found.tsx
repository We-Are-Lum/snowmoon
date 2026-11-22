import NotFound from 'next/dist/client/components/builtin/not-found';
import { VoiceRecord } from '~/components/voice-record';

/** /storyboard/record: the site's usual "not found"; the voice page in its place for those the switch lets in. */
export default function RecordNotFound() {
  return <VoiceRecord fallback={<NotFound />} />;
}
