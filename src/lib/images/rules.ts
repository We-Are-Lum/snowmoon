import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IMAGES } from '../config';

/** The style a reader may add (decision 7): the project's starting style and its setting line, shown in full. */
export const STYLES = { 'techno-vistas': 'content/snowmoon/designs/styles/techno-vistas.json' } as const;
export type StyleId = keyof typeof STYLES;

export function styleText(id: StyleId, setting: string | null): string {
  const s = JSON.parse(readFileSync(path.join(process.cwd(), STYLES[id]), 'utf8')) as { prompt: string; settings?: Record<string, string> };
  return [s.prompt, setting ? s.settings?.[setting] : null].filter(Boolean).join(' ');
}

/** The exact string sent to the model: the reader's words, the style if chosen, and the no-words line. */
export function finalPrompt(userPrompt: string, style: string | null): string {
  return [userPrompt.trim(), style, IMAGES.suffix].filter(Boolean).join('\n\n');
}

let names: string[] | null = null;
/** A name from config/image-blocked-names.json, if the prompt contains one as a whole word. */
export function blockedName(prompt: string): string | null {
  names ??= (JSON.parse(readFileSync(path.join(process.cwd(), 'config', 'image-blocked-names.json'), 'utf8')) as { names: string[] }).names;
  const lower = prompt.toLowerCase();
  return names.find((n) => new RegExp(`(^|[^\\p{L}\\p{N}])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(lower)) ?? null;
}

/** The rules shown above Generate (decision 9: shown on the screen, not part of the hashed consent). */
export const RULES = 'No real people. No sexual content. Nothing violent or hateful. No characters or logos from other works. Don’t ask for words in the picture.';

