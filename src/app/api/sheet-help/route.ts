import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { complete, directKey, gatewayToken, promptFile, servingAllowed, ModelUnavailable } from '~/lib/chat/model';
import { bookCharacters, designByVersion } from '~/lib/images/designs';
import { isChallengeCharacter } from '~/lib/challenge/open-sheets';
import { sheetHelpLive } from '~/lib/sheet-help/flag';
import { sheetHelp, validateHelp, HelpError } from '~/lib/sheet-help/help';
import { signReceipt } from '~/lib/sheet-help/receipt';

/**
 * "Ask for help": one message (src/lib/sheet-help/help.ts). 404 unless it is live (SHEET_HELP.on, Privacy describing
 * it, and the challenge's sheets open: src/lib/sheet-help/flag.ts). Signed in with Farcaster (sheets are made by FIDs).
 * Only on a challenge character's sheet: the device names the sheet it is remixing (`from`), and the server finds the
 * character from it. The message, the draft and the reply pass through and are not stored.
 */
export async function POST(request: Request) {
  if (!sheetHelpLive()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to ask for help' }, { status: 401 });
  const sql = db();
  const token = gatewayToken(request);
  if (!sql || (!token && !directKey()) || !servingAllowed()) return NextResponse.json({ error: 'Help is not available on this deployment' }, { status: 503 });
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const src = typeof raw.from === 'string' ? await designByVersion(sql, raw.from).catch(() => null) : null;
  const character = src && src.kind === 'character' && isChallengeCharacter(src.entity) ? (bookCharacters().find((c) => c.name === src.entity) ?? null) : null;
  if (!character) return NextResponse.json({ error: 'Help is only on the challenge’s character sheets' }, { status: 404 });
  try {
    const input = validateHelp(raw, character.slug, character.firstChapter);
    const result = await sheetHelp(
      {
        sql,
        fid,
        complete: (model, messages, opts) => complete(token, model, messages, opts),
        systemPrompt: promptFile('sheet-help.md'),
        guardPolicy: promptFile('sheet-help-guard.md'),
        reminder: promptFile('sheet-help-reminder.md'),
        sign: signReceipt,
        facts: character.quotes,
        who: { name: character.name, firstChapter: character.firstChapter },
      },
      input,
    );
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof HelpError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ModelUnavailable) return NextResponse.json({ error: 'The model did not answer. Try again in a moment.' }, { status: 502 });
    console.error('sheet help failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again in a moment.' }, { status: 503 });
  }
}
