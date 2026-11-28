import type postgres from 'postgres';
import { isAdmin } from '../admins';
import { X_POSTS } from '../config';
import { registerCommands, type XEnv } from './apis';
import { COMMANDS } from './interactions';
import { adminLog, type AdminLogRow } from './store';

/**
 * /admin/x-posts (owner, 2026-11-25): the X posts log for admins, and the owner's "Register commands" button. Everyone
 * else gets 404 before anything is read; signed out, a write gets 401.
 */
export type XPostsView = { cards: boolean; post: boolean; monthlyUsd: number; perDay: number; spent: number; today: number; rows: AdminLogRow[]; canRegister: boolean };

export async function xPostsView(sql: postgres.Sql | null, fid: number | null): Promise<{ status: number; body: XPostsView | { error: string } }> {
  if (!isAdmin(fid)) return { status: 404, body: { error: 'Not found' } };
  if (!sql) return { status: 503, body: { error: 'No database' } };
  const l = await adminLog(sql);
  return { status: 200, body: { cards: X_POSTS.cards, post: X_POSTS.post, monthlyUsd: X_POSTS.monthlyUsd, perDay: X_POSTS.perDay, spent: l.spent, today: l.today, rows: l.rows, canRegister: X_POSTS.registerBy.includes(fid) } };
}

export async function registerFor(fid: number | null, env: XEnv): Promise<{ status: number; body: { ok: boolean; error?: string } }> {
  if (fid === null) return { status: 401, body: { ok: false, error: 'Sign in' } };
  if (!X_POSTS.registerBy.includes(fid)) return { status: 404, body: { ok: false, error: 'Not found' } };
  if (!env.applicationId || !env.guildId || !env.botToken) return { status: 503, body: { ok: false, error: 'The Discord settings are missing in Vercel.' } };
  const r = await registerCommands(env, COMMANDS);
  return r.ok ? { status: 200, body: { ok: true } } : { status: 502, body: { ok: false, error: `Discord answered ${r.status}.` } };
}
