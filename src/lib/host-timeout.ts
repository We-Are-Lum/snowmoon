/**
 * A Farcaster host call with a time limit (Nate, 2026-11-21: in one host, sdk.context or sdk.getCapabilities() never
 * answered, and the microphone test's Record stayed disabled). Never block the page on a host check: race it, and treat
 * no answer as "unknown". Pure: safe in the browser.
 */
export type Raced<T> = { ok: true; value: T } | { ok: false; why: 'timeout' | 'error'; error?: string };

export async function withTimeout<T>(p: Promise<T> | (() => Promise<T>), ms: number): Promise<Raced<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = typeof p === 'function' ? p() : p;
    return await Promise.race([
      run.then((value) => ({ ok: true as const, value })),
      new Promise<Raced<T>>((res) => (timer = setTimeout(() => res({ ok: false, why: 'timeout' }), ms))),
    ]);
  } catch (e) {
    return { ok: false, why: 'error', error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** How long a host check may take before it is "unknown" (the page goes on without it). */
export const HOST_CHECK_MS = 2000;
/** How long the Farcaster app's own microphone prompt may take before getUserMedia is tried anyway. */
export const HOST_PROMPT_MS = 10_000;
