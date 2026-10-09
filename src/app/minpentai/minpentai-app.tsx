'use client';

/**
 * /minpentai: Learn (Claude Design's course) and Free play (Design's practice match on its own), both in
 * Design's frame (learn.tsx). The app bar switches between them: "SKIP TO FREE PLAY" and "LEARN THE GAME".
 * The rule recovered from the book's figure has its own page, /minpentai/rule.
 *
 * Out of the menus since 2026-10-09 (owner), kept in the repo: the sandbox (sandbox.tsx) and "Play the
 * computer" (match-view.tsx, match.ts, ai.ts). Their old links land here:
 * - ?mode=free (the sandbox) and ?mode=play (the computer) open Free play;
 * - ?s=… (a sandbox board) opens /minpentai/rule, the book's rule on the figure's board.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Learn, LEARN_SCREENS, PRACTICE_SCREEN } from './learn';

/** Set once Learn is finished or skipped; later bare visits open Free play. (The sandbox's key, kept.) */
const DONE_KEY = 'minpentai-tutorial-done';

type Mode = { kind: 'learn'; screen: number } | { kind: 'free' };

function setQuery(params: Record<string, string>) {
  const url = new URL(window.location.href);
  url.search = '';
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  window.history.replaceState(null, '', url);
}

export function MinpentaiApp() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  /** Remounts the frame when a link or the app bar (not Learn's own buttons) picks the screen. */
  const [visit, setVisit] = useState(0);

  // Choose on the client: a lesson link, an old link, a returning visitor, or Learn from the start.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('s')) { router.replace('/minpentai/rule'); return; }
    const lesson = Number(q.get('lesson'));
    if (Number.isInteger(lesson) && lesson >= 1 && lesson <= LEARN_SCREENS) setMode({ kind: 'learn', screen: lesson - 1 });
    else if (q.get('mode') === 'practice') setMode({ kind: 'learn', screen: PRACTICE_SCREEN });
    else if (q.get('mode') === 'free' || q.get('mode') === 'play') setMode({ kind: 'free' });
    else {
      let done = false;
      try { done = !!window.localStorage.getItem(DONE_KEY); } catch { /* storage blocked: Learn */ }
      setMode(done ? { kind: 'free' } : { kind: 'learn', screen: 0 });
    }
    setVisit((v) => v + 1);
  }, [router]);

  const goFree = () => {
    try { window.localStorage.setItem(DONE_KEY, '1'); } catch { /* Learn opens again next time */ }
    setMode({ kind: 'free' });
    setVisit((v) => v + 1);
    setQuery({ mode: 'free' });
  };
  const goLearn = () => {
    setMode({ kind: 'learn', screen: 0 });
    setVisit((v) => v + 1);
    setQuery({ lesson: '1' });
  };
  const onScreen = (i: number) => setQuery(i === PRACTICE_SCREEN ? { mode: 'practice' } : { lesson: String(i + 1) });

  // Until the address has been read, an empty frame: Learn must not start on the wrong screen.
  if (!mode || !visit) return <section className="ml-learn" aria-busy="true" />;
  if (mode.kind === 'free') return <Learn key={`free-${visit}`} start={PRACTICE_SCREEN} free onScreen={() => setQuery({ mode: 'free' })} onFree={goLearn} />;
  return <Learn key={`learn-${visit}`} start={mode.screen} onScreen={onScreen} onFree={goFree} />;
}
