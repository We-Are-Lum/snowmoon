import Link from 'next/link';
import { CHALLENGE } from '~/lib/config';
import { db } from '~/lib/db';
import { bookCharacter } from '~/lib/images/designs';
import { startingSheets } from '~/lib/challenge/entries';
import { PICK_SIZE, remixes } from '~/lib/challenge/remixes';
import { basesOf, firstRemixesOf } from '~/lib/challenge/rules';
import { CHALLENGE_WORDING as W } from '~/lib/challenge/wording';
import { LANDING_WORDING as L } from '~/lib/challenge/landing-wording';
import { ChallengeBases, type BaseTile } from '~/components/challenge-bases';
import { ChallengeRemixPick } from '~/components/challenge-remix-pick';

/**
 * The remix challenge's landing page, the short version (owner, 2026-11-04: "When it goes public, the page says much
 * less … a title, one line on what to do, the characters' bases, and a Remix button, with the rules behind a 'Rules'
 * link"). Draft for the owner's OK: what was cut, and where it went, is in docs/proposals/challenge-short-page.md.
 *
 * - The title and one line (what to do, and the deadline, built from CHALLENGE.dates), and "Rules" (/challenge/rules).
 * - Each character (CHALLENGE.characters, in that order) with its one base (CHALLENGE.bases; owner, 2026-11-04, after
 *   the restart) and the owner's first remixes of it (CHALLENGE.firstRemixes, up to CHALLENGE.firstRemixesShown), in a
 *   row of three: an empty slot for each first remix that doesn't exist yet. Tap one, then Remix opens its remix form.
 *   Before the base is picked, the row starts with the character's newest published sheet.
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
        const starts: BaseTile[] = list.slice(0, CHALLENGE.maxBases).map((s) => ({ kind: bases ? 'base' : 'sheet', versionId: s.versionId, title: s.title, byName: s.byName, byFid: s.byFid, thumb: s.thumb, style: bases ? s.style : null }));
        // The owner's first remixes, in CHALLENGE.firstRemixes' order, each found among the published remixes of this
        // character by its element or version id; one that isn't published (or isn't this character's) is left out.
        const firsts: BaseTile[] = firstRemixesOf(c.slug)
          .map((id) => all.find((r) => r.character === c.slug && (r.versionId.toLowerCase() === id || r.elementId.toLowerCase() === id)))
          .filter((r): r is NonNullable<typeof r> => Boolean(r))
          .map((r) => ({ kind: 'remix', versionId: r.versionId, title: r.title, byName: r.byName, byFid: r.byFid, thumb: r.thumb, style: null }));
        const tiles = [...starts, ...firsts];
        return (
          <section key={c.slug} className="dz-section ch-character" aria-labelledby={`ch-${c.slug}`} data-character={c.slug}>
            <h2 id={`ch-${c.slug}`}>{c.name}</h2>
            {!bases && <p className="dz-muted ch-no-bases">{tiles.length ? L.noBasesYet(name) : L.noBasesNoSheet(name)}</p>}
            {starts.length > 0 && <ChallengeBases slug={c.slug} name={name} tiles={tiles} emptySlots={CHALLENGE.firstRemixesShown - firsts.length} />}
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
