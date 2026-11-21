import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { VOICE } from '~/lib/config';
import { noStore, voicePerson, voiceReady } from '~/lib/voice/server';
import { speeches } from '~/lib/voice/speech';
import { presetChoices } from '~/lib/voice/presets';
import { hasVoiceConsent, voiceConsentWording } from '~/lib/voice/consent';
import { fundedFor, purgeOldAsks, today } from '~/lib/voice/costs';
import { latestReading, myDrafts } from '~/lib/voice/drafts';

export const dynamic = 'force-dynamic';

/** What the voice page needs: the speech, the voices, the consent, today's allowance, this person's drafts. */
export async function GET(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  const speech = speeches()[0];
  const { previewText, previewBlock, choices } = presetChoices();
  const wording = voiceConsentWording();
  const funded = fundedFor(who.fid);
  if (sql) await purgeOldAsks(sql).catch(() => 0);
  const t = sql ? await today(sql, funded, who.fid) : null;
  const readings = sql
    ? (await Promise.all([...new Set(choices.map((c) => c.presetId))].map(async (p) => [p, await latestReading(sql, speech.id, p)] as const))).filter(([, r]) => r).map(([p, r]) => ({ presetId: p, id: r!.id, candidate: (r!.recipe as { preset?: { candidate?: number } }).preset?.candidate ?? null, madeAt: r!.made_at }))
    : [];
  return NextResponse.json(
    {
      ready: voiceReady(),
      speech: { id: speech.id, title: speech.title, character: speech.character, source: speech.source, label: speech.label, standIn: speech.standIn, paragraphs: speech.paragraphs, sentences: speech.sentences.map(({ n, text }) => ({ n, text })), characters: speech.characters },
      preview: { text: previewText, block: previewBlock },
      choices,
      consent: { version: wording.version, line: wording.line, title: wording.title, text: wording.text, sha256: wording.sha256, agreed: sql ? await hasVoiceConsent(sql, who.fid) : false },
      models: { ...VOICE.models, provider: VOICE.provider },
      limits: { maxTakeSeconds: VOICE.maxTakeSeconds, maxSentenceSeconds: VOICE.maxSentenceSeconds, maxTakeBytes: VOICE.maxTakeBytes, creditsPerMinute: VOICE.rates.convertCreditsPerMinute, readingCreditsPerChar: VOICE.rates.readingCreditsPerChar },
      today: t && {
        funded,
        credits: Math.round(t.credits),
        capCredits: funded === 'admin' ? VOICE.caps.adminDailyCredits : VOICE.caps.dailyCredits,
        conversionsLeft: Math.max(0, VOICE.caps.perPersonConversions - t.conversionsByPerson),
      },
      drafts: sql ? (await myDrafts(sql, who.fid)).map((d) => ({ id: d.id, kind: d.kind, speechId: d.speech_id, presetId: d.preset_id, madeAt: d.made_at, publishedAt: d.published_at, recipe: d.recipe, audio: d.audio })) : [],
      readings,
    },
    { headers: noStore },
  );
}
