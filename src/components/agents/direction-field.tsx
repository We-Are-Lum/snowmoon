'use client';

/**
 * The script page's one text box (owner, 2026-10-20): a direction note or a rewritten line, in the person's own
 * words. Sent to our server and kept with their version, private to them and their agents; never published by
 * us. It says so under the box, as the other text boxes do (check:principles P1f). DRAFT wording.
 */
const LINE = 'Kept with your version, seen only by you and your agents. Never published by us.';

export function DirectionField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="agent-address-field">
      <label className="mi-h" htmlFor={id}>
        {label}
      </label>
      <textarea id={id} rows={3} maxLength={1000} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} autoFocus />
      <p id={`${id}-line`} className="you-note">
        {LINE}
      </p>
    </div>
  );
}
