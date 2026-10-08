'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { sdk } from '@farcaster/miniapp-sdk';
import { Assistant } from './assistant';
import '../app/assistant/assistant.css';

/**
 * The assistant beside the page, at 1200px and up, for a signed-in reader only. Nobody
 * signed out ever sees an empty column: it renders nothing until /api/chat/status answers
 * 200. Today sign-in works only inside a Farcaster client (Quick Auth), whose frame is
 * phone-width, so on the plain website this column does not appear yet.
 */
export function AssistantColumn() {
  const path = usePathname() ?? '/';
  const [signedIn, setSignedIn] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1200px)');
    if (!wide.matches) return;
    (async () => {
      const inApp = await sdk.isInMiniApp().catch(() => false);
      const res = await (inApp ? sdk.quickAuth.fetch('/api/chat/status') : fetch('/api/chat/status')).catch(() => null);
      setSignedIn(Boolean(res?.ok));
    })();
  }, []);

  // The assistant page has the assistant already.
  if (!signedIn || closed || path.startsWith('/assistant')) return null;
  return (
    <aside className="assistant-column" aria-label="Assistant">
      <button type="button" className="assistant-column-close" onClick={() => setClosed(true)}>
        Close
      </button>
      <Assistant embedded />
    </aside>
  );
}
