import { VOICE } from '../config';
import { isAdmin } from '../admins';

/**
 * The voice slice's switch (src/lib/config.ts VOICE). On Vercel only the committed values count. VOICE_TEST_ON=1 turns
 * the admin trial on for the local tests and screenshots, never on Vercel (VERCEL, or any VERCEL_ENV, turns it off).
 */
const onVercel = () => Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
export const voiceTestOn = () => !onVercel() && process.env.VOICE_TEST_ON === '1';

/** A tester (VOICE.testers, Nate 2026-11-24): the voice pages as an admin has them, and nothing else of an admin's. */
export const isVoiceTester = (fid: number) => VOICE.testers.includes(fid);
/** An admin or a tester: who gets the admins' voice pages, and whose takes and pictures the admins' pool pays for. */
export const voiceInsider = (fid: number) => isAdmin(fid) || isVoiceTester(fid);

/** Whether this person may use the voice pages and routes. */
export function voiceAllowed(fid: number | null): boolean {
  if (fid === null) return false;
  if (VOICE.open) return true;
  return (VOICE.adminTrial || voiceTestOn()) && voiceInsider(fid);
}

/**
 * The local screenshot run's sign-in (as src/lib/make/flag.ts): with VOICE_TEST_ON=1 and VOICE_TEST_FID set, never on
 * Vercel, the bearer token "voice-test-<fid>" counts as that FID on the /api/voice routes only.
 */
export function voiceTestPerson(request: Request): number | null {
  if (!voiceTestOn() || !process.env.VOICE_TEST_FID) return null;
  const m = (request.headers.get('authorization') ?? '').match(/^Bearer\s+voice-test-([1-9]\d*)$/i);
  return m && process.env.VOICE_TEST_FID.split(',').includes(m[1]) ? Number(m[1]) : null;
}

/** ElevenLabs' address: the real API, or a local stub (ELEVENLABS_BASE_URL), honoured only off Vercel. */
export function elevenLabsBase(): string {
  const stub = process.env.ELEVENLABS_BASE_URL;
  if (stub && !onVercel() && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(stub)) return stub;
  return 'https://api.elevenlabs.io';
}
