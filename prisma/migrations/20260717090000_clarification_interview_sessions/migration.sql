-- 澄清访谈会话：七组话题问答（turns 内嵌 AI 调用元数据即审计）与画像草稿产出
CREATE TABLE "ClarificationInterviewSessionRecord" (
    "id" TEXT NOT NULL,
    "jobProfileId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "status" TEXT NOT NULL,
    "currentTopicIndex" INTEGER NOT NULL DEFAULT 0,
    "turns" JSONB NOT NULL,
    "draftOutput" JSONB,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ClarificationInterviewSessionRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClarificationInterviewSessionRecord_jobProfileId_status_idx" ON "ClarificationInterviewSessionRecord"("jobProfileId", "status");

ALTER TABLE "ClarificationInterviewSessionRecord" ADD CONSTRAINT "ClarificationInterviewSessionRecord_jobProfileId_fkey" FOREIGN KEY ("jobProfileId") REFERENCES "JobProfileRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
