import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';
import { wordingSha256, type ConsentWording } from '../consent';

/**
 * The own-voice consent (config/consent-own-voice.json). The voice pages show `own-voice-v2`, the file's `draft`
 * (DRAFT wording, for Nate's reread); v1 is used by nothing (P1i). Agreeing once to the screen is recorded in
 * studio.contributor_consents (kind 'voice_recording', the wording's sha256); each conversion then needs its own tick
 * ("only if you agree for that recording"), carried by the convert request and kept in the accepted draft's recipe.
 */
export const OWN_VOICE = 'voice_recording';
export function voiceConsentWording(): ConsentWording {
  const f = JSON.parse(readFileSync(path.join(process.cwd(), 'config', 'consent-own-voice.json'), 'utf8')) as {
    draft?: string;
    current: string;
    versions: Record<string, { line: string; title: string; text: string[] }>;
  };
  const v = f.draft ?? f.current;
  const w = f.versions[v];
  return { version: v, ...w, sha256: wordingSha256(w) };
}
export async function hasVoiceConsent(sql: postgres.Sql, fid: number): Promise<boolean> {
  const [r] = await sql`select 1 from studio.contributor_consents where fid = ${fid} and kind = ${OWN_VOICE} and consent_text_sha256 = ${voiceConsentWording().sha256} limit 1`;
  return Boolean(r);
}
export async function recordVoiceConsent(sql: postgres.Sql, fid: number, shown: string): Promise<void> {
  const { sha256 } = voiceConsentWording();
  if (shown !== sha256) throw new Error('the wording changed; show the current wording again');
  if (await hasVoiceConsent(sql, fid)) return;
  await sql`insert into studio.contributor_consents (fid, kind, consent_text_sha256) values (${fid}, ${OWN_VOICE}, ${sha256})`;
}
