'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth, useSocialSession } from '~/lib/client-auth';
import { enterItShown } from '~/lib/challenge/enter-it';

/**
 * "Enter it" (2026-11-27): shown only to the picture's maker, decided here in the viewer's browser (enterItShown), so
 * the server's page, cached or not, never carries it for anyone. A Lens or Bluesky viewer's person number comes from
 * the signed-in GET /api/challenge/submit (no-store), asked once per page however many pictures are listed. Its label
 * comes from the server (no challenge words in scripts everyone is served).
 */
let personAsk: Promise<number | null> | null = null;
const askPerson = () =>
  (personAsk ??= authFetch('/api/challenge/submit', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((out: { person?: number | null } | null) => (typeof out?.person === 'number' ? out.person : null))
    .catch(() => null));

export function ChallengeEnterIt({ maker, href, label }: { maker: number; href: string; label: string }) {
  const auth = useAuth();
  const social = useSocialSession();
  const [person, setPerson] = useState<number | null>(null);
  useEffect(() => {
    if (social === null) return;
    let alive = true;
    void askPerson().then((p) => alive && setPerson(p));
    return () => {
      alive = false;
    };
  }, [social]);
  const fid = auth.kind === 'signed-in' ? auth.fid : null;
  if (!enterItShown({ fid, person: social !== null ? person : null }, maker)) return null;
  return (
    <Link href={href} className="chp-btn ch-enter-it" data-slot="enter-it" prefetch={false}>
      {label}
    </Link>
  );
}
