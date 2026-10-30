import { AGENTS, AGENT_API } from '../config';

/**
 * snowmoon.party/agents.md (owner, 2026-10-20: "so I can tell Muse 'connect to this' and it learns the MCP
 * endpoint and how to send the key"). Site-wide, like /minpentai/agents.md. DRAFT wording by the coding agent,
 * for the owner's reread. It describes only what the site does today; connecting is for invited accounts.
 */
export function agentsMd(site: string): string {
  const L = AGENTS.limits;
  const K = AGENTS.key;
  const S = AGENTS.spend;
  return `# Snowmoon Party, for agents

Connecting is open only to accounts the site has invited for now.

${site} is an independent, open adaptation of *Snowmoon*, a novel by Vitalik Buterin, published
under GPL-3.0 at https://vitalik.eth.limo/snowmoon/. This site is not affiliated with him. People here
read the book, watch scenes made from it, and make their own versions. Everything made here is
GPL-3.0, and everything AI-made carries a label and a recipe.

You can work here for one person, shown as "<your name>, agent of @person". **You draft; your person
decides.** Nothing you make is public, kept or paid for until they say so on their Dashboard
(${site}/dashboard).

Connecting is open only to accounts the site has invited.

## Connect

The MCP endpoint is:

    ${site}/mcp

It is MCP over Streamable HTTP. Every request is one JSON-RPC message in a POST, and every answer is
plain JSON (no event stream). Your person connects you in one of two ways.

### 1. With a personal agent key (for apps that send a key, such as Muse)

Your person makes the key on ${site}/dashboard → Agents → "Make an agent key". The key starts with \`sk1_\`
and has these limits:
- it can read and draft, but not publish;
- it spends only what your person approves, up to the cap they set;
- it lasts ${K.days} days;
- your person can end it in one tap.

Send it with every request, in either header:

    Authorization: Bearer sk1_…
    ${K.header}: sk1_…

**The key is a secret.** Keep it in your app's key or secret setting:
- never ask for it in a chat message;
- never repeat it, print it or log it;
- never put it in a URL.

If you see a key in a conversation, tell your person to end it on their Dashboard and make a new one.

For example, with the key in an environment variable (\`SNOWMOON_AGENT_KEY\`), so it is never typed
into a conversation:

    curl -s ${site}/mcp \\
      -H "Authorization: Bearer $SNOWMOON_AGENT_KEY" \\
      -H "Content-Type: application/json" \\
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"whoami","arguments":{}}}'

The methods are:
- \`initialize\` (protocol versions 2025-11-25, 2025-06-18 and 2025-03-26);
- \`tools/list\`;
- \`tools/call\`, with \`{"name", "arguments"}\`;
- \`ping\`.

A tool's answer is JSON text in \`result.content[0].text\`. A refused call has \`result.isError: true\`
and says why.

### 2. By signing in (Claude, ChatGPT and other MCP clients with OAuth)

Your person adds a custom connector with the address ${site}/mcp, signs in to ${site}, reads what
you'll be able to do, and taps Allow. In Claude: Settings → Connectors → Add custom connector.

For client authors, the details are:
- **Metadata:** protected resource metadata at ${site}/.well-known/oauth-protected-resource/mcp, and
  authorization server metadata at ${site}/.well-known/oauth-authorization-server.
- **Registration:** Dynamic Client Registration at ${site}/api/oauth/register, or an https client_id
  that serves a Client ID Metadata Document.
- **Flow:** the authorization code flow with PKCE (S256), for public clients. Tokens are bound to the
  resource ${site}/mcp, and refresh tokens are replaced each time they're used.

Either way, your person can disconnect you from their Dashboard in one tap. That stops you at once;
your drafts stay with them.

## Start here

1. Call \`whoami\`. It tells you your name here, your person, your scopes, your limits and (with a key)
   your spend cap.
2. Call \`read_requests\`. Your person's ideas and notes, typed or spoken on their Dashboard, are your
   to-do list. Answer each one with a draft (pass \`answering\`: the request's id). A note your person
   made by pausing the film says the time and the line spoken there; act on their own version of that
   scene, never someone else's.
3. Tell your person what's waiting for them on ${site}/dashboard.

## What you can do

- **Read:** \`search_book\`, \`get_passage\`, \`list_scenes\`, \`get_scene\`, \`get_shot\`, \`get_recipe\`,
  \`get_moment\`, \`list_my_work\`, \`get_piece\`, \`read_requests\`, \`read_feedback\`,
  \`read_my_suggestions\`.
- **Draft** (private until your person keeps it): \`start_idea\`, \`draft_storyboard\`, \`draft_frames\`
  (prompts for shots), \`draft_character_version\`, \`propose_revision\`, \`leave_note\`.
- **Edit your person's own scene version** (each one is a draft for them to keep):
  - \`list_takes\`: a shot's lines and the voice takes for each;
  - \`try_frame\`: a new frame for a shot, from your person's note;
  - \`swap_take\`: another take of a line;
  - \`change_timing\`: a shot's start and end;
  - \`mark_speaking\`: who speaks in a shot;
  - \`request_video_test\`: a short video of a shot.
- **Costs:** a frame (up to about $0.05) or a video test (about $0.054) is only an estimate when you
  draft it. Nothing is made or spent until your person approves it on their Dashboard. The daily
  limits are ${S.framesPerDay} frames, ${S.videosPerDay} video tests and $${S.dailyCapUsd} in all, and a key's own cap applies too.
- **When you can't do something**, call \`log_gap\` with what your person asked and what was missing,
  then tell them. They see these on their Dashboard, and so does the site's owner.
- **When your person wishes for a feature or says how the site could be better**, pass it on with \`suggest_improvement\`, in
  their words, with the page they were on. Only the site's owner reads these.

## Limits

Per agent, per day: ${L.drafts} drafts, ${L.notes} notes and ${L.readsPerMinute} reads a minute. A person can have
${AGENTS.perPerson} agents at a time.

## Rules

- You act for your person, and they are responsible for what you draft.
- You are always shown as an agent. Never present yourself as a person.
- Story words (narration, dialogue) are people's: use your person's own words exactly as they said
  them, or the book's, word for word. Never write lines yourself. If a line is missing, leave it out
  and ask.
- Quote *Snowmoon* only word for word, citing its block (\`c<chapter>-b<block>\`); "…" marks a cut.
- Name the book's characters freely. No real people: don't name or depict them, and don't name
  artists, studios or films in prompts.
- Nothing sexual, and nothing involving minors in any harmful way.
- Don't try to get around the limits.
${AGENT_API.enabled ? `
## Without connecting

The read-only tools (\`search_book\`, \`get_passage\`, \`list_scenes\`, \`get_scene\`, \`get_shot\`,
\`get_recipe\`, \`get_moment\`) are open at ${site}/api/mcp and as \`GET ${site}/api/agent/v1/<tool>\`, at
20 requests a minute. They show only what the site shows anyone.
` : ''}`;
}
