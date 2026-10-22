/**
 * P4a ("No model output is published without a signed-in person's action"), as a pure function over
 * source text so scripts/test-agents.ts can prove it on planted routes. Used by scripts/check-principles.ts.
 *
 * A write route (POST, PUT, PATCH, DELETE under src/app/api or src/app/mcp) passes in one of these ways:
 *  1. It requires a signed-in person: getFid, getPerson or getWallet, answering 401 without one.
 *  2. It hands every request to a shared sign-in wrapper (P4A_WRAPPERS) that checks getFid and answers 401.
 *  3. A named sign-in exemption: the route is how a sign-in happens (website, wallet).
 *  4. The open read API at /api/mcp, while it stays read only.
 *  5. (owner, 2026-10-20: "routes that only create drafts pass; any route that can publish or keep still
 *     fails") An agent's route: it requires an agent's token (agentFromRequest, 401 without one) and
 *     every write it can reach only creates drafts. Checked from the code: the route's imports are an
 *     inspected list, the tool list has no publish, keep, spend or pay tool, the tool modules never
 *     publish or keep, and the piece writers they use (draftPiece, revise, addNote) write drafts only.
 *  6. (same decision, design.md §8b) An agent sign-in route (OAuth, wallet agent): it is how an agent's
 *     sign-in happens, imports only the sign-in modules, and those write only sign-in tables.
 * Any route an agent can reach that can publish or keep fails, whatever else it checks.
 */

export type Src = { file: string; src: string };

/** Shared sign-in wrappers routes may call instead of checking getFid themselves (P4a reads each one). */
export const P4A_WRAPPERS = [{ module: '~/lib/minpentai/play-server/route', file: 'src/lib/minpentai/play-server/route.ts', call: 'play' }];
// Named exemption (owner instruction, 2026-10-08: website sign-in): the route that starts a sign-in
// cannot require one. It writes nothing of ours; it opens a channel on Farcaster's relay.
// Named exemption (owner, 2026-10-13: wallet sign-in): the wallet sign-in route is the sign-in; it
// writes only the account row, and only for a signature checked against the wallet.
export const P4A_EXEMPT = new Set(['src/app/api/auth/web/start/route.ts', 'src/app/api/wallet/sign-in/route.ts']);
// Named exemption (owner, 2026-10-19: "read API open without sign-in at a low rate"): MCP sends every message,
// reads included, as a POST. The MCP route is exempt only while it stays read only: it must not touch the database
// itself (its one write is the rate counter, inside src/lib/agent/rate.ts) and every tool it serves is read only.
export const P4A_READ_ONLY = new Set(['src/app/api/mcp/route.ts']);

/** Agent sign-in routes (owner, 2026-10-20, design.md §8b): the OAuth endpoints and the wallet agent's link and sign-in. */
export const P4A_AGENT_SIGN_IN = new Set([
  'src/app/api/oauth/register/route.ts',
  'src/app/api/oauth/token/route.ts',
  'src/app/api/oauth/revoke/route.ts',
  'src/app/api/agents/wallet/link/route.ts',
  'src/app/api/agents/wallet/token/route.ts',
]);
const SIGN_IN_IMPORTS = new Set(['next/server', '~/lib/agents/core', '~/lib/agents/oauth', '~/lib/agents/accounts', '~/lib/agent/rate', '~/lib/auth']);
const SIGN_IN_MODULES = ['src/lib/agents/core.ts', 'src/lib/agents/oauth.ts', 'src/lib/agents/accounts.ts'];
/** The only tables the agent sign-in modules may write: clients, codes, the agent, its tokens, its counts. */
const SIGN_IN_TABLES = new Set(['oauth_clients', 'oauth_codes', 'agents', 'agent_tokens', 'agent_counts']);

/** Modules an agent's route may import (inspected: none of them publishes or keeps; the tools are checked below). */
const AGENT_ROUTE_IMPORTS = new Set(['next/server', '~/lib/agents/core', '~/lib/agents/tools', '~/lib/agent/tools', '~/lib/agent/rate', '~/lib/agent/reader', '~/lib/try-again']);
const TOOLS = 'src/lib/agents/tools.ts';
const PIECES = 'src/lib/agents/pieces.ts';
const READ_TOOLS = 'src/lib/agent/tools.ts';
/** Modules the agent tools import from ./ (each scanned for publish and keep). */
const TOOL_MODULES = new Set(['core', 'accounts', 'filter', 'images', 'pieces', 'requests', 'edits', 'direction', 'suggestions']);
// Direction notes and line rewrites (owner, 2026-10-20) are private to their person and never published; ./direction is
// scanned for publish and keep like the others. Added to the inspected list by the coding agent; the owner's yes pending.
// Suggestions (owner, 2026-10-22) go to the owner only and are never published; ./suggestions is scanned like the
// others. Added to the inspected list by the coding agent; the owner's yes pending.
// The edit tools (owner, 2026-10-20) draft only; spending on an approved edit lives in ./approve, which no tool may
// import (it isn't in this list, so importing it from tools.ts fails the check).
/** What tools.ts may take from pieces.ts: the three draft writers (each read below) and readers. Never decide. */
const PIECE_WRITERS = ['draftPiece', 'revise', 'addNote'];
const PIECE_READERS = new Set(['feedbackFor', 'notesOn', 'pieceVersions', 'piecesOf', 'versionById', 'visibleTo', 'type Answering', 'type Kind', 'Answering', 'Kind']);

/** Code that publishes or keeps: the person's decide (Keep is publish), a 'keep' or 'publish' action, or a published write. */
export const PUBLISH_OR_KEEP = /\bdecide\s*\(|['"`](keep|publish)['"`]|set\s+status\s*=\s*'published'|\bpublished_by\s*=|\bpublished_at\s*=\s*now\(\)|status\s*=\s*\$\{[^}]*'published'/i;
const TOOL_NAME_BAD = /publish|keep|spend|pay|buy|charge|purchase/i;

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const importsOf = (src: string) => [...src.matchAll(/^import\s+(?:type\s+)?(?:\{([^}]*)\}|[\w*\s,]+)?\s*(?:from\s+)?['"]([^'"]+)['"]/gm)].map((m) => ({ names: (m[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean), from: m[2] }));
const isWrite = (src: string) => /export async function (POST|PUT|PATCH|DELETE)\b/.test(src);
const agentReachable = (src: string) => /\bagentFromRequest\s*\(/.test(src) || /from '~\/lib\/agents\/tools'/.test(src);

/** The body of `export async function name(` up to the next top-level `export`. */
function fnBody(src: string, name: string): string | null {
  const i = src.indexOf(`export async function ${name}(`);
  if (i < 0) return null;
  const j = src.indexOf('\nexport ', i + 1);
  return src.slice(i, j < 0 ? undefined : j);
}

/** Problems with the agent tools: why they might not be draft-only. Empty when they are. */
export function agentToolProblems(read: (rel: string) => string): string[] {
  const out: string[] = [];
  const tools = stripComments(read(TOOLS));
  // Tool names, here and in the open read tools it serves too.
  for (const f of [TOOLS, READ_TOOLS])
    for (const m of stripComments(read(f)).matchAll(/\bname:\s*'([a-z_]+)'/g)) if (TOOL_NAME_BAD.test(m[1])) out.push(`${f}: tool "${m[1]}" publishes, keeps or spends`);
  if (PUBLISH_OR_KEEP.test(tools)) out.push(`${TOOLS}: publishes or keeps (${tools.match(PUBLISH_OR_KEEP)![0]})`);
  for (const imp of importsOf(tools)) {
    if (!imp.from.startsWith('./')) continue;
    const mod = imp.from.slice(2);
    if (!TOOL_MODULES.has(mod)) out.push(`${TOOLS}: imports ./${mod}, not inspected as draft-only`);
    if (mod === 'pieces') for (const n of imp.names) if (!PIECE_WRITERS.includes(n) && !PIECE_READERS.has(n)) out.push(`${TOOLS}: takes ${n} from ./pieces (only ${PIECE_WRITERS.join(', ')} write, and only drafts)`);
  }
  for (const mod of TOOL_MODULES) {
    if (mod === 'pieces') continue;
    const s = stripComments(read(`src/lib/agents/${mod}.ts`));
    if (PUBLISH_OR_KEEP.test(s)) out.push(`src/lib/agents/${mod}.ts: publishes or keeps (${s.match(PUBLISH_OR_KEEP)![0]})`);
  }
  const pieces = stripComments(read(PIECES));
  for (const n of PIECE_WRITERS) {
    const body = fnBody(pieces, n);
    if (body === null) { out.push(`${PIECES}: ${n} not found`); continue; }
    if (n === 'addNote') {
      // A person's note is public at once; an agent's is a draft. The only 'published' written here must be that branch.
      const branch = "${agent ? 'draft' : 'published'}";
      const rest = body.replace(branch, '').replace("v.status !== 'published'", '');
      if (!body.includes(branch) || /'published'/.test(rest)) out.push(`${PIECES}: addNote may publish an agent's note`);
    } else if (PUBLISH_OR_KEEP.test(body) || /'published'/.test(body) || /insert into studio\.\w+ \([^)]*\b(status|published_at|published_by)\b/.test(body)) {
      out.push(`${PIECES}: ${n} may write something published`);
    }
  }
  return out;
}

/** Problems with one agent sign-in route, or with the modules it uses. */
function signInProblems(r: Src, read: (rel: string) => string): string[] {
  const out: string[] = [];
  for (const imp of importsOf(r.src)) if (!SIGN_IN_IMPORTS.has(imp.from)) out.push(`${r.file}: agent sign-in route imports ${imp.from}, not a sign-in module`);
  if (PUBLISH_OR_KEEP.test(stripComments(r.src))) out.push(`${r.file}: agent sign-in route can publish or keep`);
  for (const f of SIGN_IN_MODULES) {
    for (const m of stripComments(read(f)).matchAll(/(?:insert into|update|delete from)\s+studio\.(\w+)/g))
      if (!SIGN_IN_TABLES.has(m[1])) out.push(`${r.file}: its sign-in module ${f} writes studio.${m[1]}, not a sign-in table`);
  }
  return [...new Set(out)];
}

/** Problems with one route an agent can reach. Empty when it requires an agent's token and only creates drafts. */
function agentRouteProblems(r: Src, read: (rel: string) => string): string[] {
  const out: string[] = [];
  const code = stripComments(r.src);
  if (!(/\bagentFromRequest\s*\(/.test(code) && /if \(!agent\) return\b/.test(code) && /\b401\b/.test(code))) out.push(`${r.file}: an agent can reach it without an agent's token (agentFromRequest, 401)`);
  if (PUBLISH_OR_KEEP.test(code)) out.push(`${r.file}: an agent's route can publish or keep (${code.match(PUBLISH_OR_KEEP)![0]})`);
  for (const imp of importsOf(r.src)) if (!AGENT_ROUTE_IMPORTS.has(imp.from)) out.push(`${r.file}: an agent's route imports ${imp.from}, not inspected as draft-only`);
  if (/from '~\/lib\/agents\/tools'/.test(r.src)) out.push(...agentToolProblems(read));
  return out;
}

export function p4aProblems(routes: Src[], read: (rel: string) => string): string[] {
  const problems: string[] = [];
  for (const r of routes) {
    if (!isWrite(r.src)) continue;
    if (P4A_EXEMPT.has(r.file)) continue;
    if (P4A_READ_ONLY.has(r.file) && !/\bdb\(|sql`|from '~\/lib\/db'/.test(r.src) && !/readOnlyHint: false/.test(r.src)) continue;
    if (P4A_AGENT_SIGN_IN.has(r.file)) { problems.push(...signInProblems(r, read)); continue; }
    // Any route an agent can reach is judged as an agent's route, even if it also checks a person.
    if (agentReachable(r.src)) { problems.push(...agentRouteProblems(r, read)); continue; }
    if (/(getFid|getPerson|getWallet)\(/.test(r.src) && /status: 401/.test(r.src)) continue;
    if (P4A_WRAPPERS.some((w) => r.src.includes(`from '${w.module}'`) && new RegExp(`\\b${w.call}\\(request,`).test(r.src) && /getFid\(/.test(read(w.file)) && /\b401\)/.test(read(w.file)))) continue;
    problems.push(`${r.file}: writes without requiring sign-in`);
  }
  return [...new Set(problems)];
}
