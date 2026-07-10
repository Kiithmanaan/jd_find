CREATE TABLE "PluginCandidateBatchRecord" (
  "id" TEXT NOT NULL,
  "searchRunId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "requestDigest" TEXT NOT NULL,
  "candidateCount" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PluginCandidateBatchRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PluginCandidateBatchRecord_searchRunId_batchId_key" ON "PluginCandidateBatchRecord"("searchRunId", "batchId");
CREATE INDEX "PluginCandidateBatchRecord_searchRunId_status_idx" ON "PluginCandidateBatchRecord"("searchRunId", "status");
ALTER TABLE "PluginCandidateBatchRecord" ADD CONSTRAINT "PluginCandidateBatchRecord_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRunRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CandidateAssessmentRecord" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "candidateFingerprint" TEXT NOT NULL,
  "searchRunId" TEXT NOT NULL,
  "jobProfileId" TEXT NOT NULL,
  "jobProfileVersionId" TEXT NOT NULL,
  "auditId" TEXT,
  "assessmentType" TEXT NOT NULL,
  "assessment" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateAssessmentRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CandidateAssessmentRecord_candidateFingerprint_jobProfileVersionId_createdAt_idx" ON "CandidateAssessmentRecord"("candidateFingerprint", "jobProfileVersionId", "createdAt");
CREATE INDEX "CandidateAssessmentRecord_searchRunId_idx" ON "CandidateAssessmentRecord"("searchRunId");
ALTER TABLE "CandidateAssessmentRecord" ADD CONSTRAINT "CandidateAssessmentRecord_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRunRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReassessmentLockRecord" (
  "id" TEXT NOT NULL,
  "jobProfileId" TEXT NOT NULL,
  "jobProfileVersionId" TEXT NOT NULL,
  "running" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReassessmentLockRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReassessmentLockRecord_jobProfileId_jobProfileVersionId_key" ON "ReassessmentLockRecord"("jobProfileId", "jobProfileVersionId");
