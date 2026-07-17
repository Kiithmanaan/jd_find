-- 搜索词迭代闭环：SearchRun 完成后的搜索条件建议记录（推荐组 vs 淘汰组分析产出）
CREATE TABLE "SearchRefinementSuggestionRecord" (
    "id" TEXT NOT NULL,
    "searchRunId" TEXT NOT NULL,
    "jobProfileId" TEXT NOT NULL,
    "jobProfileVersionId" TEXT NOT NULL,
    "suggestedSearchCondition" JSONB NOT NULL,
    "addedKeywords" JSONB NOT NULL,
    "droppedKeywords" JSONB NOT NULL,
    "reasoning" TEXT NOT NULL,
    "analysisSnapshot" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchRefinementSuggestionRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SearchRefinementSuggestionRecord_searchRunId_idx" ON "SearchRefinementSuggestionRecord"("searchRunId");
CREATE INDEX "SearchRefinementSuggestionRecord_jobProfileId_idx" ON "SearchRefinementSuggestionRecord"("jobProfileId");

ALTER TABLE "SearchRefinementSuggestionRecord" ADD CONSTRAINT "SearchRefinementSuggestionRecord_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRunRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
