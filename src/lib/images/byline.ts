/** How a reader's image names its maker: @name when Farcaster gave one at publish, else the FID. */
export const byline = (byName: string | null | undefined, byFid: number) => (byName ? `@${byName}` : `FID ${byFid}`);

/** A design's maker: as above, and "· maintainer" when the maintainer published it for the project (step 4, decision 13). Draft. */
export const designByline = (byName: string | null | undefined, byFid: number, role?: string | null) => `${byline(byName, byFid)}${role === 'maintainer' ? ' · maintainer' : ''}`;
