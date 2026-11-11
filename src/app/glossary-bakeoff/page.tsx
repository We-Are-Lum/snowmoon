import type { Metadata } from 'next';
import { GlossaryBakeoff } from '~/components/glossary-bakeoff';
import '../glossary/glossary.css';

/**
 * /glossary-bakeoff: the blind bake-off of the glossary's written explanations (owner, 2026-10-23). The page as
 * served holds nothing: the explanations are read in the browser from /api/glossary/bakeoff, which answers only the
 * owner. Models are labelled A, B and C; the key is in a separate file the page cannot load.
 */
export const metadata: Metadata = { title: 'Glossary bake-off', robots: { index: false, follow: false } };

export default function Page() {
  return <GlossaryBakeoff />;
}
