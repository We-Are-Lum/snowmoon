'use client';

import { useId } from 'react';

/**
 * An amount in a token ("Support this site", owner 2026-10-30): only a number, handed to the wallet in this browser to
 * send. It is never sent to us, kept or published, and it says so (check:principles P1f).
 */
export function AmountField({ label, unit, value, onChange, disabled }: { label: string; unit: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <label className="amount-field">
      {label} ({unit})
      <input type="number" inputMode="decimal" min={0} step="any" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-describedby={`${id}-note`} />
      <span id={`${id}-note`} className="ic-note">Only an amount, for your wallet. Never sent to us or published.</span>
    </label>
  );
}
