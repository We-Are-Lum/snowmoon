'use client';

/**
 * The two boxes for making a personal agent key on /you (owner, 2026-10-20): the key's name and its spend
 * cap. Both are sent to our server and kept with the key; neither is ever published by us. Each says so
 * under the box, as the other text boxes do (check:principles P1f). DRAFT wording.
 */
const LINES = {
  name: 'Kept with the key and shown to you here; your agent goes by this name. Never published by us.',
  cap: 'Kept with the key. Nothing is spent until you approve it here, and never more than this in all. Never published by us.',
};

export function AgentKeyField({ id, kind, label, value, onChange }: { id: string; kind: 'name' | 'cap'; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="agent-address-field">
      <label className="mi-h" htmlFor={id}>
        {label}
      </label>
      {kind === 'name' ? (
        <input id={id} type="text" autoComplete="off" maxLength={60} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} />
      ) : (
        <input id={id} type="number" inputMode="decimal" min={0} max={10} step={0.5} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} />
      )}
      <p id={`${id}-line`} className="you-note">
        {LINES[kind]}
      </p>
    </div>
  );
}
