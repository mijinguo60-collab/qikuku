-- Dedicated phone-password credentials. Legacy User.passwordHash is intentionally
-- retained only for historical-data cleanup and is not used by new authentication.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
CREATE INDEX IF NOT EXISTS "Company_status_idx" ON "Company"("status");

CREATE TABLE "PasswordCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordCredential_userId_key" ON "PasswordCredential"("userId");
CREATE INDEX "PasswordCredential_lockedUntil_idx" ON "PasswordCredential"("lockedUntil");

ALTER TABLE "PasswordCredential"
  ADD CONSTRAINT "PasswordCredential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PasswordLoginAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "phoneHash" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordLoginAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PasswordLoginAttempt_phoneHash_attemptedAt_idx" ON "PasswordLoginAttempt"("phoneHash", "attemptedAt");
CREATE INDEX "PasswordLoginAttempt_ipHash_attemptedAt_idx" ON "PasswordLoginAttempt"("ipHash", "attemptedAt");
CREATE INDEX "PasswordLoginAttempt_deviceHash_attemptedAt_idx" ON "PasswordLoginAttempt"("deviceHash", "attemptedAt");

ALTER TABLE "PasswordLoginAttempt"
  ADD CONSTRAINT "PasswordLoginAttempt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
