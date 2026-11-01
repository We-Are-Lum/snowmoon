'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '~/lib/client-auth';
import { EDITION_NAME } from '~/lib/minpentai/versions/book-edition';
import { SCENARIOS, runScenario } from '~/lib/minpentai/versions/book-scenarios';
import { MinpentaiTags } from '../../mp-tags';
import { Board } from '../book-view';

/** One card a piece: its name, what it does in two lines (this edition's rules), and its scenario playing on a loop. */
const CARDS = [
  { scenario: 'mirror', name: 'Mirror wall', cost: 2, lines: ['A glider flying into it turns a quarter turn, yours too.', 'Three hits break it. A diagonal glider goes straight back.'] },
  { scenario: 'symbol', name: 'Symbol glider', cost: 2, lines: ['Three resting together become your symbol for one turn.', 'Wall it in during that turn and it stays as a tower.'] },
  { scenario: 'wall', name: 'Moving wall', cost: 6, lines: ['Three squares wide, moving every second step.', 'Its front sends gliders straight back; a hit from the side or behind breaks a square.'] },
  { scenario: 'factory', name: 'Glider factory', cost: 3, lines: ['Stands against a rock. Each glider that hits the rock makes it fire one of yours.', 'Each firing spends one ore; with none left the rock crumbles.'] },
] as const;

function Card({ i }: { i: number }) {
  const c = CARDS[i];
  const sc = SCENARIOS.find((s) => s.id === c.scenario)!;
  const run = useMemo(() => runScenario(sc), [sc]);
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const id = window.setInterval(() => setStep((n) => (n >= run.frames.length - 1 ? 0 : n + 1)), 300);
    return () => window.clearInterval(id);
  }, [run]);
  return (
    <section className="mb-card" aria-label={`${c.name}, card ${i + 1} of ${CARDS.length}`}>
      <p className="mb-note">Card {i + 1} of {CARDS.length} · costs {c.cost}</p>
      <h2>{c.name}</h2>
      {c.lines.map((l) => <p key={l}>{l}</p>)}
      <Board e={run.e} w={run.frames[step]} />
      <p className="mb-note">{sc.watch}</p>
    </section>
  );
}

export function Tutorial({ people }: { people: number[] }) {
  const auth = useAuth();
  const [i, setI] = useState(0);
  if (!(auth.kind === 'signed-in' && people.includes(auth.fid))) {
    return <article className="mb"><h1>{EDITION_NAME}: the four pieces</h1><MinpentaiTags tags={['rules', 'draft']} /><p>The book edition is invite-only for now.</p></article>;
  }
  return (
    <article className="mb">
      <h1>{EDITION_NAME}: the four pieces</h1>
      <MinpentaiTags tags={['book', 'rules', 'draft']} />
      <Card i={i} />
      <div className="mb-controls">
        <button type="button" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>Back</button>
        <button type="button" onClick={() => setI(Math.min(CARDS.length - 1, i + 1))} disabled={i === CARDS.length - 1}>Next piece</button>
        <a href="/minpentai/book">The book&rsquo;s words for each piece</a>
      </div>
      <p className="mb-note">Rules invented for this edition, drawn from passages in the book · not affiliated with the author.</p>
    </article>
  );
}
