'use client';

/**
 * An admin's box for a person's number (the Ephelion free picture's reset, Nate 2026-11-27): a FID, or a wallet, Lens or
 * Bluesky account's number. Sent to our server to reset their free picture, and kept in the reset's log with who did it;
 * never published. It says so under the box, as the other text boxes do (npm run check:principles P1f checks this
 * wording). DRAFT wording (the agent's).
 */
export function PersonNumberField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="person-number-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" inputMode="numeric" autoComplete="off" spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} />
      <p id={`${id}-line`} className="aa-note">
        Sent to us to reset their free picture, and kept in the reset&rsquo;s log with who did it. Never published.
      </p>
    </div>
  );
}
