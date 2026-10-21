# Research: "Add to Claude" and "Add to ChatGPT" (remote MCP with OAuth)

Research by a coding-agent helper, 2026-10-20, from the vendors' own docs unless marked uncertain.
Pages were mostly undated; recheck before launch.

## Raise first

- **Anthropic's directory won't list connectors that "transfer money, cryptocurrency, or other
  financial assets"** (https://claude.com/docs/connectors/building/review-criteria.md). So the
  connector has no payment or spending tools. Draft-only write tools are fine.
- **The MCP spec has a newer revision, 2026-07-28** (stateless: no initialize, no session id, a
  required `server/discover`, required `Mcp-Method`/`Mcp-Name` headers;
  https://modelcontextprotocol.io/specification/2026-07-28/changelog). Claude's docs list the
  2025-03-26, 2025-06-18 and 2025-11-25 auth specs. Not confirmed whether either client speaks
  2026-07-28 yet. Our server answers 2025-11-25, 2025-06-18 and 2025-03-26, statelessly.

## Claude

Sources: claude.com/docs/connectors/building.md, …/building/authentication.md,
…/custom/add-unlisted.md, support.claude.com/en/articles/11175166.

- **Plans:** Free, Pro, Max, Team and Enterprise can add custom connectors; **Free is limited to
  one**. Labelled beta.
- **Adding:** Pro and Max: Customize → Connectors → "+ Add" → "Add custom connector". Team and
  Enterprise: an Owner (or Primary Owner, or an Enterprise custom role) adds it under Organization
  settings → Connectors first; members then Connect. Once added it works in claude.ai, Desktop,
  mobile, Cowork and Claude Code.
- **Transport:** Streamable HTTP (legacy HTTP+SSE being deprecated).
- **Registration:** both DCR (RFC 7591) and Client ID Metadata Documents (CIMD). Claude uses CIMD
  only if the authorization server metadata has `client_id_metadata_document_supported: true` and
  `none` in `token_endpoint_auth_methods_supported`; otherwise DCR, which registers a new client on
  every fresh connection. `client_credentials` isn't supported.
- **PKCE:** S256 always; advertise `code_challenge_methods_supported: ["S256"]`.
- **Discovery:** an unauthenticated request must get **401** with
  `WWW-Authenticate: Bearer resource_metadata="…"` (a header on a 200 is ignored). Protected
  Resource Metadata (RFC 9728) `resource` must equal the URL the user enters, path included. Only
  the first `authorization_servers` entry is used. Fallback probes:
  `/.well-known/oauth-protected-resource/<path>`, then `/.well-known/oauth-protected-resource`.
- **Scopes:** from the 401 header, else `scopes_supported`; it adds `offline_access` if listed.
- **Callbacks:** `https://claude.ai/api/mcp/auth_callback` (hosted); Claude Code uses
  `http://localhost:<port>/callback` and `http://127.0.0.1:<port>/callback` (match ignoring port).
- **Refresh:** on a 401 and up to 5 minutes before expiry; `invalid_grant` for a dead refresh
  token; rotate refresh tokens; `/token` takes form encoding, `/register` JSON.
- **Timeouts:** 10 s for discovery, registration and token; 30 s refresh; tool calls 240 s;
  results capped near 150k characters.
- **Annotations:** directory tools need a `title` and `readOnlyHint: true` or
  `destructiveHint: true`. Read-only tools run without asking each time; destructive ones always
  prompt; users can "Always allow" or block a tool.
- **Directory:** submit at https://claude.ai/directory/manage (Pro, Max, Team or Enterprise);
  automated scan, listed as "Community" by default; needs test credentials and public docs; no
  single catch-all tool.

## ChatGPT

Sources: developers.openai.com/api/docs/guides/custom-mcp-server.md, /plugins/build/auth.md,
/plugins/build/mcp-server.md, /plugins/deploy/app-review.md. The Apps SDK docs are now branded
"Plugins".

- **Adding (web only):** chatgpt.com/plugins → "+" → "Add custom MCP server" → URL → auth →
  accept the warning → "Create as a plugin"; then install and call it with `@`.
- **Transport and auth:** SSE and streaming HTTP; OAuth, none, or mixed (initialize and tools/list
  open, tools secured one by one).
- **Writes:** allowed; confirmed by default; a tool without `readOnlyHint` counts as a write; users
  can remember approval for one conversation. `search`/`fetch` only matter for "company knowledge".
- **OAuth:** Protected Resource Metadata or the 401 header; `S256` required; sends RFC 8707
  `resource` in authorize and token requests (bind it as the token's audience). CIMD preferred
  (client id `https://chatgpt.com/oauth/client.json` or `…/oauth/{callback_id}/client.json`, auth
  `none` or `private_key_jwt`); DCR supported, once per connection (keep those clients valid).
  With `authorization_response_iss_parameter_supported: true` and an exact `iss` (RFC 9207), the
  redirect is `https://chatgpt.com/connector_platform_oauth_redirect`; otherwise
  `https://chatgpt.com/connector/oauth/{callback_id}`.
- **Directory:** a plugin portal (ZIP package, domain verification, verified identity, privacy,
  terms, support and website links, 5 positive and 3 negative test cases, a video, reviewer
  credentials); OAuth or no auth only; tools rescanned daily.
- **IP list:** https://openai.com/chatgpt-connectors.json.
- **Which plans (uncertain):** search snippets of help.openai.com/en/articles/12584461 (403 when
  opened) say full MCP with writes is for Business and Enterprise/Edu, created by admins on
  Business; an older version says Pro gets read/fetch only. Third-party guides disagree about Plus
  and Pro; nothing found for Free. **Assume workspace plans with an admin, and test on a real Plus
  or Pro account.** A June 2026 thread reports write calls blocked on a Business workspace.

## Gotchas

- Claude drops `Authorization` on a cross-host redirect: register the final URL (apex, not www).
- WAF/CDN rules can break the flow; Anthropic's egress range is `160.79.104.0/21`.
- Never accept tokens in the query string; check issuer, audience, expiry and scopes every request.
- If `/.well-known/*` can't be served at the root, put an absolute `resource_metadata` URL in the
  401 header (we do both).
- CORS matters only for browser clients such as MCP Inspector (inference).
