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

/**
 * The rail on the remix challenge's pages (the redesign, owner 2026-11-11: "The rail's state remembered per device:
 * fine"): collapsed to its 56px strip unless the person opened it on a challenge page before, on this device. Kept on the
 * device only, as the panel's choice is; elsewhere the rail keeps its own remembered state (snowmoon.rail).
 */
export const CHALLENGE_RAIL_KEY = 'snowmoon.rail.challenge';
export const challengeRailOpen = (stored: string | null): boolean => stored === 'open';
