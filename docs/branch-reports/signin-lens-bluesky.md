# Branch report: signin-lens-bluesky (DRAFT)

Owner's item 5 (2026-10-31): "Sign-in, Phase 5": Lens (wallet-based) and Bluesky (AT Protocol OAuth), picked up from
`signin-equals`. Written by the coding agent (Anthropic's Claude, a closed model). **Not merged, no pull request.**
`origin/main` was merged in with a merge commit (one conflict in `src/lib/config.ts`: `SIGN_IN_METHODS` from
signin-equals and `SUPPORT` from main, both kept).

**Everything is off.** `SIGN_IN_METHODS` keeps `lens` and `bluesky` at `on: false`; every Lens and Bluesky route
answers 404 while off (tested). Turning them on needs: the owner's "reread" of
`docs/legal/signin-lens-bluesky-draft.md` (the lines go into `legal.ts` in the same release), the migration applied,
and the decisions below. No model was called; $0 spent. No production writes: every test ran against PGlite and
stand-ins; the only outside requests were read-only queries to Lens's public API for the score sample.

## What works (tested with stand-ins; not tried against real Lens or Bluesky sign-in)

### Lens: Lens's own authentication

`src/lib/social/lens.ts`, routes `src/app/api/auth/lens/{accounts,challenge,verify}`.

1. The browser's wallet address goes to our server, which asks Lens which accounts it owns or manages
   (`accountsAvailable`); the person picks one (or it's picked if there's one).
2. Our server asks Lens for a challenge (`challenge(request: { accountOwner | accountManager: { app, account, owner |
   manager } })`, role chosen from the account's `owner`), sending our origin, so the message is a Sign-In with Ethereum
   message for this site on Lens Chain (232). We return the text and a signed ticket binding the challenge id to the
   account (ten minutes).
3. The page checks the message is for this host and this wallet, the wallet signs it, and our server sends it to Lens
   (`authenticate`). On `AuthenticationTokens` we verify the ID token ourselves: RS256 against Lens's JWKS
   (`https://api.lens.xyz/.well-known/jwks.json`), issuer `https://api.lens.xyz`, audience our App, not expired, role
   `ACCOUNT_OWNER` or `ACCOUNT_MANAGER`; the account is `act.sub` (a manager) or `sub`, and must be the ticket's.
   `WrongSignerError`, `ExpiredChallengeError` and `ForbiddenError` are refusals. Lens's tokens are dropped.

Lens's docs: https://lens.xyz/docs/protocol/authentication (flow, JWKS, RS256, claims, test Apps). The GraphQL
shapes were read from the live schema (introspection of `https://api.lens.xyz/graphql`, 2026-10-31).

**Decision needed (before Lens goes on):** the challenge names a Lens **App**. `SOCIAL_SIGN_IN.lens.app` is Lens's own
mainnet *test* App (`0x8A5Cc311…97cE`, from the docs), fine for local testing. For the site, register Snowmoon's own
Lens App on Lens Chain (an onchain deploy; small gas) and put its address there.

### Bluesky: AT Protocol OAuth

`src/lib/social/atproto.ts`, routes `src/app/api/auth/bluesky/{start,callback}`, page `/sign-in/bluesky`, metadata
`/oauth/bluesky/client-metadata.json`. Written against the spec (https://atproto.com/specs/oauth) with Node's own
crypto; **no package installed or needed**.

- Public client, scope `atproto` only (proves the DID, nothing else). PKCE S256, PAR, DPoP (ES256, a fresh key per
  sign-in, the server's `use_dpop_nonce` retry).
- Locally: the loopback client (`client_id=http://localhost?redirect_uri=http%3A%2F%2F127.0.0.1%3A<port>%2Fsign-in%2Fbluesky&scope=atproto`).
  **Test at `http://127.0.0.1:<port>`, not `localhost`**: the spec wants the redirect on 127.0.0.1, and the page keeps
  the sign-in in that tab's sessionStorage. Never on Vercel.
- On the site: `https://snowmoon.party/oauth/bluesky/client-metadata.json` is the client_id (public client,
  `token_endpoint_auth_method: none`, `dpop_bound_access_tokens: true`, redirect `https://snowmoon.party/sign-in/bluesky`).
- Start: handle → DID (DNS TXT, then HTTPS) → DID document (plc.directory or did:web) → PDS →
  `/.well-known/oauth-protected-resource` → authorization server → its metadata (issuer must match; ES256, S256,
  `atproto`, `iss` in the response required) → PAR. What the finish needs (verifier, DPoP key, issuer, token endpoint,
  expected DID, state) is **sealed** (AES-256-GCM, key from `IMAGES_TICKET_SECRET`) and kept by the page in that tab, so
  there is no cookie and no database row for a sign-in in progress.
- Finish: state must match the sealed one; `iss` must be the issuer we sent the person to; the code is exchanged (DPoP,
  PKCE); `token_type` DPoP and `atproto` in scope; `sub` must be the DID typed; and that DID's own PDS must name this
  issuer. The handle is kept only if it resolves back to the DID. The tokens are dropped.
- Every outside request: https only, a public host name (no IP literal, no localhost, no .local), 5 s timeout, no
  redirects, 100 kB cap. Not covered: DNS rebinding (a public name resolving to a private address). Worth a look before
  turning on; Vercel's network limits what that could reach.

### Who a Lens or Bluesky sign-in is

- A session token `s1.…` (like the wallet's `w1.…`), a day, kept in localStorage, sent as the bearer to the routes
  that take a wallet (`WALLET_ROUTES`) when there is no Farcaster or wallet sign-in.
- `getPerson`: a linked Farcaster ID; for Bluesky linked to Lens, that Lens account (or its FID); else the account
  itself, as person number `-(1,000,000,000 + id)` (`src/lib/people.ts`), so it never meets a FID or a wallet account.
  Every "person < 0 means wallet" place that touches money now asks `isWalletPerson` (Pictures and Remix limits and
  status, the agents' frame price, the You route's prices).
- So a Bluesky or Lens account can sign in, leave notes (comment), start drafts in "Make your own" (fork) and connect
  agents, where those routes are open to it. **Agents and notes stay behind the agents allowlist**: a Lens or Bluesky
  account gets in only if listed in `AGENTS.people.social` (`'lens:<address>'` or `'bluesky:<did>'`), empty now.
- Bylines: a Bluesky handle or a Lens username ("lens/stani") on images, Remix frames and storyboards; `whoIs` on the
  You page and profiles. No `/@handle` page for them yet (their `handleFor` is null).
- Not done in the UI: the menu shows the signed-in Lens/Bluesky name with Sign out, and the note form, Make your own
  and the agent consent screen accept the session. **The You page has no Lens/Bluesky panel yet: no link or unlink
  buttons.** The server route (`/api/social-link`, both sign-ins in one request, like `/api/wallet-link`) is built and
  tested; the panel is the main missing piece.

### Free generations

How it works today: a Farcaster account gets the free daily counts (Pictures 10, behind the Neynar score; Remix
frames), a wallet account gets none and pays from its prepaid balance.

Now (`src/lib/social/free.ts`), checked at the gate **and again where a Generate is counted** (so an agent's approved
frame, which skips the gate, can't get one either):
- Bluesky only: none, ever. No balance either (only wallet accounts have one): to pay, sign in with a wallet.
- Linked to a Farcaster account: signs in as that FID, so the FID's counts (shared with it, not added).
- Bluesky linked to a Lens account: whatever that Lens account gets.
- Lens: free only once `SOCIAL_SIGN_IN.lens.minScore` is set and its score is at least that; while it is null (now),
  none, and **the score is never looked up**. Lens unreachable: none.

## Lens score: real values, for choosing a threshold

**What it is.** Lens's "Account Score": "a probability-based measure that evaluates an account's signal strength,
helping to reduce the impact of spammy behavior … calculated using a set of ML algorithms that consider factors like
follower graphs, content, and other variables. Higher scores suggest a positive and active presence within the
ecosystem." (https://lens.xyz/docs/protocol/accounts/fetch). The docs give no range or formula; it is the `score: Int!`
field on `Account`. In the sample the values run from 0 to 9998, so it looks like 0–10,000.

**Sample** (read-only GraphQL queries to `https://api.lens.xyz/graphql`, 2026-10-31 ~08:10 UTC; 644 distinct accounts;
the script and raw answers are in the session's scratchpad, not committed):

| Group | n | min | p10 | p25 | median | p75 | p90 | p95 | max | ≥100 | ≥1000 | ≥5000 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Well-known usernames (stani, lens, aave, christina, nader, yoginth, …) | 24 | 5 | 39 | 8838 | 9990 | 9995 | 9997 | 9997 | 9998 | 83% | 83% | 79% |
| Recent posters (authors of the latest 400 posts, global feed) | 262 | 0 | 0 | 0 | 0 | 90 | 5245 | 9991 | 9997 | 24% | 13% | 10% |
| Newest usernames (last 200 minted) | 200 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0% | 0% | 0% |
| Random username search (20 random two-letter searches) | 161 | 0 | 8 | 10 | 24 | 69 | 422 | 631 | 9990 | 17% | 4% | 1% |
| **All distinct** | **644** | **0** | **0** | **0** | **0** | **31** | **647** | **9990** | **9998** | **17%** | **9%** | **7%** |

Readings:
- Long-standing, followed accounts sit at 9,986–9,998 (stani 9990, lens 9995, aave 9989, christina 9992, nader 9990,
  vitalik 9990, orb 9997, hey 9986). A few usernames that sound well-known score low (josh 63, jarrod 29, eunji 5,
  cristobal 6): those usernames probably aren't the famous people, so they're "random" in effect.
- Every account made in 2026 among the recent posters (180 of 262) scored **0**; many have machine-like names
  (stills870055, frames395758). All 200 newest usernames scored 0. So brand-new accounts start at 0, whether real or not.
- The distribution is bimodal: most accounts under ~700, then a jump to ~9,000+ for established ones.
- For comparison, the Neynar gate is 0.7 on a 0–1 scale. Rough options: **100** lets in about one in six of a broad
  sample but no new account; **1000** about one in eleven; **5000** essentially only established accounts. Not set:
  the owner's choice.

**Where it lives:** `SOCIAL_SIGN_IN.lens.minScore` in `src/lib/config.ts` (null). The refusal shows the number.

## The migration

`supabase/migrations/NEXT_signin_lens_bluesky.sql` (numbered at merge): **A** dry run (ends in rollback), **B** the
migration, **C** the read-back (reads, then a realistic Lens account, a Bluesky account, a sign-in again, a link to FID
6786 and its end, as `studio_writer`; deleted as postgres; rollback). The same blocks are in
`supabase/drafts/NEXT_signin_lens_bluesky.DRY-RUN.sql` and `supabase/drafts/READ-BACK-signin_lens_bluesky.sql`. Run as
postgres in the Supabase SQL Editor. **Not applied.**

Adds `studio.social_accounts` (kind, subject = Lens address or DID, handle, created_at, last_sign_in_at; unique per
kind and subject; the app may insert and update only handle and last_sign_in_at) and `studio.social_links` (account →
FID or Lens account, linked_at, unlinked_at, ended_by 'person'; one active per account; the app may only end a link).
RLS on, nothing for anon or authenticated. No tokens are stored anywhere. Until it is applied, a sign-in answers
"isn't available yet" and keeps nothing.

## Legal drafts

`docs/legal/signin-lens-bluesky-draft.md`: before and after for Privacy §4 (opening line; a Lens/Bluesky item; a link
item; the images byline), Privacy §7 (Lens's API; the person's Bluesky server, its sign-in server and plc.directory)
and Terms §4, plus three phrases the owner didn't list but that would stop being true: Privacy §3 (a day's sign-in
token; the sign-in in progress kept in the tab), Privacy §6 and Terms §5 (bylines). Two variants where the Lens
threshold changes the words. `legal.ts` is untouched.

## Checks

Logs are in the session scratchpad (`signin-*.log`).

- `npx tsc --noEmit -p .`: passes.
- `npm run test:signin-lens-bluesky` (new): **13 of 13 rules pass, each proven to fail on a planted violation** —
  L1–L3 Lens (owner, manager, and seven refusals: another wallet, a key outside the JWKS, another App, expired, another
  account, a builder token, a changed ticket, and a stranger asking for someone's account), B1–B3 Bluesky (loopback
  start and callback, PKCE and DPoP checked by the stand-in server; refused for a changed state, another issuer, no
  issuer, a changed seal, a seal from another tab, another DID, a DID whose PDS names another server; a handle not
  pointing back isn't kept; metadata; no IP or localhost requests), F1–F4 free generations, M1 the migration, S1 off
  means 404.
- `test:wallet`: passes (177). `test:images` / `test:images-gate`: the gate tests pass after one expected update (the
  status route now has three branches that offer picks; the static count went from 2 to 3). `test:designs` has **one
  failure that is on main too** ("nothing official … on the new screens", `src/components/design-index.tsx`, unchanged
  here: its `title="Nothing here is official"` has no full stop, so the check's exemption misses it).
- `check:principles` (static; its page checks read the live site): **54 pass, 1 fail (P6d, the accepted open item), of
  55; 55 of 55 proven to fail on a planted violation.** On the first run, P1f caught the Bluesky handle box as a bare
  text box; it is now `handle-field.tsx`, with its own P1f wording check.
- `check:ui` against this branch's build (shared lock, port 3321): **passed, 59 pages**, first run. Lens and Bluesky
  never showed, as expected, because they are off.
- `test:you-page`: **all 73 checks pass.** `test:agents`: **185 checks pass.**

New or changed checks in `check:principles` (the owner's yes pending on the exemptions):
- **P4a**: four named sign-in exemptions (lens/challenge, lens/verify, bluesky/start, bluesky/callback), like the
  wallet's and Farcaster's.
- **P6p (new)**: Lens or Bluesky sign-in on while Privacy §4 or §7 doesn't describe it fails.
- **P1f**: the Bluesky handle box (`handle-field.tsx`) says it's sent to us to sign in and never published.
- **P6b**: `social_links` is among the per-person tables anon and authenticated must not read.

## Packages

None installed and none needed. Lens: `viem` (already there) in the browser; Node's crypto checks RS256. Bluesky: Node's
crypto for ES256 DPoP, PKCE and AES-GCM; `node:dns` for handles. `@atproto/oauth-client-node` would replace about 300
lines of `atproto.ts` and add session storage we don't want (we keep no tokens); not needed.

## What the owner must say

1. **"reread"** of `docs/legal/signin-lens-bluesky-draft.md` (with any changes), choosing variant A or B.
2. **"applied"** for `NEXT_signin_lens_bluesky.sql` (it gets its number at merge).
3. **Decisions:** the Lens score threshold (or leave null: Lens accounts get no free generations); register a Lens App
   for the site; whether the four P4a exemptions are OK; whether to build the You page link/unlink panel before turning
   these on (the legal draft's "unlink on your You page" needs it).
4. Then a PR, merge, and turning `lens` / `bluesky` on in `SIGN_IN_METHODS` in the same release as the legal lines.

## Principles

- **P1 (recipes, the publication line)**: pass. P1f: the new handle box says what happens to it.
- **P4 (a signed-in person's action)**: pass, with four new named sign-in exemptions in P4a (owner's yes pending). They
  write only `social_accounts`, only for a proof Lens or the person's Bluesky server accepted, and 404 while off.
- **P6 (no third-party requests from pages; private per-person rows)**: pass. All Lens and Bluesky requests are made
  by our server, not the page; the browser goes to the person's Bluesky sign-in server only when they choose to sign
  in, a top-level navigation, like Farcaster's app link. New tables are private (P6b). P6d is the accepted open item.
- **Legal texts describe today**: pass. Off until the reread; P6p enforces it.
- **P7 (payments never enter scoring)**: pass. The Lens score decides free generations, like the Neynar score; it
  orders nothing.
- **New tension**: the Lens score is another outside "spam score" gate, like Neynar's. The person's Lens account address
  would go to Lens at each image/frame session (variant B only). And a Lens sign-in needs a Lens App we register, which
  publishes onchain that this site uses Lens.
