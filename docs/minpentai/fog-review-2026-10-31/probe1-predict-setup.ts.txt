// Probe 1: how predictable is the site computer's setup (turn 0) from public information alone?
// Amber's turn-0 view is the fixed starting board; only the seed's rng differs between matches.
import { newSolo, ordersText } from '/Users/nathan/snowmoon-book-edition/src/lib/minpentai/agent-play/solo';
const N = Number(process.argv[2] ?? 150);
for (const ruleset of ['book', 'play'] as const) for (const level of [1, 3, 5]) {
  const counts = new Map<string, number>();
  const rules = new Map<string, number>();
  let ms = 0;
  for (let i = 0; i < N; i++) {
    const seed = (Math.random() * 2 ** 31) | 0 || 1;
    const t = performance.now();
    const { m } = newSolo({ id: 'x'.repeat(12), ruleset, level, seed, person: 1, agent: { id: null, name: 'a', model: null }, now: '' });
    ms += performance.now() - t;
    const k = ordersText(m.pend.A.placements);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`${ruleset} L${level}: ${N} seeds -> ${counts.size} distinct setups; top share ${(100 * top[0][1] / N).toFixed(0)}%; top3 ${(100 * top.slice(0, 3).reduce((t, x) => t + x[1], 0) / N).toFixed(0)}%; avg ${(ms / N).toFixed(0)} ms`);
  console.log('   most common:', top[0][0].slice(0, 200));
}
