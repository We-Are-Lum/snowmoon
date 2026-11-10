import { shuffleFresh, uniform } from './shuffle';

/**
 * The challenge's settings pool (owner, 2026-11-09): for the closed models only (GPT Image 2.5 Sunburst and Gemini 3.1
 * Flash Image, never FLUX), one line right after the scene line, with one of four settings drawn evenly at random per
 * picture, on the server, at make time (P5g: an even draw from the whole pool, the owner's exception of 2026-11-09). Each setting is this
 * edition's description of the book's setting, not a quote; its blocks are the passages it is drawn from (each checked
 * to exist in content/snowmoon/text by scripts/test-settings.ts). The draw is recorded in the picture's recipe
 * (challenge.setting) and shown in "How it was made". No artist, studio, film or real person is named.
 */
export interface ChallengeSetting {
  id: 'A' | 'C' | 'D' | 'E';
  text: string;
  blocks: readonly string[];
}

// Owner, 2026-11-09: setting B ("greenery mixed with glass-and-steel buildings with sharp edges", c3-b72, c13-b24) was
// dropped (it gave generic towers on GPT and Gemini). The letters of the others stay as they were.
export const CHALLENGE_SETTINGS: readonly ChallengeSetting[] = [
  { id: 'E', text: 'a half-kilometre-tall mountain pyramid at the edge of the city', blocks: ['c4-b48'] },
  { id: 'A', text: 'stone-brick houses behind tall trees, tall apartment towers with many windows above the treetops, small drones overhead', blocks: ['c1-b2', 'c1-b13', 'c1-b4'] },
  { id: 'D', text: 'people with watches and hand devices, gates with glowing green circles, small robots with screen faces', blocks: ['c1-b4', 'c1-b41', 'c3-b82'] },
  { id: 'C', text: 'a chaotic mix of stone, concrete and glass-and-steel buildings, tall and short, some half-built', blocks: ['c5-b11', 'c22-b2'] },
];

/** The line, the owner's words exactly, with the drawn setting in place of {setting}. */
export const settingLine = (s: Pick<ChallengeSetting, 'text'>) =>
  `Set it in this world, where it fits: a near future, not a fantasy or medieval past; ${s.text}. Show this world's own version of anything mentioned, like its games, sports, clothes, vehicles and buildings.`;

/**
 * One setting, drawn evenly at random from the whole pool (each of the four has the same chance): the challenge's one
 * uniform shuffle (src/lib/challenge/shuffle.ts), as "Random" draws a style. check:principles P5g allows it here only.
 */
export const drawSetting = (random: () => number = uniform): ChallengeSetting => shuffleFresh(CHALLENGE_SETTINGS, random)[0];

/** What the recipe records of the draw. */
export const settingRecord = (s: ChallengeSetting) => ({ id: s.id, text: s.text, blocks: [...s.blocks] });
