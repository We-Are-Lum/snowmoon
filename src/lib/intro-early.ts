/**
 * The first-visit intro, shown before the page has started up (speed fix 3, 2026-11-07; coding agent, Claude by
 * Anthropic, DRAFT for the owner). The intro used to be drawn only after the page's scripts had loaded and run (an
 * effect in IntroOnce, src/components/first-visit.tsx): on a slow phone about 4 s after the home page's first text. Now
 * the home page's HTML carries the intro's first card, hidden; this script, in <head> like the theme's, shows it before
 * the first paint when this device hasn't seen this version of the intro. Same rule as before: home page only, once,
 * remembered in localStorage on this device, no cookie, nothing sent.
 *
 * Until the page has started up, Skip already works (it marks the intro seen and hides it); Next and the rest work once
 * it has. This file runs in the browser too: no server imports.
 */
export const INTRO_KEY = 'snowmoon.intro-seen';
/** On <html> while the early intro is showing. */
export const INTRO_EARLY_ATTR = 'data-intro-early';

export function introEarlyScript(version: string): string {
  const v = JSON.stringify(version).replace(/</g, '\\u003c');
  return `(function(){var K='${INTRO_KEY}',V=${v},d=document.documentElement;try{if(location.pathname==='/'&&localStorage.getItem(K)!==V)d.setAttribute('${INTRO_EARLY_ATTR}','')}catch(e){}document.addEventListener('click',function(e){if(window.__introReady)return;var t=e.target;if(t&&t.closest&&t.closest('.intro-early .intro-skip')){try{localStorage.setItem(K,V)}catch(x){}d.removeAttribute('${INTRO_EARLY_ATTR}')}},true)})();`;
}
