-- Additive phone verification migration. The legacy User.phone and
-- SmsVerification table remain untouched for historical compatibility.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneE164" TEXT;

-- Normalize only unambiguous legacy mainland numbers. Refuse to continue if a
-- duplicate would make a unique phone binding ambiguous.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE phone ~ '^1[3-9][0-9]{9}$'
    GROUP BY phone
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'cannot backfill User.phoneE164 because duplicate legacy phone values exist';
  END IF;
END $$;

UPDATE "User"
SET "phoneE164" = '+86' || phone
WHERE "phoneE164" IS NULL AND phone ~ '^1[3-9][0-9]{9}$';

CREATE UNIQUE INDEX IF NOT EXISTS "User_phoneE164_key" ON "User" ("phoneE164");

CREATE TABLE IF NOT EXISTS "SmsVerificationChallenge" (
  "id" TEXT NOT NULL,
  "phoneHash" TEXT NOT NULL,
  "phoneLast4" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL,
  "sendStatus" TEXT NOT NULL,
  "providerRequestId" TEXT,
  "providerStatusCode" TEXT,
  "failureCategory" TEXT,
  "requestIpHash" TEXT NOT NULL,
  "userAgentHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SmsVerificationChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SmsVerificationChallenge_phoneHash_purpose_createdAt_idx"
  ON "SmsVerificationChallenge" ("phoneHash", "purpose", "createdAt");
CREATE INDEX IF NOT EXISTS "SmsVerificationChallenge_expiresAt_idx"
  ON "SmsVerificationChallenge" ("expiresAt");
CREATE INDEX IF NOT EXISTS "SmsVerificationChallenge_consumedAt_idx"
  ON "SmsVerificationChallenge" ("consumedAt");
CREATE INDEX IF NOT EXISTS "SmsVerificationChallenge_providerRequestId_idx"
  ON "SmsVerificationChallenge" ("providerRequestId");
CREATE INDEX IF NOT EXISTS "SmsVerificationChallenge_requestIpHash_createdAt_idx"
  ON "SmsVerificationChallenge" ("requestIpHash", "createdAt");
