import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { AGENTS } from '~/lib/config';
import { agentsOn, sha256, sql } from '~/lib/agents/core';

/**
 * Speaking counts as writing (owner, 2026-10-20). The person's recording comes in, is transcribed, and only
 * the text goes back, for them to check and send as their words. The recording is held in memory for the
 * request and never stored, logged or published. Transcription: Whisper large-v3-turbo (MIT, open weights)
 * on Groq, when GROQ_API_KEY is set; a labelled stand-in in the local tests (AGENTS_TEST_TRANSCRIPT, never
 * on Vercel). At most 10 a minute per person.
 */
const noStore = { 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
  const [r] = await sql()<{ n: number }[]>`insert into studio.api_rate (caller, minute, n) values (${sha256(`speak:${person}:${process.env.AGENT_RATE_KEY ?? process.env.IMAGES_TICKET_SECRET ?? ''}`).slice(0, 32)}, date_trunc('minute', now()), 1)
    on conflict (caller, minute) do update set n = studio.api_rate.n + 1 returning n`;
  if (r.n > 10) return NextResponse.json({ error: 'Too many in a minute. Try again shortly.' }, { status: 429, headers: noStore });
  const type = request.headers.get('content-type') ?? '';
  if (!/^audio\/(webm|ogg|mp4|mpeg|wav|x-wav)/.test(type)) return NextResponse.json({ error: 'Send audio' }, { status: 400, headers: noStore });
  const audio = Buffer.from(await request.arrayBuffer());
  if (!audio.length || audio.length > AGENTS.transcription.maxBytes) return NextResponse.json({ error: 'That recording is too long; keep it under two minutes.' }, { status: 400, headers: noStore });
  const standIn = process.env.VERCEL ? null : process.env.AGENTS_TEST_TRANSCRIPT;
  if (standIn) return NextResponse.json({ text: standIn, by: 'test stand-in (not a real transcription)' }, { headers: noStore });
  const key = process.env.GROQ_API_KEY;
  if (!key) return NextResponse.json({ error: 'Speaking isn’t set up here yet. Type it instead.' }, { status: 503, headers: noStore });
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type }), `speech.${type.split('/')[1].split(';')[0]}`);
  form.append('model', AGENTS.transcription.model);
  form.append('response_format', 'json');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  const out = (await res?.json().catch(() => null)) as { text?: string } | null;
  if (!res?.ok || typeof out?.text !== 'string') return NextResponse.json({ error: 'That didn’t come through. Try again, or type it.' }, { status: 502, headers: noStore });
  return NextResponse.json({ text: out.text.trim(), by: `${AGENTS.transcription.model} on ${AGENTS.transcription.host}` }, { headers: noStore });
}
