'use client';

/**
 * /minpentai: Learn (Claude Design's course, v3) and Play (Design's "Minpentai Play": the hub with
 * Learn, Play and Free play, practice, the computer ladder, one-on-one, free play). Design's three
 * tabs replace v3's (owner, 2026-10-09). Learn's "SKIP TO FREE PLAY" opens Play's free play; Play's
 * Learn tab opens the lessons again.
 *
 * Addresses:
 * - ?lesson=1…17 a Learn screen; ?mode=practice Learn's practice match (v3);
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
import { Learn, LEARN_SCREENS, PRACTICE_SCREEN } from './learn';
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

export function MinpentaiApp() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  /** Remounts the frame when a link or the app bar (not the screen's own buttons) picks the screen. */
  const [visit, setVisit] = useState(0);

  // Choose on the client: a lesson link, an old link, a returning visitor, or Learn from the start.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('s')) { router.replace('/minpentai/rule'); return; }
    const lesson = Number(q.get('lesson'));
    const m = q.get('mode');
    if (Number.isInteger(lesson) && lesson >= 1 && lesson <= LEARN_SCREENS) setMode({ kind: 'learn', screen: lesson - 1 });
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
  const goLearn = () => {
    setMode({ kind: 'learn', screen: 0 });
    setVisit((v) => v + 1);
    setQuery({ lesson: '1' });
  };
  const onScreen = (i: number) => setQuery(i === PRACTICE_SCREEN ? { mode: 'practice' } : { lesson: String(i + 1) });

  // Until the address has been read, an empty frame: neither must start on the wrong screen.
  if (!mode || !visit) return <section className="mp-play" aria-busy="true" />;
  if (mode.kind === 'play') return <Play key={`play-${visit}`} start={mode.start} onLearn={goLearn} />;
  return <Learn key={`learn-${visit}`} start={mode.screen} onScreen={onScreen} onFree={goFree} />;
}
