import Link from 'next/link';
import type { RulesView } from '~/lib/challenge/rules-view';
import { AiTag } from './ai-tag';
import { CHALLENGE } from '~/lib/config';

/**
 * /challenge/rules, drawn from its data (src/lib/challenge/rules-view.ts), which carries every word. No hooks, so the
 * public page draws it on the server and the admins' view (challenge-admin.tsx) in the browser.
 */
export function ChallengeRulesBody({ v }: { v: RulesView }) {
  return (
    <div className="page prose ch-page ch-rules-page">
      <p className="label ip-crumb">
        <Link href="/challenge">{v.back}</Link>
      </p>
      {v.adminNote && <p className="dz-note ch-admin-only">{v.adminNote}</p>}
      <h1>{v.title}</h1>
      {v.draft && <p className="as-draft ch-draft">{v.draft}</p>}
      <p className="ch-deadline">
        <strong>{v.deadline}</strong>
        {v.deadlineAfter && ` ${v.deadlineAfter}`}
      </p>
      {/* Who can enter, up front (owner, 2026-11-03; launch rehearsal item 2): no lookup here, the score is checked at Generate. */}
      {v.who && <p className="ch-who">{v.who}</p>}
      <p className="ch-intro">
        {v.intro}
        {v.introDraft && <span className="as-draft ch-draft"> · {v.introDraft}</span>}
      </p>
      <section className="ch-rules">
        <p>
          <strong>{v.next[0]}</strong> {v.next[1]}
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

      {v.counts && (
        <section className="dz-section ch-counts" aria-labelledby="ch-counts">
          <h2 id="ch-counts">{v.counts.head}</h2>
          <ul className="ch-count-list">
            {v.counts.rows.map((c) => (
              <li key={c.slug} className="ch-count" data-character={c.slug}>
                <strong>{c.name}</strong>: {c.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="dz-section ch-entries" aria-labelledby="ch-entries">
        <h2 id="ch-entries">{v.entriesHead}</h2>
        {v.entriesOff ? (
          <p className="dz-muted">{v.entriesOff}</p>
        ) : v.entries.length ? (
          <>
            {v.entriesNote && <p className="dz-note">{v.entriesNote}</p>}
            <ul className="dz-rows">
              {v.entries.map((e) => (
                <li key={e.href}>
                  <Link href={e.href} className="dz-row">
                    {e.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className={CHALLENGE.pictureEntries ? 'dz-thumb dz-thumb-pic' : 'dz-thumb'} src={e.thumb} alt={v.alt} width={64} height={CHALLENGE.pictureEntries ? 36 : 48} loading="lazy" />
                    ) : (
                      <span className="dz-thumb dz-thumb-empty" aria-hidden="true" />
                    )}
                    <span className="dz-row-text">
                      <span className="dz-row-title">
                        <span className="ch-badge">{v.badge}</span> {e.title}
                      </span>
                      <span className="dz-row-meta">{e.meta}</span>
                      {e.thumb && (
                        <span className="dz-row-ai">
                          {CHALLENGE.pictureEntries ? <AiTag /> : <AiTag what="Views" />}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="dz-muted">{v.entriesNone}</p>
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
