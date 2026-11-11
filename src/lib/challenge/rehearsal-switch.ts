/**
 * The rehearsal switch (coordinator's brief for the owner, 2026-11-04: rehearsal 1, Farcaster only). With
 * CHALLENGE_REHEARSAL=on, on this machine only, the remix challenge runs as if opened, against a local rehearsal
 * database, so the owner can walk the whole path before the real open:
 * - the challenge id is `rehearsal-<yyyymmdd>` (the Pacific day the server started), so nothing it writes could be
 *   mistaken for the real challenge's rows;
 * - entries open now: every date in CHALLENGE.dates moves by the same amount, so the window opens at the start of
 *   today (Pacific) and everything after keeps its spacing;
 * - /challenge is public on that server (CHALLENGE.public);
 * - admins are eligible (rehearsal only), so the owner can enter his own remix. Every other check is the real one:
 *   the invited list or the Neynar decision, and the post check at Submit.
 *
 * It is on only when all of these hold, and off otherwise, whatever CHALLENGE_REHEARSAL says:
 * - not on Vercel at all (no VERCEL, and VERCEL_ENV is not production, preview or development);
 * - STUDIO_DATABASE_URL, if set, points at this machine (127.0.0.1 or localhost), so it can't reach production data;
 *   `npm run rehearsal` goes further and refuses to start unless it is the rehearsal database's own address.
 * check:principles P6w proves VERCEL_ENV=production turns it off, with a planted switch that ignores it.
 *
 * Pure (no imports), so src/lib/config.ts can apply it, and the browser's copy of the config agrees: in the browser
 * it reads the build's NEXT_PUBLIC_CHALLENGE_REHEARSAL (set only by `npm run rehearsal`) and the page's own host.
 */
export type RehearsalEnv = Record<string, string | undefined>;

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])$/;
/** A Postgres address on this machine: postgres://user@127.0.0.1:port/db (or localhost). */
export const LOCAL_DB_URL = /^postgres(ql)?:\/\/[^@/]*@(127\.0\.0\.1|localhost)(:\d+)?\//;

/** Whether the rehearsal switch is on for this server. */
export function rehearsalOn(env: RehearsalEnv): boolean {
  if (env.CHALLENGE_REHEARSAL !== 'on') return false;
  // Never on any Vercel deployment: production above all, and previews too.
  if (env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development' || env.VERCEL) return false;
  if (env.NEXT_PUBLIC_VERCEL_ENV === 'production') return false;
  const url = env.STUDIO_DATABASE_URL;
  if (url && !LOCAL_DB_URL.test(url)) return false;
  return true;
}

/** The browser's view of the switch: the build's flag, and a page served from this machine. */
export function rehearsalOnInBrowser(flag: string | undefined, vercelEnv: string | undefined, host: string | undefined): boolean {
  return flag === 'on' && !vercelEnv && typeof host === 'string' && LOOPBACK_HOST.test(host);
}

/** The Pacific day of an instant, "YYYY-MM-DD". */
export function pacificDay(at: Date, timeZone = 'America/Los_Angeles'): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

/** The first instant of the Pacific day that holds `at`. */
export function pacificDayStart(at: Date, timeZone = 'America/Los_Angeles'): Date {
  const day = pacificDay(at, timeZone);
  // Pacific midnight is 07:00 or 08:00 UTC; take the earlier of the two that falls on that Pacific day.
  for (const h of [7, 8]) {
    const t = new Date(`${day}T${String(h).padStart(2, '0')}:00:00Z`);
    if (pacificDay(t, timeZone) === day && pacificDay(new Date(t.getTime() - 1), timeZone) !== day) return t;
  }
  return new Date(`${day}T08:00:00Z`);
}

/** The rehearsal's challenge: its id and its dates, every one moved so the window opens at the start of today (Pacific). */
export function rehearsalChallenge<D extends Record<string, string>>(dates: D & { opens: string }, now: Date, timeZone = 'America/Los_Angeles'): { id: string; dates: D } {
  const start = pacificDayStart(now, timeZone);
  const shift = start.getTime() - Date.parse(dates.opens);
  const moved = Object.fromEntries(Object.entries(dates).map(([k, v]) => [k, new Date(Date.parse(v) + shift).toISOString()])) as D;
  return { id: `rehearsal-${pacificDay(now, timeZone).replaceAll('-', '')}`, dates: moved };
}

/**
 * The rehearsal database's stand-in bases (scripts/rehearsal-db.ts seeds them), by version id: one per character,
 * three for Deluin and Gladias, as CHALLENGE.baseCount has it. Under the switch they are the challenge's bases.
 */
const rid = (c: number, i: number) => `0000ba5e-0000-4000-8000-0000000${String(c).padStart(2, '0')}${String(i).padStart(3, '0')}`;
export const REHEARSAL_BASE_IDS: Record<string, readonly string[]> = {
  zei: [rid(1, 1)],
  gladias: [rid(2, 1), rid(2, 2), rid(2, 3)],
  bai: [rid(3, 1)],
  seila: [rid(4, 1)],
  deluin: [rid(5, 1), rid(5, 2), rid(5, 3)],
  mu: [rid(6, 1)],
};

/**
 * The rehearsal's current default looks (branch challenge-moments): Deluin's and Gladias' look b (their third stand-in
 * base, recast b), and the one stand-in base of each of the others. Rehearsal stand-ins only.
 */
export const REHEARSAL_DEFAULT_LOOKS: Record<string, string | null> = {
  zei: rid(1, 1),
  gladias: rid(2, 3),
  bai: rid(3, 1),
  seila: rid(4, 1),
  deluin: rid(5, 3),
  mu: rid(6, 1),
};
