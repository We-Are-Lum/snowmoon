import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { complete, directKey, gatewayToken, promptFile, servingAllowed, ModelUnavailable } from '~/lib/chat/model';
import { bookCharacters, designByVersion } from '~/lib/images/designs';
import { isChallengeCharacter } from '~/lib/challenge/open-sheets';
import { findMomentLive } from '~/lib/sheet-help/flag';
import { findMoment, validateMoment, MomentError } from '~/lib/sheet-help/find-moment';

/**
 * "Find a moment" in "Ask for help": one search (src/lib/sheet-help/find-moment.ts). 404 unless it is live (its own
 * switch SHEET_HELP.findMoment, "Ask for help" live, and Privacy §5 describing it: src/lib/sheet-help/flag.ts).
 * Signed in with Farcaster; only beside a challenge character's sheet (the device names the sheet it is remixing,
 * `from`, as "Ask for help" does). The character searched for is the sheet's, or another of the book's cast. The mood
 * and the results pass through and are not stored; the search counts as one of "Ask for help"'s messages.
 */
export async function POST(request: Request) {
  if (!findMomentLive()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Farcaster only (owner, 2026-11-04): getFid reads a Quick Auth token, never a wallet, Lens or Bluesky sign-in.
  const fid = await getFid(request);
  if (fid === null || !Number.isInteger(fid) || fid <= 0) return NextResponse.json({ error: 'Sign in with Farcaster to ask for help' }, { status: 401 });
  const sql = db();
  const token = gatewayToken(request);
  if (!sql || (!token && !directKey()) || !servingAllowed()) return NextResponse.json({ error: 'Help is not available on this deployment' }, { status: 503 });
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const src = typeof raw.from === 'string' ? await designByVersion(sql, raw.from).catch(() => null) : null;
  const cast = bookCharacters();
  const sheet = src && src.kind === 'character' && isChallengeCharacter(src.entity) ? (cast.find((c) => c.name === src.entity) ?? null) : null;
  if (!sheet) return NextResponse.json({ error: 'Help is only on the challenge’s character sheets' }, { status: 404 });
  try {
    const input = validateMoment(raw, cast, sheet.slug);
    const who = cast.find((c) => c.slug === input.character)!;
    const result = await findMoment(
      {
        sql,
        fid,
        complete: (model, messages, opts) => complete(token, model, messages, opts),
        systemPrompt: promptFile('find-moment.md'),
        searchPrompt: promptFile('chat-search-terms.md'),
        guardPolicy: promptFile('find-moment-guard.md'),
        reminder: promptFile('find-moment-reminder.md'),
        who: { name: who.name, firstChapter: who.firstChapter },
      },
      input,
    );
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof MomentError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ModelUnavailable) return NextResponse.json({ error: 'The model did not answer. Try again in a moment.' }, { status: 502 });
    console.error('find a moment failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again in a moment.' }, { status: 503 });
  }
}
