import Link from 'next/link';
import type { ChallengeView } from '~/lib/challenge/view';
import { ChallengeBases } from './challenge-bases';
import { ChallengeRemixPick } from './challenge-remix-pick';

/**
 * /challenge's page, the short landing (owner, 2026-11-04), drawn from its data (src/lib/challenge/view.ts), which
 * carries every word: the title and one line, "Rules" (/challenge/rules), each character in CHALLENGE.characters'
 * order with its bases and, under "First remixes by @naaate", the owner's first remixes, then a random few remixes
 * and "See all". Nothing is ordered by likes, payments or anything but time or chance (P5, P7). No hooks, so the
 * public page draws it on the server and the admins' view (challenge-admin.tsx) in the browser.
 */
export function ChallengeBody({ v }: { v: ChallengeView }) {
  return (
    <div className="page prose ch-page">
      {v.adminNote && <p className="dz-note ch-admin-only">{v.adminNote}</p>}
      <h1>{v.title}</h1>
      <p className="ch-line">{v.line}</p>
      <p className="ch-top-links">
        <Link href="/challenge/rules" className="ch-rules-link">
          {v.rulesLink}
        </Link>
        <span className="as-draft ch-draft"> · {v.draftShort}</span>
      </p>

      {v.characters.map((c) => (
        <section key={c.slug} className="dz-section ch-character" aria-labelledby={`ch-${c.slug}`} data-character={c.slug}>
          <h2 id={`ch-${c.slug}`}>{c.name}</h2>
          {c.note && <p className="dz-muted ch-no-bases">{c.note}</p>}
          {c.bases.length > 0 && <ChallengeBases slug={c.slug} name={c.callName} bases={c.bases} firsts={c.firsts} emptySlots={c.emptySlots} firstsHead={c.firstsHead} w={c.w} />}
        </section>
      ))}

      <section className="dz-section ch-remixes" aria-labelledby="ch-remixes">
        <h2 id="ch-remixes">{v.remixesHead}</h2>
        {v.remixesNote && <p className="dz-note">{v.remixesNote}</p>}
        <ChallengeRemixPick all={v.remixes} size={v.pickSize} w={v.pick} />
      </section>
      <p className="dz-note ch-foot">{v.notAffiliated}</p>
    </div>
  );
}
