# Branch report: signin-equals

Owner's request (2026-10-30): "Sign-in screen: Farcaster and wallet shown as equals, with room for Lens and Bluesky (Bluesky right after Lens). Branch only."

Not merged, no pull request. Nothing about how signing in works has changed: only how the choices look.

## What changed, in plain words

- **Equals.** Wherever both ways to sign in are offered, Farcaster and the wallet are now the same button: the same size, the same outline, the same font and weight. Before, one was filled black and the other outlined, and in the image maker the wallet came first. Now the order is always Farcaster, then the wallet.
- **One line under each**, saying what that sign-in is. These two lines are new and are **draft wording** for your reread (below).
- **Your sentence stays.** "Signing in is free. It's a signature, not a payment." is unchanged and now sits once under both buttons everywhere a wallet is offered (before, in some places it sat under the wallet button only).
- **Room for Lens and Bluesky.** The list of ways to sign in now comes from one ordered list in the settings (`SIGN_IN_METHODS` in `src/lib/config.ts`): Farcaster, wallet, Lens, Bluesky, in that order, each switched on or off. Lens and Bluesky are **off** and never shown on the site (no "coming soon" buttons). Turning one on later also needs its sign-in built and the legal texts updated.
- **Four fit without redesign.** The buttons sit in a grid: one column where it's narrow (the phone, the menu, the side rail, the assistant panel), side by side where there's room (the You page on a wide screen). I tested all four switched on in a **local-only test mode** (screenshots below). That test mode is refused by the build on Vercel, so it can't reach the site.

## Each place, before and after

Screenshots are in `docs/branch-reports/signin-equals/`: `before-*` (the live site today), `after-*` (this branch), `four-*` (this branch, local test with all four on).

| Place | Before | After |
|---|---|---|
| Phone menu (390) | Farcaster filled, wallet outlined, your line under both | Both outlined and the same size, a line under each, your line under both. `*-menu-390.png` |
| Side rail on wide screens (1440) | Same as the menu | Same as the menu. `*-chapter-rail-assistant-1440.png` (left) |
| You page, signed out (390, 1440) | Two smaller uppercase buttons, wallet with its own note | The same equal buttons; side by side at 1440. `*-you-390.png`, `*-you-1440.png` |
| Image maker's sign-in step (390, 1440) | Wallet first and filled, Farcaster second and outlined | Farcaster then wallet, equal. The free-images line for Farcaster accounts is still there. `*-composer-390.png`, `*-composer-1440.png` |
| Assistant, signed out (390, and the 1440 panel) | One filled Farcaster button | **Farcaster only**, now in the same style as everywhere, with its line. `*-assistant-390.png` |
| Make your own, the agent-connect consent screen, the storyboard editor and the frame panel in the editor | Farcaster then wallet, different looks | The same equal list (in the editor, the editor's smaller buttons). Not screenshotted: these need a scene or an agent request to open. |

Why the assistant still offers Farcaster only: questions are counted per Farcaster account, and a wallet that isn't linked to one is refused there (`src/app/api/chat/ask/route.ts`). Offering a wallet button there would offer something that doesn't work for most wallets. If you'd like the wallet shown there too (it works for linked wallets), say so.

Unchanged: the Farcaster sign-in sheet itself (the QR code dialog, your approved wording, `data-wording="FID 6786"`), signing in inside the Farcaster app (no wallet button there, as before), linked wallets, sign-out, and the one-purpose buttons ("Sign in to like", "Sign in to save", Minpentai's sign-in, the You page's "link your Farcaster account").

## Wording for your reread

New, draft (in `src/lib/sign-in-text.ts`, `SIGN_IN_CHOICES`, marked DRAFT there):

- Under "Sign in with Farcaster": **"Your Farcaster account, approved in the Farcaster app."**
- Under "Sign in with a wallet": **"An Ethereum wallet, in this browser or in your wallet app."**

No approved sentence was changed. Lens and Bluesky have placeholder lines that only the local test shows.

## Checks

- Type check (`tsc --noEmit`): passes.
- `check:principles`: 53 pass, 0 fail, 1 not run (P6d, the Vercel CLI isn't available here; accepted open), of 54; 54 of 54 proven to fail on a planted violation.
- `npm run build`: passes.
- `check:ui` against this branch's build: **passed, 59 pages.** Its sign-in checks now compare the two buttons' boxes (same width and height to half a pixel) and their look (fill, border, font, size, weight), require a line under each, and fail if Lens or Bluesky ever shows; this runs on the phone menu, the side rail, the You page and the image maker. The font-size and touch-target floors are kept.
- `test:you-page`: **all 73 checks pass.**
- Two earlier `check:ui` runs broke before finishing, both on the shared machine's local database stall that the db-limits branch is fixing (a page whose server-side database read never answered: `/references/designs/character/gladias`; another session hit the same on `/references/designs`), and once on slow outside images on `/you/illustrations`. Not worked around. I added one thing to `check:ui`: when a run breaks, it now also says which problems it found before the break, so a break no longer hides the checks that did run.

## Principles

- **Texts describe what works today**: pass. Lens and Bluesky are off and never shown; the only way to see them is a local test mode the Vercel build refuses.
- **No third-party requests**: pass. No new outside requests; the sign-in code is unchanged.
- **Owner's approved wording**: pass. Nothing approved changed; the two new lines are marked draft.
- **Legal texts ship with the feature**: pass. No legal text touched (`src/lib/legal.ts` untouched); turning on Lens or Bluesky later needs them.
- **Font-size and touch-target floors**: pass (check:ui).
- Tension to note: the image maker used to put the wallet first and filled (your decision of 2026-10-16 and 2026-10-21). "Equals" in one ordered list replaces that with Farcaster then wallet, both alike. Say if the image maker should keep the wallet first.
