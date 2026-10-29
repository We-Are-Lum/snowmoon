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
  // The order (owner, 2026-10-29, the next-version plan): Adaptations first, then the Book, References (once
  // Pictures), Minpentai and the Assistant. Read stays one tap away on the home page and in the reader.
  const items: NavItem[] = [
    { key: 'adaptations', label: 'Adaptations', href: '/adaptations', meta: adaptations ? 'Watch · remix' : undefined },
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
    { key: 'pictures', label: 'References', href: '/references', meta: 'Trial' },
    {
      key: 'minpentai',
      label: 'Minpentai',
      href: '/minpentai?mode=learn',
      // Learn opens the course where you left it, or its first step; Play opens free play (owner, 2026-10-16).
      children: [
        { key: 'mp-learn', label: 'Learn', href: '/minpentai?mode=learn' },
        { key: 'mp-play', label: 'Play', href: '/minpentai?mode=free' },
      ],
    },
    { key: 'assistant', label: 'Assistant', href: '/assistant' },
  ];
  // Adaptations are out of view for now (ADAPTATIONS.visible).
  return ADAPTATIONS.visible ? items : items.filter((i) => i.key !== 'adaptations');
}
/** Destinations shown as coming, as text, not links. None now: References (once Pictures) is open as a trial. */
export const COMING: { label: string; meta: string }[] = [];
