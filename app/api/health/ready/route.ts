import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Readiness verifies the application's actual PostgreSQL adapter. It keeps the
 * response intentionally generic so health probes cannot learn topology,
 * account names, versions, or connection details.
 */
export async function GET() {
  try {
    const result = await getDb().prepare('SELECT 1 AS ok').get();
    if (!result) throw new Error('readiness_query_empty');
    return NextResponse.json({ status: 'ok' }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[HEALTH_READY]', { code: error?.code || 'UNKNOWN' });
    }
    return NextResponse.json({ status: 'unavailable' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
