import 'server-only';
import { VOICE } from '../config';
import { bylineName } from '../names';
import { voiceTestOn } from './flag';
import { getAudio } from './store';
import { deletePublic, putPublic } from './public-store';
import type { PublishDeps } from './publish';

/** Publishing is on with Nate's word (VOICE.publish), or on a local test copy (VOICE_TEST_ON, never on Vercel). */
export const publishOn = () => VOICE.publish || voiceTestOn();

export function publishDeps(): PublishDeps {
  return {
    name: async (fid, proof) => (await bylineName(fid, proof).catch(() => ({ name: null }))).name,
    getPrivate: getAudio,
    putPublic,
    deletePublic,
    standInsAllowed: voiceTestOn(),
  };
}
