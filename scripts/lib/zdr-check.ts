/**
 * Per-reply zero-retention check for the planning coach's comparison eval (owner, 2026-10-11:
 * "any reply without the ZDR flag and the pinned provider fails").
 *
 * scripts/lib/batch-model.ts stays byte for byte with site-guides, so this does not change the call
 * path: it watches the one gateway reply that completeViaGateway reads, and refuses the result unless
 * the gateway's own metadata says zero retention was enabled, every attempt supported it, and every
 * attempt went to the pinned provider. A refused reply is never used and never retried.
 */
export class ZdrRefused extends Error {}

type Gateway = {
  enabledZeroDataRetention?: boolean;
  routing?: {
    finalProvider?: string;
    planningReasoning?: string;
    modelAttempts?: { providerAttempts?: { provider?: string; success?: boolean }[] }[];
  };
};

/** Why a reply's gateway metadata fails the rule, or null when it passes. */
export function zdrProblem(gw: Gateway | undefined, pinned: string): string | null {
  if (!gw) return 'no gateway metadata on the reply';
  if (gw.enabledZeroDataRetention !== true) return 'the reply does not carry the zero-retention flag';
  const r = gw.routing;
  if (r?.finalProvider !== pinned) return `served by ${r?.finalProvider ?? 'an unnamed provider'}, not ${pinned}`;
  const m = r.planningReasoning?.match(/ZDR requested: all (\d+) attempts support ZDR/);
  if (!m) return 'the routing plan does not say every attempt supports zero retention';
  const attempts = (r.modelAttempts ?? []).flatMap((a) => a.providerAttempts ?? []);
  if (!attempts.length) return 'no provider attempts recorded';
  const other = attempts.find((a) => a.provider !== pinned);
  if (other) return `an attempt went to ${other.provider}, not ${pinned}`;
  return null;
}

/** Run one gateway call with the check. Calls must not overlap (the eval runs them one at a time). */
export async function withZdrCheck<T>(pinned: string, run: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch;
  let last: Gateway | undefined;
  let seen = false;
  globalThis.fetch = (async (...a: Parameters<typeof fetch>) => {
    const res = await orig(...a);
    seen = true;
    const j = (await res.clone().json().catch(() => null)) as { choices?: { message?: { provider_metadata?: { gateway?: Gateway } } }[] } | null;
    last = j?.choices?.[0]?.message?.provider_metadata?.gateway;
    return res;
  }) as typeof fetch;
  let out: T;
  try {
    out = await run();
  } finally {
    globalThis.fetch = orig;
  }
  if (!seen) throw new ZdrRefused('no gateway reply was seen');
  const problem = zdrProblem(last, pinned);
  if (problem) throw new ZdrRefused(problem);
  return out;
}
