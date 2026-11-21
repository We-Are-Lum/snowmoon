/**
 * What to tell someone whose microphone was refused (NotAllowedError), by browser. DRAFT wording (Nate, 2026-11-20,
 * after his iPhone Safari test), for his reread. Used by /admin/mic-test now; the Ephelion recording page
 * (/storyboard/record, branch ephelion-voice) will show the same lines. Pure: safe in the browser.
 */
export type MicPlace = 'farcaster-app' | 'ios-safari' | 'mac-safari' | 'chrome' | 'other';

export function micPlace(ua: string, inFarcasterApp: boolean): MicPlace {
  if (inFarcasterApp) return 'farcaster-app';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua));
  const chrome = /Chrome\/|CriOS\/|Edg\//.test(ua);
  if (ios && !/CriOS\//.test(ua)) return 'ios-safari';
  if (chrome || /CriOS\//.test(ua)) return 'chrome';
  if (/Macintosh/.test(ua) && /Safari\//.test(ua)) return 'mac-safari';
  return 'other';
}

/** DRAFT: one plain line per place. */
export const MIC_HELP: Record<MicPlace, string> = {
  'ios-safari':
    "Safari didn't allow the microphone. Tap aA in the address bar, then Website Settings, set Microphone to Allow, and reload the page. If it's already set to Allow, check Settings › Apps › Safari › Microphone.",
  'mac-safari':
    "Safari didn't allow the microphone. Choose Safari › Settings for snowmoon.party (or Safari › Settings › Websites › Microphone), set it to Allow, and reload the page.",
  chrome:
    "Chrome didn't allow the microphone. Tap the icon to the left of the address, set Microphone to Allow (or open Site settings), and reload the page.",
  'farcaster-app':
    "The Farcaster app didn't allow the microphone. Allow the microphone for Farcaster in your phone's settings, then try again.",
  other: "Your browser didn't allow the microphone. Allow it for snowmoon.party in your browser's site settings, and reload the page.",
};

/** The microphone permission's state where the browser reports it ('granted', 'denied', 'prompt'), or null. */
export async function micPermission(): Promise<'granted' | 'denied' | 'prompt' | null> {
  try {
    const p = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
    return p ? (p.state as 'granted' | 'denied' | 'prompt') : null;
  } catch {
    return null;
  }
}

/** Whether a prompt was shown, from the state before and after asking (the browser doesn't say so directly). */
export function promptShown(before: string | null, after: string | null): 'yes' | 'no' | 'unknown' {
  if (!before || !after) return 'unknown';
  if (before === 'prompt' && after !== 'prompt') return 'yes';
  if (before === 'denied' || before === 'granted') return 'no';
  return 'unknown';
}
