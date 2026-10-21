# The agent read API (DRAFT; switched off)

Branch `agent-read-api`, 2026-10-19. Built by the coding agent from the owner's design ("Snowmoon: agent interface"
v1, approved with changes in v2): "build only the read-only MCP/API now … on a branch, switched off". The rest of
the agent interface (agent accounts, linking, drafts, frames, figure checks, notes) waits for the You page, notes and
consent v5.

## What it is

The same seven read-only tools, served two ways:
- **MCP**, Streamable HTTP: `POST https://snowmoon.party/api/mcp`, one JSON-RPC message per request, answered as
  `application/json`. There's no session and no stream. Methods: `initialize`, `ping`, `tools/list`, `tools/call`.
  Protocol 2025-06-18 (2025-03-26 also answered).
- **REST**: `GET https://snowmoon.party/api/agent/v1/<tool>?<arguments>`. `GET /api/agent/v1/tools` lists the tools
  with their argument schemas.

| Tool | What it returns |
|---|---|
| `search_book(query, limit?)` | passages of *Snowmoon* containing the words, with chapter, block id (`c14-b97`) and link |
| `get_passage(chapter, from, to)` | up to 40 blocks of one chapter, plain text, with ids |
| `list_scenes()` | every adaptation and its public versions: maker, page, video, AI label, closed model if any |
| `get_scene(adaptation, version)` | one public version and its shots in order (id, number, start and end, who, frame) |
| `get_shot(adaptation, version, shot)` | camera and people, lines with whose words they are and their converted voices, frame, editor link |
| `get_recipe(adaptation, version, shot)` | how the frame was made: prompt, input pictures by sha256, model (named closed with its maker if so), cost, date |
| `get_moment(adaptation, shot)` | one shot in every public version by its maker, side by side |

**What it serves:**
- Only what the site already shows anyone: the book (GPL-3.0; agents aren't held to a reader's spoiler limit), and
  published scenes, shots, lines and recipes.
- Nothing hidden or private, and no person beyond a published byline.
- Every answer carries its licence, and anything a model made carries its AI label.

**What it can't do:** there are no write tools. Every tool is marked `readOnlyHint: true`.

## Limits

- **Without sign-in:** 20 requests a minute per caller, MCP and REST together (`AGENT_API.perMinute`). Over that, the
  answer is 429 with `Retry-After`; over MCP it's JSON-RPC error -32000.
- **How callers are counted:** in `studio.api_rate` (DRAFT migration 0018). A caller is a keyed hash of its address,
  and the key changes every UTC day. Rows are deleted after an hour. Nothing else about a request is stored or logged.

## Its own database role (owner, 2026-10-19: "a read-only database role, not the production credentials")

The agent routes never use the site's writer connection. Every query they make runs on `AGENT_DATABASE_URL`, as the
role **agent_reader** (created by migration 0018). That role can:
- read adaptations, versions and pages (row security still hides hidden versions from it), and the names table, for
  bylines;
- write only the rate counter.

It can't change a scene, or read wallets, consents, images or Remix frames. Without `AGENT_DATABASE_URL`, the agent
routes have no database at all (`asAgentReader` in src/lib/db.ts).

## Before it's switched on

1. The owner's go, and a reread of the Privacy line below.
2. Apply migration 0018 (dry run first). It creates agent_reader without a login.
3. In the SQL Editor, give the role a login: `alter role agent_reader login password '…'`. Never commit the password.
4. Set `AGENT_DATABASE_URL` (agent_reader through the pooler) and `AGENT_RATE_KEY` in Vercel production.
5. Set `AGENT_API.enabled = true` in `src/lib/config.ts`.

## Privacy, drafted

**§3 (or §4), one item:**
> If you or your software use the agent API (snowmoon.party/api/mcp and /api/agent): to keep it to 20 requests a minute, we count requests for one minute under a code made from your internet address with a key that changes every day, so the address itself is never stored and one day's codes can't be matched to another's. The count is deleted after an hour. What you ask for is not stored.

**§7:** no new outside service.

**Terms:** none needed for read-only access; the "Agents" section waits for agent accounts.

## Checks

- `npm run test:agent-api-live`, 17 checks, on a **running server** (`next start` on the build). The server is given **no writer credentials**: no STUDIO_DATABASE_URL, and the test refuses to run if any .env file Next would load is present. Its only database is PGlite with every migration, with the session set to agent_reader. Over HTTP it checks the MCP handshake, every tool, the REST twin, that hidden versions are never served, and the rate limit. On the role it checks that it can't change scenes, can't read wallet, consent, image or Remix tables, and that row security hides hidden versions.

- `npm run test:agent-api`, 25 checks, against PGlite with every migration:
  - switched off, nothing is answered;
  - the MCP handshake and the tool list;
  - every tool;
  - bad arguments come back as the tool's own error;
  - a hidden version is never served (planting a leak fails 2 checks);
  - the REST twin;
  - the per-caller limit;
  - the counter keeps no address;
  - nothing but the counter is written.
- `check:principles`: P4a gains a named, guarded exemption for `/api/mcp`. MCP sends reads as POSTs, and the route
  passes only while it doesn't touch the database itself and declares no write tool.
