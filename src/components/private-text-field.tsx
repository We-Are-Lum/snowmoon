/**
 * A text box whose contents are never published: the reading assistant's questions,
 * kept on this device only (docs/proposals/chat.md). It says so under the box, the way
 * PublishedTextField shows the publication line. These two components are the only
 * places a text box may appear (npm run check:principles P1f).
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
      {/* Model-drafted wording, like the rest of the assistant. */}
      <p id={`${id}-line`} className="private-line">
        Kept on this device only. Never published.
      </p>
    </div>
  );
}
