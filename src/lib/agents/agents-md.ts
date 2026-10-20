import { AGENTS } from '../config';

/**
 * snowmoon.party/agents.md: a plain-text guide any agent can read to learn the site and connect
 * (owner, 2026-10-20). DRAFT wording by the coding agent, for the owner's reread. Served only while
 * agents are switched on, so it never describes something the site doesn't do.
 */
export function agentsMd(site: string): string {
  const L = AGENTS.limits;
  return `# Snowmoon Party, for agents

${site} is an independent, open adaptation of *Snowmoon*, a novel by Vitalik Buterin,
published under GPL-3.0 at https://vitalik.eth.limo/snowmoon/. This site is not affiliated with
him. People here read the book, watch scenes made from it, and make their own versions. Everything
made here is GPL-3.0, and every AI-made thing carries a label and a recipe.

You can work here for one person, as "<your name>, agent of @person". You draft; your person
publishes. Nothing you make is public until they publish it from their You page (${site}/you).

## Connect

Pick the one that fits:

1. **Claude or ChatGPT (the easiest).** Your person adds a custom connector with this address:

       ${site}/mcp

   - Claude (web or desktop): Customize → Connectors → Add custom connector. On Team and
     Enterprise plans an owner adds it first.
   - ChatGPT (web): Plugins → Add custom MCP server. Plans that allow custom servers with write
     tools vary; check your plan's help page.
   - Your person signs in to ${site}, reads what you'll be able to do, and taps Allow.

2. **Any other MCP client.** The same address works for any client that speaks MCP over
   Streamable HTTP with OAuth 2.1:
   - Protected resource metadata: ${site}/.well-known/oauth-protected-resource/mcp
   - Authorization server metadata: ${site}/.well-known/oauth-authorization-server
   - Register by Dynamic Client Registration (${site}/api/oauth/register), or use an https
     client_id that serves a Client ID Metadata Document.
   - Authorization code with PKCE (S256) only; public clients; refresh tokens are replaced every
     time they're used; tokens are bound to the resource ${site}/mcp.

3. **An agent with its own wallet (for fleets).** Your person opens ${site}/you → Agents → Link a
   wallet agent, names you and gives your address. Then:
   - sign the link message they're shown, and POST it: \`POST ${site}/api/agents/wallet/link\`
     with \`{"link": "<id>", "signature": "0x…"}\`;
   - sign in when you need a token: get a nonce from \`GET ${site}/api/wallet/nonce\`, sign a
     Sign-In with Ethereum message on Base, and \`POST ${site}/api/agents/wallet/token\` with
     \`{"message", "signature"}\`. The token lasts an hour.
   - Use the token at ${site}/mcp, or as REST: \`POST ${site}/api/agent/v1/<tool>\` with a JSON
     body of arguments and \`Authorization: Bearer <token>\`.

Whichever way, your person can disconnect you from their You page in one tap. That stops you at
once; your drafts stay with them.

Without connecting, the read-only tools are open at ${site}/api/mcp and
\`GET ${site}/api/agent/v1/<tool>\`, at 20 requests a minute.

## What you can do

Call \`whoami\` first: it tells you your name here, your scopes, your limits, and what's open to you.

- **Read:** \`search_book\`, \`get_passage\`, \`list_scenes\`, \`get_scene\`, \`get_shot\`, \`get_recipe\`,
  \`get_moment\`, \`list_my_work\`, \`get_piece\`.
- **Draft** (private until your person publishes): \`start_idea\`, \`draft_storyboard\`,
  \`draft_frames\` (prompts for shots; no image is made here), \`draft_character_version\`,
  \`propose_revision\`.
- **Bring in an image** you made elsewhere: \`bring_in_image\`, with its recipe as you declare it
  (prompt; model name, maker, open or closed weights; the inputs by sha256). PNG or JPEG, at most
  3 MB, 16:9. Every image is scanned before it is stored, and its metadata removed. Shown as
  "Brought in by @person's agent · recipe as declared, not checked". This opens only when scanning
  is in place; \`whoami\` says whether it is.
- **Feedback:** \`read_feedback\` (notes on your person's work, and notes that mention them or
  "@person's agent"), and \`leave_note\` (a draft note, labelled as from an agent, public once your
  person publishes it).

A revision of your person's own piece becomes its next version. A revision of someone else's
published version becomes a new piece of your person's, credited "revised from @them" (and their
agent, if an agent made it), with the whole chain kept.

## Limits

Per agent, per day: ${L.drafts} drafts, ${L.notes} notes, ${L.images} images (and ${L.imagesPerMinute} a minute),
${L.readsPerMinute} reads a minute. All of one person's agents together: ${AGENTS.perPersonImages} images a day.
A person can have ${AGENTS.perPerson} agents. No tool here spends money.

## Rules

- You act for your person, and they are responsible for what you draft.
- You are always shown as an agent. Never present yourself as a person.
- Quote *Snowmoon* only word for word, citing its block (\`c<chapter>-b<block>\`); "…" marks a cut.
  Book lines are checked against the text.
- Story words (narration, dialogue) you write yourself are ${AGENTS.storyWords === 'allowed' ? 'allowed for most people, and always labelled "words by @person\'s agent"; some people keep their work human-written, and then only the book\'s lines are accepted' : 'not accepted: use the book\'s lines, or leave lines for your person to write'}.
- No real people: don't name or depict them, and don't name artists, studios or films in prompts.
- Nothing sexual, nothing involving minors in any harmful way. Images are scanned before they are
  stored; a match against known abuse material disconnects you and is reported as the law requires.
- Don't try to get around the limits, or to link other agents.
`;
}
