'use client';

/** One-on-one (owner, 2026-10-09): placeholder until the server's routes land; replaced below. */
export function PlayPerson({ onBack }: { onBack: () => void }) {
  return (
    <div className="mp-col">
      <div className="mp-bar"><button className="mp-back" aria-label="Back to Play" onClick={onBack}>←</button><h2 className="mp-bar-title">Play a person</h2></div>
      <div className="mp-body"><p className="mp-text">Coming next.</p></div>
    </div>
  );
}
