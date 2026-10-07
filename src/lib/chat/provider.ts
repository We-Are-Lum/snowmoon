import { CHAT } from '../config';

/**
 * The owner's conditions for the hosted model (principle 6, Oct 7, 2026): one pinned
 * provider, zero data retention, both hops named in the notice, no message text kept.
 */

/** Zero data retention always; one provider only once it is pinned (no fallback: if it is down, the call fails). */
export function providerOptions() {
  return { gateway: { zeroDataRetention: CHAT.zeroDataRetention, ...(CHAT.provider ? { only: [CHAT.provider] } : {}) } };
}

/** The provider that served a gateway reply: choices[0].message.provider_metadata.gateway.routing. */
export function servedBy(reply: unknown): string | null {
  const routing = (reply as { choices?: { message?: { provider_metadata?: { gateway?: { routing?: { finalProvider?: string; resolvedProvider?: string } } } } }[] })
    ?.choices?.[0]?.message?.provider_metadata?.gateway?.routing;
  return routing?.finalProvider ?? routing?.resolvedProvider ?? null;
}

/** With a provider pinned, a reply from any other provider is not used. */
export function servedByPinned(provider: string | null): boolean {
  return !CHAT.provider || provider === CHAT.provider;
}

/** Readers may use the assistant only with a pinned, named provider and zero data retention. */
export function servingAllowed(): boolean {
  return Boolean(CHAT.provider && CHAT.providerName && CHAT.zeroDataRetention);
}
