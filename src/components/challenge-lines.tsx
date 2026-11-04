import Link from 'next/link';
import type { SheetChallenge } from '~/lib/challenge/sheet-lines';
import { ChallengeSubmit } from './challenge-submit';
import { PostedOn } from './posted-on';

/** A sheet page's remix-challenge lines (src/lib/challenge/sheet-lines.ts), every word from that data. No hooks. */
export function ChallengeLines({ c, versionId, byFid }: { c: SheetChallenge; versionId: string; byFid: number }) {
  return (
    <>
      {c.lines.map((l) =>
        l.submit ? (
          <div key={l.text} className="dz-meta ch-standing">
            <p className={l.muted ? 'dz-muted' : undefined}>
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
            <ChallengeSubmit versionId={versionId} byFid={byFid} words={l.submit} />
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
