/**
 * The colour theme: Light (the default), Dark, or System. Remembered in localStorage on this
 * device, never in a cookie. THEME_SCRIPT runs in <head> before anything is painted, so a
 * reload never flashes the wrong theme.
 */
export type Theme = 'light' | 'dark' | 'system';
export const THEME_KEY = 'snowmoon.theme';
export const THEME_SCRIPT = `(function(){var t='light';try{var s=localStorage.getItem('${THEME_KEY}');if(s==='dark'||s==='system')t=s}catch(e){}document.documentElement.setAttribute('data-theme',t)})();`;
