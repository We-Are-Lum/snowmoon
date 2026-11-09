import { CLOSED_PROVIDERS, type ClosedProvider } from '../config';
import { MODEL_NOTICES } from '../legal';

/**
 * The closed models' notice on the remix form (owner, 2026-11-04; branch remix-model-choice, DRAFT). No server-only
 * imports and no network: everything here is decided and kept on the person's device.
 *
 * - One notice per maker (provider), not per model: picking a second model by the same maker shows nothing new.
 * - "OK" closes it for this page; "Don't remind me again" stores the maker's notice version on the device, and the
 *   notice shows again only when that version goes up (src/lib/config.ts CLOSED_PROVIDERS).
 * - The first notice a device sees also asks "I'm 18 or older" (owner, 2026-11-04). Until it is ticked on this device,
 *   neither button works and no closed model can be picked. The answer is stored on the device only: it reminds of the
 *   Terms' 18+ rule; the server can't check it, so it is not a verification.
 * - Nothing here is sent anywhere: the form makes no request when a notice is answered.
 */
export const NOTICE_KEY = (provider: string) => `snowmoon.model-notice.${provider}`;
export const ADULT_KEY = 'snowmoon.adult-confirmed';

/** The device's storage, as the form uses it (window.localStorage, guarded); tests pass a stand-in. */
export interface DeviceStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}
export function browserStore(): DeviceStore {
  return {
    get: (k) => {
      try {
        return window.localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        window.localStorage.setItem(k, v);
      } catch {
        /* private mode: the answer lasts for this page only */
      }
    },
  };
}

export const noticeVersion = (provider: string): number | null => CLOSED_PROVIDERS[provider as ClosedProvider]?.noticeVersion ?? null;

/** What a notice asks right now, for a pick of a model by this maker. */
export function noticeFor(provider: string, store: DeviceStore, seenThisPage: ReadonlySet<string>): { show: boolean; askAdult: boolean } {
  const askAdult = store.get(ADULT_KEY) !== '1';
  const v = noticeVersion(provider);
  const dismissed = v !== null && store.get(NOTICE_KEY(provider)) === String(v);
  // The 18+ box must be answered on this device before any closed pick, whatever was dismissed.
  return { show: askAdult || (!seenThisPage.has(provider) && !dismissed), askAdult };
}

/** May a closed model by this maker be picked now (no notice left to answer)? */
export const mayPick = (provider: string, store: DeviceStore, seenThisPage: ReadonlySet<string>) => !noticeFor(provider, store, seenThisPage).show;

/** The person answers the notice. Returns false (nothing changes) while the 18+ box is needed and not ticked. */
export function answerNotice(provider: string, button: 'ok' | 'never', adultTicked: boolean, store: DeviceStore, seenThisPage: Set<string>): boolean {
  const { askAdult } = noticeFor(provider, store, seenThisPage);
  if (askAdult && !adultTicked) return false;
  if (askAdult) store.set(ADULT_KEY, '1');
  seenThisPage.add(provider);
  const v = noticeVersion(provider);
  if (button === 'never' && v !== null) store.set(NOTICE_KEY(provider), String(v));
  return true;
}

/** The words a notice version covers (label, title, text), for the version check in scripts/test-model-choice.ts. */
export function noticeWordsText(provider: string): string {
  const n = MODEL_NOTICES[provider as keyof typeof MODEL_NOTICES];
  return n ? [n.label, n.title, ...n.text].join('\n') : '';
}
