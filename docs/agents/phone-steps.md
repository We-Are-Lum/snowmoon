# Adding Snowmoon to the Claude app on your phone

These steps work only after the morning merge (see "Before" below). Do them one at a time.

## Before (once, at the Mac)

1. Apply the migrations in this order: `0015_version_hidden_by.sql` (the You page),
   `0018_api_rate.sql`, then `0019_agents.sql`. Each file says "DRAFT, not applied"; skip any you've already run.
   Dry-run each one first (swap `commit;` for `rollback;`).
2. Merge the PR and let it deploy.
3. Sign in with Farcaster (FID 6786): it's the only account on the allowlist. To add your sign-in wallet
   later, put its address (lowercase) in `AGENTS.people.wallets` in `src/lib/config.ts`.

## On the phone

1. Open the Claude app.
2. Go to Settings → Connectors → **Add custom connector**. On claude.ai this is under Customize →
   Connectors. If you don't see it on the phone, add it once on claude.ai in a browser: connectors
   added there show up in the app.
3. Name it **Snowmoon** and enter the URL **https://snowmoon.party/mcp**. Leave the advanced settings
   empty, then tap Add.
4. Tap **Connect**. Snowmoon's consent page opens. Sign in if it asks, check what it lists, and tap
   **Allow**.
5. In a new chat, turn Snowmoon on under the tools button. Try: "In my Fifteen Days version, list the
   shots and their lines."
6. Ask for an edit, for example: "On shot 3, try a new frame: warmer light."
7. Open **snowmoon.party/you**. The draft waits there with its cost. Tap **Make it** to spend, then
   **Keep**, **Try again** or **Say more**.
8. Anything the agent couldn't do is listed on /you under **"What your agent couldn't do"**.

**To disconnect:** tap Disconnect on /you, or remove the connector in the app. Either one stops the agent
at once.

## Next: ChatGPT Plus (on the web)

Test whether it can draft or only read. OpenAI's help page lists write actions for Business,
Enterprise and Edu, and read and fetch for Pro. It doesn't name Plus.

1. On chatgpt.com, go to Settings → Apps (it may say "Apps & Connectors") → Advanced settings, and turn on **Developer mode**. The exact menu names may differ.
2. **Create app**, with the URL https://snowmoon.party/mcp and OAuth for authentication.
3. Sign in on Snowmoon's page and tap **Allow**.
4. In a chat, ask: "Using Snowmoon, call whoami." That's a read.
5. Then ask: "On shot 3 of my Fifteen Days version, mark Bai as speaking." That's a draft.
   - If ChatGPT asks you to confirm and the draft shows up on /you, Plus can draft.
   - If the tool is missing or blocked, Plus can only read.

## Muse (Meta), with a key

Muse may connect with a key rather than a sign-in, so it gets a personal agent key.

1. On snowmoon.party/you → Agents → **Make an agent key**. Name it "Muse" and set a cap (for example
   $1). Tap **Make the key**, then **Copy**. The key is shown only this once.
2. In Muse, ask it to add a custom connector. When it asks for the key, paste it into the **secure
   credential prompt**, never into the chat.
3. Tell Muse: "Connect to snowmoon.party/agents.md and follow it." The page tells it the endpoint
   (https://snowmoon.party/mcp) and how to send the key (`Authorization: Bearer …`, or the header
   `X-Snowmoon-Key`).
4. Ask for an edit, then review it on /you. Your Agents list shows what the key has spent of its cap.

If the key ever ends up in a chat message, tap **Disconnect** on the key in /you and make a new one.
The key ends by itself after 30 days.
