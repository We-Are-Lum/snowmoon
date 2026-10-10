'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HOME_TEXT as H, type HomeMoment } from '~/lib/home';

/**
 * "A moment from the book": a sentence or two of the book, shown exactly as written (no quote marks
 * added, none changed), with its block id and a link to that block. The first is served; after load
 * one is picked at random, and "Another" picks a different one.
 */
export function HomeMomentCard({ moments }: { moments: HomeMoment[] }) {
  const [i, setI] = useState(0);
  useEffect(() => setI(Math.floor(Math.random() * moments.length)), [moments.length]);
  const m = moments[i];
  const idx = m.block.split('-b')[1];
  return (
    <section className="home-card home-moment" aria-labelledby="home-moment-head">
      <div className="home-card-head">
        <h2 id="home-moment-head">{H.moment.head(m.chapter)}</h2>
        <span className="home-ref">{m.block}</span>
      </div>
      <blockquote className="home-quote" cite={`/chapter/${m.chapter}#${m.block}`} data-block={m.block}>
        {m.text}
      </blockquote>
      <div className="home-actions">
        <Link href={`/chapter/${m.chapter}#c${m.chapter}-b${idx}`} className="home-btn home-btn-solid home-moment-read">
          {H.moment.read}
        </Link>
        {moments.length > 1 && (
          <button type="button" className="home-btn home-btn-line" onClick={() => setI((i + 1 + Math.floor(Math.random() * (moments.length - 1))) % moments.length)}>
            {H.moment.another}
          </button>
        )}
      </div>
    </section>
  );
}
