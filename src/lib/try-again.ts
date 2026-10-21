import { NextResponse } from 'next/server';

/**
 * A database call failed inside a route that changes something (2026-10-19: a Hide answered a bare 500 when a
 * query failed; see docs/db-interleave.md). The person is told to try again, nothing about the error itself; the
 * log gets the Postgres code (or the error's name) and the route, never values. DRAFT wording.
 */
export const TRY_AGAIN = 'Something went wrong on our side. Try again in a moment.';

export function tryAgain(route: string, e: unknown): NextResponse {
  console.error(`${route} failed`, (e as { code?: string }).code ?? (e as Error)?.name ?? 'unknown');
  return NextResponse.json({ error: TRY_AGAIN, retry: true }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
