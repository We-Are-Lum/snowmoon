import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import postgres from 'postgres';

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
  if (client === undefined) {
    const url = process.env.STUDIO_DATABASE_URL;
    // prepare: false because the transaction pooler does not keep prepared statements.
    client = url ? postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 }) : null;
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
    agentClient = url ? postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 }) : null;
  }
  return scoped.run(agentClient, fn);
}
