import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });
process.env.SMS_CODE_PEPPER = 'route-invitation-test-pepper-at-least-32-bytes';
process.env.SESSION_SECRET = 'route-invitation-test-secret-at-least-32-bytes';
process.env.SMS_PROVIDER = 'mock';

const ENDPOINT = 'ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech';
const tables = ['User', 'AuthIdentity', 'PasswordCredential', 'Company', 'CompanyMembership', 'Subscription', 'CreditAccount', 'CreditGrant', 'CreditLedger', 'UserSession', 'CompanyInvitation', 'SmsVerificationChallenge'];
function progress(step: string) { console.log(`[company-invitation-routes-db] ${step}`); }
function sql(query: string) { let index = 0; return query.replace(/\?/g, () => `$${++index}`); }
function dbFor(client: Client) {
  let sequence = 0;
  const db: any = {
    prepare(query: string) {
      return {
        async get(...values: unknown[]) { return (await client.query(sql(query), values)).rows[0] || null; },
        async all(...values: unknown[]) { return (await client.query(sql(query), values)).rows; },
        async run(...values: unknown[]) { return { changes: (await client.query(sql(query), values)).rowCount || 0 }; },
      };
    },
    // eslint-disable-next-line no-unused-vars
    async transactionAsync<T>(fn: (tx: any) => Promise<T>) {
      const savepoint = `route_test_${++sequence}`;
      await client.query(`SAVEPOINT ${savepoint}`);
      try { const result = await fn(db); await client.query(`RELEASE SAVEPOINT ${savepoint}`); return result; }
      catch (error) { await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`); await client.query(`RELEASE SAVEPOINT ${savepoint}`); throw error; }
    },
  };
  return db;
}
async function counts(client: Client) {
  const result: Record<string, number> = {};
  for (const table of tables) result[table] = Number((await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`)).rows[0].count);
  return result;
}

async function main() {
  if (process.env.COMPANY_INVITATION_ROUTES_DB_ROLLBACK_TEST !== '1') throw new Error('route rollback flag required');
  const directUrl = process.env.DATABASE_DIRECT_URL || '';
  if (new URL(directUrl).hostname !== ENDPOINT) throw new Error('拒绝非测试数据库');
  const { NextRequest } = await import('next/server');
  const { withServerTestDb } = await import('../lib/db');
  const { createServerSession, getSessionForToken, SESSION_COOKIE } = await import('../lib/session');
  const { hashVerificationCode } = await import('../lib/sms/security');
  const invitations = await import('../app/api/team/invitations/route');
  const invitationById = await import('../app/api/team/invitations/[id]/route');
  const team = await import('../app/api/team/route');
  const publicInvite = await import('../app/api/invitations/[inviteCode]/route');
  const send = await import('../app/api/invitations/[inviteCode]/send-code/route');
  const accept = await import('../app/api/invitations/[inviteCode]/accept/route');
  const client = new Client({ connectionString: directUrl, ssl: { rejectUnauthorized: false } });
  const checks: Record<string, boolean> = {};
  let before: Record<string, number> = {};
  let during: Record<string, number> = {};
  let after: Record<string, number> = {};
  let began = false;
  try {
    await client.connect(); progress('connected');
    before = await counts(client); progress('before-counts');
    await client.query('BEGIN'); began = true; progress('transaction-begin');
    const db = dbFor(client);
    await withServerTestDb(db, async () => {
      const now = new Date().toISOString();
      const planId = (await client.query(`SELECT id FROM "Plan" WHERE code='trial' LIMIT 1`)).rows[0]?.id;
      assert.ok(planId, '测试库缺少 trial Plan');
      const companyId = randomUUID(); const ownerId = randomUUID(); const memberId = randomUUID();
      const phone = () => `1${randomInt(3, 10)}${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;
      const inviteePhone = phone(); const conflictPhone = phone(); const fullPhone = phone(); const revokedPhone = phone();
      await client.query(`INSERT INTO "Company" (id,name,status,plan,"createdAt") VALUES ($1,'route test company','active','trial',$2)`, [companyId, now]);
      for (const [id, name] of [[ownerId, 'route owner'], [memberId, 'route member']]) {
        await client.query(`INSERT INTO "User" (id,name,status,role,"companyId","createdAt","updatedAt") VALUES ($1,$2,'active','member',$3,$4,$4)`, [id, name, companyId, now]);
      }
      await client.query(`INSERT INTO "CompanyMembership" (id,"userId","companyId",role,status,"joinedAt","createdAt","updatedAt") VALUES ($1,$2,$3,'owner','active',$4,$4,$4),($5,$6,$3,'member','active',$4,$4,$4)`, [randomUUID(), ownerId, companyId, now, randomUUID(), memberId]);
      await client.query(`INSERT INTO "Subscription" (id,"companyId","planId","billingCycle",status,"startedAt","expiresAt","autoRenew","createdAt","updatedAt") VALUES ($1,$2,$3,'trial','trialing',$4,$5,false,$4,$4)`, [randomUUID(), companyId, planId, now, new Date(Date.now() + 86400000).toISOString()]);
      progress('fixtures-created');

      const owner = await createServerSession({ id: ownerId, name: 'route owner', email: '' }, db);
      const member = await createServerSession({ id: memberId, name: 'route member', email: '' }, db);
      const request = (path: string, token?: string, body?: unknown, method = body ? 'POST' : 'GET') => new NextRequest(`http://localhost${path}`, { method, headers: { ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const profile = (value: string) => ({ phone: value, code: '654321', personalName: '路由测试员工', password: 'InvitePassw0rd!', confirmPassword: 'InvitePassw0rd!' });
      const prepareChallenge = async (invitation: { id: string; inviteCode: string }, value: string) => {
        assert.equal((await send.POST(request(`/api/invitations/${invitation.inviteCode}/send-code`, undefined, { phone: value }), { params: { inviteCode: invitation.inviteCode } })).status, 200);
        await client.query(`UPDATE "SmsVerificationChallenge" SET "codeHash"=$1 WHERE purpose=$2`, [hashVerificationCode(process.env.SMS_CODE_PEPPER!, `+86${value}`, `INVITE_ACCEPT:${invitation.id}`, '654321'), `INVITE_ACCEPT:${invitation.id}`]);
      };

      const created = (await invitations.POST(request('/api/team/invitations', owner.token, { phone: inviteePhone })))!;
      assert.equal(created.status, 201);
      const invitation = (await created.json()).invitation;
      assert.match(invitation.inviteCode, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/);
      assert.match(invitation.inviteUrl, /^\/invite\//);
      assert.equal(invitation.maskedPhone.includes(inviteePhone), false);
      const list = (await invitations.GET(request('/api/team/invitations', owner.token)))!;
      assert.equal(list.status, 200); const listBody = await list.json();
      assert.equal(listBody.activeMemberCount, 2); assert.equal(listBody.memberLimit, 5);
      assert.equal(JSON.stringify(listBody).includes('boundPhone'), false); assert.equal(JSON.stringify(listBody).includes('tokenHash'), false);
      const teamResult = (await team.GET(request('/api/team', owner.token)))!; assert.equal(teamResult.status, 200);
      assert.equal(JSON.stringify(await teamResult.json()).includes('phoneE164'), false);
      checks.ownerCreatesAndListsMaskedInvitation = true;

      assert.equal((await invitations.GET(request('/api/team/invitations', member.token)))!.status, 403);
      assert.equal((await invitations.POST(request('/api/team/invitations', member.token, { phone: conflictPhone })))!.status, 403);
      assert.equal((await invitations.GET(request('/api/team/invitations')))!.status, 401);
      checks.memberAndAnonymousAreRejected = true;

      await prepareChallenge(invitation, inviteePhone); progress('challenge-prepared');
      const accepted = await accept.POST(request(`/api/invitations/${invitation.inviteCode}/accept`, undefined, profile(inviteePhone)), { params: { inviteCode: invitation.inviteCode } });
      assert.equal(accepted.status, 200);
      const cookie = accepted.headers.get('set-cookie') || ''; const token = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1]; assert.ok(token);
      const employeeSession = await getSessionForToken(token, db);
      assert.equal(employeeSession?.role, 'member'); assert.equal(employeeSession?.activeCompanyId, companyId);
      assert.equal((await client.query(`SELECT COUNT(*)::int AS count FROM "PasswordCredential" WHERE "userId"=$1`, [employeeSession?.id])).rows[0].count, 1);
      checks.employeeAcceptsWithPasswordAndMemberSession = true; progress('employee-session-verified');

      const conflictCreated = (await invitations.POST(request('/api/team/invitations', owner.token, { phone: conflictPhone })))!;
      const conflictInvitation = (await conflictCreated.json()).invitation; await prepareChallenge(conflictInvitation, conflictPhone);
      const conflict = await accept.POST(request(`/api/invitations/${conflictInvitation.inviteCode}/accept`, owner.token, { phone: conflictPhone, code: '654321' }), { params: { inviteCode: conflictInvitation.inviteCode } });
      assert.equal(conflict.status, 409); assert.equal(conflict.headers.get('set-cookie'), null); assert.ok(await getSessionForToken(owner.token, db));
      assert.deepEqual((await client.query(`SELECT status,"usedCount" FROM "CompanyInvitation" WHERE id=$1`, [conflictInvitation.id])).rows[0], { status: 'active', usedCount: 0 });
      assert.equal((await client.query(`SELECT "consumedAt" FROM "SmsVerificationChallenge" WHERE purpose=$1`, [`INVITE_ACCEPT:${conflictInvitation.id}`])).rows[0].consumedAt, null);
      checks.loggedInIdentityConflictRejected = true; progress('identity-conflict-verified');

      const fullCreated = (await invitations.POST(request('/api/team/invitations', owner.token, { phone: fullPhone })))!;
      const fullInvitation = (await fullCreated.json()).invitation; await prepareChallenge(fullInvitation, fullPhone);
      const fillers: string[] = [];
      while (Number((await client.query(`SELECT COUNT(*)::int AS count FROM "CompanyMembership" WHERE "companyId"=$1 AND status='active'`, [companyId])).rows[0].count) < 5) {
        const userId = randomUUID(); const membershipId = randomUUID(); fillers.push(membershipId);
        await client.query(`INSERT INTO "User" (id,name,status,role,"companyId","createdAt","updatedAt") VALUES ($1,'route filler','active','member',$2,$3,$3)`, [userId, companyId, now]);
        await client.query(`INSERT INTO "CompanyMembership" (id,"userId","companyId",role,status,"createdAt","updatedAt") VALUES ($1,$2,$3,'member','active',$4,$4)`, [membershipId, userId, companyId, now]);
      }
      const full = await accept.POST(request(`/api/invitations/${fullInvitation.inviteCode}/accept`, undefined, profile(fullPhone)), { params: { inviteCode: fullInvitation.inviteCode } });
      assert.equal(full.status, 409); assert.equal((await full.json()).error, '成员名额已满');
      assert.equal((await client.query(`SELECT "consumedAt" FROM "SmsVerificationChallenge" WHERE purpose=$1`, [`INVITE_ACCEPT:${fullInvitation.id}`])).rows[0].consumedAt, null);
      assert.deepEqual((await client.query(`SELECT status,"usedCount" FROM "CompanyInvitation" WHERE id=$1`, [fullInvitation.id])).rows[0], { status: 'active', usedCount: 0 });
      checks.fullCompanyDoesNotConsumeCode = true;
      await client.query(`DELETE FROM "CompanyMembership" WHERE id=$1`, [fillers.pop()]);
      const retry = await accept.POST(request(`/api/invitations/${fullInvitation.inviteCode}/accept`, undefined, profile(fullPhone)), { params: { inviteCode: fullInvitation.inviteCode } });
      assert.equal(retry.status, 200);
      assert.ok((await client.query(`SELECT "consumedAt" FROM "SmsVerificationChallenge" WHERE purpose=$1`, [`INVITE_ACCEPT:${fullInvitation.id}`])).rows[0].consumedAt);
      checks.sameCodeSucceedsAfterSeatReleased = true; progress('capacity-retry-verified');

      const revokeTestSeat = fillers.pop();
      assert.ok(revokeTestSeat, '撤销邀请测试前应有可释放的 filler 席位');
      await client.query(`DELETE FROM "CompanyMembership" WHERE id=$1`, [revokeTestSeat]);

      const revokeCreated = (await invitations.POST(request('/api/team/invitations', owner.token, { phone: revokedPhone })))!;
      const revokeInvitation = (await revokeCreated.json()).invitation;
      const revoked = await invitationById.DELETE(request(`/api/team/invitations/${revokeInvitation.id}`, owner.token, undefined, 'DELETE'), { params: { id: revokeInvitation.id } });
      assert.equal(revoked.status, 200);
      assert.equal((await publicInvite.GET(request(`/api/invitations/${revokeInvitation.inviteCode}`), { params: { inviteCode: revokeInvitation.inviteCode } })).status, 200);
      checks.ownerRevokesInvitation = true;

      const failingDb = { prepare: db.prepare, transactionAsync: async () => { throw new Error('test database unavailable'); } };
      const unavailable = await withServerTestDb(failingDb, async () => accept.POST(request(`/api/invitations/${conflictInvitation.inviteCode}/accept`, undefined, profile(conflictPhone)), { params: { inviteCode: conflictInvitation.inviteCode } }));
      assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).error, '服务暂时不可用，请稍后重试');
      checks.unknownDatabaseErrorReturns503 = true;
      during = await counts(client); progress('during-counts');
    });
  } finally {
    if (began) { progress('rollback-start'); await client.query('ROLLBACK').catch(() => undefined); progress('rollback-complete'); }
    after = await counts(client).catch(() => ({}));
    await client.end().catch(() => undefined);
  }
  assert.deepEqual(after, before);
  console.log(JSON.stringify({ endpointMatch: true, checks, before, during, after, ok: true }, null, 2));
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
