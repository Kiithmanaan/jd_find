import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { DomainError } from "../src/domain/errors.js";
import { createSearchRun, startSearchRun } from "../src/domain/search-run.js";
import { normalizeSourceAcquisitionResult } from "../src/domain/source-adapter-contract.js";
import { CsvSourceAdapter, parseCandidateDraftCsv } from "../src/infrastructure/csv/csv-source-adapter.js";
import { MockAIAssessment } from "../src/infrastructure/mock/mock-ai-assessment.js";
import { SearchOrchestrator } from "../src/application/search-orchestrator.js";
import { createConfirmedJobProfile } from "./fixtures.js";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url)).includes("/dist/")
  ? join(fileURLToPath(new URL("..", import.meta.url)).split("/dist/")[0]!)
  : fileURLToPath(new URL("..", import.meta.url));
const fixturePath = join(workspaceRoot, "tests", "fixtures", "candidates.csv");

test("CSV parser 将候选人文件映射为 CandidateDraft", () => {
  const csv = [
    "fingerprint,name,title,city,educationLevel,yearsOfExperience,industries,keywords,summary,intent,activityLevel,platform,sourceUrl,searchContext,fallbackClues",
    'quoted,候选人,顾问,上海,本科,7,"企业服务;SaaS","解决方案;客户成功","包含,逗号的摘要",高,中,CSVPlatform,https://example.test/quoted,搜索上下文,"候选人;顾问"',
  ].join("\n");

  const candidates = parseCandidateDraftCsv(csv);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.resume.summary, "包含,逗号的摘要");
  assert.deepEqual(candidates[0]?.resume.industries, ["企业服务", "SaaS"]);
  assert.deepEqual(candidates[0]?.sourceLead.fallbackClues, ["候选人", "顾问"]);
});

test("CSV parser 拒绝缺失必需表头", () => {
  assert.throws(
    () => parseCandidateDraftCsv("fingerprint,name\ncandidate,name"),
    DomainError,
  );
});

test("CSV parser 拒绝非法工作年限", () => {
  const csv = [
    "fingerprint,name,title,city,educationLevel,yearsOfExperience,industries,keywords,summary,intent,activityLevel,platform,sourceUrl,searchContext,fallbackClues",
    "bad-years,候选人,顾问,上海,本科,abc,企业服务,解决方案,摘要,高,中,CSVPlatform,https://example.test/bad,搜索上下文,候选人",
  ].join("\n");

  assert.throws(() => parseCandidateDraftCsv(csv), DomainError);
});

test("CsvSourceAdapter 复用 SourceLead 契约，拒绝无 URL 且无辅助线索", async () => {
  const csv = [
    "fingerprint,name,title,city,educationLevel,yearsOfExperience,industries,keywords,summary,intent,activityLevel,platform,sourceUrl,searchContext,fallbackClues",
    "no-lead,候选人,顾问,上海,本科,5,企业服务,解决方案,摘要,高,中,CSVPlatform,,搜索上下文,",
  ].join("\n");
  assert.throws(() => {
    const candidates = parseCandidateDraftCsv(csv);
    normalizeSourceAcquisitionResult({ candidates });
  }, DomainError);
});

test("CsvSourceAdapter 从文件读取候选人并走一次性寻访闭环", async () => {
  const jobProfile = createConfirmedJobProfile();
  const adapter = new CsvSourceAdapter({ filePath: fixturePath });
  const searchRun = startSearchRun(createSearchRun(jobProfile, "csv-source-run"));
  const acquisition = await adapter.acquireCandidates(jobProfile, searchRun);

  assert.equal(acquisition.candidates.length, 2);
  assert.equal(acquisition.candidates[1]?.sourceLead.url, undefined);
  assert.ok(acquisition.candidates[1]?.sourceLead.fallbackClues.length);

  const orchestrator = new SearchOrchestrator({
    sourceAdapter: adapter,
    aiAssessment: new MockAIAssessment(),
    idGenerator: () => "csv-orchestrated-run",
  });
  const completed = await orchestrator.runOneTimeSearch(jobProfile);

  assert.equal(completed.status, "Completed");
  assert.equal(completed.candidates.length, 2);
});
