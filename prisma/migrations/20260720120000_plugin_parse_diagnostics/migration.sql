-- 原始载荷解析诊断（docs/30 §4c）：每个插件批次的服务端解析统计与字段名普查
CREATE TABLE "PluginParseDiagnosticsRecord" (
    "id" TEXT NOT NULL,
    "searchRunId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "mappingVersion" TEXT NOT NULL,
    "captureVersion" TEXT,
    "geeksExtracted" INTEGER NOT NULL,
    "draftsParsed" INTEGER NOT NULL,
    "rejected" INTEGER NOT NULL,
    "rejectedReasons" JSONB NOT NULL,
    "keyCensus" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginParseDiagnosticsRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PluginParseDiagnosticsRecord_searchRunId_batchId_key" ON "PluginParseDiagnosticsRecord"("searchRunId", "batchId");

CREATE INDEX "PluginParseDiagnosticsRecord_searchRunId_idx" ON "PluginParseDiagnosticsRecord"("searchRunId");

ALTER TABLE "PluginParseDiagnosticsRecord" ADD CONSTRAINT "PluginParseDiagnosticsRecord_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRunRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
