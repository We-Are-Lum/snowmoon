/** The re-test's strings and cases (2026-11-09), as in scripts/retest-2026-11-09.ts, for the scripts that follow it. */
export const LOOKS: Record<string, string> = {
  bai: 'Unless the change says otherwise: a woman with dark brown skin, tattooed arms and gold earrings.',
  zei: 'Unless the change says otherwise: a man with light golden-tan skin and dark eyes.',
};
export const SCENE_LINE = 'Unless the change says otherwise: one figure, in a scene that suits the change, not a character sheet.';
export const CASES: { ch: string; change: number; words: string }[] = [
  { ch: 'bai', change: 8, words: 'as a medieval knight in armour' },
  { ch: 'bai', change: 11, words: 'as a deep-sea diver in a brass helmet, underwater' },
  { ch: 'bai', change: 4, words: 'much taller, with a heavy, broad-shouldered build' },
  { ch: 'bai', change: 3, words: 'aged about 70' },
  { ch: 'bai', change: 7, words: 'shaved head' },
  { ch: 'zei', change: 3, words: 'aged about 70' },
  { ch: 'zei', change: 7, words: 'shaved head' },
];
