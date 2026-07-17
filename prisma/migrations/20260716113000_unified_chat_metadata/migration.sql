-- Preserve existing sessions and messages. New metadata is nullable so historic
-- records continue to render without fabricated model or Skill information.
ALTER TABLE "ChatSession"
  ADD COLUMN IF NOT EXISTS "modelId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerModelId" TEXT,
  ADD COLUMN IF NOT EXISTS "knowledgeSpaceIds" TEXT,
  ADD COLUMN IF NOT EXISTS "webSearchEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';

ALTER TABLE "ChatMessage"
  ADD COLUMN IF NOT EXISTS "modelId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerModelId" TEXT,
  ADD COLUMN IF NOT EXISTS "skillId" TEXT,
  ADD COLUMN IF NOT EXISTS "knowledgeSpaceIds" TEXT,
  ADD COLUMN IF NOT EXISTS "webSearchEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "attachmentIds" TEXT,
  ADD COLUMN IF NOT EXISTS "inputTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "outputTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "creditsUsed" INTEGER,
  ADD COLUMN IF NOT EXISTS "estimatedCost" INTEGER,
  ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS "errorCode" TEXT;

CREATE INDEX IF NOT EXISTS "ChatSession_companyId_userId_updatedAt_idx"
  ON "ChatSession" ("companyId", "userId", "updatedAt");

CREATE INDEX IF NOT EXISTS "ChatMessage_sessionId_createdAt_idx"
  ON "ChatMessage" ("sessionId", "createdAt");

-- Historical records intentionally retain NULL model/Skill/scope metadata.
-- The unified UI treats these as legacy messages and never fabricates values
-- that were not recorded at send time. This migration therefore performs no
-- UPDATE against existing chat history or its updatedAt timestamps.
