import { NextResponse } from 'next/server';
import { isImprovised, spokenSentences, takeLabel, takeMaxSeconds, type Spoken } from '~/lib/voice/spoken';
import { db } from '~/lib/db';
import { VOICE } from '~/lib/config';
import { noStore, voicePerson, voiceReady } from '~/lib/voice/server';
import { offeredSpeeches, speeches } from '~/lib/voice/speech';
import { presetChoices } from '~/lib/voice/presets';
import { hasVoiceConsent, voiceConsentReread, voiceConsentWording } from '~/lib/voice/consent';
import { fundedFor, purgeOldAsks, today } from '~/lib/voice/costs';
import { latestReading, myDrafts } from '~/lib/voice/drafts';
import { isAdmin } from '~/lib/admins';

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
  // The ready-made readings, per speech and voice (Nate, 2026-11-22: the team's three speeches beside c13-b64).
  // The versions offered (a retired one stays findable for its recordings, not offered: Nate, 2026-11-22).
  const all = offeredSpeeches();
  const presets = [...new Set(choices.map((c) => c.presetId))];
  const readings = sql
    ? (await Promise.all(all.flatMap((sp) => presets.map(async (p) => [sp.id, p, await latestReading(sql, sp.id, p)] as const))))
        .filter(([, , r]) => r)
        .map(([sid, p, r]) => ({ speechId: sid, presetId: p, id: r!.id, candidate: (r!.recipe as { preset?: { candidate?: number } }).preset?.candidate ?? null, madeAt: r!.made_at }))
    : [];
  const view = (sp: (typeof all)[number]) => ({ id: sp.id, maxSeconds: takeMaxSeconds(sp.id), title: sp.title, character: sp.character, source: sp.source, label: sp.label, version: sp.version, aiHelp: sp.aiHelp, credit: sp.credit, standIn: sp.standIn, paragraphs: sp.paragraphs, sentences: sp.sentences.map(({ n, text }) => ({ n, text })), characters: sp.characters, names: sp.names });
  return NextResponse.json(
    {
      ready: voiceReady(),
      speech: view(speech),
      speeches: all.map(view),
      preview: { text: previewText, block: previewBlock },
      choices,
      consent: { version: wording.version, reread: voiceConsentReread(), line: wording.line, title: wording.title, text: wording.text, sha256: wording.sha256, agreed: sql ? await hasVoiceConsent(sql, who.fid) : false },
      models: { ...VOICE.models, provider: VOICE.provider },
      limits: { maxTakeSeconds: VOICE.maxTakeSeconds, maxSentenceSeconds: VOICE.maxSentenceSeconds, maxTakeBytes: VOICE.maxTakeBytes, creditsPerMinute: VOICE.rates.convertCreditsPerMinute, readingCreditsPerChar: VOICE.rates.readingCreditsPerChar, transcribeCreditsPerSecond: VOICE.rates.transcribeCreditsPerSecond },
      today: t && {
        funded,
        credits: Math.round(t.credits),
        capCredits: funded === 'admin' ? VOICE.caps.adminDailyCredits : VOICE.caps.dailyCredits,
        conversionsLeft: Math.max(0, VOICE.caps.perPersonConversions - t.conversionsByPerson),
      },
      drafts: sql ? (await myDrafts(sql, who.fid)).map((d) => ({ id: d.id, label: d.kind === 'performance' && (d.recipe as { check?: unknown }).check ? takeLabel(d.recipe as { spoken?: Spoken }) : null, improvised: isImprovised(d.recipe as { spoken?: Spoken }), sentences: isImprovised(d.recipe as { spoken?: Spoken }) ? spokenSentences(d.recipe as { spoken?: Spoken }) : null, kind: d.kind, speechId: d.speech_id, presetId: d.preset_id, madeAt: d.made_at, publishedAt: d.published_at, recipe: d.recipe, audio: d.audio })) : [],
      readings,
      // The speech card's "Make the AI reading" (admins only, Nate 2026-11-26); the reading route decides it again.
      canMakeReadings: isAdmin(who.fid),
    },
    { headers: noStore },
  );
}
