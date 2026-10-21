import { CHAT } from '~/lib/config';

/**
 * A text box in a private draft ("Make your own", owner's long run 2, item 5): saved by us in the person's drafts,
 * which only they can open, never published, and sent to the assistant's model only with a message to the coach.
 * It says so under the box, like PublishedTextField and PrivateTextField (npm run check:principles P1f checks this
 * wording). DRAFT wording.
 */
export function PrivateDraftField({
  id,
  label,
  value,
  onChange,
  rows = 2,
  maxLength,
  single = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength?: number;
  single?: boolean;
}) {
  return (
    <div className="mk-field">
      <label htmlFor={id}>{label}</label>
      {single ? (
        <input id={id} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} />
      ) : (
        <textarea id={id} rows={rows} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} />
      )}
      <p id={`${id}-line`} className="mk-line">
        Private: saved in your drafts, which only you can open. Never published. Sent to {CHAT.providerName} only with a message to the coach.
      </p>
    </div>
  );
}
