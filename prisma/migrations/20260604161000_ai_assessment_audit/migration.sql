-- CreateTable
CREATE TABLE "AIAssessmentAuditRecord" (
    "id" TEXT NOT NULL,
    "searchRunId" TEXT NOT NULL,
    "jobProfileId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "candidateIds" JSONB NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "outputSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIAssessmentAuditRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIAssessmentAuditRecord_searchRunId_idx" ON "AIAssessmentAuditRecord"("searchRunId");

-- CreateIndex
CREATE INDEX "AIAssessmentAuditRecord_jobProfileId_idx" ON "AIAssessmentAuditRecord"("jobProfileId");

-- CreateIndex
CREATE INDEX "AIAssessmentAuditRecord_provider_model_idx" ON "AIAssessmentAuditRecord"("provider", "model");

-- AddForeignKey
ALTER TABLE "AIAssessmentAuditRecord" ADD CONSTRAINT "AIAssessmentAuditRecord_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRunRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
