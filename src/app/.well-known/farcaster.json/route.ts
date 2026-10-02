import { NextResponse } from 'next/server';
import { APP_NAME, appUrl } from '~/lib/config';

/** Farcaster miniapp manifest, served locally per deployment. */
export function GET() {
  const url = appUrl();
  const { FARCASTER_HEADER: header, FARCASTER_PAYLOAD: payload, FARCASTER_SIGNATURE: signature } = process.env;
  return NextResponse.json(
    {
      ...(header && payload && signature ? { accountAssociation: { header, payload, signature } } : {}),
      miniapp: {
        version: '1',
        name: APP_NAME,
        homeUrl: url,
        iconUrl: `${url}/icon.png`,
        splashImageUrl: `${url}/splash.png`,
        splashBackgroundColor: '#f4f1ea',
        subtitle: 'An open illustrated Snowmoon',
        description:
          'Read Snowmoon by Vitalik Buterin and build an open illustrated and narrated edition together with every prompt in public',
        primaryCategory: 'art-creativity',
        tags: ['book', 'reading', 'illustration', 'gpl'],
      },
    },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
