/**
 * The challenge's settings pool (owner, 2026-11-09; src/lib/challenge/settings.ts). Stand-ins only: no model is called.
 * Each check runs on the real inputs and on a planted violation, which it must catch.
 *
 *   npm run test:settings
 *
 *  T1 the line is the owner's, word for word, with {setting} filled; the four settings (B dropped) and their blocks;
 *  T2 every cited block exists in content/snowmoon/text;
 *  T3 the line goes after the scene line, before the style (the prompt's order);
 *  T4 closed models (GPT, Gemini) always get the line, FLUX never (the route draws only for a closed model);
 *  T5 the draw is even (each of the four equally likely, the challenge's uniform shuffle) and made at make time;
 *  T6 the draw is recorded in the ticket and the recipe (letter, text, blocks), read back for "How it was made", shown
 *     there labelled as this edition's description, citing the blocks;
 *  T7 no setting names a real person, artist, studio or film (blocked names, the words, the prompt check mocked);
 *  T8 P5g records the even draw (docs/principles.md).
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { CHALLENGE_SETTINGS, drawSetting, settingLine, settingRecord, type ChallengeSetting } from '../src/lib/challenge/settings';
import { SETTING_WORDING } from '../src/lib/challenge/settings-wording';
import { challengeRecord } from '../src/lib/images/anchor';
import { remixPrompt } from '../src/lib/challenge/make';
import { SCENE_LINE } from '../src/lib/challenge/looks';
import { KEEP_LINE } from '../src/lib/challenge/styles';
import { blockedName } from '../src/lib/images/rules';
import { IMAGES } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0;
const failed: string[] = [];
const need = (ok: boolean, what: string) => (ok ? [] : [what]);
function proven(name: string, problems: () => string[], planted: () => string[]) {
  const real = problems();
  const plant = planted();
  const ok = real.length === 0 && plant.length > 0;
  if (ok) passed++;
  else failed.push(`${name}: ${real.length ? `real: ${real.join('; ')}` : 'the planted violation was not caught'}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${real.length ? ` (${real.join('; ')})` : ''}${plant.length ? '' : ' (plant not caught)'}`);
}

const route = read('src/app/api/challenge/make/route.ts');

// T1
const OWNER = (s: string) => `Set it in this world, where it fits: a near future, not a fantasy or medieval past; ${s}. Show this world's own version of anything mentioned, like its games, sports, clothes, vehicles and buildings.`;
const WANT: Record<string, [string, string[]]> = {
  E: ['a half-kilometre-tall mountain pyramid at the edge of the city', ['c4-b48']],
  A: ['stone-brick houses behind tall trees, tall apartment towers with many windows above the treetops, small drones overhead', ['c1-b2', 'c1-b13', 'c1-b4']],
  C: ['a chaotic mix of stone, concrete and glass-and-steel buildings, tall and short, some half-built', ['c5-b11', 'c22-b2']],
  D: ['people with watches and hand devices, gates with glowing green circles, small robots with screen faces', ['c1-b4', 'c1-b41', 'c3-b82']],
};
const settingsOk = (list: readonly ChallengeSetting[]) => [
  ...need(list.length === 4 && new Set(list.map((s) => s.id)).size === 4 && !list.some((s) => (s.id as string) === 'B'), 'not the four settings (B dropped, owner 2026-11-09)'),
  ...list.flatMap((s) => need(WANT[s.id]?.[0] === s.text && JSON.stringify(WANT[s.id]?.[1]) === JSON.stringify(s.blocks), `setting ${s.id} isn't the owner's`)),
  ...list.flatMap((s) => need(settingLine(s) === OWNER(s.text), `setting ${s.id}'s line isn't the owner's words`)),
];
proven('T1 the setting line is the owner\'s, word for word; the four settings (E, A, D, C; B dropped) and their blocks', () => settingsOk(CHALLENGE_SETTINGS), () => settingsOk(CHALLENGE_SETTINGS.map((s, i) => (i ? s : { ...s, text: `${s.text} at dusk` }))));

// T2
const blockExists = (id: string) => {
  const m = /^c(\d+)-b(\d+)$/.exec(id);
  if (!m) return false;
  try {
    const d = JSON.parse(read(`content/snowmoon/text/chapter-${m[1]}.json`)) as { blocks: { idx: number; content: string }[] };
    return d.blocks.some((b) => b.idx === Number(m[2]) && b.content.trim().length > 0);
  } catch {
    return false;
  }
};
const blocksOk = (list: readonly ChallengeSetting[]) => list.flatMap((s) => s.blocks.flatMap((b) => need(blockExists(b), `${s.id}: block ${b} doesn't exist`)));
proven('T2 every cited block exists in content/snowmoon/text', () => blocksOk(CHALLENGE_SETTINGS), () => blocksOk([{ id: 'A', text: 'x', blocks: ['c1-b9999'] }]));

// T3
const order = (f: typeof remixPrompt) => {
  const line = settingLine(CHALLENGE_SETTINGS[0]);
  const p = f({ words: 'Zei with a red scarf', name: 'Zei', look: 'Unless the change says otherwise: a man.', style: 'Comic look.', setting: line });
  const at = (x: string) => p.indexOf(x);
  return [
    ...need(at('Zei with a red scarf') === 0 && at('Zei is the person in reference image 1') > 0 && at('a man.') > at('reference image 1') && at(SCENE_LINE) > at('a man.') && at(line) > at(SCENE_LINE) && at('Comic look.') > at(line) && at(KEEP_LINE) > at('Comic look.') && at(IMAGES.suffix) > at(KEEP_LINE), 'the order: words, reference, look, scene, setting, style, keep, suffix'),
    ...need(!f({ words: 'w', name: 'Zei', style: '' }).includes('Set it in this world'), 'a prompt without a setting has the line'),
  ];
};
const swapped: typeof remixPrompt = (p) => remixPrompt({ ...p, style: p.setting ?? '', setting: p.style });
proven('T3 the setting line comes right after the scene line, before the style', () => order(remixPrompt), () => order(swapped));

// T4
const gate = (src: string) => [
  ...need(/const setting = !moment && !chosen\.open \? drawSetting\(\) : null;/.test(src), 'the route doesn\'t draw for a closed model only'),
  ...need(/remixPrompt\(\{ words: r\.words, name, look: lookForBase\(src\.character, await baseFrontOf\(sql, src\)\), style: style!\.text, \.\.\.\(setting \? \{ setting: settingLine\(setting\) \} : \{\}\) \}\)/.test(src), 'the prompt doesn\'t carry the drawn setting'),
  ...need((src.match(/drawSetting\(/g) ?? []).length === 1 && (src.match(/settingLine\(/g) ?? []).length === 1, 'the setting is drawn or written elsewhere in the route'),
];
const models = read('src/lib/challenge/models.ts');
proven('T4 GPT and Gemini (closed) always get the setting line; FLUX (open) never', () => [...gate(route), ...need(/id: 'flux2-klein-4b-edit',[\s\S]*?open: true/.test(models) && /id: 'gpt-image-2.5-sunburst',[\s\S]*?open: false/.test(models) && /id: 'gemini-3.1-flash-image',[\s\S]*?open: false/.test(models), 'the models\' open flags changed')], () => gate(route.replace('!moment && !chosen.open ?', '!moment ?')));

// T5
const even = (draw: () => ChallengeSetting) => {
  const n = 50_000;
  const counts = new Map<string, number>();
  for (let i = 0; i < n; i++) { const s = draw(); counts.set(s.id, (counts.get(s.id) ?? 0) + 1); }
  const exp = n / CHALLENGE_SETTINGS.length;
  const chi = [...CHALLENGE_SETTINGS].reduce((a, s) => a + ((counts.get(s.id) ?? 0) - exp) ** 2 / exp, 0);
  // 3 degrees of freedom: 16.27 is the 0.1% point.
  return [...need(counts.size === 4, `drew ${counts.size} of 4`), ...need(chi < 16.27, `uneven draw (chi-square ${chi.toFixed(1)}: ${JSON.stringify(Object.fromEntries(counts))})`)];
};
const draws = [...Array(20).keys()].map(() => drawSetting().id);
proven('T5 the draw is even (the challenge\'s uniform shuffle over the whole pool; chi-square on 50,000 draws) and made per picture at make time', () => [...even(() => drawSetting()), ...need(new Set(draws).size > 1, 'the same setting every time'), ...need(/export const drawSetting = \(random: \(\) => number = uniform\): ChallengeSetting => shuffleFresh\(CHALLENGE_SETTINGS, random\)\[0\];/.test(read('src/lib/challenge/settings.ts')), 'not the uniform shuffle over the whole pool')], () => even(() => (Math.random() < 0.4 ? CHALLENGE_SETTINGS[0] : drawSetting())));

// T6
const data = read('src/lib/images/data.ts'), page = read('src/app/image/[id]/page.tsx'), preview = read('src/components/challenge-preview.tsx'), ticket = read('src/lib/images/ticket.ts'), publish = read('src/app/api/images/publish/route.ts');
const rec = settingRecord(CHALLENGE_SETTINGS[1]);
const recorded = (src: string) => [
  ...need(/\.\.\.\(setting \? \{ setting: settingRecord\(setting\) \} : \{\}\),/.test(src), 'the ticket\'s challenge doesn\'t record the setting'),
  ...need(JSON.stringify(rec) === JSON.stringify({ id: 'A', text: WANT.A[0], blocks: WANT.A[1] }), 'the record isn\'t letter, text, blocks'),
  ...need(/setting\?: \{ id: string; text: string; blocks: string\[\] \};/.test(ticket) && /\.\.\.\(t\.challenge \? \{ challenge: challengeRecord\(t\.challenge\) \} : \{\}\)/.test(publish) && 'setting' in challengeRecord({ character: 'zei', from: 'f', fromKind: 'sheet', setting: { id: 'A', text: 't', blocks: [] } }), 'the recipe doesn\'t keep the ticket\'s challenge (and its setting)'),
  ...need(/setting: readSetting\(\(p\.challenge as \{ setting\?: unknown \} \| undefined\)\?\.setting\)/.test(data), '"How it was made" doesn\'t read it back'),
  ...need(/\{SETTING_WORDING\.head\}/.test(page) && /SETTING_WORDING\.line\(im\.setting\)/.test(page) && /SETTING_WORDING\.line\(d\.setting\)/.test(preview), 'the picture page or the preview doesn\'t show it'),
  ...need(SETTING_WORDING.head === 'Setting' && SETTING_WORDING.line(rec) === `${WANT.A[0]}. This edition's description of the book's world, not a quote, picked at random from four (setting A); based on c1-b2, c1-b13, c1-b4.`, `the wording: ${SETTING_WORDING.line(rec)}`),
];
proven('T6 the draw is recorded (letter, text, blocks) in the ticket and recipe, and "How it was made" shows it as this edition\'s description, citing the blocks', () => recorded(route), () => recorded(route.replace('...(setting ? { setting: settingRecord(setting) } : {}),', '')));

// T7
{
  const { checkPrompt } = await import('../src/lib/images/guard');
  const sent: string[] = [];
  const real = globalThis.fetch;
  const key = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'stand-in-not-a-key';
  globalThis.fetch = (async (_u: string, init?: RequestInit) => {
    const m = (JSON.parse(String(init?.body ?? '{}')).messages ?? []) as { role: string; content: string }[];
    sent.push(m.find((x) => x.role === 'user')?.content ?? '');
    return new Response(JSON.stringify({ id: 'x', model: 'stand-in', choices: [{ index: 0, message: { role: 'assistant', content: '{"allow": true}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const req = new Request('http://localhost/api/challenge/make', { method: 'POST' });
  const allowed: boolean[] = [];
  for (const s of CHALLENGE_SETTINGS) allowed.push((await checkPrompt(settingLine(s), req, IMAGES.designs.guardMaxTokens)).allow);
  globalThis.fetch = real;
  process.env.GROQ_API_KEY = key;
  const NAMES = /\b(studio|ghibli|disney|pixar|dreamworks|marvel|film|movie|anime|manga|in the style of|by [A-Z]|blade runner|star wars|cyberpunk 2077)/i;
  const words = (texts: string[]) => texts.flatMap((x) => [...need(blockedName(x) === null, `"${x}" names someone on the blocked list`), ...need(!NAMES.test(x), `"${x}" names an artist, studio or film`)]);
  proven('T7 no setting names a real person, artist, studio or film (blocked names, the words; the prompt check, mocked, saw each line)', () => [...words(CHALLENGE_SETTINGS.map((s) => settingLine(s))), ...need(allowed.every(Boolean) && CHALLENGE_SETTINGS.every((s) => sent.some((u) => u.includes(s.text))), 'the check didn\'t see each line')], () => words(['a city like in Blade Runner', 'towers by Studio Ghibli']));
}

// T8
const principles = read('docs/principles.md');
const p5g = (doc: string) => need(/owner, 2026-11-09[^\n]*setting/i.test(doc) && /settings pool/i.test(doc), 'P5g doesn\'t record the even draw of the settings (owner, 2026-11-09)');
proven('T8 docs/principles.md P5g records the settings\' even draw (owner, 2026-11-09)', () => p5g(principles), () => p5g(principles.replace(/settings pool/gi, 'x')));

console.log(`\ntest:settings: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
