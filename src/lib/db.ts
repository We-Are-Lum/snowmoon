import 'server-only';
import postgres from 'postgres';

/**
 * The app's only database connection: `studio_writer` through the transaction
 * pooler (STUDIO_DATABASE_URL). It can read and write rows in `studio` and
 * nothing else (brief §4b). Server routes check the signed-in FID first.
 * Null when the variable is unset (local builds, preview deployments).
 */
let client: postgres.Sql | null | undefined;

export function db(): postgres.Sql | null {
  if (client === undefined) {
    const url = process.env.STUDIO_DATABASE_URL;
    // prepare: false because the transaction pooler does not keep prepared statements.
    client = url ? postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 }) : null;
  }
  return client;
}
