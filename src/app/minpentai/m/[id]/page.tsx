import { notFound } from 'next/navigation';
import { playOn } from '~/lib/agents/core';
import { linkOpens, recordOf, viewFor } from '~/lib/minpentai/agent-play/solo';
import { load } from '~/lib/minpentai/agent-play/store';
import { MinpentaiTags } from '../../mp-tags';
import { Refresh } from './refresh';
import { ViewBoard } from './view-board';
import '../../book/book.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Minpentai: your side', robots: { index: false }, referrer: 'no-referrer' as const };

/**
 * A person's live link to their agent-play match (draft, 2026-10-31): their side only, the same view their agent
 * gets (solo.ts viewFor), never the other side's board or orders while the match is on. The link's secret is in
 * ?k=; a wrong or missing secret and a missing match read the same. Off while AGENTS.minpentaiPlay is off.
 */
export default async function LiveLink({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  if (!playOn()) notFound();
  const { id } = await params, { k } = await searchParams;
  const r = await load(id).catch(() => null);
  if (!r || !linkOpens(r.m, k ?? '')) notFound();
  const m = r.m, v = viewFor(m);
  const end = m.end ? recordOf(m) : null;
  return (
    <div className="page minpentai">
      <article className="mb">
        <h1>Minpentai: your side</h1>
        <MinpentaiTags tags={['rules', 'draft']} />
        <p>
          {v.ruleset}, against the site computer (level {v.opponent.level}). You are Cyan. {v.rule ? `Rule this match: ${v.rule}` : ''}
        </p>
        <p className="mb-note">
          {v.phase === 'over' ? `Over at step ${m.end!.step}: ${m.end!.win === 'C' ? 'you won' : m.end!.win === 'A' ? 'the site computer won' : 'a draw'} (${m.end!.how}).` : `Step ${v.step} of ${v.max_steps} · turn ${v.turn}${v.phase === 'setup' ? ' (setup)' : ''} · ${v.points} points to place`}
        </p>
        {end ? (
          <>
            <h2>The whole board at the end</h2>
            <ViewBoard board={end.final_position} width={v.board_size.width} height={v.board_size.height} />
          </>
        ) : (
          <ViewBoard board={v.board} width={v.board_size.width} height={v.board_size.height} canPlace={v.can_place} lastSeen={v.last_seen_enemy_towers} />
        )}
        {!end ? (
          <>
            <h3>Your orders this turn</h3>
            {v.my_orders ? (
              <p>{v.my_orders.placements.map((p) => `${p.piece} at ${p.x},${p.y}${'dir' in p && p.dir ? ` ${p.dir}` : ''}${'slant' in p && p.slant ? ` ${p.slant}` : ''}`).join('; ') || 'nothing'} ({v.my_orders.source}{v.my_orders.final ? ', final' : ''}){v.my_orders.note ? ` · note: ${v.my_orders.note}` : ''}</p>
            ) : <p>None yet.</p>}
            <p className="mb-note">The site computer has committed its orders: {v.opponent_commitment?.slice(0, 16)}… (they are revealed with yours).</p>
          </>
        ) : null}
        <h3>Standing order</h3>
        <p>{v.standing_order ? `“${v.standing_order.text}” (preset: ${v.standing_order.preset})` : 'None: if the site computer plays a turn for you, it plays balanced.'}</p>
        <h3>Your turns so far</h3>
        <ol>{v.my_turns.map((t) => <li key={t.turn}>Step {t.step}: {t.placements.map((p) => `${p.piece} ${p.x},${p.y}`).join('; ') || 'nothing'} ({t.source})</li>)}</ol>
        <p className="mb-note">Only your side is shown while the match is on: what your towers see, and where you last saw the enemy's. Rules invented for this edition · not affiliated with the author.</p>
        {!end ? <Refresh seconds={5} /> : null}
      </article>
    </div>
  );
}
