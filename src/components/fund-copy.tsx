'use client';

import { useState } from 'react';

/** Copies the fund address to the clipboard. No request leaves the browser (principle 6). */
export function FundCopy({ address, label, done }: { address: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(address).then(() => setCopied(true), () => {});
  };
  return (
    <button type="button" className="ic-secondary fund-copy" onClick={copy} aria-live="polite">
      {copied ? done : label}
    </button>
  );
}
