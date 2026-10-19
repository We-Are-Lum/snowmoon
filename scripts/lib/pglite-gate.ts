import type { PGlite } from '@electric-sql/pglite';

/**
 * PGlite is ONE Postgres session. In the end-to-end tests the site talks to it through pglite-socket while the
 * test also queries it directly (pg.query / pg.exec) to check what was written. Postgres keeps one unnamed
 * prepared statement per session, and postgres.js (prepare: false) runs a query as Parse+Describe+Flush, waits
 * for the parameter types, then Bind+Execute+Sync. A direct test query that lands in that gap replaces the
 * site's unnamed statement, so the site's Bind runs against the TEST's statement: 08P01 ("bind message supplies
 * 3 parameters, but prepared statement "" requires 1"), 22P02 (a uuid bound to a bigint), or, when the
 * parameter types happen to match, the site silently runs the test's statement with its own values.
 * (2026-10-19, docs/db-interleave.md.) On the real database every connection is its own session, so the site
 * itself never does this; it is a test-harness fault, and this gate removes it:
 *
 * - The site's messages pass through; a Parse/Bind/Describe/Execute/Flush marks its session "busy" until a Sync
 *   whose ReadyForQuery says idle ('I'), so a test query never runs inside the site's pipeline or its transaction. A message that would START a new pipeline waits while a direct test query is running.
 * - The test's pg.query / pg.exec wait until the site is between pipelines, and hold the gate while they run.
 * - Every reply to the site is checked: any 08P01 (protocol violation) is recorded, and the test fails on it
 *   (protocolErrors()), so this can't come back unnoticed.
 */
export function gatePglite(pg: PGlite) {
  let mid = false;
  let gate: Promise<void> | null = null;
  let idle: (() => void)[] = [];
  const errors: string[] = [];
  let waitedTest = 0;
  let waitedSite = 0;

  const raw = pg.execProtocolRawStream.bind(pg) as (m: Uint8Array, o: { onRawData: (d: Uint8Array) => void } & Record<string, unknown>) => Promise<unknown>;
  (pg as unknown as { execProtocolRawStream: typeof raw }).execProtocolRawStream = async (msg, opts) => {
    const type = msg[0];
    const letter = type >= 0x41 && type <= 0x7a;
    if (letter && !mid) while (gate) (waitedSite++, await gate);
    // Extended-protocol messages open a pipeline that only Sync closes; a simple Query ('Q') is self-contained.
    if (letter && type !== 0x53 && type !== 0x51 && type !== 0x58) mid = true;
    let status = '';
    const r = await raw(msg, {
      ...opts,
      onRawData: (d: Uint8Array) => {
        const b = Buffer.from(d);
        const s = b.toString('latin1');
        if (s.includes('C08P01')) errors.push(s.match(/M([^\x00]*)/)?.[1] ?? '08P01');
        // ReadyForQuery: 'Z', length 5, then the session's state: I idle, T in a transaction, E a failed one.
        const z = b.lastIndexOf(Buffer.from([0x5a, 0, 0, 0, 5]));
        if (z >= 0 && z + 5 < b.length) status = String.fromCharCode(b[z + 5]);
        opts.onRawData(d);
      },
    });
    // The site's session is free for a test query only between pipelines AND outside a transaction.
    if ((type === 0x53 || type === 0x51) && status && status !== 'I') mid = true;
    if ((type === 0x53 || type === 0x51) && status === 'I') {
      mid = false;
      const w = idle;
      idle = [];
      w.forEach((f) => f());
    }
    return r;
  };

  const held = async <T>(run: () => Promise<T>): Promise<T> => {
    while (gate) await gate;
    let open!: () => void;
    gate = new Promise<void>((r) => (open = r));
    try {
      while (mid) (waitedTest++, await new Promise<void>((r) => idle.push(r)));
      return await run();
    } finally {
      gate = null;
      open();
    }
  };
  const query = pg.query.bind(pg);
  const exec = pg.exec.bind(pg);
  (pg as unknown as { query: typeof query }).query = ((text: string, params?: unknown[], o?: never) => held(() => query(text, params, o))) as typeof query;
  (pg as unknown as { exec: typeof exec }).exec = ((text: string, o?: never) => held(() => exec(text, o))) as typeof exec;

  return {
    /** 08P01 replies the site received; must be empty. */
    protocolErrors: () => [...errors],
    /** How often a test query waited for the site, and the site for a test query (evidence the gate does work). */
    waits: () => ({ test: waitedTest, site: waitedSite }),
  };
}

/** For a test without its own check list: a protocol error the site received makes the run fail at exit. */
export function failOnProtocolErrors(gate: ReturnType<typeof gatePglite>, test: string) {
  process.on('exit', () => {
    const e = gate.protocolErrors();
    console.log(`[pglite-gate] ${test}: waits ${JSON.stringify(gate.waits())}, protocol errors ${e.length}`);
    if (e.length) {
      console.log(`${test}: FAILED: the site received 08P01 from the test database: ${e.join('; ')}`);
      process.exitCode = 1;
    }
  });
}
