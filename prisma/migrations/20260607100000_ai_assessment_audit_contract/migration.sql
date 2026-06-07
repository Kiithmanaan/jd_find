ALTER TABLE "AIAssessmentAuditRecord"
ADD COLUMN "agentType" TEXT NOT NULL DEFAULT 'match-assessment',
ADD COLUMN "promptVersion" TEXT NOT NULL DEFAULT 'match-assessment-v1',
ADD COLUMN "agentVersion" TEXT NOT NULL DEFAULT 'jd-match-assessment-v1',
ADD COLUMN "prompt" TEXT NOT NULL DEFAULT '',
ADD COLUMN "durationMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'success',
ADD COLUMN "errorType" TEXT,
ADD COLUMN "errorMessage" TEXT;
