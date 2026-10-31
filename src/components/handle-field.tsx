'use client';

/**
 * The Bluesky handle box at sign-in (branch signin-lens-bluesky): the handle is sent to our server, which looks it up
 * (DNS, the person's DID document, their Bluesky server) to start the sign-in. Kept with the account only if it
 * resolves back to it; never published by us. It says so under the box, as the other text boxes do (npm run
 * check:principles P1f checks this wording). DRAFT wording for the owner.
 */
export function HandleField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="handle-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" autoComplete="username" spellCheck={false} placeholder="alice.bsky.social" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} />
      <p id={`${id}-line`} className="ic-note">
        Sent to us to find your Bluesky server and sign you in. Never published by us.
      </p>
    </div>
  );
}
