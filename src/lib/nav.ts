/**
 * The app's destinations, in the prototype's order, shared by the desktop rail and the phone
 * menu sheet. Only places that exist are links; "Pictures" is shown as coming, as text.
 */
export interface NavItem {
  key: string;
  label: string;
  href: string;
  /** Right-aligned note: the chapter, a count, or a word. */
  meta?: string;
}

import { ADAPTATIONS } from './config';

export function navItems(last: number, adaptations: number): NavItem[] {
  const items: NavItem[] = [
    { key: 'read', label: 'Read', href: `/chapter/${last}`, meta: `Ch ${last}` },
    { key: 'listen', label: 'Listen', href: `/chapter/${last}?view=listen` },
    { key: 'assistant', label: 'Assistant', href: '/assistant' },
    { key: 'adaptations', label: 'Adaptations', href: '/adaptations', meta: String(adaptations) },
    { key: 'minpentai', label: 'Minpentai', href: '/minpentai', meta: 'Tutorial' },
    { key: 'podcast', label: 'Podcast', href: '/about#podcast', meta: 'RSS' },
    { key: 'about', label: 'About', href: '/about' },
  ];
  // Adaptations are out of view for now (ADAPTATIONS.visible).
  return ADAPTATIONS.visible ? items : items.filter((i) => i.key !== 'adaptations');
}
export const COMING = [{ label: 'Pictures', meta: 'Coming' }];
