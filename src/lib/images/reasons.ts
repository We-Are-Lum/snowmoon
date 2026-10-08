/** Why a reader reports an image (section 6), in the order the report form lists them. */
export const REASONS = ['minor', 'sexual', 'real_person', 'violence', 'hateful', 'someone_elses_work', 'misrepresents', 'spam', 'other'] as const;
export const REASON_LABELS: Record<(typeof REASONS)[number], string> = {
  minor: 'Anything sexual involving a minor',
  sexual: 'Sexual content',
  real_person: 'A real person',
  violence: 'Violence or gore',
  hateful: 'Hateful',
  someone_elses_work: 'Someone else\u2019s character, logo or artwork',
  misrepresents: 'Misrepresents the book or the author',
  spam: 'Spam or nonsense',
  other: 'Other',
};
