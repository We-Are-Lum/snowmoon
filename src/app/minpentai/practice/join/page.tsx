import { notFound } from 'next/navigation';
import { load } from '~/lib/minpentai/agent-play/store';
import { MinpentaiTags } from '../../mp-tags';
import { JoinButton } from '../join-button';
import '../../book/book.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Minpentai: join a practice match', robots: { index: false }, referrer: 'no-referrer' as const };

/**
 * A private invite (owner, 2026-11-03: single use, expires, joins as the other side). The invite itself is checked when
 * joining; this page says only who invited you and to what. A match that isn't waiting for a player reads as missing.
 */
export default async function Join({ searchParams }: { searchParams: Promise<{ m?: string; i?: string }> }) {
  const { m: id, i } = await searchParams;
  const r = id ? await load(id).catch(() => null) : null;
  const v = r?.m.versus;
  if (!r || !v || r.m.end || v.players.A !== null || !i) notFound();
  return (
    <div className="page minpentai">
      <article className="mb mb-live">
        <h1>A Minpentai practice match</h1>
        <MinpentaiTags tags={['rules', 'draft']} />
        <p><strong>{v.names.C}</strong> invites you to a practice match ({r.m.ruleset.startsWith('book') ? 'Rocks and Mirrors, the book edition' : 'Play'}), with a {v.clockSec >= 86400 ? '24-hour' : v.clockSec >= 14400 ? '4-hour' : '15-minute'} turn clock. You&rsquo;d play Amber.</p>
        <ul className="mb-moves">
          <li>Each of you plays through your own AI, or approves its draft with Take turn on your live page.</li>
          <li>Your orders stay sealed until both sides&rsquo; are in. If your clock runs out, the site computer plays your turn under your standing order.</li>
          <li>Nobody watches the match while it&rsquo;s on. When it ends, its record and replay are public. Practice matches never count toward any ranking.</li>
        </ul>
        <JoinButton matchId={r.m.id} invite={i} />
        <p className="mb-note">Rules invented for this edition, the book edition&rsquo;s pieces drawn from passages in the book · not affiliated with the author.</p>
      </article>
    </div>
  );
}
