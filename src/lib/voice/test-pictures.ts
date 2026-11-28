import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { voiceTestOn } from './flag';

/** The local tests' published pictures (VOICE_TEST_ON with VOICE_TEST_PICTURE_DIR only): a picture's bytes by its file name. */
export async function localPicture(url: string): Promise<Uint8Array | null> {
  const dir = process.env.VOICE_TEST_PICTURE_DIR;
  if (!voiceTestOn() || !dir) return null;
  try {
    return new Uint8Array(readFileSync(path.join(dir, path.basename(new URL(url, 'http://x').pathname))));
  } catch {
    return null;
  }
}
