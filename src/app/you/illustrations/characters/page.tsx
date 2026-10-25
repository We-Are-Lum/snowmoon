import type { Metadata } from 'next';
import { CharacterDrift } from '~/components/character-drift';
import '../../../../styles/images.css';
import '../../you.css';

/**
 * /you/illustrations/characters: the owner's drift grids (owner, 2026-10-25), beside the image review. The page as
 * served holds nothing: the grids are read in the browser from /api/you/illustrations/characters, owner only.
 */
export const metadata: Metadata = { title: 'Characters across the images', robots: { index: false, follow: false } };

export default function CharacterDriftPage() {
  return <CharacterDrift />;
}
