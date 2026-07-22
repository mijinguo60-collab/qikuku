import { randomInt, randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit-log';
import { requireCompanySubscription, resolveSubscriptionEntitlements } from '@/lib/billing/subscriptions';
import { encodeBoundPhone, formatBoundPhoneMask, verifyBoundPhone } from './phone-binding';
import { SMS_PURPOSE_INVITE_ACCEPT } from '@/lib/sms/security';
import { createPasswordCredentialInTransaction } from '@/lib/auth/password';

const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InvitationErrorCode = 'invalid_invitation' | 'member_limit_reached' | 'phone_belongs_to_other_company' | 'membership_conflict' | 'account_unavailable' | 'profile_required';

export class InvitationError extends Error {
  code: InvitationErrorCode;

  constructor(code: InvitationErrorCode, message: string) {
    super(message);
    this.name = 'InvitationError';
    this.code = code;
  }
}

export type InvitationRow = {
  id: string; companyId: string; inviterId: string; inviteType: string; inviteCode: string | null;
  role: string; maxUses: number; usedCount: number; boundPhone: string | null; expiresAt: Date | string; status: string;
  companyName?: string;
};

function asDate(value: Date | string) { return value instanceof Date ? value : new Date(value); }

export function generateInviteCode() {
  let code = '';
  for (let index = 0; index < 12; index += 1) code += INVITE_CODE_ALPHABET[randomInt(0, INVITE_CODE_ALPHABET.length)];
  return code;
}

export function invitationAcceptPurpose(invitationId: string) {
  return `${SMS_PURPOSE_INVITE_ACCEPT}:${invitationId}`;
}

export function isInvitationUsable(invitation: Pick<InvitationRow, 'inviteType' | 'status' | 'usedCount' | 'maxUses' | 'expiresAt'> | null | undefined) {
  return Boolean(invitation
    && invitation.inviteType === 'phone'
    && invitation.status === 'active'
    && Number(invitation.usedCount) < Number(invitation.maxUses)
    && asDate(invitation.expiresAt).getTime() > Date.now());
}

async function activeMemberCount(connection: any, companyId: string) {
  const row = await connection.prepare(`SELECT COUNT(*)::int AS count FROM "CompanyMembership" WHERE "companyId"=? AND status='active'`).get(companyId);
  return Number(row?.count || 0);
}

async function getEntitlements(connection: any, companyId: string) {
  return resolveSubscriptionEntitlements(await requireCompanySubscription(companyId, connection));
}

function inviteDetail(invitationId: string, inviteCode: string, maskedPhone: string, status: string) {
  return { invitationId, inviteCode, maskedPhone, status };
}

async function bestEffortInvitationAudit(
  auditWriter: typeof writeAuditLog | undefined,
  input: Parameters<typeof writeAuditLog>[0],
) {
  // Invitation data has already committed at this point. Audit availability is
  // never allowed to turn a successful create/revoke/accept into a client error.
  await (auditWriter ?? writeAuditLog)(input).catch(() => {});
}

export async function auditInvitationAccepted(
  result: { companyId: string; invitationId: string; inviteCode: string; maskedPhone: string; user: { id: string } },
  auditWriter?: typeof writeAuditLog,
) {
  await bestEffortInvitationAudit(auditWriter, {
    companyId: result.companyId,
    userId: result.user.id,
    action: 'invitation_accepted',
    detail: inviteDetail(result.invitationId, result.inviteCode, result.maskedPhone, 'accepted'),
  });
}

export async function createPhoneInvitation(input: {
  companyId: string; inviterId: string; phoneE164: string; db?: any;
  auditWriter?: typeof writeAuditLog; codeGenerator?: () => string;
}) {
  const db = input.db ?? getDb();
  const boundPhone = encodeBoundPhone(input.phoneE164);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();
  const result = await db.transactionAsync(async (tx: any) => {
    const entitlements = await getEntitlements(tx, input.companyId);
    const count = await activeMemberCount(tx, input.companyId);
    if (count >= entitlements.memberLimit) throw new InvitationError('member_limit_reached', '成员名额已满');
    await tx.prepare(`UPDATE "CompanyInvitation" SET status='revoked',"updatedAt"=? WHERE "companyId"=? AND "boundPhone"=? AND status='active'`).run(now.toISOString(), input.companyId, boundPhone);
    let invitationId = '';
    let inviteCode = '';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = input.codeGenerator?.() ?? generateInviteCode();
      const candidateId = randomUUID();
      const inserted = await tx.prepare(`INSERT INTO "CompanyInvitation" (id,"companyId","inviterId","inviteType","inviteCode","tokenHash",role,"maxUses","usedCount","boundPhone","expiresAt",status,"createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT ("inviteCode") DO NOTHING`).run(
        candidateId, input.companyId, input.inviterId, 'phone', candidate, null, 'member', 1, 0, boundPhone, expiresAt, 'active', now.toISOString(), now.toISOString(),
      );
      if (inserted.changes === 1) {
        invitationId = candidateId;
        inviteCode = candidate;
        break;
      }
    }
    if (!inviteCode) throw new Error('邀请码生成失败');
    return { invitationId, inviteCode, inviteUrl: `/invite/${inviteCode}`, maskedPhone: formatBoundPhoneMask(boundPhone), expiresAt, memberLimit: entitlements.memberLimit, activeMemberCount: count };
  });
  await bestEffortInvitationAudit(input.auditWriter, { companyId: input.companyId, userId: input.inviterId, action: 'invitation_created', detail: inviteDetail(result.invitationId, result.inviteCode, result.maskedPhone, 'active') });
  return result;
}

async function expireIfNeeded(connection: any, invitation: InvitationRow) {
  if (invitation.status === 'active' && asDate(invitation.expiresAt).getTime() <= Date.now()) {
    await connection.prepare(`UPDATE "CompanyInvitation" SET status='expired',"updatedAt"=? WHERE id=? AND status='active'`).run(new Date().toISOString(), invitation.id);
    return { ...invitation, status: 'expired' };
  }
  return invitation;
}

function publicInvitation(invitation: InvitationRow | null) {
  if (!invitation || !isInvitationUsable(invitation)) return { valid: false, companyName: null, maskedPhone: null, expiresAt: null, status: 'invalid' };
  return { valid: true, companyName: invitation.companyName || null, maskedPhone: formatBoundPhoneMask(invitation.boundPhone), expiresAt: asDate(invitation.expiresAt).toISOString(), status: 'active' };
}

export async function listCompanyInvitations(companyId: string, db = getDb()) {
  const rows = await db.prepare(`SELECT i.*,c.name as "companyName" FROM "CompanyInvitation" i JOIN "Company" c ON c.id=i."companyId" WHERE i."companyId"=? ORDER BY i."createdAt" DESC`).all(companyId) as InvitationRow[];
  const invitations = [];
  for (const row of rows) {
    const invitation = await expireIfNeeded(db, row);
    invitations.push({ id: invitation.id, inviteCode: invitation.inviteCode, inviteUrl: invitation.inviteCode ? `/invite/${invitation.inviteCode}` : null, maskedPhone: formatBoundPhoneMask(invitation.boundPhone), role: 'member', maxUses: invitation.maxUses, usedCount: invitation.usedCount, expiresAt: asDate(invitation.expiresAt).toISOString(), status: invitation.status, createdAt: (invitation as any).createdAt });
  }
  const entitlements = await getEntitlements(db, companyId);
  return { invitations, activeMemberCount: await activeMemberCount(db, companyId), memberLimit: entitlements.memberLimit };
}

export async function revokeCompanyInvitation(input: { companyId: string; invitationId: string; revokedBy: string; db?: any; auditWriter?: typeof writeAuditLog }) {
  const db = input.db ?? getDb();
  const invitation = await db.prepare(`SELECT * FROM "CompanyInvitation" WHERE id=? AND "companyId"=?`).get(input.invitationId, input.companyId) as InvitationRow | null;
  if (!invitation) return { ok: false as const, kind: 'not_found' as const };
  if (invitation.status === 'accepted') return { ok: false as const, kind: 'accepted' as const };
  if (invitation.status !== 'active') return { ok: false as const, kind: 'not_found' as const };
  const update = await db.prepare(`UPDATE "CompanyInvitation" SET status='revoked',"updatedAt"=? WHERE id=? AND "companyId"=? AND status='active'`).run(new Date().toISOString(), input.invitationId, input.companyId);
  if (update.changes !== 1) return { ok: false as const, kind: 'not_found' as const };
  await bestEffortInvitationAudit(input.auditWriter, { companyId: input.companyId, userId: input.revokedBy, action: 'invitation_revoked', detail: inviteDetail(invitation.id, invitation.inviteCode || '', formatBoundPhoneMask(invitation.boundPhone), 'revoked') });
  return { ok: true as const };
}

export async function resolveInvitation(inviteCode: string, db = getDb()) {
  const invitation = await db.prepare(`SELECT i.*,c.name as "companyName" FROM "CompanyInvitation" i JOIN "Company" c ON c.id=i."companyId" WHERE i."inviteCode"=?`).get(inviteCode) as InvitationRow | null;
  return publicInvitation(invitation ? await expireIfNeeded(db, invitation) : null);
}

export async function getActiveInvitationForPhone(inviteCode: string, phoneE164: string, db = getDb()) {
  const invitation = await db.prepare(`SELECT i.*,c.name as "companyName" FROM "CompanyInvitation" i JOIN "Company" c ON c.id=i."companyId" WHERE i."inviteCode"=?`).get(inviteCode) as InvitationRow | null;
  const resolved = invitation ? await expireIfNeeded(db, invitation) : null;
  if (!resolved || !isInvitationUsable(resolved) || !verifyBoundPhone(resolved.boundPhone, phoneE164)) return null;
  return resolved;
}

/**
 * Internal only: the caller must have verified and consumed the matching
 * INVITE_ACCEPT challenge in this same transaction and must hold the locked
 * CompanyInvitation row. Routes and normal business code must use
 * acceptInvitationWithCode() instead.
 */
export async function acceptPhoneInvitationInTransaction(
  tx: any,
  input: { invitation: InvitationRow; phoneE164: string; newUserProfile?: { personalName: string; passwordHash: string } },
) {
    const invitation = input.invitation;
    if (!isInvitationUsable(invitation) || !verifyBoundPhone(invitation.boundPhone, input.phoneE164)) throw new InvitationError('invalid_invitation', '邀请已失效');
    await tx.prepare(`SELECT id FROM "Company" WHERE id=? FOR UPDATE`).get(invitation.companyId);
    const entitlements = await getEntitlements(tx, invitation.companyId);
    const now = new Date().toISOString();
    let user = await tx.prepare(`SELECT id,name,email,status,role,"companyId" FROM "User" WHERE "phoneE164"=? OR phone=? OR phone=? ORDER BY CASE WHEN "phoneE164"=? THEN 0 ELSE 1 END LIMIT 1 FOR UPDATE`).get(input.phoneE164, input.phoneE164.slice(3), input.phoneE164, input.phoneE164) as any;
    const identity = await tx.prepare(`SELECT id,"userId" FROM "AuthIdentity" WHERE provider='phone' AND ("providerUserId"=? OR "providerUserId"=?) LIMIT 1 FOR UPDATE`).get(input.phoneE164, input.phoneE164.slice(3)) as any;
    if (identity && user && identity.userId !== user.id) throw new InvitationError('membership_conflict', '账号归属异常');
    if (identity && !user) user = await tx.prepare(`SELECT id,name,email,status,role,"companyId" FROM "User" WHERE id=? FOR UPDATE`).get(identity.userId);
    if (user?.status && user.status !== 'active') throw new InvitationError('account_unavailable', '账号当前不可用');
    const memberships = user ? await tx.prepare(`SELECT id,"companyId",role,status FROM "CompanyMembership" WHERE "userId"=? ORDER BY "createdAt" ASC,id ASC FOR UPDATE`).all(user.id) as any[] : [];
    if (memberships.length > 1) throw new InvitationError('membership_conflict', '账号企业信息异常');
    if (memberships.some((membership) => membership.companyId !== invitation.companyId)) throw new InvitationError('phone_belongs_to_other_company', '该手机号已属于其他企业');
    const existing = memberships[0] || null;
    const needsActiveSeat = !existing || existing.status !== 'active';
    if (needsActiveSeat && await activeMemberCount(tx, invitation.companyId) >= entitlements.memberLimit) throw new InvitationError('member_limit_reached', '成员名额已满');
    if (!user) {
      if (!input.newUserProfile) throw new InvitationError('profile_required', '请填写姓名并设置登录密码');
      const userId = randomUUID();
      await tx.prepare(`INSERT INTO "User" (id,name,"phoneE164","phoneVerifiedAt",status,role,"companyId","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?)`).run(userId, input.newUserProfile.personalName, input.phoneE164, now, 'active', 'member', invitation.companyId, now, now);
      await tx.prepare(`INSERT INTO "AuthIdentity" (id,"userId",provider,"providerUserId","createdAt","updatedAt") VALUES (?,?, 'phone', ?,?,?)`).run(randomUUID(), userId, input.phoneE164, now, now);
      await createPasswordCredentialInTransaction(tx, { userId, passwordHash: input.newUserProfile.passwordHash });
      user = { id: userId, name: input.newUserProfile.personalName, email: null, status: 'active', role: 'member', companyId: invitation.companyId };
    } else {
      if (identity) await tx.prepare(`UPDATE "AuthIdentity" SET "providerUserId"=?,"updatedAt"=? WHERE id=?`).run(input.phoneE164, now, identity.id);
      else await tx.prepare(`INSERT INTO "AuthIdentity" (id,"userId",provider,"providerUserId","createdAt","updatedAt") VALUES (?,?, 'phone', ?,?,?)`).run(randomUUID(), user.id, input.phoneE164, now, now);
      await tx.prepare(`UPDATE "User" SET "phoneE164"=?,"phoneVerifiedAt"=?,"companyId"=?,"updatedAt"=? WHERE id=?`).run(input.phoneE164, now, invitation.companyId, now, user.id);
    }
    if (!existing) await tx.prepare(`INSERT INTO "CompanyMembership" (id,"userId","companyId",role,status,"invitedBy","joinedAt","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?)`).run(randomUUID(), user.id, invitation.companyId, 'member', 'active', invitation.inviterId, now, now, now);
    else if (existing.status !== 'active') await tx.prepare(`UPDATE "CompanyMembership" SET role='member',status='active',"invitedBy"=?,"joinedAt"=?,"updatedAt"=? WHERE id=?`).run(invitation.inviterId, now, now, existing.id);
    const consumed = await tx.prepare(`UPDATE "CompanyInvitation" SET "usedCount"="usedCount"+1,status='accepted',"updatedAt"=? WHERE id=? AND status='active' AND "usedCount"<"maxUses"`).run(now, invitation.id);
    if (consumed.changes !== 1) throw new InvitationError('invalid_invitation', '邀请已失效');
    return { user: { id: user.id, name: user.name, email: user.email || '' }, invitationId: invitation.id, companyId: invitation.companyId, inviteCode: invitation.inviteCode || '', maskedPhone: formatBoundPhoneMask(invitation.boundPhone), idempotent: !needsActiveSeat };
}
