-- CreateEnum
CREATE TYPE "JobProfileStatus" AS ENUM ('Draft', 'Suggested', 'Confirmed', 'Archived');

-- CreateEnum
CREATE TYPE "SearchRunStatus" AS ENUM ('Created', 'Running', 'Acquired', 'Deduplicated', 'HardFiltered', 'Assessed', 'Completed', 'Interrupted', 'Failed', 'Cancelled');

-- CreateEnum
CREATE TYPE "CandidateResultStatus" AS ENUM ('Acquired', 'Deduplicated', 'HardPassed', 'HardRejected', 'Assessed', 'Displayable');

-- CreateTable
CREATE TABLE "JobProfileRecord" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "jdText" TEXT NOT NULL,
    "status" "JobProfileStatus" NOT NULL,
    "searchCondition" JSONB NOT NULL,
    "hardRequirements" JSONB NOT NULL,
    "softRequirements" JSONB NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobProfileRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchRunRecord" (
    "id" TEXT NOT NULL,
    "jobProfileId" TEXT NOT NULL,
    "status" "SearchRunStatus" NOT NULL,
    "targetResultCount" INTEGER NOT NULL,
    "interruptedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchRunRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateResultRecord" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "jobProfileId" TEXT NOT NULL,
    "searchRunId" TEXT NOT NULL,
    "status" "CandidateResultStatus" NOT NULL,
    "resume" JSONB NOT NULL,
    "intent" TEXT NOT NULL,
    "activityLevel" TEXT NOT NULL,
    "sourceLead" JSONB NOT NULL,
    "hardRejectReasons" JSONB NOT NULL,
    "matchAssessment" JSONB,

    CONSTRAINT "CandidateResultRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchEventRecord" (
    "id" TEXT NOT NULL,
    "searchRunId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,

    CONSTRAINT "SearchEventRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobProfileRecord_status_idx" ON "JobProfileRecord"("status");

-- CreateIndex
CREATE INDEX "SearchRunRecord_jobProfileId_idx" ON "SearchRunRecord"("jobProfileId");

-- CreateIndex
CREATE INDEX "SearchRunRecord_status_idx" ON "SearchRunRecord"("status");

-- CreateIndex
CREATE INDEX "CandidateResultRecord_jobProfileId_idx" ON "CandidateResultRecord"("jobProfileId");

-- CreateIndex
CREATE INDEX "CandidateResultRecord_searchRunId_idx" ON "CandidateResultRecord"("searchRunId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateResultRecord_searchRunId_fingerprint_key" ON "CandidateResultRecord"("searchRunId", "fingerprint");

-- CreateIndex
CREATE INDEX "SearchEventRecord_searchRunId_idx" ON "SearchEventRecord"("searchRunId");

-- CreateIndex
CREATE INDEX "SearchEventRecord_type_idx" ON "SearchEventRecord"("type");

-- CreateIndex
CREATE UNIQUE INDEX "SearchEventRecord_searchRunId_sequence_key" ON "SearchEventRecord"("searchRunId", "sequence");

-- AddForeignKey
ALTER TABLE "SearchRunRecord" ADD CONSTRAINT "SearchRunRecord_jobProfileId_fkey" FOREIGN KEY ("jobProfileId") REFERENCES "JobProfileRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateResultRecord" ADD CONSTRAINT "CandidateResultRecord_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRunRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchEventRecord" ADD CONSTRAINT "SearchEventRecord_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRunRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
