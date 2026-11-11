import type { Metadata } from 'next';
import { ConsistencyPage } from '~/components/consistency-page';
import '../../../styles/images.css';
import '../you.css';
import './consistency.css';

/**
 * /you/consistency: same character, same look (owner, 2026-10-23). Owner-only: the page as served holds nothing;
 * the scores and the sheets are read in the browser from /api/you/consistency, which answers only for FID 6786.
 */
export const metadata: Metadata = { title: 'Same character, same look', robots: { index: false, follow: false } };

export default function Consistency() {
  return <ConsistencyPage />;
}
