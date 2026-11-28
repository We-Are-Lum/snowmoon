import { after, NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { alertReports } from '~/lib/images/alert';
import { ownStoryboard, reportStoryboard } from '~/lib/voice/moderation';
import { moderationDeps, publishOn, takesOn } from '~/lib/voice/publish-deps';
import { voiceTestPerson } from '~/lib/voice/flag';

// Anyone signed in (a Farcaster sign-in; the local tests' stand-in sign-in off Vercel only).
const who = async (request: Request) => voiceTestPerson(request) ?? (await getFid(request));

/**
 * Report a published storyboard (Nate, 2026-11-23), by any signed-in person: one reason and an optional private note.
 * The images' rules (src/lib/voice/moderation.ts): one report per person, inside the same daily limit as images; one
 * "minor" report, or three different reporters, hide it at once until a moderator looks.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Storyboards (VOICE.publish) and takes (VOICE.publishTakes, 2026-11-26): the same report and hide (#225).
  if (!publishOn() && !takesOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const fid = await who(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in to report' }, { status: 401 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available here' }, { status: 503 });
  const { id } = await params;
  const r = await reportStoryboard(sql, fid, id, await request.json().catch(() => ({})), moderationDeps());
  // The moderators' push ("Snowmoon: N reports waiting", nothing else), after the answer; never fails the report.
  // (The page is rendered on every request, so a hide shows at once.)
  if (r.status === 200) {
    try {
      after(() => alertReports(sql).then(() => undefined, () => undefined));
    } catch {
      void alertReports(sql).catch(() => undefined);
    }
  }
  return NextResponse.json(r.json, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * GET: for the signed-in person only, whether this publication is their own, and if it is hidden, why (so its maker
 * sees the reason on the hidden page). Never says whose it is to anyone else: an unnamed storyboard stays unnamed.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Storyboards (VOICE.publish) and takes (VOICE.publishTakes, 2026-11-26): the same report and hide (#225).
  if (!publishOn() && !takesOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const fid = await who(request);
  if (fid === null) return NextResponse.json({ mine: false }, { headers: { 'Cache-Control': 'no-store' } });
  const sql = db();
  if (!sql) return NextResponse.json({ mine: false });
  const { id } = await params;
  const r = await ownStoryboard(sql, fid, id);
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
}
