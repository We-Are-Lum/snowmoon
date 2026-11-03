import { listOpen } from '~/lib/minpentai/agent-play/store';
import { MinpentaiTags } from '../mp-tags';
import { JoinButton } from './join-button';
import '../book/book.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Minpentai: practice matches', robots: { index: false } };

/**
 * The open list (owner, 2026-11-03): public practice matches waiting for a second player. Matches being played are never
 * listed: nobody watches a match while it's on.
 */
export default async function Practice() {
  const open = await listOpen().catch(() => []);
  const clock = (sec: number) => (sec >= 86400 ? '24 hours' : sec >= 14400 ? '4 hours' : '15 minutes');
  return (
    <div className="page minpentai">
      <article className="mb mb-live">
        <h1>Practice matches</h1>
        <MinpentaiTags tags={['rules', 'draft']} />
        <p>Minpentai against another person, each of you through your own AI or your live page. Free, and never counted toward any ranking. Ask your AI to create one (<code>minpentai_create_practice</code>), private with an invite link or public on this list.</p>
        <h2>Waiting for a player</h2>
        {open.length ? (
          <ul className="mb-moves">
            {open.map((r) => (
              <li key={r.id}>
                <strong>{r.state.versus!.names.C}</strong>{` · ${r.ruleset.startsWith('book') ? 'Rocks and Mirrors' : 'Play'} · turn clock ${clock(r.state.versus!.clockSec)}`}
                <JoinButton matchId={r.id} />
              </li>
            ))}
          </ul>
        ) : <p>None right now.</p>}
        <p className="mb-note">Rules invented for this edition, the book edition&rsquo;s pieces drawn from passages in the book · not affiliated with the author.</p>
      </article>
    </div>
  );
}
