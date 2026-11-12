import Link from 'next/link';
import type { ChallengeView } from '~/lib/challenge/view';
import { AiTag } from './ai-tag';
import { TileBase } from './challenge-card';

/**
 * /challenge, the home (Claude Design's handoff, screen 1; owner-approved 2026-11-11), drawn from its data
 * (src/lib/challenge/view.ts), which carries every word: the title, the owner's pitch and the window; the ways to take
 * part (Remix a picture, Add a backstory, Join the collab; owner, 2026-11-11); one tile per character in CHALLENGE.characters'
 * order (P5h), each a fresh random base (P5g), its name and, where the book states it, its home with the block id;
 * then the characters still to join (CHALLENGE.joining); then "New to Snowmoon?", "Rules" and "About the pictures".
 * Nothing is ordered by likes, payments or anything but chance (P5, P7). No hooks here (TileBase is the client part),
 * so the public page draws it on the server and the admins' view (challenge-admin.tsx) in the browser.
 */
export function ChallengeBody({ v }: { v: ChallengeView }) {
  return (
    <div className="ch-home ch-page" data-page="challenge-home">
      {v.adminNote && <p className="dz-note ch-admin-only">{v.adminNote}</p>}
      <header className="chh-head">
        <div className="chh-head-main">
          <h1 className="chh-title">{v.title}</h1>
          <p className="chh-pitch">{v.pitch}</p>
        </div>
        <div className="chh-when">
          <p className="chh-window">{v.window}</p>
          {v.closes && <p className="chh-closes">{v.closes}</p>}
          <p className="ch-top-links chh-links">
            <Link href="/challenge/rules" className="ch-rules-link">
              {v.rulesLink}
            </Link>
            {' · '}
            <Link href="/challenge/entries" className="ch-entries-link">
              {v.entriesLink}
            </Link>
            {v.draftShort && <span className="as-draft ch-draft"> · {v.draftShort}</span>}
          </p>
        </div>
      </header>
      <div className="chh-ways">
        {v.ways.map((w) => (
          <details key={w.n} className="chh-way">
            <summary>
              <span className="chh-n">{w.n}</span>
              <span className="chh-way-title">{w.title}</span>
              {w.tag && <span className="chh-tag">{w.tag}</span>}
            </summary>
            <p>
              {w.body}
              {w.href && (
                <>
                  {' '}
                  <a href={w.href} target="_blank" rel="noopener">
                    {w.href.replace(/^https?:\/\//, '')}
                  </a>
                </>
              )}
              {w.pending && <> {w.pending}</>}
            </p>
          </details>
        ))}
      </div>
      <ul className="chh-grid" role="list">
        {v.cards.map(({ c, w, home }) => (
          <li key={c.slug} className="cc-card chh-tile" data-character={c.slug}>
            <div className="chh-pic-wrap">
              {c.bases.length ? (
                <div className="chh-pic">
                  <TileBase c={c} alt={w.alt} />
                </div>
              ) : (
                <div className="chh-pic chh-empty">
                  <p>{c.note}</p>
                </div>
              )}
              {c.bases.length > 0 && (
                <span className="chh-ai">
                  <AiTag note={w.look} />
                </span>
              )}
            </div>
            <div className="chh-cap">
              <h2 className="chh-name">
                <Link href={c.href} className="cc-name-link" prefetch={false}>
                  {c.name}
                </Link>
              </h2>
              {home && (
                <p className="chh-note" title={home.from}>
                  {home.place} <span className="chh-block">· {home.block}</span>
                </p>
              )}
            </div>
          </li>
        ))}
        {v.joining.map((j) => (
          <li key={j.slug} className="chh-tile chh-joining" data-character={j.slug}>
            <div className="chh-pic-wrap">
              <div className="chh-pic chh-empty">
                <p>{j.text}</p>
              </div>
            </div>
            <div className="chh-cap">
              <h2 className="chh-name">{j.name}</h2>
              <p className="chh-note">{j.note}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="chh-details">
        {v.details.map((d) => (
          <details key={d.title} className="chh-detail">
            <summary>
              <span>{d.title}</span>
              <span className="chh-plus" aria-hidden="true">
                +
              </span>
            </summary>
            {d.body.map((b) => (
              <p key={b}>{b}</p>
            ))}
            {d.link && (
              <p>
                <Link href={d.link.href}>{d.link.text} →</Link>
              </p>
            )}
          </details>
        ))}
      </div>
      <p className="dz-note ch-foot">{v.notAffiliated}</p>
    </div>
  );
}
