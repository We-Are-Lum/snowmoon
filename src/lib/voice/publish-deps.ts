import 'server-only';
import { VOICE } from '../config';
import { bylineName } from '../names';
import { voiceTestOn } from './flag';
import { deleteAudio, getAudio, putAudio } from './store';
import { deletePublic, getPublic, putPublic } from './public-store';
import type { PublishDeps } from './publish';
import type { ModerationDeps } from './moderation';

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

/** Moving a hidden storyboard's files between the public bucket and the private one (moderation). */
export function moderationDeps(): ModerationDeps {
  return { getPublic, putPublic, deletePublic, getPrivate: getAudio, putPrivate: putAudio, deletePrivate: deleteAudio };
}
