import Link from 'next/link';
import type { CharacterView } from '~/lib/challenge/view';
import { AiTag } from './ai-tag';
import { Bases, CardLine, Row } from './challenge-card';

/**
 * A character's page, /challenge/<slug> (owner, 2026-11-08, the simpler challenge), drawn from its data
 * (src/lib/challenge/view.ts, characterView), which carries every word: the name, its approved one line, "Bases" (a
 * fresh random order per visit, P5g), then "Remixes": every published challenge picture of the character, newest first,
 * whole at 16:9, with no count (P5i). Tapping any picture opens the remix screen with it as the reference. No hooks
 * here, so the public page draws it on the server and the admins' view (challenge-admin.tsx) in the browser.
 */
export function ChallengeCharacterBody({ v }: { v: CharacterView }) {
  const { c, w } = v;
  return (
    <div className="page prose ch-page ch-character-page" data-character={c.slug}>
      <p className="label ip-crumb">
        <Link href="/challenge">{v.back}</Link>
      </p>
      {v.adminNote && <p className="dz-note ch-admin-only">{v.adminNote}</p>}
      <h1 className="cc-name">{c.name}</h1>
      <CardLine c={c} w={w} />
      {c.note && <p className="dz-muted cc-note">{c.note}</p>}
      {c.bases.length > 0 && (
        <section aria-labelledby="ch-bases" className="ch-char-bases">
          <h2 id="ch-bases" className="cc-head">
            {w.bases}
          </h2>
          <Bases c={c} w={w} />
        </section>
      )}
      <section aria-labelledby="ch-remixes" className="ch-char-remixes">
        <h2 id="ch-remixes" className="cc-head">
          {w.remixes}
        </h2>
        {c.remixes.length ? (
          <>
            <Row tiles={c.remixes} alt={w.alt} label={w.remixes} lazy picture />
            <p className="cc-ai">
              <AiTag />
            </p>
          </>
        ) : (
          <p className="dz-muted ch-feed-none">{w.none}</p>
        )}
      </section>
      <p className="dz-note ch-foot">{v.notAffiliated}</p>
    </div>
  );
}
