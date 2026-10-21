'use client';

/**
 * The balance screen's box for a payment's transaction hash (owner, 2026-10-15): a payment that
 * reached us but wasn't added. Sent to our server, which looks it up on Base; never published by us
 * (the hash is public onchain already). It says so under the box, as the other text boxes do
 * (npm run check:principles P1f checks this wording). DRAFT wording for the owner.
 */
export function TxHashField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="tx-hash-field">
      <label className="mi-h" htmlFor={id}>
        {label}
      </label>
      <input id={id} type="text" inputMode="text" autoComplete="off" spellCheck={false} placeholder="0x…" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} />
      <p id={`${id}-line`} className="ic-note">
        Sent to us to look up on Base, and kept with your payments. Never published by us.
      </p>
    </div>
  );
}
