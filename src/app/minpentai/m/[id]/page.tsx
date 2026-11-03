import { notFound } from 'next/navigation';
import { playFor } from '~/lib/agents/core';
import { draftInfo, linkSide, recordOf, turnFrames, viewFor } from '~/lib/minpentai/agent-play/solo';
import { load } from '~/lib/minpentai/agent-play/store';
import { settle } from '~/lib/minpentai/agent-play/quiet';
import { clocked } from '~/lib/minpentai/agent-play/act';
import { MinpentaiTags } from '../../mp-tags';
import { Refresh } from './refresh';
import { ViewBoard } from './view-board';
import { TakeTurn } from './take-turn';
import { Replay } from './replay';
import '../../book/book.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Minpentai: your side', robots: { index: false }, referrer: 'no-referrer' as const };

const WHO: Record<string, string> = { person: 'you', agent: 'your AI', 'site-computer': 'the site computer', autopilot: 'your AI (autopilot)' };
const PRESET: Record<string, string> = { balanced: 'balanced', defend: 'defend', attack: 'attack', expand: 'expand' };
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
type Move = { piece: string; x: number; y: number; dir?: string; slant?: string };
const say = (p: Move) => `${p.piece.replace(/_/g, ' ')} at ${p.x},${p.y}${p.dir ? `, ${p.piece === 'factory' ? 'firing' : 'flying'} ${p.dir}` : ''}${p.slant ? `, leaning ${p.slant}` : ''}`;

/**
 * A person's live link to their agent-play match (owner, 2026-11-01: "good to watch on a phone while my AI plays"): their
 * side only (solo.ts viewFor, the same view their AI gets), the last turn's moves outlined on the board with who chose
 * each, this turn's orders, and the standing order in effect. Never the other side's board or orders while the match is
 * on. The secret is in ?k=; a wrong or missing secret, a missing match and someone else's read the same (404).
 */
export default async function LiveLink({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string; turn?: string }> }) {
  const { id } = await params, { k, turn: turnParam } = await searchParams;
  const peek = await load(id).catch(() => null);
  // A practice match has a link per player, each opening that player's side only.
  const side = peek ? linkSide(peek.m, k ?? '') : null;
  const owner = peek && side ? (peek.m.versus ? peek.m.versus.players[side] : peek.m.person) : null;
  if (!peek || !side || owner === null || !playFor(owner)) notFound();
  // The same quiet time as every tool call (quiet.ts): the page's timing says nothing about the computer's planning.
  // A practice match has no computer to hide, but its clock runs on every read (act.ts clocked).
  const r = (peek.m.versus ? await clocked(id) : await settle(id)) ?? peek;
  const m = r.m, v = viewFor(m, side), vs = m.versus;
  const end = m.end ? recordOf(m) : null;
  const last = v.my_turns[v.my_turns.length - 1];
  const draft = draftInfo(m, side);
  // The replay: the last turn played while the match is on (your side's view); any turn, whole board, once it's over.
  const replayTurn = end && turnParam !== undefined && m.history.some((h) => h.turn === Number(turnParam)) ? Number(turnParam) : last?.turn;
  const frames = replayTurn !== undefined ? turnFrames(m, replayTurn, !!end, side) : [];
  const book = m.ruleset.startsWith('book');
  return (
    <div className="page minpentai">
      <article className="mb mb-live">
        <p className="mb-status">
          {v.phase === 'over'
            ? `Over at step ${m.end!.step}: ${m.end!.win === 'C' ? 'you won' : m.end!.win === 'A' ? 'the site computer won' : 'a draw'}.`
            : `Step ${v.step} of ${v.max_steps} · turn ${v.turn}${v.phase === 'setup' ? ' (setup)' : ''}`}
        </p>
        <h1>{book ? 'Rocks and Mirrors' : 'Minpentai'}: your side</h1>
        {'towers_destroyed' in v && v.towers_destroyed ? (
          <p className="mb-tally">
            Towers destroyed: <strong>you {v.towers_destroyed.by_you}</strong> · the site computer {v.towers_destroyed.by_opponent}
            {v.your_kills?.length ? <> (yours: {v.your_kills.map((x) => `(${x.x}, ${x.y}) at step ${x.step}`).join(', ')})</> : null}. With towers level at the last step, more destroyed wins.
          </p>
        ) : null}
        <MinpentaiTags tags={['rules', 'draft']} />
        {end ? (
          <>
            <h2>The whole board at the end</h2>
            <ViewBoard board={end.final_position} width={v.board_size.width} height={v.board_size.height} />
          </>
        ) : (
          <ViewBoard board={v.board} width={v.board_size.width} height={v.board_size.height} canPlace={v.can_place} lastSeen={v.last_seen_enemy_towers} marks={last ? last.placements : []} ghosts={draft && !draft.final ? draft.placements : []} />
        )}
        <p className="mb-note">{vs ? `You are ${v.side}, against ${v.opponent.joined ? v.opponent.name : 'a player who hasn’t joined yet'} (a practice match).` : `You are Cyan, against the site computer (level ${v.opponent.level}).`} Only your side is shown while the match is on: what your towers see, and where you last saw the enemy&rsquo;s.{book ? <> <a href="/minpentai/book/tutorial">How the pieces work →</a></> : null}</p>

        {frames.length ? (
          <>
            <h2>{end ? `Turn ${replayTurn}, step by step: the whole board` : `Last turn, step by step: what your side saw`}</h2>
            <Replay key={`${replayTurn}-${!!end}`} frames={frames} width={v.board_size.width} height={v.board_size.height} whole={!!end} summary={!end ? v.last_turn_summary?.lines : undefined} />
            {end ? <p className="mb-note">Replay a turn: {m.history.map((h) => <a key={h.turn} href={`?k=${encodeURIComponent(k ?? '')}&turn=${h.turn}`}>{h.turn}</a>).reduce((a: React.ReactNode[], x, i) => (i ? [...a, ' · ', x] : [x]), [])}</p> : null}
          </>
        ) : null}

        <h2>Last turn</h2>
        {last ? (
          <>
            <p>Turn {last.turn}, step {last.step}: chosen by <strong>{WHO[last.source] ?? last.source}</strong>{last.preset ? ` (standing order: ${PRESET[last.preset] ?? last.preset})` : ''}. Outlined on the board.</p>
            <ul className="mb-moves">{last.placements.length ? last.placements.map((p, i) => <li key={i}>{say(p as Move)}<span className="mb-who">{WHO[last.source] ?? last.source}</span></li>) : <li>Nothing placed.</li>}</ul>
          </>
        ) : <p>No turn played yet.</p>}
        {v.last_turn_summary && !(frames.length && !end) ? (
          <>
            <h3>What your side saw happen (steps {v.last_turn_summary.from_step}–{v.last_turn_summary.from_step + v.every})</h3>
            <ul className="mb-moves">{v.last_turn_summary.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </>
        ) : null}

        {!end ? (
          <>
            <h2>This turn</h2>
            {draft && !draft.final ? (
              <>
                <p><strong>{cap(WHO[draft.source] ?? draft.source)}</strong> drafted these orders, shown faint on the board: <strong>{`${draft.cost} of ${draft.points} points`}</strong>.</p>
                <ul className="mb-moves">{draft.placements.length ? draft.placements.map((p, i) => <li key={i}>{say(p as Move)}</li>) : <li>Nothing placed.</li>}</ul>
                {draft.warnings.length ? <ul className="mb-warnings">{draft.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
                {draft.note ? <p className="mb-note">Note: {draft.note}</p> : null}
                <TakeTurn id={m.id} turn={v.turn} />
              </>
            ) : v.my_orders ? (
              <>
                <p>Orders in: chosen by <strong>{WHO[v.my_orders.source] ?? v.my_orders.source}</strong>{v.my_orders.final ? ', final' : ', not final yet'}.</p>
                <ul className="mb-moves">{v.my_orders.placements.length ? v.my_orders.placements.map((p, i) => <li key={i}>{say(p as Move)}</li>) : <li>Nothing placed.</li>}</ul>
                {v.my_orders.note ? <p className="mb-note">Note: {v.my_orders.note}</p> : null}
              </>
            ) : <p>No orders yet. {v.points} points to place.</p>}
            {vs ? (
              <p className="mb-note">
                {v.opponent.joined ? <>Playing <strong>{v.opponent.name}</strong>. </> : 'Waiting for someone to join. '}
                {v.opponent.sent_final_orders ? `Their orders are in, sealed (${(v.opponent.commitment ?? '').slice(0, 12)}…). ` : v.opponent.joined ? 'Their orders aren’t in yet. ' : ''}
                {vs.deadline ? `This turn’s clock runs out ${new Date(vs.deadline).toUTCString()}; then the site computer plays any side whose orders aren’t in, under its standing order.` : ''}
                {' '}A practice match: never counted toward any ranking.
              </p>
            ) : (
              <p className="mb-note">The site computer&rsquo;s moves this turn follow from the board and its random value, committed at the start ({(v.opponent.random_commitment ?? '').slice(0, 12)}…); anyone can check them after the end.</p>
            )}
          </>
        ) : null}

        <h2>Standing order</h2>
        <p>{v.standing_order ? <>&ldquo;{v.standing_order.text}&rdquo; <span className="mb-who">{PRESET[v.standing_order.preset]}</span></> : 'None: if the site computer plays a turn for you, it plays balanced.'}</p>

        <h2>All your turns</h2>
        <ol>{v.my_turns.map((t) => <li key={t.turn}>Step {t.step}: {t.placements.map((p) => say(p as Move)).join('; ') || 'nothing'} <span className="mb-who">{WHO[t.source] ?? t.source}{'taken_on_the_live_page' in t && t.taken_on_the_live_page ? `, on this page (drafted by ${WHO[t.drafted_by ?? ''] ?? t.drafted_by})` : ''}</span></li>)}</ol>
        <p className="mb-note">Rules invented for this edition{book ? ', drawn from passages in the book' : ''} · not affiliated with the author.</p>
        {!end ? <Refresh seconds={5} /> : null}
      </article>
    </div>
  );
}
