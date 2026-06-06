-- AlterEnum
ALTER TYPE "CandidateResultStatus" ADD VALUE 'Pending';

-- CreateTable
CREATE TABLE "UserRecord" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "pluginTokenVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRecord_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "JobProfileRecord" ADD COLUMN "createdByUserId" TEXT;

-- AlterTable
ALTER TABLE "SearchRunRecord" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "SearchRunRecord" ADD COLUMN "rawSubmittedCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "UserRecord_email_key" ON "UserRecord"("email");

-- CreateIndex
CREATE INDEX "UserRecord_email_idx" ON "UserRecord"("email");
