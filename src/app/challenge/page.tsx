import Link from 'next/link';
import { CHALLENGE } from '~/lib/config';
import { db } from '~/lib/db';
import { designByline } from '~/lib/images/byline';
import { bookCharacter } from '~/lib/images/designs';
import { sheetCharacter } from '~/lib/images/sheets';
import { standing, startingSheets, type Standing } from '~/lib/challenge/entries';
import { entrantCounts, phase } from '~/lib/challenge/rules';
import { CHALLENGE_WORDING as W } from '~/lib/challenge/wording';
import { AiTag } from '~/components/ai-tag';

/**
 * The remix challenge (owner, 2026-10-31; docs/proposals/remix-challenge-plan.md, build list item 1): the rules (the
 * plan's draft copy, marked as draft wording, every date from CHALLENGE.dates), the characters (CHALLENGE.characters, in
 * that order), each with its count of distinct eligible entrants (a count, never a ranking), with the sheets to
 * start from, the entries so far (newest first; only once CHALLENGE.entries is on, after the owner's reread) and the
 * deadline. Readable signed out. Nothing is ordered by likes, payments or anything but time (P5, P7).
 */
export const revalidate = 60;
export const metadata = { title: 'Remix the cast', description: 'The remix challenge on Snowmoon Party: draft rules.' };

const callName = (name: string) => name.split(' ')[0];

export default async function ChallengePage() {
  const sql = db();
  const chars = CHALLENGE.characters.map((s) => bookCharacter(s)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const sheets = await Promise.all(chars.map(async (c) => ({ c, about: sheetCharacter(c.slug)?.about ?? null, list: sql ? await startingSheets(sql, c.slug).catch(() => []) : [] })));
  const none: Standing = { entries: [], byAdmins: [], entrants: entrantCounts([]) };
  const st: Standing = sql && CHALLENGE.entries ? await standing(sql).catch(() => none) : none;
  const now = phase();
  const nameOf = (slug: string) => callName(chars.find((c) => c.slug === slug)?.name ?? slug);
  return (
    <div className="page prose ch-page">
      <p className="label ip-crumb">
        <Link href="/references/designs?tab=characters">← Characters</Link>
      </p>
      <h1>{W.title}</h1>
      <p className="as-draft ch-draft">{W.draft}</p>
      <p className="ch-deadline">
        <strong>{now === 'before' ? W.opensOn() : now === 'open' ? W.deadline() : W.closed()}</strong>
        {now === 'before' && ` ${W.deadline()}`}
      </p>
      <section className="ch-rules">
        <p>{W.intro()}</p>
        <p>
          <strong>{W.nextHead}</strong> {W.next()}
        </p>
        <p>
          <strong>{W.bountyHead}</strong> {W.bounty}
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

      {sheets.map(({ c, about, list }) => (
        <section key={c.slug} className="dz-section ch-character" aria-labelledby={`ch-${c.slug}`}>
          <h2 id={`ch-${c.slug}`}>{c.name}</h2>
          {CHALLENGE.entries && (
            <p className="dz-meta ch-count">
              {W.entrants(st.entrants.get(c.slug) ?? 0)} · {W.entrantsNeeded(st.entrants.get(c.slug) ?? 0)}
            </p>
          )}
          {about && <p>{about}</p>}
          <p>
            <Link href={`/references/designs/character/${c.slug}`}>{W.readBook(callName(c.name))} →</Link>
          </p>
          <p className="dz-label">{W.startFrom}</p>
          {list.length ? (
            <ul className="dz-rows">
              {list.map((s) => (
                <li key={s.versionId}>
                  <Link href={`/references/designs/${s.versionId}`} className="dz-row">
                    {s.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="dz-thumb" src={s.thumb} alt={`AI-generated front view of ${c.name}, not by the author`} width={64} height={48} loading="lazy" />
                    ) : (
                      <span className="dz-thumb dz-thumb-empty" aria-hidden="true" />
                    )}
                    <span className="dz-row-text">
                      <span className="dz-row-title">{s.title || `${callName(c.name)}`}</span>
                      <span className="dz-row-meta">{designByline(s.byName, s.byFid)}</span>
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
          ) : CHALLENGE.held.includes(c.slug) ? (
            <p className="dz-muted">{W.held(callName(c.name))}</p>
          ) : (
            <p className="dz-muted">{W.noSheetYet(callName(c.name))}</p>
          )}
        </section>
      ))}

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
                        <span className="ch-badge">{W.badge}</span> {nameOf(e.character)}: {e.title || nameOf(e.character)}
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
                    {nameOf(v.character)}: {v.title || nameOf(v.character)} · {designByline(v.byName, v.maker)} · v{v.versionNo}
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
