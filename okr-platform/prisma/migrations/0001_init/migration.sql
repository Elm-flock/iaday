-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'LEADER', 'MEMBER');

-- CreateEnum
CREATE TYPE "CycleKind" AS ENUM ('ANNUAL', 'QUARTER');

-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "CheckInCadence" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ObjectiveOrigin" AS ENUM ('TOP_DOWN', 'BOTTOM_UP');

-- CreateEnum
CREATE TYPE "ObjectiveType" AS ENUM ('COMMITTED', 'ASPIRATIONAL');

-- CreateEnum
CREATE TYPE "ObjectiveStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "KrScoring" AS ENUM ('DERIVED', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScoreBand" AS ENUM ('RED', 'YELLOW', 'GREEN');

-- CreateEnum
CREATE TYPE "CheckInAction" AS ENUM ('CONTINUE', 'UPDATE', 'START', 'STOP');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('OBJECTIVE_PUBLISHED', 'OBJECTIVE_CLOSED', 'KR_TARGET_CHANGED', 'KR_SCORE_CHANGED', 'CYCLE_ACTIVATED', 'CYCLE_CLOSED', 'CYCLE_THRESHOLDS_CHANGED', 'USER_ROLE_CHANGED', 'USER_DEACTIVATED', 'REFRESH_REUSE_DETECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "familyExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "userId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("userId","teamId")
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CycleKind" NOT NULL,
    "parentId" UUID,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "CycleStatus" NOT NULL DEFAULT 'DRAFT',
    "checkInCadence" "CheckInCadence" NOT NULL DEFAULT 'WEEKLY',
    "committedThreshold" DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    "aspirationalThreshold" DECIMAL(3,2) NOT NULL DEFAULT 0.70,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Objective" (
    "id" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerTeamId" UUID,
    "parentObjectiveId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "origin" "ObjectiveOrigin" NOT NULL,
    "type" "ObjectiveType" NOT NULL,
    "status" "ObjectiveStatus" NOT NULL DEFAULT 'DRAFT',
    "score" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "finalScore" DECIMAL(5,4),
    "achieved" BOOLEAN,
    "createdById" UUID NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Objective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyResult" (
    "id" UUID NOT NULL,
    "objectiveId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "scoring" "KrScoring" NOT NULL,
    "unit" TEXT,
    "startValue" DECIMAL(18,4),
    "targetValue" DECIMAL(18,4),
    "currentValue" DECIMAL(18,4),
    "score" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL,
    "lastCheckInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeyResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" UUID NOT NULL,
    "keyResultId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "value" DECIMAL(18,4),
    "score" DECIMAL(5,4) NOT NULL,
    "band" "ScoreBand" NOT NULL,
    "action" "CheckInAction" NOT NULL,
    "note" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" UUID NOT NULL,
    "fromUserId" UUID NOT NULL,
    "toUserId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "objectiveId" UUID,
    "keyResultId" UUID,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recognition" (
    "id" UUID NOT NULL,
    "fromUserId" UUID NOT NULL,
    "toUserId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "objectiveId" UUID,
    "keyResultId" UUID,
    "milestoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recognition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_parentId_name_key" ON "Team"("parentId", "name");

-- CreateIndex
CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");

-- CreateIndex
CREATE INDEX "Cycle_parentId_idx" ON "Cycle"("parentId");

-- CreateIndex
CREATE INDEX "Cycle_status_idx" ON "Cycle"("status");

-- CreateIndex
CREATE INDEX "Objective_cycleId_ownerUserId_idx" ON "Objective"("cycleId", "ownerUserId");

-- CreateIndex
CREATE INDEX "Objective_cycleId_ownerTeamId_idx" ON "Objective"("cycleId", "ownerTeamId");

-- CreateIndex
CREATE INDEX "Objective_cycleId_status_idx" ON "Objective"("cycleId", "status");

-- CreateIndex
CREATE INDEX "Objective_parentObjectiveId_idx" ON "Objective"("parentObjectiveId");

-- CreateIndex
CREATE INDEX "KeyResult_objectiveId_idx" ON "KeyResult"("objectiveId");

-- CreateIndex
CREATE INDEX "KeyResult_ownerId_idx" ON "KeyResult"("ownerId");

-- CreateIndex
CREATE INDEX "CheckIn_keyResultId_createdAt_idx" ON "CheckIn"("keyResultId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Feedback_toUserId_createdAt_idx" ON "Feedback"("toUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_fromUserId_createdAt_idx" ON "Feedback"("fromUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Recognition_createdAt_idx" ON "Recognition"("createdAt");

-- CreateIndex
CREATE INDEX "Recognition_toUserId_idx" ON "Recognition"("toUserId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_parentObjectiveId_fkey" FOREIGN KEY ("parentObjectiveId") REFERENCES "Objective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyResult" ADD CONSTRAINT "KeyResult_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyResult" ADD CONSTRAINT "KeyResult_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "KeyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "KeyResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "KeyResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- SQL manual (Prisma no modela CHECK ni índices parciales). Ver diseño sec. 3.
-- ============================================================================

-- Raíz única del árbol de equipos (la organización).
CREATE UNIQUE INDEX "team_single_root" ON "Team" ((true)) WHERE "parentId" IS NULL;

-- Ciclo: fechas y umbrales válidos (REQ-CYC-1, REQ-CYC-2).
ALTER TABLE "Cycle" ADD CONSTRAINT "cycle_dates_order" CHECK ("startDate" < "endDate");
ALTER TABLE "Cycle" ADD CONSTRAINT "cycle_thresholds_range" CHECK (
  "committedThreshold" > 0 AND "committedThreshold" <= 1
  AND "aspirationalThreshold" > 0 AND "aspirationalThreshold" <= 1
);

-- Objetivo: exactamente un owner (usuario XOR equipo) (REQ-OKR-1) y score acotado.
ALTER TABLE "Objective" ADD CONSTRAINT "objective_single_owner" CHECK (num_nonnulls("ownerUserId", "ownerTeamId") = 1);
ALTER TABLE "Objective" ADD CONSTRAINT "objective_score_range" CHECK ("score" BETWEEN 0 AND 1);
ALTER TABLE "Objective" ADD CONSTRAINT "objective_no_self_parent" CHECK ("parentObjectiveId" IS NULL OR "parentObjectiveId" <> "id");

-- Key Result: DERIVED exige start/target distintos (REQ-OKR-3); score acotado.
ALTER TABLE "KeyResult" ADD CONSTRAINT "kr_derived_values" CHECK (
  "scoring" = 'MANUAL'
  OR ("startValue" IS NOT NULL AND "targetValue" IS NOT NULL AND "startValue" <> "targetValue")
);
ALTER TABLE "KeyResult" ADD CONSTRAINT "kr_score_range" CHECK ("score" BETWEEN 0 AND 1);

-- Check-in: score acotado.
ALTER TABLE "CheckIn" ADD CONSTRAINT "checkin_score_range" CHECK ("score" BETWEEN 0 AND 1);

-- Feedback y reconocimiento: sin autoenvío (REQ-FDB-1, REQ-REC-1).
ALTER TABLE "Feedback" ADD CONSTRAINT "feedback_no_self" CHECK ("fromUserId" <> "toUserId");
ALTER TABLE "Recognition" ADD CONSTRAINT "recognition_no_self" CHECK ("fromUserId" <> "toUserId");
