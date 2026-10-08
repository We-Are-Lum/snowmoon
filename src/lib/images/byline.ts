/** How a reader's image names its maker: @name when Farcaster gave one at publish, else the FID. */
export const byline = (byName: string | null | undefined, byFid: number) => (byName ? `@${byName}` : `FID ${byFid}`);
