import Link from 'next/link';
import { IMAGES } from '~/lib/config';
import { referenceCards } from '~/lib/references';
import { InfoLabel } from '~/components/info-label';
import { PicturesMenu } from '~/components/pictures-menu';
import { ReferenceCards } from '~/components/reference-cards';
import '../../../styles/images.css';
import '../../../styles/designs.css';

export const metadata = { title: 'Glossary references' };
export const revalidate = 60;

/**
 * References: the glossary (owner, 2026-10-29, the next-version plan, Phase 1: "References page: one card per glossary
 * item, with its reference images"). Terms without an image yet aren't shown. Model-drafted wording, for the owner.
 */
export default async function GlossaryReferences() {
  const cards = await referenceCards();
  return (
    <div className="page prose pictures">
      <p className="label pictures-label">
        <Link href="/references">← References</Link> · {IMAGES.label}
      </p>
      <h1>Glossary</h1>
      <p>
        The book&apos;s words with pictures of them. Each one is AI-generated, not by the author.{' '}
        <InfoLabel
          word="About"
          kind="about"
          declaration="About these references"
          title="Glossary references"
          body={[
            'One card for each word of the glossary that has a picture yet: the sentence where the book first uses it, and pictures from its character or setting sheets.',
            'A word with no picture yet isn\'t here; its glossary page has "Add a reference".',
          ]}
        />
      </p>
      <PicturesMenu current="glossary" />
      {cards.length ? <ReferenceCards cards={cards} /> : <p className="dz-note">No word has a picture yet.</p>}
    </div>
  );
}
