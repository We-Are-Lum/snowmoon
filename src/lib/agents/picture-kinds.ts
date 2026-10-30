/** The draft kinds that make a picture on Make it (Plan A part 2). No server-only imports: the dashboard uses it too. */
export type PictureKind = 'picture' | 'sheet' | 'place' | 'style';
export const PICTURE_KINDS: readonly PictureKind[] = ['picture', 'sheet', 'place', 'style'];
