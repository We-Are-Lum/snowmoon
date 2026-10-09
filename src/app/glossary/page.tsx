import { REPO_URL } from '~/lib/config';
import { glossaryIndex, glossaryTerm, glossarySlugs } from '~/lib/glossary';
import { GlossaryIndex } from '~/components/glossary';
import './glossary.css';

export const metadata = { title: 'Glossary' };

/** The invented words, A–Z (content/snowmoon/glossary.json). Static; the device limits what shows. */
export default function Glossary() {
  const entries = glossaryIndex();
  const explained = glossarySlugs().filter((s) => glossaryTerm(s)!.explanations.length).length;
  return <GlossaryIndex entries={entries} total={entries.length} explained={explained} method={`${REPO_URL}/blob/main/scripts/lib/glossary.ts`} />;
}
