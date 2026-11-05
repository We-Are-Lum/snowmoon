import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CHALLENGE } from '~/lib/config';
import { db } from '~/lib/db';
import { designByline } from '~/lib/images/byline';
import { bookCharacter } from '~/lib/images/designs';
import { standing, type Standing } from '~/lib/challenge/entries';
import { entrantCounts, phase } from '~/lib/challenge/rules';
import { CHALLENGE_WORDING as W } from '~/lib/challenge/wording';
import { LANDING_WORDING as L } from '~/lib/challenge/landing-wording';
import { AiTag } from '~/components/ai-tag';

/**
 * The remix challenge's rules, behind /challenge's "Rules" link (owner, 2026-11-04: "When it goes public, the page says
 * much less … with the rules behind a 'Rules' link"). Everything /challenge said before it became the short page lives
 * here: the deadline, who can enter, what you do, what happens next, the rules, the admins line, each character's
 * count of entrants (a count, never a ranking) and the entries so far, newest first (docs/proposals/challenge-short-page.md
 * lists what moved). Every date from CHALLENGE.dates; marked as draft wording. Readable signed out (once the admin-only
 * gate lifts: until CHALLENGE.public is on, it answers "not found" to everyone, admins included; ./not-found.tsx is the
 * plain one). Nothing ordered by anything but time (P5, P7).
 */
export const revalidate = 60;
export async function generateMetadata(): Promise<Metadata> {
  if (!CHALLENGE.public) return { robots: { index: false, follow: false } };
  return { title: 'The rules: remix the cast', description: 'The remix challenge on Snowmoon Party: the draft rules.' };
}

const callName = (name: string) => name.split(' ')[0];

export default async function ChallengeRules() {
  // Admin-only until the owner opens it (CHALLENGE.public; owner, 2026-11-04): "not found" to everyone, admins included.
  if (!CHALLENGE.public) notFound();
  const sql = db();
  const chars = CHALLENGE.characters.map((s) => bookCharacter(s)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const none: Standing = { entries: [], byAdmins: [], entrants: entrantCounts([]) };
  const st: Standing = sql && CHALLENGE.entries ? await standing(sql).catch(() => none) : none;
  const now = phase();
  const nameOf = (slug: string) => callName(chars.find((c) => c.slug === slug)?.name ?? slug);
  return (
    <div className="page prose ch-page ch-rules-page">
      <p className="label ip-crumb">
        <Link href="/challenge">{L.back}</Link>
      </p>
      <h1>{L.rulesTitle}</h1>
      <p className="as-draft ch-draft">{W.draft}</p>
      <p className="ch-deadline">
        <strong>{now === 'before' ? W.opensOn() : now === 'open' ? W.deadline() : W.closed()}</strong>
        {now === 'before' && ` ${W.deadline()}`}
      </p>
      {/* Who can enter, up front (owner, 2026-11-03; launch rehearsal item 2): no lookup here, the score is checked at Generate. */}
      {now !== 'closed' && <p className="ch-who">{W.whoCanEnter()}</p>}
      <p className="ch-intro">{W.intro()}</p>
      <section className="ch-rules">
        <p>
          <strong>{W.nextHead}</strong> {W.next()}
        </p>
        <p>
          <strong>{W.rulesHead}</strong>
        </p>
        <ul>
          {W.rules().map((r) => (
            <li key={r}>{r}</li>
          ))}
          <li>{W.adminsLine}</li>
        </ul>
        <p className="dz-note">{W.notAffiliated}</p>
      </section>

      {CHALLENGE.entries && (
        <section className="dz-section ch-counts" aria-labelledby="ch-counts">
          <h2 id="ch-counts">{L.countsHead}</h2>
          <ul className="ch-count-list">
            {chars.map((c) => (
              <li key={c.slug} className="ch-count" data-character={c.slug}>
                <strong>{callName(c.name)}</strong>: {W.entrants(st.entrants.get(c.slug) ?? 0)} · {W.entrantsNeeded(st.entrants.get(c.slug) ?? 0)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="dz-section ch-entries" aria-labelledby="ch-entries">
        <h2 id="ch-entries">{W.entriesHead}</h2>
        {!CHALLENGE.entries ? (
          <p className="dz-muted">{W.entriesOff}</p>
        ) : st.entries.length ? (
          <>
            <p className="dz-note">{W.entriesOrder}</p>
            <ul className="dz-rows">
              {st.entries.map((e) => (
                <li key={e.versionId}>
                  <Link href={`/references/designs/${e.versionId}`} className="dz-row">
                    {e.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="dz-thumb" src={e.thumb} alt="AI-generated front view, not by the author" width={64} height={48} loading="lazy" />
                    ) : (
                      <span className="dz-thumb dz-thumb-empty" aria-hidden="true" />
                    )}
                    <span className="dz-row-text">
                      <span className="dz-row-title">
                        <span className="ch-badge">{W.badge}</span> {W.entryLabel(nameOf(e.character), e.title)}
                      </span>
                      <span className="dz-row-meta">
                        {designByline(e.byName, e.maker)} · v{e.versionNo}
                      </span>
                      {e.thumb && (
                        <span className="dz-row-ai">
                          <AiTag what="Views" />
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="dz-muted">{W.entriesNone}</p>
        )}
        {CHALLENGE.entries && st.byAdmins.length > 0 && (
          <>
            <h3>{W.adminsHead}</h3>
            <ul className="ch-admin-list">
              {st.byAdmins.map((v) => (
                <li key={v.versionId}>
                  <Link href={`/references/designs/${v.versionId}`}>
                    {W.entryLabel(nameOf(v.character), v.title)} · {designByline(v.byName, v.maker)} · v{v.versionNo}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
