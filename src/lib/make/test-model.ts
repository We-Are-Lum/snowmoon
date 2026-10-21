import type { Complete } from '../chat/ask';

/**
 * A stand-in model for the local tests of "Make your own" only (MAKE_TEST_FAKES=1, never on Vercel). It answers the
 * coach with a note, or, when the person's message contains TEST-WRITES, with a written line (so the checks must
 * catch it); the guard answers OK unless the reply contains a line. Nothing it makes costs anything.
 */
export function fakeComplete(): Complete | null {
  if (process.env.VERCEL || process.env.MAKE_TEST_FAKES !== '1') return null;
  return async (model, messages) => {
    const last = messages[messages.length - 1]?.content ?? '';
    const sys = messages[0]?.content ?? '';
    const base = { promptTokens: 10, completionTokens: 10, costUsd: 0, requestId: null, provider: 'test', model };
    if (sys.includes('You check one reply from a story coach')) {
      return { ...base, text: /ZEI:|"[^"]{12,}"/.test(last) ? 'VIOLATION writes a line' : 'OK notes only' };
    }
    if (last.includes('TEST-WRITES') || (last.includes('was not shown') && messages.some((m) => m.content.includes('TEST-WRITES-TWICE')))) {
      return { ...base, text: 'Here you go:\nZEI: "I never wanted to win like this."' };
    }
    if (last.includes('was not shown')) return { ...base, text: "I don't write lines for you. What does she want him to hear, and what does she hide?" };
    return { ...base, text: 'What does she want in this moment, and what would it cost her to say it? A close-up would let us read it on her face.' };
  };
}
