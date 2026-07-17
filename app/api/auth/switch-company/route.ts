import { NextRequest, NextResponse } from 'next/server';
import { getRequestSession } from '@/lib/session';
import { switchActiveCompany } from '@/lib/membership';
export async function POST(request:NextRequest){const session=await getRequestSession(request);if(!session)return NextResponse.json({error:'未登录'},{status:401});const {companyId}=await request.json();if(typeof companyId!=='string')return NextResponse.json({error:'企业参数无效'},{status:400});const token=request.cookies.get('qikuku_user')?.value||'';const ok=await switchActiveCompany(session.id,token,companyId);return ok?NextResponse.json({success:true}):NextResponse.json({error:'无权切换到该企业'},{status:403});}
