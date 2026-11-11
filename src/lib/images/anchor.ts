import type { Ticket, TicketChallenge } from './ticket';

/**
 * A published image's passage (owner, 2026-11-10): every reader's image has one; a remix challenge picture never, and
 * never a moment ("challenge pictures must never be attached to a passage or moment"). Applied at publish, so a draft
 * signed before that day publishes without one too. No server-only imports, for the tests.
 */
export function publishAnchor(t: Pick<Ticket, 'chapter' | 'start' | 'end'> & { challenge?: unknown }): { chapter: number; start: number; end: number } | null {
  if (t.challenge) return null;
  return typeof t.chapter === 'number' && typeof t.start === 'number' && typeof t.end === 'number' ? { chapter: t.chapter, start: t.start, end: t.end } : null;
}

/** A challenge picture's record as published: what it is and what it started from, never a moment or its scene. */
export function challengeRecord(c: TicketChallenge): TicketChallenge {
  const { moment: _m, scene: _s, ...rest } = c;
  void _m;
  void _s;
  return rest;
}
