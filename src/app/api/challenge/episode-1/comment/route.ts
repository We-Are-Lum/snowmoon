import { NextResponse } from 'next/server';
import { getPerson, signedInAs } from '~/lib/auth';
import { db } from '~/lib/db';
import { mayAsk } from '~/lib/chat/gate';
import { complete, directKey, gatewayToken, promptFile, servingAllowed, ModelUnavailable } from '~/lib/chat/model';
import { commentOn } from '~/lib/challenge/episode/comment';
import { PROBLEMS, readOutline } from '~/lib/challenge/episode/rules';
import { episodeVisibleTo } from '~/lib/challenge/episode/visibility';
import { EPISODE_WORDING as W } from '~/lib/challenge/episode/wording';

/**
 * Episode 1's AI comment (owner, 2026-11-24). POST { title, cards, minuteAfter }: the draft, read as Submit reads it
 * (the sample-words rule aside: a draft may still hold them), then src/lib/challenge/episode/comment.ts. Who may ask is
 * the assistant's own rule (src/lib/chat/gate.ts). Neither the draft nor the comment is stored or logged.
 */
/**
 * A draft as the comment reads it: a card with neither half written is left out (the line moves with the cards before
 * it), and an empty half is sent as "(empty)", so a half-written draft can be commented on. Submit doesn't use this.
 */
function forComment(input: unknown): unknown {
  const o = (input ?? {}) as { title?: unknown; cards?: unknown; minuteAfter?: unknown };
  const raw = (Array.isArray(o.cards) ? o.cards : []) as { happens?: unknown; does?: unknown }[];
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const line = typeof o.minuteAfter === 'number' ? o.minuteAfter : 0;
  const kept = raw.map((c, i) => ({ c, i })).filter(({ c }) => text(c?.happens) || text(c?.does));
  return {
    title: o.title,
    cards: kept.map(({ c }) => ({ happens: text(c.happens) || '(empty)', does: text(c.does) || '(empty)', picture: null })),
    minuteAfter: kept.filter(({ i }) => i < line).length,
  };
}

export async function POST(request: Request) {
  const person = await getPerson(request);
  if (!episodeVisibleTo(person)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (person === null) return NextResponse.json({ error: W.commentSignIn }, { status: 401 });
  const sql = db();
  const token = gatewayToken(request);
  if (!sql || (!token && !directKey()) || !servingAllowed()) return NextResponse.json({ error: 'The assistant is not available on this deployment' }, { status: 503 });
  try {
    const gate = await mayAsk(sql, person, { lookUp: true, signedInAs: await signedInAs(request) });
    if (!gate.ok) return NextResponse.json({ error: gate.error, reason: gate.reason }, { status: gate.status });
    const read = readOutline(forComment(await request.json().catch(() => null)), []);
    if (!read.ok) return NextResponse.json({ error: read.problems.some((p) => p.why === PROBLEMS.noCards) ? W.commentNeedsCards : read.problems[0].why, problems: read.problems }, { status: 400 });
    const r = await commentOn({ sql, fid: person, complete: (model, messages, opts) => complete(token, model, messages, opts), systemPrompt: promptFile('episode-comment.md') }, read.outline);
    if (r.state === 'limit') return NextResponse.json({ error: "You've used today's assistant questions. Try again tomorrow." }, { status: 429 });
    if (r.state === 'spend') return NextResponse.json({ error: "The assistant has reached today's limit for everyone. Try again tomorrow." }, { status: 429 });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ModelUnavailable) return NextResponse.json({ error: 'The model did not answer. Try again in a moment.' }, { status: 502 });
    console.error('episode comment failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
