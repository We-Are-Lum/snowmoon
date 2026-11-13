'use client';

import { BACKSTORY_MAX, BACKSTORY_WORDING as B, type StoredBackstory } from '~/lib/challenge/backstory';
import { PublishedTextField } from './publish-words';

/**
 * The Backstory box (owner, 2026-11-09): the three starter questions as hints above it (never put in the box), the box
 * itself (a PublishedTextField: typed text only, at most BACKSTORY_MAX characters, with the publication line). No request
 * and no model here: what's in the box is what was typed.
 */
export function BackstoryField(p: { name: string; text: string; onText: (v: string) => void; id?: string; hideLabel?: boolean }) {
  const id = p.id ?? 'mk-backstory';
  return (
    <section className="mk-backstory" data-slot="backstory">
      <ul className="mk-backstory-hints dz-muted" aria-label="Questions to start from">
        {B.hints(p.name).map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      <PublishedTextField id={id} label={`${B.label} ${B.optional}`} value={p.text} onChange={p.onText} rows={5} maxLength={BACKSTORY_MAX} hideLabel={p.hideLabel} />
    </section>
  );
}

/** A picture's backstory as shown under it: the words, then "Invented by @maker, not from the book". */
export function BackstoryShown(p: { backstory: StoredBackstory; maker: string }) {
  return (
    <section className="mk-backstory-shown" data-slot="backstory-shown">
      <p className="mk-backstory-text">{p.backstory.text}</p>
      <p className="dz-muted mk-backstory-by">{B.invented(p.maker)}</p>
    </section>
  );
}
