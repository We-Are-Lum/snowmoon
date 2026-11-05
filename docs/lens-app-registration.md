# Registering Snowmoon's own Lens App (DRAFT)

For the owner, 2026-11-04 (your answer 4a). Drafted by the coding agent (Anthropic's Claude, a closed model). Branch
`signin-lens-bluesky`.

**Status (2026-11-04, owner: "the metadata is approved as drafted"):** the metadata is uploaded to Grove as an
immutable file (step 1, below). The admin page `/admin/lens-app` runs steps 2 to 4 in your browser with your wallet
(`src/components/lens-app-register.tsx`); nothing is signed or sent until you use it. **Before:** nothing had been
sent, signed or uploaded. The agent only read Lens's docs, Lens's public
GraphQL schema (introspection) and Lens Chain's public RPC; `eth_estimateGas` is a read-only simulation.

Today the site signs Lens users in to Lens's own **Test App** (`0x8A5Cc31180c37078e1EbA2A23c861Acf351a97cE`,
`SOCIAL_SIGN_IN.lens.app` in `src/lib/config.ts`). Lens's docs say test Apps are for testing. Registering our own
App puts "Snowmoon Party" on the sign-in and in every Lens ID token's `aud`. It also publishes onchain that this site
uses Lens. It changes no legal words.

## In one look

| | |
|---|---|
| Chain | **Lens Chain mainnet**, chain id **232** (0xe8), RPC **https://rpc.lens.xyz** (WebSocket `wss://rpc.lens.xyz/ws`), explorer https://explorer.lens.xyz, gas token **GHO** |
| From which wallet | **Your own wallet**, the one that will own the App (it becomes the App's owner). Not the site's pay-to address and not the Support (Splits) address. Same wallet for the Builder sign-in (step 2) and, if asked, the transaction (step 4) |
| What you sign | (1) a Lens **Builder sign-in** message (off-chain, no gas); (2) only if Lens doesn't sponsor it, **one transaction** to the **LensFactory** contract `0x1fa75D26819Ac733bf7B1C1B36C3F8aEF32d2Cc0`, which deploys the App |
| Gas | about **0.0012–0.0021 GHO** (under one cent); have **0.01 GHO** on Lens Chain to be safe. Every recent App deploy we found was paid by Lens's own sender, so you may pay nothing |
| Afterwards | put the new App address in `SOCIAL_SIGN_IN.lens.app` (one line), in the same release that turns Lens on |

## 1. The App's metadata (uploaded first; no wallet, no gas)

Lens's App metadata format (`$schema` `https://json-schemas.lens.dev/app/1.0.0.json`; fields from
`@lens-protocol/metadata`'s `AppMetadataSchema`, last changed 2025-01-10). Proposed content, DRAFT for your OK:

```json
{
  "$schema": "https://json-schemas.lens.dev/app/1.0.0.json",
  "lens": {
    "name": "Snowmoon Party",
    "tagline": "Snowmoon by Vitalik Buterin, read and illustrated in the open.",
    "description": "An independent, open edition of the novel Snowmoon by Vitalik Buterin (GPL v3), with read-aloud audio, pictures and a game. Not affiliated with or endorsed by the author. Operated by Lum LLC.",
    "logo": "https://snowmoon.party/icon.png",
    "url": "https://snowmoon.party",
    "developer": "Lum LLC",
    "platforms": ["web"],
    "termsOfService": "https://snowmoon.party/terms",
    "privacyPolicy": "https://snowmoon.party/privacy"
  }
}
```

**Uploaded (2026-11-04):** `docs/lens-app-metadata.json`, byte for byte, sha256
`bddb0e3e35ade9e28b884e7003f2663942ecf996196f809bf2ec2707f96e9d26`, by `POST https://api.grove.storage/?chain_id=232`
(HTTP 201): uri **`lens://a0001df5cbdfdde5837b0896b0a4006eff7f614ff37dc240677b2508005499d4`**, gateway
https://api.grove.storage/a0001df5cbdfdde5837b0896b0a4006eff7f614ff37dc240677b2508005499d4 (status "available"; its
bytes hash to the same sha256). Immutable: a PUT to it without Grove's ACL token answers 401.

- Required: `name`, `url`, `developer`, `platforms`. The rest are optional; `logo` can be dropped.
- **Where it lives (the metadata URI):** upload it to Grove, Lens's storage, as an immutable file:
  `POST https://api.grove.storage/?chain_id=232` with the JSON as the body and `Content-Type: application/json`. The
  answer gives a `uri` like `lens://4f91ca…` and a `gateway_url`. Grove's docs mention no wallet or fee for an
  immutable upload. The agent can do this step on your OK (it is not a transaction); the file is then public and can't
  be changed (a new version means a new upload and an App metadata update).
- Alternative: host the same JSON at `https://snowmoon.party/lens-app.json` and use that URL. That can be changed
  later without Lens, but the App's onchain record then points at our site.

## 2. Sign in to Lens as a Builder (off-chain, no gas)

Lens: "You MUST be authenticated as Builder to create an App." The Builder role "does not require an App address."

- Lens's API (`https://api.lens.xyz/graphql`) is asked for `challenge(request: { builder: { address: "<YOUR_WALLET>" } })`.
- Your wallet signs the message it returns (a Sign-In with Ethereum message). That signature is the Builder sign-in.
  Then `authenticate(request: { id, signature })` returns Builder tokens, used only for step 3.
- **Built: the page `/admin/lens-app`** (owner, 2026-11-04), calling Lens's GraphQL API directly from your browser
  (no new package; Lens's API allows any origin). It also re-checks the metadata's bytes on Grove. Was:
  a short script with `@lens-protocol/client` (`client.login({ builder: { address }, signMessage })`), run on
  your computer with your wallet, or a page we build that runs it in your browser. Neither exists yet; say which.

## 3. Create the App (the `createApp` mutation)

The call (Lens's SDK `createApp(sessionClient, {...})`, or the GraphQL `createApp(request: CreateAppRequest!)`),
with every argument (field list from Lens's public schema, introspected 2026-11-04):

| Argument | Value | Why |
|---|---|---|
| `metadataUri` | the `lens://…` URI from step 1 | the App's name and links |
| `admins` | `[]` (empty) | you, the owner, can already manage it; add a second address only if you want one |
| `graph` | `{ globalGraph: true }` | we don't run our own follow graph |
| `defaultFeed` | `{ globalFeed: true }` | we don't post to Lens; the global feed is the default |
| `feeds` | `[]` (default: the global feed) | as above |
| `namespace` | `{ globalNamespace: true }` | Lens usernames stay `lens/<name>`, which is what the site shows as a byline |
| `groups` | `[]` | none |
| `verification` | `false` | App Verification signs posts and follows made through the App; we make none |
| `signers` | `[]` | none (only used with verification) |
| `sponsorship` | not set | we don't pay Lens users' gas |
| `treasury` | not set | no fees |

No Authorization Endpoint is needed: Lens's docs say "By default, any Lens account can log in to your app", and an
endpoint is only "To control access, sponsorship, or enable app verification". Our server already decides who gets
what (the Lens score check), after sign-in.

The answer (`CreateAppResult`) is one of:

- `CreateAppResponse { hash }`: Lens sent the transaction itself (sponsored). You pay nothing; wait for it
  (`waitForTransaction`), then `fetchApp({ txHash })` gives the App's address.
- `SelfFundedTransactionRequest { raw }`: you send `raw` from your wallet (step 4).
- `TransactionWillFail { reason }`: nothing to send; tell me the reason.

## 4. If Lens asks you to send it (one transaction)

- **To:** the LensFactory, `0x1fa75D26819Ac733bf7B1C1B36C3F8aEF32d2Cc0` (Lens's contracts page, "Lens Mainnet").
  It calls the AppFactory (`0xB3b7502C47E16a1E3c6d660b73006f45Ec327B0B`) to deploy the App. The function is
  LensFactory's App deploy (selector `0xec5c08c0` in every recent App deploy we found); the arguments are the
  ones in step 3, encoded by Lens's API into `raw.data`. Check before signing: `to` is the LensFactory, `value` is
  0, `chainId` is 232. The page shows to, value and chainId (and from, gas and the data's first bytes) before you sign, and
  won't offer to send unless `to` is the LensFactory, `value` is 0, `chainId` is 232 and `from` is your wallet; you
  also tick that you checked them.
- **From:** your wallet (the Builder), on **Lens Chain mainnet (232)**, gas paid in **GHO**.

### Gas estimate (2026-11-04)

Read from Lens Chain's public RPC (`https://rpc.lens.xyz`), block 6,457,034:

- `eth_gasPrice`: 2,771,160,274 wei (about 2.77 gwei, in GHO).
- Eight recent App deploys (LensFactory, selector `0xec5c08c0`, 15–18 Oct 2026, e.g.
  `0x9ae87c32…f244ac` and `0xf735f6d4…cfe6d6`) used **438,721–509,735 gas** at 2.771 gwei:
  **0.00122–0.00141 GHO** each.
- `eth_estimateGas` re-simulating two of them (same sender and calldata) gave **735,803** and **754,985 gas**:
  **0.0020–0.0021 GHO** (an estimate is higher than what is finally used).
- All eight were sent by one address (`0xb9646756…3264e348`), which looks like Lens's own sponsor, so the App
  may be created at no cost to you (step 3's `CreateAppResponse`).

GHO is about one US dollar, so the cost is well under one cent. **Have 0.01 GHO on Lens Chain** in your wallet.

### Getting GHO onto Lens Chain

- **Lens Bridge**, https://lens.xyz/bridge: "transfer assets between various EVM networks and the Lens Chain". Bridge a
  little ETH or GHO from Ethereum (or a network the bridge lists) to Lens Chain; GHO is Lens Chain's native token.
- **Across**, https://app.across.to/bridge (Lens's docs list it for Lens Chain): pick Lens as the destination and GHO.
- **ZKsync Bridge**, also listed in Lens's docs.
- About $1 of GHO is plenty. Check the chain shows "Lens" / chain id 232 in your wallet before you confirm.

## 5. What changes afterwards

- `src/lib/config.ts`: `SOCIAL_SIGN_IN.lens.app` becomes the new App's address (and its comment says it is ours,
  registered on its date, with its transaction hash). Nothing else: the challenge, the ID token's audience check (`aud` must be our App)
  and `test:signin-lens-bluesky` all read that one value.
- Before Lens goes on: one real sign-in on a preview with your Lens account, checking the token's `aud` is the new
  App.
- Optional later: an App metadata update (new URI) is another `setAppMetadata` call by you; not needed now.

## Sources (read 2026-11-04; Lens's pages carry no dates)

- Create an App: https://lens.xyz/docs/protocol/apps/create
- Authentication (Builder role, App addresses, test Apps): https://lens.xyz/docs/protocol/authentication
- Authorization workflows ("By default, any Lens account can log in to your app"): https://lens.xyz/docs/protocol/apps/authorization-workflows
- Contracts (LensFactory, AppFactory, global Graph, Feed and Namespace, Test App): https://lens.xyz/docs/protocol/resources/contracts
- Network information (chain id 232, RPC, explorer, GHO): https://lens.xyz/docs/chain/resources/network-information
- Bridges: https://lens.xyz/docs/chain/tools/bridging/lens and https://lens.xyz/docs/chain/tools/bridging/across
- Grove upload: https://lens.xyz/docs/storage/usage/upload
- App metadata schema: https://github.com/lens-protocol/metadata/blob/main/src/app/AppMetadataSchema.ts (last change 2025-01-10)
- Lens API schema (`CreateAppRequest`, `CreateAppResult`, `BuilderChallengeRequest`): introspection of https://api.lens.xyz/graphql, 2026-11-04
- Gas: `eth_gasPrice`, `eth_getLogs` (AppFactory), `eth_getTransactionReceipt` and `eth_estimateGas` on https://rpc.lens.xyz, 2026-11-04
