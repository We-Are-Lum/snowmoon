import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import net from 'node:net';
import postgres from 'postgres';

/**
 * Time limits on every database connection (owner, 2026-10-30: "time limits and keepalive on every connection
 * (connect, query and idle timeouts, keepalive, max lifetime), so a dropped connection fails fast and reconnects
 * instead of hanging"). Each server instance has one connection; on 2026-10-30 a local server's connection to the
 * pooler went silent mid-query and every page that read the database hung behind it.
 * - connect: give up on a connection that isn't made in 10 s.
 * - query: the socket is closed if nothing at all comes back for 30 s. A query waiting on it fails (CONNECTION_CLOSED),
 *   and the next one opens a new connection. (A statement_timeout sent at connect is ignored by the transaction pooler,
 *   tested 2026-10-30: the database's own limit for this role stays 2 minutes.)
 * - idle: a connection unused for 20 s is closed.
 * - keepalive: TCP keepalive every 10 s.
 * - lifetime: a connection is replaced after 5 minutes, even when busy, so none outlives a network change for long.
 * DB_SILENT_MS changes the query limit, for the local test only (scripts/test-db-limits.ts).
 */
export const DB_LIMITS = {
  connectSeconds: 10,
  idleSeconds: 20,
  lifetimeSeconds: 5 * 60,
  keepAliveSeconds: 10,
  silentMs: Number(process.env.DB_SILENT_MS) || 30_000,
};

/** The socket for one connection: keepalive on, and closed if it goes silent for DB_LIMITS.silentMs. */
function limitedSocket(o: { host: string[]; port: number[] }): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host: o.host[0], port: o.port[0] });
    s.setKeepAlive(true, DB_LIMITS.keepAliveSeconds * 1000);
    // Closed without an error on purpose: postgres.js then fails the waiting query (CONNECTION_CLOSED) and marks the
    // connection closed in the same step, so the next query opens a new one. Destroyed with an error, the query failed
    // first and a query arriving in between was handed the dead connection and hung (test:db-limits L3).
    s.setTimeout(DB_LIMITS.silentMs, () => {
      console.error(`database connection silent for ${DB_LIMITS.silentMs / 1000} s; closed so the next query reconnects`);
      s.destroy();
    });
    s.once('connect', () => resolve(s));
    s.once('error', reject);
  });
}

/** The options every connection here uses. `socket` and `max_pipeline` are postgres.js options its types leave out (src/connection.js). */
type Options = postgres.Options<Record<string, postgres.PostgresType>>;
/** A database on this machine: the local tests' PGlite, whose socket server accepts one connection (more are refused). */
const isLocal = (url: string) => /@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);

export const dbOptions = (url = ''): Options => ({
  prepare: false, // the transaction pooler does not keep prepared statements
  // Six connections per server instance, one query at a time on each (owner, 2026-10-30; measured on the real pooler
  // the same day). With one connection (as before), a query that had to wait for it was often never answered: two
  // queries at once, the second hung on 10 of 10 warm connections; with two connections, three at once, the third hung
  // 10 of 10. With six: 0 of 456 hung, at 3, 5, 6, 8, 12 and 20 queries at once. Queries one after another never hung.
  // A local test database gets one (PGlite's socket server refuses a second). DB_MAX changes the number, for a local test.
  max: Number(process.env.DB_MAX) || (isLocal(url) ? 1 : 6),
  connect_timeout: DB_LIMITS.connectSeconds,
  idle_timeout: DB_LIMITS.idleSeconds,
  max_lifetime: DB_LIMITS.lifetimeSeconds,
  keep_alive: DB_LIMITS.keepAliveSeconds,
  ...({ socket: limitedSocket, max_pipeline: 1 } as unknown as Options),
});

/**
 * The app's only database connection: `studio_writer` through the transaction
 * pooler (STUDIO_DATABASE_URL). It can read and write rows in `studio` and
 * nothing else (brief §4b). Server routes check the signed-in FID first.
 * Null when the variable is unset (local builds, preview deployments).
 */
let client: postgres.Sql | null | undefined;

const scoped = new AsyncLocalStorage<postgres.Sql | null>();

export function db(): postgres.Sql | null {
  // Inside asAgentReader (the agent read API), every query uses the read-only agent role's connection instead.
  if (scoped.getStore() !== undefined) return scoped.getStore()!;
  if (!client) {
    // Not kept while unset, so a script that sets it after an early call (scripts/test-wallet.ts) still connects.
    const url = process.env.STUDIO_DATABASE_URL;
    client = url ? postgres(url, dbOptions(url)) : null;
  }
  return client;
}

/**
 * The agent read API's own connection (owner, 2026-10-19: "test it on a running server with a read-only database
 * role, not the production credentials"): AGENT_DATABASE_URL, as the role agent_reader (DRAFT migration 0018), which
 * can read published adaptations, versions, pages and current names, and write only the rate counter. Code run inside
 * asAgentReader never sees the writer's connection: without AGENT_DATABASE_URL, db() answers null there.
 */
let agentClient: postgres.Sql | null | undefined;
export function asAgentReader<T>(fn: () => Promise<T>): Promise<T> {
  if (agentClient === undefined) {
    const url = process.env.AGENT_DATABASE_URL;
    agentClient = url ? postgres(url, dbOptions(url)) : null;
  }
  return scoped.run(agentClient, fn);
}
