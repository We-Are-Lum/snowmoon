import 'server-only';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { db } from './db';

/**
 * Consent to publish one's own words (prompts, lines). Asked once, before the
 * first contribution that stores a person's own words; recorded with the hash
 * of the exact wording shown (config/consent.json), so the record says what
 * was agreed to. Append-only: a new wording asks again.
 */
export interface ConsentWording {
  version: string;
  line: string;
  title: string;
  text: string[];
  sha256: string;
}

export const OWN_WORDS = 'own_words';

function sql() {
  const s = db();
  if (!s) throw new Error('no database configured');
  return s;
}

export function consentWording(version?: string): ConsentWording {
  const file = JSON.parse(readFileSync(path.join(process.cwd(), 'config', 'consent.json'), 'utf8')) as {
    current: string;
    versions: Record<string, { line: string; title: string; text: string[] }>;
  };
  const v = version ?? file.current;
  const w = file.versions[v];
  if (!w) throw new Error(`no consent wording ${v}`);
  return { version: v, ...w, sha256: wordingSha256(w) };
}

/** The hash covers exactly what the screen shows: the line, the title and each paragraph. */
export function wordingSha256(w: { line: string; title: string; text: string[] }): string {
  return createHash('sha256').update(JSON.stringify([w.line, w.title, ...w.text])).digest('hex');
}

/** Has this person agreed to the current wording? */
export async function hasConsented(fid: number): Promise<boolean> {
  const { sha256 } = consentWording();
  const [row] = await sql()`
    select 1 from studio.contributor_consents
    where fid = ${fid} and kind = ${OWN_WORDS} and consent_text_sha256 = ${sha256}
    limit 1`;
  return !!row;
}

/** Record agreement to the wording the person was shown; refuses a stale wording. */
export async function recordConsent(fid: number, shownSha256: string): Promise<void> {
  const { sha256 } = consentWording();
  if (shownSha256 !== sha256) throw new Error('the wording changed; show the current wording again');
  if (await hasConsented(fid)) return;
  const s = sql();
  await s`insert into studio.contributor_consents ${s({ fid, kind: OWN_WORDS, consent_text_sha256: sha256 })}`;
}
