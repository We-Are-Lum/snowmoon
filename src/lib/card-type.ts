import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Type for the share cards drawn in code (the passage card, the glossary card): fonts and quotation marks. */
const FONT_DIR = path.join(process.cwd(), 'node_modules/@fontsource');
const font = (pkg: string, file: string) => readFileSync(path.join(FONT_DIR, pkg, 'files', file));
let fonts: { name: string; data: Buffer; weight: 400 | 500; style: 'normal' | 'italic' }[] | null = null;
export function loadFonts() {
  fonts ??= [
    { name: 'Crimson Pro', data: font('crimson-pro', 'crimson-pro-latin-400-normal.woff'), weight: 400, style: 'normal' },
    { name: 'Crimson Pro', data: font('crimson-pro', 'crimson-pro-latin-400-italic.woff'), weight: 400, style: 'italic' },
    { name: 'Crimson Pro', data: font('crimson-pro', 'crimson-pro-latin-500-normal.woff'), weight: 500, style: 'normal' },
    { name: 'DM Mono', data: font('dm-mono', 'dm-mono-latin-400-normal.woff'), weight: 400, style: 'normal' },
  ];
  return fonts;
}

/** Curly quotes and apostrophes; wrap in quotation marks unless the text already starts with one (dialogue). */
export function typeset(text: string): string {
  let open = true;
  const t = text
    .replace(/(\w)'(\w)/g, '$1\u2019$2')
    .replace(/'/g, '\u2019')
    .replace(/"/g, () => ((open = !open) ? '\u201D' : '\u201C'));
  return /^[\u201C\u2018]/.test(t) ? t : `\u201C${t}\u201D`;
}
