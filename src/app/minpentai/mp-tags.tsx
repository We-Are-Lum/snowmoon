'use client';

/**
 * Minpentai's source tags as short labels with ⓘ (owner ruling, 2026-10-09): "Book ⓘ", "Invented ⓘ"
 * and "Draft ⓘ", each opening the explanation. Every invented tag on a screen (the rules, the broadcast,
 * the lenses, the symbol's shape) folds into one "Invented ⓘ" whose sheet lists each. The full tag
 * words stay in learn-text.ts and in each label's accessible name.
 */
import React from 'react';
import { InfoLabel } from '~/components/info-label';
import { LABELS } from '~/lib/labels';
import { LEARN_TEXT as T, type TagKey } from '~/lib/minpentai/learn-text';

const INVENTED: TagKey[] = ['rules', 'imag', 'lens', 'inv'];

export function MinpentaiTags({ tags }: { tags: readonly TagKey[] }) {
  const L = LABELS.minpentai;
  const invented = INVENTED.filter((k) => tags.includes(k));
  return (
    <div className="ml-tags">
      {tags.includes('book') && (
        <InfoLabel className="ml-tag ml-tag-solid" word={L.book.word} kind="book" declaration={`${T.tags.book}: ${L.book.declaration}`} title={L.book.title} body={[T.tagDetails.book]} />
      )}
      {invented.length > 0 && (
        <InfoLabel
          className="ml-tag ml-tag-dashed"
          word={L.invented.word}
          kind="invented"
          declaration={`${invented.map((k) => T.tags[k]).join(', ')}: ${L.invented.declaration}`}
          title={L.invented.title}
          body={invented.map((k) => T.tagDetails[k])}
          links={tags.includes('rules') ? [{ href: '/minpentai/rule', label: "The rule recovered from the book's figure →" }] : []}
        />
      )}
      {tags.includes('draft') && (
        <InfoLabel className="ml-tag ml-tag-draft" word={L.draft.word} kind="draft" declaration={`${T.tags.draft}: ${L.draft.declaration}`} title={L.draft.title} body={[T.tagDetails.draft]} />
      )}
    </div>
  );
}
