// Probe 4: does submit(final: true) take a time that depends on hidden state? The site computer plans its next
// turn inside resolve(), from its own view (hidden from Cyan). Twins differ only outside Cyan's sight.
import { newSolo, rulesOf, submit, type SoloMatch } from '/Users/nathan/snowmoon-book-edition/src/lib/minpentai/agent-play/solo';
const json = (m: SoloMatch) => JSON.parse(JSON.stringify(m)) as SoloMatch;
const ruleset = (process.argv[2] ?? 'book') as 'book' | 'play';
for (const level of [1, 3, 5]) {
  const { m } = newSolo({ id: 'probe0000000', ruleset, level, seed: 9, person: 1, agent: { id: null, name: 'a', model: null }, now: '' });
  const { e, s } = rulesOf(m);
  m.pend.A = { ...m.pend.A, placements: [] };
  const variants: Record<string, (x: SoloMatch) => void> = {
    'Amber as started (2 towers)': () => {},
    'Amber lost a tower (1 tower, hidden)': (x) => { const k = e.towers(x.w, 'A')[0]; delete x.w.tw[k]; },
    'Amber +3 hidden towers': (x) => { for (const [px, py] of [[e.W - 4, 1], [e.W - 4, e.H - 2], [e.W - 6, (e.H / 2) | 0]]) x.w.tw[e.K(px, py)] = 'A'; },
    'Amber +6 hidden squares': (x) => { for (let i = 0; i < 6; i++) x.w.sq[e.K(e.W - 2, i)] = { o: 'A', hp: 2 }; },
  };
  const out: string[] = [];
  for (const [name, f] of Object.entries(variants)) {
    const ts: number[] = [];
    for (let i = 0; i < 9; i++) {
      const x = json(m); f(x);
      const t = performance.now();
      submit(x, { turn: 0, placements: [], source: 'agent', final: true, now: '' });
      ts.push(performance.now() - t);
    }
    ts.sort((a, b) => a - b);
    out.push(`${name}: median ${ts[4].toFixed(0)} ms (min ${ts[0].toFixed(0)}, max ${ts[8].toFixed(0)})`);
  }
  console.log(`${ruleset} level ${level}:\n  ` + out.join('\n  '));
}
