import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json(
    { commit: process.env.APP_COMMIT, built_at: process.env.APP_BUILT_AT },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
