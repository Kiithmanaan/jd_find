-- AlterTable
ALTER TABLE "JobProfileRecord" ADD COLUMN "currentVersionId" TEXT;

-- CreateTable
CREATE TABLE "JobProfileVersionRecord" (
    "id" TEXT NOT NULL,
    "jobProfileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "jdText" TEXT NOT NULL,
    "searchCondition" JSONB NOT NULL,
    "hardRequirements" JSONB NOT NULL,
    "softRequirements" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "JobProfileVersionRecord_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "SearchRunRecord" ADD COLUMN "jobProfileVersionId" TEXT;

-- AlterTable
ALTER TABLE "AIAssessmentAuditRecord" ADD COLUMN "jobProfileVersionId" TEXT;

-- CreateIndex
CREATE INDEX "JobProfileVersionRecord_jobProfileId_idx" ON "JobProfileVersionRecord"("jobProfileId");

-- CreateIndex
CREATE INDEX "JobProfileVersionRecord_jobProfileId_status_idx" ON "JobProfileVersionRecord"("jobProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JobProfileVersionRecord_jobProfileId_version_key" ON "JobProfileVersionRecord"("jobProfileId", "version");

-- CreateIndex
CREATE INDEX "SearchRunRecord_jobProfileVersionId_idx" ON "SearchRunRecord"("jobProfileVersionId");

-- CreateIndex
CREATE INDEX "AIAssessmentAuditRecord_jobProfileVersionId_idx" ON "AIAssessmentAuditRecord"("jobProfileVersionId");

-- AddForeignKey
ALTER TABLE "JobProfileVersionRecord" ADD CONSTRAINT "JobProfileVersionRecord_jobProfileId_fkey" FOREIGN KEY ("jobProfileId") REFERENCES "JobProfileRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchRunRecord" ADD CONSTRAINT "SearchRunRecord_jobProfileVersionId_fkey" FOREIGN KEY ("jobProfileVersionId") REFERENCES "JobProfileVersionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
