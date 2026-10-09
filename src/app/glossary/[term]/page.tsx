import { notFound } from 'next/navigation';
import { glossarySlugs, glossaryTerm } from '~/lib/glossary';
import { GlossaryTerm } from '~/components/glossary';
import '../glossary.css';

type Props = { params: Promise<{ term: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return glossarySlugs().map((term) => ({ term }));
}
// The word itself stays out of the tab title: it may be from a chapter the reader hasn't reached.
export const metadata = { title: 'Glossary' };

export default async function GlossaryTermPage({ params }: Props) {
  const t = glossaryTerm((await params).term);
  if (!t) notFound();
  return <GlossaryTerm t={t} />;
}
