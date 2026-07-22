-- The all-purpose phone quotas use phoneHash + createdAt. The existing
-- purpose-qualified index cannot efficiently cover that predicate.
CREATE INDEX IF NOT EXISTS "SmsVerificationChallenge_phoneHash_createdAt_idx"
  ON "SmsVerificationChallenge"("phoneHash", "createdAt");
