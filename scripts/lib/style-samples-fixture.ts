import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { OfferedStyle } from '../../src/lib/challenge/base-style';
import type { ReadySample } from './publish-style';

/**
 * Test pictures for publishing a style with its samples (scripts/test-publish-style.ts, scripts/test-model-choice.ts C19
 * and C24): small JPEGs made here, each with a whole recipe whose prompt carries the style's text, and a stand-in for the
 * site's storage that keeps what it was given. Nothing is uploaded anywhere.
 */
export async function samplesFor(style: OfferedStyle, n = 2, tag = 't'): Promise<ReadySample[]> {
  const out: ReadySample[] = [];
  for (let i = 0; i < n; i++) {
    const bytes = await sharp({ create: { width: 1024, height: 576, channels: 3, background: { r: (i * 70 + tag.length * 13) % 256, g: (style.title.length * 9) % 256, b: 120 } } }).jpeg().toBuffer();
    out.push({
      file: `/fixtures/${style.title.toLowerCase().replace(/\W+/g, '-')}-${tag}-${i}.jpg`,
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      recipe: {
        prompt: `Zei is the person in reference image 1, the main figure.\n\nStyle: ${style.text}\n\nNo text, no lettering, no signs with words.`,
        model: 'gemini-3.1-flash-image', endpoint: 'google/gemini-3.1-flash-image', host: 'Vercel AI Gateway',
        settings: { aspect_ratio: '16:9' }, seed: null, request_id: `gen_fixture_${tag}_${i}`, cost_usd: 0.0676, made_at: '2026-11-09T01:30:00.000Z', width: 1024, height: 576,
        references: [{ sha256: 'a'.repeat(64), what: "Zei's base front" }],
        checks: { prompt: { model: 'gpt-oss-safeguard-20b', verdict: 'ok' }, host_safety_checker: 'not run' },
        assist: { model: 'claude-coding-agent', drafted: ['sample prompt'], source: 'test fixture' },
      },
    });
  }
  return out;
}

/** The storage stand-in: records each put and answers a local address. */
export function fakeStore() {
  const puts: string[] = [];
  return { puts, put: async (sha256: string) => { puts.push(sha256); return `https://pictures.example/images/readers/${sha256.slice(0, 32)}.jpg`; } };
}
