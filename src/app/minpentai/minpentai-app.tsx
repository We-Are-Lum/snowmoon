'use client';

/**
 * /minpentai: Learn (Claude Design's course, v3) and Play (Design's "Minpentai Play": the hub with
 * Learn, Play and Free play, practice, the computer ladder, one-on-one, free play). Design's three
 * tabs replace v3's (owner, 2026-10-09). Learn's "SKIP TO FREE PLAY" opens Play's free play; Play's
 * Learn tab opens the lessons again.
 *
 * Addresses:
 * - ?lesson=1…7 a lesson, ?lesson=8 Under the hood (owner, 2026-10-20: "?lesson=1 open lesson 1 directly");
 *   ?watch=1…8 a screen of the broadcast; ?mode=practice Learn's practice match (v3). The old numbering,
 *   ?lesson=9…17 for the lessons on, still opens the same screens (9 is lesson 1);
 * - ?mode=play the Play hub; ?mode=free free play (also #fp=… boards); ?mode=ladder the ladder;
 *   ?mode=person or ?invite=… one-on-one;
 * - ?s=… (an old sandbox board) opens /minpentai/rule, the book's rule on the figure's board.
 * A first visit opens Learn; once Learn is finished or skipped, a bare visit opens the Play hub.
 *
 * Out of the menus, kept in the repo: the sandbox (sandbox.tsx), "Play the computer" on the
 * sandbox's engine (match-view.tsx, match.ts, ai.ts), and v3's practice match as free play.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Learn, LEARN_SCREENS, PRACTICE_SCREEN, WATCH_SCREENS } from './learn';
import { Play } from './play';

/** Set once Learn is finished or skipped; later bare visits open Play. (The sandbox's key, kept.) */
const DONE_KEY = 'minpentai-tutorial-done';

type PlayStart = 'home' | 'free' | 'ladder' | 'person';
type Mode = { kind: 'learn'; screen: number } | { kind: 'play'; start: PlayStart };

function setQuery(params: Record<string, string>) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  window.history.replaceState(null, '', url);
}

/** The Learn screen an address names, or null: ?watch=1…8, ?lesson=1…8 (lessons, then Under the hood), or the old ?lesson=9…17. */
export function screenFor(q: URLSearchParams): number | null {
  const watch = Number(q.get('watch'));
  if (q.has('watch') && Number.isInteger(watch) && watch >= 1 && watch <= WATCH_SCREENS) return watch - 1;
  const lesson = Number(q.get('lesson'));
  if (!q.has('lesson') || !Number.isInteger(lesson)) return null;
  if (lesson >= 1 && lesson < PRACTICE_SCREEN - WATCH_SCREENS + 1) return WATCH_SCREENS + lesson - 1;
  if (lesson > WATCH_SCREENS && lesson <= LEARN_SCREENS) return lesson - 1;
  return null;
}

/** The address of a Learn screen, the inverse of screenFor. */
export function addressOf(i: number): Record<string, string> {
  if (i === PRACTICE_SCREEN) return { mode: 'practice' };
  return i < WATCH_SCREENS ? { watch: String(i + 1) } : { lesson: String(i - WATCH_SCREENS + 1) };
}

export function MinpentaiApp() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  /** Remounts the frame when a link or the app bar (not the screen's own buttons) picks the screen. */
  const [visit, setVisit] = useState(0);

  // Choose on the client: a lesson link, an old link, a returning visitor, or Learn from the start.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('s')) { router.replace('/minpentai/rule'); return; }
    const screen = screenFor(q);
    const m = q.get('mode');
    if (screen !== null) setMode({ kind: 'learn', screen });
    else if (m === 'practice') setMode({ kind: 'learn', screen: PRACTICE_SCREEN });
    else if (q.get('invite') || m === 'person') setMode({ kind: 'play', start: 'person' });
    else if (m === 'free' || window.location.hash.startsWith('#fp=')) setMode({ kind: 'play', start: 'free' });
    else if (m === 'ladder') setMode({ kind: 'play', start: 'ladder' });
    else if (m === 'play') setMode({ kind: 'play', start: 'home' });
    else {
      let done = false;
      try { done = !!window.localStorage.getItem(DONE_KEY); } catch { /* storage blocked: Learn */ }
      setMode(done ? { kind: 'play', start: 'home' } : { kind: 'learn', screen: 0 });
    }
    setVisit((v) => v + 1);
  }, [router]);

  const goFree = () => {
    try { window.localStorage.setItem(DONE_KEY, '1'); } catch { /* Learn opens again next time */ }
    setMode({ kind: 'play', start: 'free' });
    setVisit((v) => v + 1);
    setQuery({ mode: 'free' });
  };
  // Play's Learn tab opens lesson 1 itself (owner, 2026-10-20: no "Open the lessons" step).
  const goLearn = () => {
    setMode({ kind: 'learn', screen: WATCH_SCREENS });
    setVisit((v) => v + 1);
    setQuery({ lesson: '1' });
  };
  const onScreen = (i: number) => setQuery(addressOf(i));

  // Until the address has been read, an empty frame: neither must start on the wrong screen.
  if (!mode || !visit) return <section className="mp-play" aria-busy="true" />;
  if (mode.kind === 'play') return <Play key={`play-${visit}`} start={mode.start} onLearn={goLearn} />;
  return <Learn key={`learn-${visit}`} start={mode.screen} onScreen={onScreen} onFree={goFree} />;
}
