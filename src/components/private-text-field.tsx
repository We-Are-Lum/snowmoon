import { CHAT } from '~/lib/config';

/**
 * A text box whose contents are never published: the reading assistant's questions,
 * saved only on this device and sent to the model's two hosts to be answered
 * (docs/proposals/chat.md). It says so under the box, the way PublishedTextField shows
 * the publication line. These two components are the only places a text box may appear
 * (npm run check:principles P1f checks this wording).
 */
export function PrivateTextField({
  id,
  label,
  value,
  onChange,
  rows = 2,
  maxLength,
  disabled,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="private-field">
      <label className="as-visually-hidden" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-line`}
      />
      <p id={`${id}-line`} className="private-line">
        Saved only on this device. Sent to {CHAT.route} to be answered. Never published.{' '}
        <span className="as-draft">Draft wording</span>
      </p>
    </div>
  );
}
