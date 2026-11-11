/**
 * The rehearsal's fixed addresses (branch contest, 2026-11-04): its database on this machine, and where the app runs.
 * Shared by scripts/rehearsal-db.ts and scripts/rehearsal.ts.
 */
export { REHEARSAL_BASE_IDS } from '../../src/lib/challenge/rehearsal-switch';
export const REHEARSAL_DB_PORT = 54329;
export const rehearsalDbUrl = (port: number = REHEARSAL_DB_PORT) => `postgres://postgres@127.0.0.1:${port}/postgres`;
/** The app, on the loopback address Bluesky's loopback sign-in needs (127.0.0.1, not "localhost"). */
export const REHEARSAL_ORIGIN = 'http://127.0.0.1:3000';
