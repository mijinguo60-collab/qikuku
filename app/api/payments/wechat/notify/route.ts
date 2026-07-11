import { NextResponse } from 'next/server';
export async function POST() { return NextResponse.json({ error: '支付通道尚未开通' }, { status: 503 }); }
