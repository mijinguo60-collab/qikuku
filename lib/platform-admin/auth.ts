import { NextRequest } from 'next/server'; import { getRequestSession,getServerSession } from '@/lib/session'; import { getDb } from '@/lib/db';
async function resolve(id?:string){return id?getDb().prepare(`SELECT id,name,email,role FROM "User" WHERE id=? AND status='active' AND role='platform_super_admin'`).get(id):null;}
export async function getPlatformAdmin(){return resolve((await getServerSession())?.id)}
export async function requirePlatformAdmin(r:NextRequest){return resolve((await getRequestSession(r))?.id)}
