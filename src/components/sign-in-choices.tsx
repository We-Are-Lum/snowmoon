'use client';

import { SIGN_IN_ALL_FOUR, SIGN_IN_METHODS, type SignInMethod } from '~/lib/config';
import { SIGN_IN_CHOICES } from '~/lib/sign-in-text';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { SignInButton } from './sign-in';
import { WalletSignInButton } from './wallet';

/**
 * Every place that offers more than one way to sign in (owner, 2026-10-30: "Farcaster and wallet shown as equals, with
 * room for Lens and Bluesky"). The ways come from SIGN_IN_METHODS, in its order; each is the same button, the same size
 * and weight, with one short line under it. The list is a grid: one column where it is narrow (the menu, the rail, a
 * phone), side by side where there is room, and it holds four without a change.
 *
 * `wallet` says whether this place offers the wallet (the caller's own rule, unchanged: signed out, not inside a
 * Farcaster app, and wallet sign-in open where the caller asks). The sign-in itself is the existing SignInButton and
 * WalletSignInButton: only the presentation is here.
 */
export function SignInChoices({ wallet, size = 'full', note = true }: { wallet: boolean; size?: 'full' | 'small'; note?: boolean }) {
  const shown = SIGN_IN_METHODS.filter((m) => (m.id === 'wallet' ? wallet : m.on || SIGN_IN_ALL_FOUR)).map((m) => m.id as SignInMethod);
  const btn = `${size === 'small' ? 'ed-small' : 'menu-signin'} signin-choice-btn`;
  return (
    <div className={`signin-choices signin-choices-${size}`} data-count={shown.length}>
      <ul className="signin-choice-list">
        {shown.map((id) => (
          <li key={id} className="signin-choice" data-method={id}>
            {id === 'farcaster' ? (
              <SignInButton className={btn} label={SIGN_IN_CHOICES.farcaster.label} />
            ) : id === 'wallet' ? (
              <WalletSignInButton className={btn} note={false} />
            ) : (
              // Lens and Bluesky: only in the local four-entry test (SIGN_IN_ALL_FOUR); not built, so the button does nothing.
              <button type="button" className={btn} data-local-test="">
                {SIGN_IN_CHOICES[id].label}
              </button>
            )}
            <p className="signin-choice-line">{SIGN_IN_CHOICES[id].line}</p>
          </li>
        ))}
      </ul>
      {/* The owner's words (2026-10-19), once under all the buttons, where a wallet is offered. */}
      {note && wallet && <p className="menu-signin-note">{IMAGE_WORDING.prepaid.signInNote}</p>}
    </div>
  );
}
