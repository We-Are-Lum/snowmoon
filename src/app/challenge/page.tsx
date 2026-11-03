import Link from 'next/link';
import { CHALLENGE } from '~/lib/config';
import { db } from '~/lib/db';
import { bookCharacter } from '~/lib/images/designs';
import { startingSheets } from '~/lib/challenge/entries';
import { PICK_SIZE, remixes } from '~/lib/challenge/remixes';
import { basesOf } from '~/lib/challenge/rules';
import { CHALLENGE_WORDING as W } from '~/lib/challenge/wording';
import { LANDING_WORDING as L } from '~/lib/challenge/landing-wording';
import { ChallengeBases } from '~/components/challenge-bases';
import { ChallengeRemixPick } from '~/components/challenge-remix-pick';

/**
 * The remix challenge's landing page, the short version (owner, 2026-11-04: "When it goes public, the page says much
 * less … a title, one line on what to do, the characters' bases, and a Remix button, with the rules behind a 'Rules'
 * link"). Draft for the owner's OK: what was cut, and where it went, is in docs/proposals/challenge-short-page.md.
 *
 * - The title and one line (what to do, and the deadline, built from CHALLENGE.dates), and "Rules" (/challenge/rules).
 * - Each character (CHALLENGE.characters, in that order) with its three bases as a triptych (CHALLENGE.bases, in
 *   CHALLENGE.baseStyles' order): tap one, then Remix opens its remix form. Before the bases are picked, up to three of
 *   its published sheets, newest first.
 * - A random few remixes, shuffled afresh in the browser on each visit from the full list (P5g's one exception:
 *   unweighted, no counts, no featuring), and "See all" (/challenge/remixes, newest first, by character). Proposed to
 *   the owner as staying; the owner's list doesn't name them.
 *
 * Why the shuffle runs in the browser, not on the server per request: the page stays cached (revalidate below), so a
 * launch-call crowd doesn't make a database read per visit, and every visit still gets its own order; a server shuffle
 * on a cached page would show everyone the same order for a minute. No remix or like count on any card (P5i).
 */
export const revalidate = 60;
export const metadata = { title: 'Remix the cast', description: 'The remix challenge on Snowmoon Party: pick a character, remix one of its bases.' };

const callName = (name: string) => name.split(' ')[0];

export default async function ChallengePage() {
  const sql = db();
  const chars = CHALLENGE.characters.map((s) => bookCharacter(s)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const sheets = await Promise.all(chars.map(async (c) => ({ c, list: sql ? await startingSheets(sql, c.slug).catch(() => []) : [] })));
  const all = sql ? await remixes(sql).catch(() => []) : [];
  const names = Object.fromEntries(chars.map((c) => [c.slug, callName(c.name)]));
  return (
    <div className="page prose ch-page">
      <h1>{W.title}</h1>
      <p className="ch-line">{L.line()}</p>
      <p className="ch-top-links">
        <Link href="/challenge/rules" className="ch-rules-link">{L.rulesLink}</Link>
        <span className="as-draft ch-draft"> · {W.draftShort}</span>
      </p>

      {sheets.map(({ c, list }) => {
        const name = callName(c.name);
        const bases = basesOf(c.slug).length > 0;
        const tiles = list.slice(0, CHALLENGE.maxBases);
        return (
          <section key={c.slug} className="dz-section ch-character" aria-labelledby={`ch-${c.slug}`} data-character={c.slug}>
            <h2 id={`ch-${c.slug}`}>{c.name}</h2>
            {!bases && <p className="dz-muted ch-no-bases">{tiles.length ? L.noBasesYet(name) : L.noBasesNoSheet(name)}</p>}
            {tiles.length > 0 && <ChallengeBases slug={c.slug} name={name} bases={bases} tiles={tiles.map((s) => ({ versionId: s.versionId, title: s.title, byName: s.byName, byFid: s.byFid, thumb: s.thumb, style: bases ? s.style : null }))} />}
          </section>
        );
      })}

      <section className="dz-section ch-remixes" aria-labelledby="ch-remixes">
        <h2 id="ch-remixes">{L.remixesHead}</h2>
        {all.length > 0 && <p className="dz-note">{L.remixesNote}</p>}
        <ChallengeRemixPick all={all.map((r) => ({ versionId: r.versionId, character: r.character, title: r.title, byName: r.byName, byFid: r.byFid, thumb: r.thumb }))} size={PICK_SIZE} names={names} />
      </section>
      <p className="dz-note ch-foot">{W.notAffiliated}</p>
    </div>
  );
}
