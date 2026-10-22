import type { Metadata } from 'next';
import { VoiceTest } from './voice-test';
import './voice-test.css';

/**
 * /voice-test: the owner's phone test for voice conversion in the browser (owner, 2026-10-22: "test on my
 * iPhone (WebGPU support, speed, memory)"). FID 6786 only: sign-in is a bearer token kept on the device
 * (src/lib/client-auth.ts), so the page as served holds nothing, and what it runs comes from /api/voice-test,
 * which answers 404 to everyone else; the page then shows the site's "not found".
 * It converts a finished public line, never a recording: no microphone, and nothing is uploaded.
 */
export const metadata: Metadata = { title: 'Voice test', robots: { index: false, follow: false } };

export default function VoiceTestPage() {
  return <VoiceTest />;
}
