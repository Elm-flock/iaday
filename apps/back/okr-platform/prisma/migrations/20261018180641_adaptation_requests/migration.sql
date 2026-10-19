-- CreateEnum
CREATE TYPE "AdaptationFormat" AS ENUM ('LECTURA_FACIL', 'LENGUAJE_CLARO', 'AUDIO', 'APOYO_VISUAL', 'REUNION_ADAPTADA', 'OTRO');

-- CreateEnum
CREATE TYPE "AdaptationRequestStatus" AS ENUM ('PENDIENTE', 'EN_CURSO', 'ENTREGADA', 'RECHAZADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ADAPTATION_REQUEST_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADAPTATION_REQUEST_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'ADAPTATION_REQUEST_DELIVERED';
ALTER TYPE "AuditAction" ADD VALUE 'ADAPTATION_REQUEST_REJECTED';

-- CreateTable
CREATE TABLE "AdaptationRequest" (
    "id" UUID NOT NULL,
    "requesterId" UUID,
    "subject" VARCHAR(150) NOT NULL,
    "description" VARCHAR(2000),
    "entityType" "AiEntityType",
    "entityId" UUID,
    "preferredFormat" "AdaptationFormat" NOT NULL,
    "status" "AdaptationRequestStatus" NOT NULL DEFAULT 'PENDIENTE',
    "assigneeId" UUID,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "resolutionNote" VARCHAR(2000),
    "resolutionLink" VARCHAR(500),
    "rejectionJustification" VARCHAR(2000),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdaptationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdaptationRequest_requesterId_createdAt_idx" ON "AdaptationRequest"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "AdaptationRequest_status_dueDate_idx" ON "AdaptationRequest"("status", "dueDate");

-- AddForeignKey
ALTER TABLE "AdaptationRequest" ADD CONSTRAINT "AdaptationRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdaptationRequest" ADD CONSTRAINT "AdaptationRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
