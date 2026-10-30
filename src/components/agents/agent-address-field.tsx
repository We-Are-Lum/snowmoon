'use client';

/**
 * The wallet address of an agent a person links on /dashboard (owner, 2026-10-20). Sent to our server and kept
 * with the link, so the agent can sign in with it; never published by us (the agent is shown by its name).
 * It says so under the box, as the other text boxes do (check:principles P1f). DRAFT wording.
 */
export function AgentAddressField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="agent-address-field">
      <label className="mi-h" htmlFor={id}>
        {label}
      </label>
      <input id={id} type="text" autoComplete="off" spellCheck={false} placeholder="0x…" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} />
      <p id={`${id}-line`} className="you-note">
        Sent to us and kept with the link, so the agent can sign in. Never published by us.
      </p>
    </div>
  );
}
