-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('ADAPT', 'OKR_SUGGEST', 'CHECKIN_SUMMARY');

-- CreateEnum
CREATE TYPE "AiStep" AS ENUM ('CLASSIFY', 'GENERATE', 'REPAIR', 'JUDGE', 'REGENERATE', 'TRANSPORT');

-- CreateEnum
CREATE TYPE "LlmCallStatus" AS ENUM ('OK', 'FAILED');

-- CreateEnum
CREATE TYPE "AiEntityType" AS ENUM ('OBJECTIVE', 'KEY_RESULT', 'CHECK_IN', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "AdaptationLevel" AS ENUM ('EASY_READ', 'PLAIN');

-- CreateEnum
CREATE TYPE "AdaptedContentStatus" AS ENUM ('DRAFT', 'ACCEPTED', 'VALIDATED', 'NEEDS_REVIEW');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'AI_CONTENT_ADAPTED';
ALTER TYPE "AuditAction" ADD VALUE 'AI_CONTENT_VALIDATED';
ALTER TYPE "AuditAction" ADD VALUE 'AI_SUGGESTION_ACCEPTED';

-- CreateTable
CREATE TABLE "LlmCall" (
    "id" UUID NOT NULL,
    "traceId" UUID NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "step" "AiStep" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "model" TEXT NOT NULL,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "promptId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "costUsdEst" DECIMAL(12,8) NOT NULL,
    "status" "LlmCallStatus" NOT NULL,
    "errorCode" TEXT,
    "actorId" UUID,
    "entityType" "AiEntityType",
    "entityId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdaptedContent" (
    "id" UUID NOT NULL,
    "entityType" "AiEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "level" "AdaptationLevel" NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "readability" JSONB NOT NULL,
    "status" "AdaptedContentStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewReason" TEXT,
    "promptId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "traceId" UUID NOT NULL,
    "generationMs" INTEGER NOT NULL,
    "requestedById" UUID,
    "acceptedAt" TIMESTAMP(3),
    "validatedById" UUID,
    "validatedAt" TIMESTAMP(3),
    "validationNote" VARCHAR(1000),
    "humanEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdaptedContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSuggestion" (
    "id" UUID NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "entityType" "AiEntityType",
    "entityId" UUID,
    "traceId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "needsHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" UUID,
    "acceptedAt" TIMESTAMP(3),
    "discardedAt" TIMESTAMP(3),
    "timeToDecisionMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LlmCall_traceId_idx" ON "LlmCall"("traceId");

-- CreateIndex
CREATE INDEX "LlmCall_feature_createdAt_idx" ON "LlmCall"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "LlmCall_model_createdAt_idx" ON "LlmCall"("model", "createdAt");

-- CreateIndex
CREATE INDEX "LlmCall_actorId_idx" ON "LlmCall"("actorId");

-- CreateIndex
CREATE INDEX "AdaptedContent_entityType_entityId_idx" ON "AdaptedContent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AdaptedContent_status_createdAt_idx" ON "AdaptedContent"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdaptedContent_entityType_entityId_level_sourceHash_key" ON "AdaptedContent"("entityType", "entityId", "level", "sourceHash");

-- CreateIndex
CREATE INDEX "AiSuggestion_feature_createdAt_idx" ON "AiSuggestion"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "AiSuggestion_requestedById_idx" ON "AiSuggestion"("requestedById");

-- AddForeignKey
ALTER TABLE "LlmCall" ADD CONSTRAINT "LlmCall_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdaptedContent" ADD CONSTRAINT "AdaptedContent_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdaptedContent" ADD CONSTRAINT "AdaptedContent_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- LlmCall append-only a nivel BD (medicion y trazabilidad de IA).
-- Se rechaza todo UPDATE/DELETE salvo la unica mutacion que genera la propia FK
-- (ON DELETE SET NULL de "actorId": non-null -> null, sin tocar ninguna otra columna).
-- TRUNCATE no dispara triggers de fila: se bloquea con un trigger de sentencia (abajo).
CREATE OR REPLACE FUNCTION llm_call_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."actorId" IS NOT NULL
     AND NEW."actorId" IS NULL
     AND (to_jsonb(NEW) - 'actorId') = (to_jsonb(OLD) - 'actorId') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'LlmCall es append-only: % no permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER llm_call_append_only
  BEFORE UPDATE OR DELETE ON "LlmCall"
  FOR EACH ROW EXECUTE FUNCTION llm_call_append_only();

-- TRUNCATE tambien rechazado (statement-level; el trigger de fila no se dispara con TRUNCATE).
-- Los tests lo evitan con session_replication_role = replica (ver test/helpers/db.ts).
CREATE OR REPLACE FUNCTION llm_call_no_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LlmCall es append-only: TRUNCATE no permitido'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER llm_call_no_truncate
  BEFORE TRUNCATE ON "LlmCall"
  FOR EACH STATEMENT EXECUTE FUNCTION llm_call_no_truncate();
