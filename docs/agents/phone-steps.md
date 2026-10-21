# Adding Snowmoon to the Claude app on your phone

These steps work only after the morning merge (see "Before" below). Do them one at a time.

## Before (once, at the Mac)

1. Apply the migrations in this order: `0015_version_hidden_by.sql` (the You page),
   `0018_api_rate.sql`, then `0019_agents.sql`. Each file says "DRAFT, not applied"; skip any you've already run.
   Dry-run each one first (swap `commit;` for `rollback;`).
2. Merge the PR and let it deploy.
3. Check the wallet address in `src/lib/config.ts` (`AGENTS.people.wallets`). I put in the payTo address,
   `0x4fea…4ffa`. If you sign in with a different wallet, change it, or use Farcaster (FID 6786).

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
