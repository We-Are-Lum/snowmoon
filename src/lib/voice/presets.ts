import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The voice presets (config/voice-presets.json). Until Nate picks (review page, B1), each brief's three Voice Design
 * previews stand in as choices: twelve in all, played from the review page's copies on our media host (never from
 * ElevenLabs' addresses, principle 6). A preview isn't a saved voice: with the real API, converting into one is
 * refused until Nate picks it and it is saved (`voiceId`); the local stub takes the preview's id.
 */
export const PREVIEW_BASE = 'https://media.snowmoon.party/review/e069b1fde988a10b4eaf26c984b6dac9';

export interface PresetChoice {
  presetId: string;
  name: string;
  description: string;
  candidate: number;
  generatedVoiceId: string;
  previewUrl: string;
  saved: boolean;
}
interface PresetFile {
  previewText: string;
  previewBlock: string;
  presets: {
    id: string;
    name: string;
    status: string;
    voiceId: string | null;
    recipe: { model: string; description: string; seed: number | null; guidanceScale: number; previews: { n: number; generatedVoiceId: string; sha256: string }[]; picked: number | null };
  }[];
}
const file = (): PresetFile => JSON.parse(readFileSync(path.join(process.cwd(), 'config', 'voice-presets.json'), 'utf8'));

export function presetChoices(): { previewText: string; previewBlock: string; choices: PresetChoice[] } {
  const f = file();
  const choices = f.presets.flatMap((p) =>
    p.recipe.previews
      .filter((v) => p.recipe.picked === null || p.recipe.picked === v.n)
      .map((v) => ({
        presetId: p.id,
        name: p.recipe.picked === null ? `${p.name} ${v.n}` : p.name,
        description: p.recipe.description,
        candidate: v.n,
        generatedVoiceId: v.generatedVoiceId,
        previewUrl: `${PREVIEW_BASE}/${p.id.replace(/^ephelion-/, '')}-${v.n}.mp3`,
        saved: Boolean(p.voiceId && p.recipe.picked === v.n),
      })),
  );
  return { previewText: f.previewText, previewBlock: f.previewBlock, choices };
}

/** The preset's recipe as an accepted draft records it. */
export function presetRecipe(presetId: string, candidate: number) {
  const p = file().presets.find((x) => x.id === presetId);
  const v = p?.recipe.previews.find((x) => x.n === candidate);
  if (!p || !v) return null;
  return {
    id: p.id,
    name: p.name,
    invented: true,
    voiceId: p.voiceId,
    made: 'Voice Design',
    designModel: p.recipe.model,
    description: p.recipe.description,
    seed: p.recipe.seed,
    guidanceScale: p.recipe.guidanceScale,
    candidate,
    generatedVoiceId: v.generatedVoiceId,
    previewSha256: v.sha256,
    standIn: p.voiceId === null,
  };
}

/** The voice id to convert into: the saved voice, or (stub only) the preview's id. Null: not usable with the real API. */
export function voiceIdFor(presetId: string, candidate: number, stub: boolean): string | null {
  const r = presetRecipe(presetId, candidate);
  if (!r) return null;
  if (r.voiceId && !r.standIn) return r.voiceId;
  return stub ? r.generatedVoiceId : null;
}
