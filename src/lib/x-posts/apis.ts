import { oauthHeader, type OAuthKeys } from './signatures';

/**
 * The two outside services, called only from the server (P6): X's API, posting as @snowmoon_party with the account's own
 * four fixed values (owner, 2026-11-25), and Discord's REST API with the bot's token. Each base address can be pointed at
 * a local stub (X_API_URL, DISCORD_API_URL) for the tests; nothing here reads a key except from the settings passed in.
 */

export type XEnv = {
  /** Discord: the app's public key (hex), application ID, bot token, server, channel, team role, the leads' user IDs. */
  publicKey: string;
  applicationId: string;
  botToken: string;
  guildId: string;
  channelId: string;
  roleId: string;
  leads: string[];
  /** X: the four values from the app created signed in as @snowmoon_party. */
  x: OAuthKeys;
  account: string;
  discordApi: string;
  xApi: string;
};

/** The settings, read when asked (never at import). Missing values are empty strings: every check then refuses. */
export function xEnv(e: NodeJS.ProcessEnv = process.env): XEnv {
  return {
    publicKey: e.DISCORD_PUBLIC_KEY ?? '',
    applicationId: e.DISCORD_APPLICATION_ID ?? '',
    botToken: e.DISCORD_BOT_TOKEN ?? '',
    guildId: e.DISCORD_GUILD_ID ?? '',
    channelId: e.DISCORD_X_CHANNEL_ID ?? '',
    roleId: e.DISCORD_X_ROLE_ID ?? '',
    leads: (e.DISCORD_X_LEADS ?? '').split(',').map((s) => s.trim()).filter((s) => /^\d{17,20}$/.test(s)),
    x: { consumerKey: e.X_API_KEY ?? '', consumerSecret: e.X_API_SECRET ?? '', token: e.X_ACCESS_TOKEN ?? '', tokenSecret: e.X_ACCESS_TOKEN_SECRET ?? '' },
    account: 'snowmoon_party',
    discordApi: e.DISCORD_API_URL || 'https://discord.com/api/v10',
    xApi: e.X_API_URL || 'https://api.x.com',
  };
}

const TIMEOUT_MS = 8_000;

// --- X ------------------------------------------------------------------------------------------------------------

/** What X said: posted (with its id), refused (X answered no: nothing was posted), or no answer (it may have posted). */
export type XPostResult = { ok: true; id: string } | { ok: false; refused: true; reason: string } | { ok: false; refused: false; reason: string };

export async function xCreatePost(env: XEnv, text: string): Promise<XPostResult> {
  const url = `${env.xApi}/2/tweets`;
  let r: Response;
  try {
    r = await fetch(url, { method: 'POST', headers: { Authorization: oauthHeader('POST', url, env.x), 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    return { ok: false, refused: false, reason: (e as Error).name === 'TimeoutError' ? 'no answer in 8 seconds' : 'the connection failed' };
  }
  const j = (await r.json().catch(() => ({}))) as { data?: { id?: string }; detail?: string; title?: string; errors?: { message?: string }[] };
  if (r.ok && j.data?.id && /^\d{1,25}$/.test(j.data.id)) return { ok: true, id: j.data.id };
  // A 5xx or a 2xx without an id: X may have posted it. Anything else is X refusing it.
  const reason = (j.detail || j.title || j.errors?.[0]?.message || `HTTP ${r.status}`).slice(0, 300);
  return r.status >= 500 || r.ok ? { ok: false, refused: false, reason } : { ok: false, refused: true, reason };
}

/** Deleted (or already gone), or X's reason it wasn't. */
export async function xDeletePost(env: XEnv, id: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const url = `${env.xApi}/2/tweets/${id}`;
  try {
    const r = await fetch(url, { method: 'DELETE', headers: { Authorization: oauthHeader('DELETE', url, env.x) }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const j = (await r.json().catch(() => ({}))) as { data?: { deleted?: boolean }; detail?: string; title?: string };
    if ((r.ok && j.data?.deleted) || r.status === 404) return { ok: true };
    return { ok: false, reason: (j.detail || j.title || `HTTP ${r.status}`).slice(0, 300) };
  } catch (e) {
    return { ok: false, reason: (e as Error).name === 'TimeoutError' ? 'no answer in 8 seconds' : 'the connection failed' };
  }
}

// --- Discord ------------------------------------------------------------------------------------------------------

export type DiscordMessage = { content?: string; embeds?: unknown[]; components?: unknown[]; flags?: number; allowed_mentions?: unknown };

/** No message the site sends ever pings anyone: a post's "@everyone" or "@name" stays text. */
export const NO_PINGS = { parse: [] as string[] };

async function discord(env: XEnv, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  try {
    const r = await fetch(`${env.discordApi}${path}`, {
      method,
      headers: { Authorization: `Bot ${env.botToken}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: r.ok, status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, status: 0, json: {} };
  }
}

/** A new card in #x-posts; its message ID, or null. */
export async function postCard(env: XEnv, msg: DiscordMessage): Promise<string | null> {
  const r = await discord(env, 'POST', `/channels/${env.channelId}/messages`, { ...msg, allowed_mentions: NO_PINGS });
  return r.ok && typeof r.json.id === 'string' ? r.json.id : null;
}

export async function editCard(env: XEnv, messageId: string, msg: DiscordMessage): Promise<boolean> {
  return (await discord(env, 'PATCH', `/channels/${env.channelId}/messages/${messageId}`, { ...msg, allowed_mentions: NO_PINGS })).ok;
}

/** Replaces the server's slash commands with this list (Discord's bulk overwrite). */
export async function registerCommands(env: XEnv, commands: unknown[]): Promise<{ ok: boolean; status: number }> {
  const r = await discord(env, 'PUT', `/applications/${env.applicationId}/guilds/${env.guildId}/commands`, commands);
  return { ok: r.ok, status: r.status };
}

/** Edits the reply only the clicker sees (an interaction's own message), within the 15 minutes its token lasts. */
export async function editReply(env: XEnv, token: string, content: string): Promise<boolean> {
  return (await discord(env, 'PATCH', `/webhooks/${env.applicationId}/${token}/messages/@original`, { content, components: [], allowed_mentions: NO_PINGS })).ok;
}
