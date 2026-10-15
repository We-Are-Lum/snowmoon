/**
 * An AI picture's short label (owner, 2026-10-15: "AI pictures can just have an AI label and an
 * info hover that clarifies more"): "AI ⓘ", and on hover or focus the declaration, which is also
 * its accessible name. For a style's samples and a sheet's views; a reader's image keeps AiLabel,
 * which opens how it was made. check:principles P2b reads the declaration here.
 */
export function AiTag({ what, by }: { what?: string; by?: string }) {
  const tip = `${what ? `${what}: ` : ''}AI-generated, not by the author${by ? ` · by ${by}` : ''}`;
  return (
    <span className="ai-tag" tabIndex={0} data-ai="tag">
      <span aria-hidden="true">AI</span>
      <svg className="info-i" width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M6 5.2v3.6M6 3.2v.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{tip}</span>
      <span className="ai-tag-tip" aria-hidden="true">
        {' '}
        {tip}
      </span>
    </span>
  );
}
