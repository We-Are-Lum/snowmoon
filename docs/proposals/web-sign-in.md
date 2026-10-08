# Proposal: Sign in with Farcaster on the plain website

> **Built** on 2026-10-08 as recommended in section 2 (owner instruction: build it beside Quick Auth,
> name both outside services, keep the no-cookies rule): `src/app/api/auth/web/{start,status}`,
> `src/lib/client-auth.ts`, `src/components/sign-in.tsx`. The token lives in localStorage for its
> one hour; P4a names the start route as its one exemption. Decisions 3–9 were taken at their
> recommended defaults; decision 5 (re-sign-in before publishing) is not built.

> Proposal only. Nothing is built. Written 2026-10-08 against `main` (6b96f80)
> and the `desktop-layout` branch (936b0e5). Research fetched 2026-10-08;
> sources at the end. **[Unverified]** marks anything I could not confirm.

## Summary

Today a person can sign in only inside a Farcaster client, through Quick Auth.
On the plain website nothing can sign in, so the assistant and the desktop
assistant column are closed there.

The recommendation: use **Sign In With Farcaster (SIWF) through the Farcaster
relay, and let Farcaster's Quick Auth server turn the signature into the same
kind of token the miniapp already gets.** Our server makes every outside call.
The page makes none. The browser keeps the token in `localStorage` for at most
one hour. No cookie. `getFid` does not change: a web token and a miniapp token
are the same kind of token (issuer `https://auth.farcaster.xyz`, audience our
domain, subject the FID).

What it costs: one hour, then the person signs in again (no silent refresh on
the web). Farcaster's relay and sign-in server see who signed in and when.
P4a needs a named exemption for the two sign-in routes.

---

## 1. What happens today

- `src/lib/auth.ts`: `getFid` reads `Authorization: Bearer <jwt>` and verifies
  it locally against the public keys at
  `https://auth.farcaster.xyz/.well-known/jwks.json`, with audience = the
  hostname of `NEXT_PUBLIC_URL`. No cookie, because Farcaster web runs the app
  in a cross-site iframe and Safari and Brave drop third-party cookies there.
- `src/components/miniapp-bar.tsx`: inside Farcaster it signs in silently.
  Outside it shows "reading" with the hint "Open in a Farcaster client to sign
  in".
- `src/components/assistant.tsx`: `authedFetch` uses `sdk.quickAuth.fetch`
  in the app and a plain `fetch` outside. Outside, the signed-out screen's
  button says "Open Snowmoon in a Farcaster app to sign in."
- `desktop-layout` branch, `assistant-column.tsx`: the column at 1200px and up
  renders only after `/api/chat/status` answers 200. Its comment says it
  cannot appear on the plain website yet. This proposal is what lets it.
- Routes that use `getFid`: `api/auth/me`, `api/chat/ask`, `api/chat/status`,
  `api/cards`, `api/cards/[id]/like`, `api/consent`.

## 2. Recommended design

### The flow

1. **Start.** The person presses "Sign in with Farcaster". The page calls
   `POST /api/auth/web/start` on our own site.
2. **Nonce.** Our server asks `POST https://auth.farcaster.xyz/nonce` for a
   nonce. (Quick Auth only issues a token for a message whose nonce it issued.
   The nonce is single-use and expires after 5 minutes, per the public source.)
3. **Channel.** Our server calls `POST https://relay.farcaster.xyz/v1/channel`
   with `domain` = our hostname (the same value `getFid` checks),
   `siweUri` = `https://<our hostname>/`, the nonce, and an expiry 5 minutes
   out. The relay returns a `channelToken` and a URL of the form
   `https://farcaster.xyz/~/siwf?channelToken=…`.
4. **Show.** Our server returns only `channelToken` and that URL to the page.
   - Desktop: the page draws a QR code of the URL **locally** (a bundled
     library; no QR image service). The person scans it with their phone.
   - Phone browser: the page shows an "Open Farcaster" button that links to the
     URL. The Farcaster app opens. The person approves and comes back to the
     tab.
5. **Approve.** In the Farcaster app the person sees a request to sign in to
   our domain and approves. Their client signs the SIWF message (with the
   custody address or an auth address) and posts it to the relay.
6. **Poll.** The page polls `GET /api/auth/web/status?c=<channelToken>` on our
   site every 1.5 s, for at most 5 minutes. Our server asks the relay
   `GET /v1/channel/status` (channel token as bearer).
7. **Exchange.** When the relay says `completed`, our server sends the
   message and signature to `POST https://auth.farcaster.xyz/verify-siwf` with
   our domain. That server checks the signature on Optimism, consumes the
   nonce, and returns a JWT: `iss` auth.farcaster.xyz, `aud` our domain,
   `sub` the FID, valid 1 hour.
8. **Hand back.** Our server returns `{ token, fid }` to the page. The
   message, signature, profile fields and addresses never reach the page and
   are not stored or logged by us.
9. **Use.** The page sends `Authorization: Bearer <token>` on API calls, the
   same header Quick Auth uses. `getFid` verifies it unchanged.

### Why this design

- **No RPC of our own.** The signature check against Optimism happens inside
  auth.farcaster.xyz, which already issues every miniapp token we accept.
- **No session of our own.** No signing secret, no session table, no cookie.
- **One token kind.** `getFid` and the 30-a-day limit work as they are.
- **No third-party request from a page.** The relay and the sign-in server are
  called by our server, so they see a Vercel address, not the reader's.
- **No new package required** for the calls: the relay and Quick Auth server
  are plain HTTP. `@farcaster/quick-auth` (already installed, 0.0.8) has
  `generateNonce` and `verifySiwf`. A small QR library is the only addition.

## 3. Alternatives

**B. AuthKit (`@farcaster/auth-kit`) with its defaults.** The React button and
QR dialog. The browser itself calls `relay.farcaster.xyz` and, to verify,
`https://mainnet.optimism.io`. Both then see the reader's IP and browser.
That fails P6a. It also defaults `domain` and `siweUri` to whatever the browser
reports. Rejected.

**C. Verify ourselves.** Use `@farcaster/auth-client` `verifySignInMessage`
on our server with our own Optimism RPC, then mint our own token.
- It needs an Optimism RPC. `viemConnector()` without a URL falls back to the
  public `https://mainnet.optimism.io` and warns "Do not use this in
  production". So we would pick a provider (Alchemy, Infura, QuickNode or
  similar) and add a key. The RPC sees our server's IP, the signing address,
  and the FID (calls `IdRegistry.idOf(address)` and
  `KeyRegistry.keyDataOf(fid, address)`), and the time.
- It needs our own token: a signing secret on Vercel, a second issuer in
  `getFid`, and our own lifetime and revocation rules.
- Gain: we choose the lifetime (longer sessions possible). We can tell web
  tokens from miniapp tokens (useful, see the threat model).
- We still depend on the relay and still verify miniapp tokens with
  auth.farcaster.xyz.
- Effort L. Not recommended now; worth it only if the owner wants sessions
  longer than an hour or wants to treat web sign-ins differently.

**D. A cookie session.** See section 5. Not needed.

**E. A hosted sign-in vendor (for example Neynar's sign-in).** Adds a
company that sees every sign-in, with its own terms. Not recommended.

**F. Do nothing.** The website stays read-only. The desktop column never
appears outside Farcaster (where the frame is phone-width anyway).

## 4. Every outside service and what it sees

Our server makes all calls below except rows 4 and 5, which happen on the
person's own phone or by a link they choose to open.

| # | Service (operator) | Contacted by | What it sees | Kept |
|---|---|---|---|---|
| 1 | **auth.farcaster.xyz** `/nonce` (Farcaster team; Cloudflare Worker) | our server | Vercel's IP; a nonce request; time. Nothing about the person yet. | Nonce up to 5 min (public source). |
| 2 | **relay.farcaster.xyz** `/v1/channel` (Farcaster team) | our server | Vercel's IP and user agent (stored as channel `metadata`); our domain; `siweUri`; the nonce; expiry; time. | Redis, up to the channel TTL (3600 s default in the source); deleted when we read the completed status. **[Unverified: production TTL and logging.]** |
| 3 | **relay.farcaster.xyz**, written by the person's Farcaster client | Farcaster's own backend (the authenticate route needs Farcaster's relay key) | The person's **FID, username, display name, bio, profile picture URL**, the signed SIWF message (which holds our domain, the nonce, the signing **custody or auth address**, and `farcaster://fids/<fid>`), the signature, auth method. The relay then adds the **custody address and verified addresses**. | Same channel; returned to us once, then deleted. |
| 3a | Relay's lookups: an Optimism RPC (`https://mainnet.optimism.io` default in source) and Farcaster hubs (`snap.farcaster.xyz`, fallback `crackle.farcaster.xyz`) | the relay | The FID (`custodyOf(fid)`, `verificationsByFid`), from the relay's IP; time. Not the reader's IP. | **[Unverified: production RPC provider.]** |
| 4 | **farcaster.xyz/~/siwf** (the link in the QR or the button) | the person's phone (scan) or phone browser (tap) | The person's IP and user agent; the channel token; time. On desktop, the desktop browser never contacts it. | **[Unverified]** |
| 5 | **The person's Farcaster client** (the Farcaster app; other clients if they support SIWF **[unverified which]**) and its backend | the person | That this FID signed in to our domain, at this time, from their device. They already use this app. | Their client's terms. |
| 6 | **auth.farcaster.xyz** `/verify-siwf` | our server | Vercel's IP; our domain (counted per domain in its analytics); the SIWF message (FID, signing address, nonce, times); the signature; time. It returns the token. | Request logs (observability on, sampling 1.0 in the public config). **[Unverified: deployed config.]** |
| 6a | Its Optimism RPC providers (`ETH_RPC_URLS`, not public) | auth.farcaster.xyz | The signing address and FID (`idOf`, `keyDataOf`); a Cloudflare IP; time. | **[Unverified: which providers.]** |
| 7 | **auth.farcaster.xyz** `/.well-known/jwks.json` | our server (already today) | Vercel's IP; that we fetch the public keys. Nothing about the person. | Unchanged. |
| 8 | **Vercel** (our host, already) | the page | Everything our routes see, including the token in the header. Already true for miniapp tokens. | Our project's logs. |

What none of them see: anything the person reads, any question they ask, any
card they save. The chat path (Vercel AI Gateway, Groq) is unchanged and does
not receive the token.

What is new compared with today: rows 2, 3, 3a, 4 and the `verify-siwf` call.
In the miniapp, the Farcaster host already does the equivalent of rows 1, 5
and 6 for every Quick Auth sign-in, so for people who use the miniapp the same
parties already see the same facts.

If the page called these services itself (alternative B), rows 2 and 6 would
also see the reader's own IP and browser.

## 5. Holding the session without cookies

**Recommended: the token in `localStorage`, sent as a bearer header.**

- **Key:** `snowmoon.signin` → `{ token, fid, exp }`.
- **Lifetime:** 1 hour, fixed by auth.farcaster.xyz (`JWT_EXPIRATION = '1h'`
  in the public source; the docs example also shows exactly 1 hour). There is
  no refresh token. After an hour the person scans or taps again.
- **Why `localStorage`:** the person reads in one tab and asks in another;
  the desktop column and `/assistant` share it; a reload keeps them signed in.
  `sessionStorage` would ask again on every new tab. Memory only would ask
  again on every reload. (Decision 3.)
- **Expiry handling:** the page reads `exp` before each call. If less than
  2 minutes are left, it asks the person to sign in again before sending a
  question, so a question is never lost mid-flight. Any 401 clears the key and
  shows the signed-out screen. Threads stay on the device either way.
- **Logout:** "Sign out" deletes the key. The token itself stays valid until
  its hour ends; there is no revocation at auth.farcaster.xyz. Without theft
  there is no other copy. We say so in one line.
- **XSS exposure:** any script running on our origin can read the key. Our
  exposure is small: no third-party scripts (P6a), React escaping, no
  `dangerouslySetInnerHTML` with user text **[to confirm at build time]**.
  The damage is bounded: one hour, and only what our API allows (ask up to the
  daily limit, save and like cards, record consent). Never put the token in a
  URL, a log line or an error message.
- **Inside the miniapp** nothing changes: `sdk.quickAuth` keeps its token in
  memory and refreshes silently. Storage inside the Farcaster web iframe is
  partitioned, so a web token never leaks into it, and the code uses the web
  token only when `sdk.isInMiniApp()` is false.

**Would a cookie be needed?** No. Every signed-in feature is a client-side
call to an API route, which can carry a header.

**If a cookie were chosen anyway, the costs:**
- A second auth path in `getFid` (cookie or bearer) and our own session
  secret (alternative C), because a Quick Auth JWT in a cookie still expires
  in an hour.
- CSRF protection on every write route (`SameSite=Lax` plus an origin check).
- It still does not work in the miniapp iframe, which is why there is none.
- **Privacy:** a cookie rides on every page request, including chapter pages.
  Vercel's request logs could then tie what a person reads to their FID. A
  bearer header goes only on the API calls that need it. This is the main
  reason to keep the rule.
- Gain: an `HttpOnly` cookie hides the session from XSS, and our own session
  could last longer than an hour.

## 6. Beside Quick Auth

- **One `getFid`, unchanged.** Both tokens are signed by auth.farcaster.xyz,
  with `aud` our hostname and `sub` the FID. `getFid` already checks exactly
  that. One small change: export the `domain()` helper so the start route
  sends the same hostname `getFid` checks.
- **Same FID semantics.** The FID is the account, whether the person signed
  with the custody address or an auth address. A person who signs in on the
  web and in the miniapp is one person to us.
- **Same 30-a-day limit**, keyed by FID, counted together across both ways
  in. Same consent record, same "shown with your Farcaster name".
- **One client helper.** Move `authedFetch` to `src/lib/client-auth.ts`:
  in the miniapp, `sdk.quickAuth.fetch`; otherwise, a `fetch` with the stored
  web token if present and unexpired; otherwise a plain `fetch`. The bar, the
  assistant and the desktop column all use it.
- **We cannot tell the two apart** in recommended design. The tokens look the
  same. That matters only for decision 5.
- **Preview deployments:** the token's audience is the hostname of
  `NEXT_PUBLIC_URL`. A preview with a different hostname cannot accept
  production tokens. Same as Quick Auth today.

## 7. What the signed-out website shows

- **Reading is unaffected.** Chapters, narration, images, cards, recipes and
  About look exactly as now. No banner, no prompt, no pop-up, no request to
  anyone but our own site.
- **Top bar.** "reading" becomes a small "Sign in" button. Signed in: `fid
  <n>` and "Sign out".
- **The assistant's signed-out screen (9d).** Same heading and privacy
  sentence as now. The button opens the sign-in step instead of saying "Open
  Snowmoon in a Farcaster app":
  - Desktop: a QR code and "Scan with your phone's camera or the Farcaster
    app. This code works for 5 minutes." A "Cancel" link.
  - Phone browser: "Open Farcaster", then "Approve in Farcaster, then come
    back to this tab."
  - Under either, one line naming the outside parties before anything starts,
    for example: "Signing in goes through Farcaster's relay and sign-in
    server. They see your Farcaster ID and that you signed in here, not what
    you read or ask." (Draft wording; decision 7.)
  - "Keep reading without it" stays.
  - On expiry: "Signed out after an hour. Sign in again."
- **The desktop assistant column (1200px and up)** appears only after
  sign-in, as built on `desktop-layout`. Signed out, nothing renders, not an
  empty column, not a prompt. It just starts working for web sign-ins.
- **The About page** lists the sign-in services (rows 1–6 of section 4).

## 8. Threat model

**Replay.**
- The nonce is issued by auth.farcaster.xyz, single-use, 5 minutes (public
  source). A captured message and signature cannot be exchanged twice.
- A captured token can be replayed until its hour ends. That is the bearer
  model, the same as Quick Auth today.

**Phishing with our domain (the main risk).**
- Anyone can open a relay channel that names our domain and show the QR code
  on their own page. If a person approves it, the attacker gets a message
  signed for our domain and can exchange it at auth.farcaster.xyz for a token
  that `getFid` accepts, for one hour.
- **This is possible today**, whether or not we build web sign-in: nothing
  ties the relay channel to the page that shows it. Building web sign-in does
  make "scan a code to sign in to Snowmoon" familiar, which makes the lure more
  believable.
- What the attacker could do for that hour: spend the person's 30 questions,
  save and like cards, record consent. Later, publish words under the
  person's name once a form that stores words exists. That last one is the
  serious case.
- Mitigations: the Farcaster app shows the requesting domain **[unverified
  how prominently]**; our sign-in screen says "Only scan a code on
  <our hostname>"; the code lasts 5 minutes; a publishing action shows the
  name and asks again (already planned: consent screen and preview).
  Decision 5 asks whether publishing should need more.

**Fake relay or fake Farcaster pages.**
- A page that imitates `farcaster.xyz/~/siwf` cannot sign anything; the
  signature comes only from the person's Farcaster client. It could try to get
  them to install something or type a recovery phrase. Our screen should say:
  "Farcaster will never ask for your recovery phrase to sign in."
- We call only fixed hosts from the server (`relay.farcaster.xyz`,
  `auth.farcaster.xyz`). The page never chooses them. The link we show is
  checked to start with `https://farcaster.xyz/~/siwf?` before it is returned.

**Token theft.**
- XSS on our origin (section 5). Bounded by one hour and our API.
- Logs: never log the token, the channel token or the SIWF message. Same rule
  the chat routes follow for message text.
- A shared computer: "Sign out" removes it; otherwise it lapses in an hour.

**Domain binding.**
- The start route sends our fixed hostname, not the browser's `Host`, so a
  look-alike domain proxying our site gets tokens for the look-alike, which
  `getFid` rejects. auth.farcaster.xyz checks that the message's domain equals
  the domain we pass and sets `aud` to it.
- The relay refuses channels for `farcaster.xyz` itself; nothing protects our
  domain beyond the person reading it.

**Abuse of our start route.**
- Anyone can call `/api/auth/web/start`, which makes two outside calls. Limit
  it per IP (for example a Vercel firewall rate rule, 10 a minute) so nobody
  gets our server's IP rate-limited at the relay (the relay rate-limits
  channel creation per IP; its production limit is **[unverified]**).
- The status route only forwards to the relay for a channel token in the
  relay's format and returns only `pending`, `expired`, or `{ token, fid }`.

**Dependence.** If relay.farcaster.xyz or auth.farcaster.xyz is down, web
sign-in is down. The miniapp already depends on the second.

## 9. Effort: M

About two to three days, with checks. No migration, no new secret, no new
environment variable.

New files:
- `src/app/api/auth/web/start/route.ts`: nonce, channel, return
  `{ channelToken, url, expiresAt }`.
- `src/app/api/auth/web/status/route.ts`: relay status; on completion,
  `verifySiwf`; return `{ token, fid }`.
- `src/lib/client-auth.ts`: `authedFetch`, token storage, expiry, sign-out.
- `src/components/web-sign-in.tsx`: QR (desktop) or "Open Farcaster"
  (phone), polling, cancel, timeout, the outside-parties line.
- `scripts/check-web-sign-in.ts` (or cases in `check-principles`): the start
  route sends the fixed hostname; the status route never returns the message,
  signature or profile; no log line includes a token.

Changed files:
- `src/lib/auth.ts`: export the domain helper. `getFid` unchanged.
- `src/components/miniapp-bar.tsx`: "Sign in" / "Sign out" outside Farcaster.
- `src/components/assistant.tsx`: use the shared `authedFetch`; screen 9d web
  path; expiry message.
- `src/components/assistant-column.tsx` (on `desktop-layout`): use the shared
  `authedFetch`.
- `src/app/about/page.tsx`: the sign-in services.
- `scripts/check-principles.ts`: P4a named exemption for the two sign-in
  routes (decision 2); P6a adds a page with the sign-in dialog open.
- `scripts/check-ui.ts`: the signed-out bar and 9d at phone and desktop size.
- `docs/principles.md`: P4a exemption and the P6 note.
- `package.json`: one small QR library, bundled (licence to confirm;
  candidates `qrcode` or `uqr`, both MIT **[to confirm]**).

## 10. Principles

1. **Public recipes; people know their words are public.** Pass. Sign-in
   publishes nothing. Consent still comes before the first stored words.
2. **AI declared; words are the author's or a signed-in person's.** Pass,
   with a concern: a web token stolen by phishing (section 8) could let
   someone write as another person for an hour once word forms exist. The
   risk exists today through auth.farcaster.xyz; web sign-in makes it more
   likely.
3. **Model allowlist.** Not touched. Pass.
4. **No model output published without a signed-in person's action.** Pass
   in spirit. **Concern:** P4a requires every POST route to call `getFid` and
   return 401. The sign-in routes cannot require being signed in. They write
   nothing to our database. They need a named exemption in the check, proven
   by the existing plant (decision 2). Making them GET routes would dodge the
   check but hide a side effect; not recommended.
5. **Nothing canon; moderators only hide.** Not touched. Pass.
6. **No third-party requests from pages; individual data private.** Pass for
   page requests: our server makes every outside call; the QR is drawn
   locally. **Concern:** new outside parties see the FID, profile and signing
   address at sign-in (section 4), and Farcaster learns that this FID uses
   this site. Tension: on a phone, the "Open Farcaster" link is a
   navigation the person chooses to `farcaster.xyz`; it is not a request from
   the page, but it does reach a third party with their IP. No individual
   rating or like becomes readable.
7. **Payments; no token; "not affiliated".** Not touched. Pass. (A sign-in
   token is not a crypto token; the wording should avoid "token" on screen.)
8. **In-world screens match the source.** Not touched. Pass.

Tension to raise first: **P4a versus sign-in itself**, and **P6's spirit
versus adding Farcaster's relay and sign-in server as parties that learn who
uses the site.** The chat proposal (sections 11–12) accepted outside parties
on the conditions that they are named in the notice and keep nothing they do
not need. The relay keeps the channel up to an hour unless we read it; we read
it at once on completion, but an abandoned channel stays until its TTL.

## 11. Unverified

- Production settings of relay.farcaster.xyz: channel TTL, logging, rate
  limit, RPC provider. I read the public source only.
- That auth.farcaster.xyz runs the public `quick-auth` source (last commit
  2025-09-14): 1-hour tokens, 5-minute single-use nonces, logging config, and
  its RPC providers.
- How prominently the Farcaster app shows the requesting domain.
- Whether `farcaster.xyz/~/siwf` reliably opens the app on iOS and Android
  from a phone browser, and whether the app returns the person to the browser
  (the relay accepts a `redirectUrl`; whether the app honours it is unknown).
- Which Farcaster clients other than the Farcaster app support SIWF.
- Whether Vercel request logs record the `Authorization` header (believed
  not; confirm).
- The current operator of Farcaster's services (the docs say "Farcaster");
  I did not check ownership.

## 12. Decisions for the owner

1. **Build web sign-in at all, and with which design?** Recommended: relay +
   Quick Auth `verify-siwf`, all calls from our server (A). Alternatives:
   our own verification, RPC and token (C, effort L), or do nothing (F).
2. **P4a exemption.** Allow the two routes under `src/app/api/auth/web/` to
   be POST without `getFid`, named in the check and in `principles.md`?
3. **Where the token lives.** `localStorage` (signed in across tabs and
   reloads, for up to an hour; recommended), `sessionStorage` (one tab), or
   memory only (every reload asks again).
4. **Accept the one-hour limit?** Accept it now (recommended), or ask for
   longer sessions, which means alternative C and our own secret.
5. **Publishing from a web sign-in.** Because a phishing attack can get a
   one-hour token for our domain, should actions that publish a person's
   words ask them to sign in again just before publishing (a fresh token, under
   5 minutes old)? Recommended: yes, for publishing only, for both kinds of
   token, since we cannot tell them apart.
6. **Accept the new outside parties under P6:** Farcaster's relay (FID,
   profile, addresses, kept up to an hour) and the `verify-siwf` call at
   auth.farcaster.xyz, both named on the sign-in screen and the About page?
7. **Wording** of the line under the sign-in button and the About entry
   (draft in section 7).
8. **Phone browser behaviour.** Accept that the person must return to the tab
   by hand after approving, until the app's return behaviour is verified?
9. **QR library.** Approve adding one small bundled library (licence checked
   at build time)?
10. **Order of work.** Merge `desktop-layout` first, so the desktop column
    gets web sign-in in the same change, or build web sign-in on `main` and
    rebase the column after?

---

## Sources (all fetched 2026-10-08)

- AuthKit introduction: <https://docs.farcaster.xyz/auth-kit/introduction>
- AuthKitProvider defaults (relay `https://relay.farcaster.xyz`, rpcUrl
  `https://mainnet.optimism.io`, domain `window.location.host`):
  <https://docs.farcaster.xyz/auth-kit/auth-kit-provider>
- SignInButton (QR on desktop, redirect on mobile; timeout 5 min; poll
  1.5 s): <https://docs.farcaster.xyz/auth-kit/sign-in-button>
- Auth client: <https://docs.farcaster.xyz/auth-kit/client/introduction>,
  <https://docs.farcaster.xyz/auth-kit/client/app/create-channel>,
  <https://docs.farcaster.xyz/auth-kit/client/app/status> (status includes
  FID, profile, custody, verifications, and `metadata` with IP and user
  agent), <https://docs.farcaster.xyz/auth-kit/client/app/verify-sign-in-message>
- SIWF overview: <https://docs.farcaster.xyz/developers/siwf/>
- FIP-11, Sign In With Farcaster (message format; "a hosted, trusted
  server"): <https://github.com/farcasterxyz/protocol/discussions/110>
- Quick Auth server proposal (`/nonce`, `/verify-siwf`, `/verify-jwt`, JWKS;
  "completely optional"): <https://github.com/farcasterxyz/protocol/discussions/231>
- Quick Auth docs: <https://miniapps.farcaster.xyz/docs/sdk/quick-auth>,
  <https://miniapps.farcaster.xyz/docs/sdk/quick-auth/get-token> (example
  token valid exactly 1 hour)
- Relay source, `farcasterxyz/auth-monorepo` at ae3dffd339 (2026-03-30):
  `apps/relay/src/env.ts` (CHANNEL_TTL 3600, URL_BASE
  `https://farcaster.xyz/~/siwf`, hubs, OPTIMISM_RPC_URL),
  `handlers.ts` (stores creator IP and user agent; refuses `farcaster.xyz`
  domains; deletes the channel when a completed status is read),
  `server.ts` (rate limit on channel creation), `addresses.ts`;
  `packages/auth-client/src/clients/ethereum/viemConnector.ts` (public RPC
  warning; `idOf`, `keyDataOf`). <https://github.com/farcasterxyz/auth-monorepo>
- Quick Auth server source, `farcasterxyz/quick-auth` at ecb6f83c74
  (2025-09-14): `hono-cloudflare-worker/src/siwf.ts` (nonce must be one it
  issued; verifies with `ETH_RPC_URLS`), `jwt.ts` (1h, RS256, `aud` = domain),
  `durable-objects/noncePool.ts` (5-minute nonces), `app.ts` (CORS `*`,
  per-domain analytics), `wrangler.jsonc` (observability sampling 1.0).
  <https://github.com/farcasterxyz/quick-auth>
- Installed client: `node_modules/@farcaster/quick-auth` 0.0.8
  (`generateNonce`, `verifySiwf`, `verifyJwt` via JWKS; default origin
  `https://auth.farcaster.xyz`).
