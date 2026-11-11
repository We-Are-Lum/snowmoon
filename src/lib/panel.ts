/**
 * Where the assistant panel starts closed (1200px and up; under that there is no panel). No server-only imports.
 * - Minpentai's pages (owner, 2026-10-20): closed; opening it there lasts for the visit only.
 * - The remix challenge's pages (owner, 2026-11-10): closed, unless the person opened it on a challenge page before, on
 *   this device; closing it there forgets that. Kept on the device only (Privacy §3, "a few other settings of yours").
 * - Everywhere else: open unless the person closed it (snowmoon.panel), unchanged.
 */
export const isChallengePath = (path: string) => path === '/challenge' || path.startsWith('/challenge/');
export const CHALLENGE_PANEL_KEY = 'snowmoon.panel.challenge';
export const challengePanelOpen = (stored: string | null): boolean => stored === 'open';
