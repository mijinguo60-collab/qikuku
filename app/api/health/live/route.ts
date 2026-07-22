import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Process liveness only: this deliberately never touches PostgreSQL. */
export async function GET() {
  return NextResponse.json({ status: 'ok' }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
