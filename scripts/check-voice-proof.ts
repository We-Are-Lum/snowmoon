/**
 * P1h on its own (DRAFT, 2026-11-20): the voice slice's take flow keeps no recording, and each planted violation is
 * caught (scripts/lib/voice-proof.ts). No ElevenLabs, no spending.   npm run check:voice-proof
 */
import path from 'node:path';
import { voiceProof, VOICE_PLANTS } from './lib/voice-proof';

const { real, missed } = await voiceProof(path.resolve(import.meta.dirname, '..'));
for (const p of real) console.log(`FAIL the real code: ${p}`);
for (const p of VOICE_PLANTS) console.log(`${missed.includes(p.name) ? 'FAIL missed' : 'ok   caught'}: ${p.name}`);
for (const m of missed.filter((m) => !VOICE_PLANTS.some((p) => p.name === m))) console.log(`FAIL ${m}`);
if (real.length || missed.length) process.exit(1);
console.log(`ok   the real code passes; ${VOICE_PLANTS.length} planted violations caught`);
