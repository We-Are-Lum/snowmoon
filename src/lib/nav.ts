/**
 * The app's destinations, shared by the desktop rail and the phone menu sheet. The book's own
 * ways in (Read, Listen, Glossary) sit under "Book". About is the ? beside the menu (phone) and a
 * link at the foot of the rail (desktop); the podcast feed is linked from the Listen pane.
 */
export interface NavItem {
  key: string;
  label: string;
  href: string;
  /** Right-aligned note: the chapter, a count, or a word. */
  meta?: string;
  /** Shown indented under this item; an item with children is a heading, not a link. */
  children?: NavItem[];
}

import { ADAPTATIONS } from './config';

export function navItems(last: number, adaptations: number): NavItem[] {
  const items: NavItem[] = [
    {
      key: 'book',
      label: 'Book',
      href: `/chapter/${last}`,
      children: [
        { key: 'read', label: 'Read', href: `/chapter/${last}`, meta: `Ch ${last}` },
        { key: 'listen', label: 'Listen', href: `/chapter/${last}?view=listen` },
        // Opened from the reader, the link carries the reading place (?from=c3-b42) for "Back" (app-shell.tsx).
        { key: 'glossary', label: 'Glossary', href: '/glossary' },
      ],
    },
    { key: 'assistant', label: 'Assistant', href: '/assistant' },
    { key: 'adaptations', label: 'Adaptations', href: '/adaptations', meta: String(adaptations) },
    { key: 'minpentai', label: 'Minpentai', href: '/minpentai', meta: 'Learn · play' },
    { key: 'pictures', label: 'Pictures', href: '/images', meta: 'Trial' },
  ];
  // Adaptations are out of view for now (ADAPTATIONS.visible).
  return ADAPTATIONS.visible ? items : items.filter((i) => i.key !== 'adaptations');
}
/** Destinations shown as coming, as text, not links. None now: Pictures is open as a trial. */
export const COMING: { label: string; meta: string }[] = [];
