import Link from 'next/link';
import type { ChallengeView, ChallengeRow } from '~/lib/challenge/view';
import { AiTag } from './ai-tag';

/**
 * /challenge's page (owner, 2026-10-31), drawn from its data (src/lib/challenge/view.ts), which carries every word:
 * the rules (draft wording, every date from CHALLENGE.dates), the characters in CHALLENGE.characters' order, each with
 * its count of distinct eligible entrants (a count, never a ranking) and the sheets to start from, the entries so far
 * (newest first) and the deadline. Nothing is ordered by likes, payments or anything but time (P5, P7). No hooks, so
 * the public page draws it on the server and the admins' view (challenge-admin.tsx) in the browser.
 */
function Rows({ rows }: { rows: ChallengeRow[] }) {
  return (
    <ul className="dz-rows">
      {rows.map((s) => (
        <li key={s.href}>
          <Link href={s.href} className="dz-row">
            {s.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="dz-thumb" src={s.thumb} alt={s.alt} width={64} height={48} loading="lazy" />
            ) : (
              <span className="dz-thumb dz-thumb-empty" aria-hidden="true" />
            )}
            <span className="dz-row-text">
              <span className="dz-row-title">
                {s.badge && (
                  <>
                    <span className="ch-badge">{s.badge}</span>{' '}
                  </>
                )}
                {s.title}
              </span>
              <span className="dz-row-meta">{s.meta}</span>
              {s.thumb && (
                <span className="dz-row-ai">
                  <AiTag what="Views" />
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ChallengeBody({ v }: { v: ChallengeView }) {
  return (
    <div className="page prose ch-page">
      <p className="label ip-crumb">
        <Link href="/references/designs?tab=characters">← Characters</Link>
      </p>
      {v.adminNote && <p className="dz-note ch-admin-only">{v.adminNote}</p>}
      <h1>{v.title}</h1>
      <p className="as-draft ch-draft">{v.draft}</p>
      <p className="ch-deadline">
        <strong>{v.deadline}</strong>
        {v.deadlineAfter && ` ${v.deadlineAfter}`}
      </p>
      {/* Who can enter, up front (owner, 2026-11-03; launch rehearsal item 2): no lookup here, the score is checked at Generate. */}
      {v.who && <p className="ch-who">{v.who}</p>}
      <section className="ch-rules">
        <p>{v.intro}</p>
        <p>
          <strong>{v.next[0]}</strong> {v.next[1]}
        </p>
        <p>
          <strong>{v.bounty[0]}</strong> {v.bounty[1]}
        </p>
        <p>
          <strong>{v.rulesHead}</strong>
        </p>
        <ul>
          {v.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="dz-note">{v.notAffiliated}</p>
      </section>

      {v.characters.map((c) => (
        <section key={c.slug} className="dz-section ch-character" aria-labelledby={`ch-${c.slug}`}>
          <h2 id={`ch-${c.slug}`}>{c.name}</h2>
          {c.count && <p className="dz-meta ch-count">{c.count}</p>}
          {c.about && <p>{c.about}</p>}
          <p className="ch-bounty">
            {c.bounty}
            {c.bountyLink && (
              <>
                {' '}
                <a href={c.bountyLink.href} target="_blank" rel="noopener noreferrer">
                  {c.bountyLink.text}
                </a>
              </>
            )}
          </p>
          <p>
            <Link href={`/references/designs/character/${c.slug}`}>{c.readBook}</Link>
          </p>
          <p className="dz-label">{c.startLabel}</p>
          {c.sheets.length ? <Rows rows={c.sheets} /> : <p className="dz-muted">{c.none}</p>}
        </section>
      ))}

      <section className="dz-section ch-entries" aria-labelledby="ch-entries">
        <h2 id="ch-entries">{v.entriesHead}</h2>
        {v.entries.length ? (
          <>
            {v.entriesNote && <p className="dz-note">{v.entriesNote}</p>}
            <Rows rows={v.entries} />
          </>
        ) : (
          <p className="dz-muted">{v.entriesEmpty}</p>
        )}
        {v.adminsHead && (
          <>
            <h3>{v.adminsHead}</h3>
            <ul className="ch-admin-list">
              {v.byAdmins.map((r) => (
                <li key={r.href}>
                  <Link href={r.href}>{r.text}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
