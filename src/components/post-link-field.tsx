'use client';

/**
 * "Add where you posted it" (the remix challenge, owner 2026-10-31): the address of the person's post on Farcaster,
 * Bluesky or Lens. Sent to our server, which only reads it: it checks the host and asks that network's own service for
 * the post; the address itself is never opened by us. Listed under "Posted on" with the network, the writer's handle
 * and the date, as a link. It says so under the box, as the other text boxes do (check:principles P1f). DRAFT wording.
 */
export function PostLinkField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="post-link-field">
      <label className="mi-h" htmlFor={id}>
        {label}
      </label>
      <input id={id} type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://…" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} />
      <p id={`${id}-line`} className="ic-note">
        Sent to us. We read the post from its network’s own service, never from this address. Shown on this page with the network, the writer’s handle and the date, as a link.
      </p>
    </div>
  );
}
