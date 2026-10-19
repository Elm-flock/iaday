CREATE TYPE "AssistantPlanStatus" AS ENUM ('PROPOSED', 'INVALID', 'EXECUTING', 'EXECUTED', 'PARTIAL', 'FAILED', 'INTERRUPTED', 'DISCARDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AssistantMessageRole" AS ENUM ('ADMIN', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AssistantMessageKind" AS ENUM ('TEXT', 'PLAN', 'QUERY_RESULT', 'EXECUTION_RESULT', 'HELP');

-- AlterEnum
ALTER TYPE "AiEntityType" ADD VALUE 'ASSISTANT_PLAN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AiFeature" ADD VALUE 'ADMIN_CHAT';
ALTER TYPE "AiFeature" ADD VALUE 'ADMIN_DIGEST';
ALTER TYPE "AiFeature" ADD VALUE 'HELP_ANSWER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AiStep" ADD VALUE 'PLAN';
ALTER TYPE "AiStep" ADD VALUE 'ANSWER';
ALTER TYPE "AiStep" ADD VALUE 'SUMMARIZE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'USER_PASSWORD_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'ASSISTANT_PLAN_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'ASSISTANT_PLAN_DISCARDED';
ALTER TYPE "AuditAction" ADD VALUE 'ASSISTANT_ACTION_EXECUTED';
ALTER TYPE "AuditAction" ADD VALUE 'ASSISTANT_ACTION_FAILED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AssistantPlan" (
    "id" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "status" "AssistantPlanStatus" NOT NULL,
    "summary" VARCHAR(300) NOT NULL,
    "assumptions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "handleMap" JSONB NOT NULL,
    "issues" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "planHash" CHAR(64) NOT NULL,
    "traceId" UUID NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "stepResults" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "role" "AssistantMessageRole" NOT NULL,
    "kind" "AssistantMessageKind" NOT NULL DEFAULT 'TEXT',
    "text" VARCHAR(2000) NOT NULL,
    "planId" UUID,
    "payload" JSONB,
    "traceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantPlan_requestedById_createdAt_idx" ON "AssistantPlan"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantPlan_status_expiresAt_idx" ON "AssistantPlan"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AssistantMessage_adminId_createdAt_idx" ON "AssistantMessage"("adminId", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantPlan" ADD CONSTRAINT "AssistantPlan_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AssistantPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

