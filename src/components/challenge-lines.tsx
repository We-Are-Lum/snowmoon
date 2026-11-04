import Link from 'next/link';
import type { SheetChallenge } from '~/lib/challenge/sheet-lines';
import { ChallengeMark } from './challenge-mark';
import { PostedOn } from './posted-on';

/** A sheet page's remix-challenge lines (src/lib/challenge/sheet-lines.ts), every word from that data. No hooks. */
export function ChallengeLines({ c, versionId, byFid }: { c: SheetChallenge; versionId: string; byFid: number }) {
  return (
    <>
      {c.lines.map((l) =>
        l.mark ? (
          <div key={l.text} className="dz-meta ch-standing">
            <p className="dz-muted">{l.text}</p>
            <ChallengeMark versionId={versionId} byFid={byFid} words={l.mark} />
          </div>
        ) : (
          <p key={l.text} className={`dz-meta ch-standing${l.muted ? ' dz-muted' : ''}${l.link && !l.badge ? ' ch-invite' : ''}`}>
            {l.badge && (
              <>
                <span className="ch-badge">{l.badge}</span>{' '}
              </>
            )}
            {l.text}
            {l.link && (
              <>
                {' '}
                <Link href={l.link.href}>{l.link.text}</Link>
              </>
            )}
          </p>
        ),
      )}
    </>
  );
}

/** "Posted on", from the same data. */
export function ChallengePosts({ c, versionId }: { c: SheetChallenge; versionId: string }) {
  return c.posts.length > 0 ? <PostedOn versionId={versionId} posts={c.posts} /> : null;
}
