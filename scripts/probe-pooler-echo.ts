/**
 * READ-ONLY probe of the real Supabase transaction pooler (2026-10-19, docs/db-interleave.md): does postgres.js with
 * prepare: false keep each query's values with its own statement under concurrency, as the site runs it?
 * Only constants are selected (no table is read or written); transactions are opened READ ONLY.
 *   npx tsx --env-file=.env.local scripts/probe-pooler-echo.ts [clients] [queries per client]
 * Each client is one postgres.js client like src/lib/db.ts (prepare: false, max: 1), as one function instance is.
 */
import postgres from 'postgres';

const url = process.env.STUDIO_DATABASE_URL;
if (!url) throw new Error('STUDIO_DATABASE_URL not set');
const CLIENTS = Number(process.argv[2] ?? 4);
const N = Number(process.argv[3] ?? 150);
let ok = 0, wrong = 0, errors = 0;
const codes: Record<string, number> = {};
const check = (p: Promise<{ v: number }[]>, want: number) =>
  p.then((r) => (Number(r[0].v) === want ? ok++ : wrong++), (e) => (errors++, (codes[e.code ?? e.name] = (codes[e.code ?? e.name] ?? 0) + 1)));

const t0 = Date.now();
await Promise.all(
  Array.from({ length: CLIENTS }, async (_, c) => {
    const sql = postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} });
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < N; i++) {
      const k = i % 3, base = c * 1_000_000 + i;
      jobs.push(
        k === 0 ? check(sql.unsafe(`select $1::int as v /* c${c} a${i} */`, [base]), base)
        : k === 1 ? check(sql.unsafe(`select $1::int + $2::int as v /* c${c} b${i} */`, [base, 7]), base + 7)
        : sql.begin('read only', async (tx) => {
            await check(tx.unsafe(`select $1::int * 2 as v /* c${c} t${i} */`, [base]), base * 2);
            await check(tx.unsafe(`select $1::int as v /* c${c} u${i} */`, [base]), base);
          }).catch(() => errors++),
      );
      if (i % 5 === 0) await new Promise((r) => setTimeout(r, Math.random() * 3));
    }
    await Promise.all(jobs);
    await sql.end({ timeout: 2 });
  }),
);
console.log(JSON.stringify({ clients: CLIENTS, queries: ok + wrong + errors, ok, wrong, errors, codes, ms: Date.now() - t0 }));
