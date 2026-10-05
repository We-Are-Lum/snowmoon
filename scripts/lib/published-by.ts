/**
 * Who published a batch made by a script (principle 4's recorded path for the
 * maintainer): the maintainer's FID, the action, the script, the date, and the
 * evidence of the person's instruction (a prompt log in docs/prompts/). Scripts
 * refuse to publish without --evidence pointing at a file in the repo.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { SYSTEM_FID } from '../../src/lib/config';

export interface PublishedBy {
  fid: number;
  role: 'maintainer';
  action: 'published via script';
  script: string;
  date: string; // YYYY-MM-DD, UTC
  evidence: string;
}

export function publishedBy(root: string, script: string): PublishedBy {
  const evidence = process.argv.find((a) => a.startsWith('--evidence='))?.split('=')[1];
  if (!evidence) throw new Error('--evidence=<path in the repo> is required: the prompt log that records the instruction to publish');
  if (!existsSync(path.join(root, evidence))) throw new Error(`--evidence: ${evidence} does not exist in the repo`);
  return { fid: SYSTEM_FID, role: 'maintainer', action: 'published via script', script, date: new Date().toISOString().slice(0, 10), evidence };
}
