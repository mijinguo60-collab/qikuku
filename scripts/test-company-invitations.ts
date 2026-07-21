import assert from 'node:assert/strict';

process.env.SMS_CODE_PEPPER = 'company-invitations-test-pepper-at-least-32-bytes';

async function main() {
  const { encodeBoundPhone, formatBoundPhoneMask, getBoundPhoneLast4, verifyBoundPhone } = await import('../lib/invitations/phone-binding');
  const { generateInviteCode, invitationAcceptPurpose, isInvitationUsable } = await import('../lib/invitations/company-invitations');
  const { SMS_PURPOSE_INVITE_ACCEPT } = await import('../lib/sms/security');
  const { SMS_GLOBAL_PHONE_DAILY_LIMIT_SQL, SMS_GLOBAL_PHONE_HOURLY_LIMIT_SQL } = await import('../lib/sms/auth-service');
  const { acceptInvitationWithCode } = await import('../lib/sms/auth-service');
  const phone = '+8613812345678';
  const bound = encodeBoundPhone(phone);
  assert.equal(bound.includes('13812345678'), false);
  assert.equal(verifyBoundPhone(bound, phone), true);
  assert.equal(verifyBoundPhone(bound, '+8613912345678'), false);
  assert.equal(getBoundPhoneLast4(bound), '5678');
  assert.equal(formatBoundPhoneMask(bound), '手机尾号 5678');
  for (let index = 0; index < 100; index += 1) {
    const code = generateInviteCode();
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/);
  }
  assert.equal(invitationAcceptPurpose('invite-123'), `${SMS_PURPOSE_INVITE_ACCEPT}:invite-123`);
  assert.notEqual(invitationAcceptPurpose('invite-123'), invitationAcceptPurpose('invite-456'));
  assert.equal(SMS_GLOBAL_PHONE_HOURLY_LIMIT_SQL.includes('purpose'), false);
  assert.equal(SMS_GLOBAL_PHONE_DAILY_LIMIT_SQL.includes('purpose'), false);
  assert.equal(isInvitationUsable({ inviteType: 'phone', status: 'active', usedCount: 0, maxUses: 1, expiresAt: new Date(Date.now() + 1000) }), true);
  assert.equal(isInvitationUsable({ inviteType: 'phone', status: 'active', usedCount: 1, maxUses: 1, expiresAt: new Date(Date.now() + 1000) }), false);
  assert.equal(isInvitationUsable({ inviteType: 'phone', status: 'active', usedCount: 0, maxUses: 1, expiresAt: new Date(Date.now() - 1000) }), false);
  assert.equal(isInvitationUsable({ inviteType: 'email', status: 'active', usedCount: 0, maxUses: 1, expiresAt: new Date(Date.now() + 1000) }), false);
  assert.deepEqual(
    await acceptInvitationWithCode('ANYINVITECODE', phone, '123456', { ip: '127.0.0.1', userAgent: 'test' }, {
      db: { transactionAsync: async () => { throw new Error('database unavailable'); } },
    }),
    { ok: false, kind: 'service_unavailable' },
  );
  console.log('company invitation pure logic tests passed');
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
