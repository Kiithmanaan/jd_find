import assert from "node:assert/strict";
import test from "node:test";
import { reassessJobProfileCandidates } from "../src/application/reassess-job-profile-candidates.js";
import { summarizeJobProfileCandidates } from "../src/domain/candidate-summary.js";
import {
  acquireCandidateResults,
  applyHardFilter,
  applySoftAssessments,
  completeSearchRun,
  createSearchRun,
  deduplicateWithinSearchRun,
  startSearchRun,
} from "../src/domain/search-run.js";
import { InMemoryAIAssessmentAuditSink, InMemoryCandidateAssessmentRepository, InMemorySearchRunRepository } from "../src/infrastructure/memory/in-memory-repositories.js";
import { MockAIAssessment } from "../src/infrastructure/mock/mock-ai-assessment.js";
import { createCandidateDrafts, createConfirmedJobProfile, createMatchAssessment } from "./fixtures.js";

test("岗位候选人汇总按 JobProfile 跨 SearchRun 去重并区分当前版本", async () => {
  const jobProfile = {
    ...createConfirmedJobProfile(),
    currentVersionId: "job-1-v2",
  };
  const firstRun = completeSearchRun(
    applySoftAssessments(
      applyHardFilter(
        deduplicateWithinSearchRun(
          acquireCandidateResults(
            startSearchRun(createSearchRun(jobProfile, "summary-run-1", { targetResultCount: undefined, ownerId: undefined })),
            jobProfile,
            createCandidateDrafts().slice(0, 1),
          ),
        ),
        jobProfile,
      ),
      new Map([["summary-run-1-candidate-1", createMatchAssessment({ score: 70, jobProfileVersionId: "job-1-v1" })]]),
    ),
  );
  const secondRun = completeSearchRun(
    applySoftAssessments(
      applyHardFilter(
        deduplicateWithinSearchRun(
          acquireCandidateResults(
            startSearchRun(createSearchRun(jobProfile, "summary-run-2", { targetResultCount: undefined, ownerId: undefined })),
            jobProfile,
            createCandidateDrafts().slice(0, 2),
          ),
        ),
        jobProfile,
      ),
      new Map([
        ["summary-run-2-candidate-1", createMatchAssessment({ score: 95, jobProfileVersionId: "job-1-v2" })],
        ["summary-run-2-candidate-2", createMatchAssessment({ score: 80, jobProfileVersionId: "job-1-v2" })],
      ]),
    ),
  );

  const summary = summarizeJobProfileCandidates([firstRun, secondRun], "job-1-v2");

  assert.deepEqual(
    summary.currentVersionCandidates.map((candidate) => candidate.fingerprint),
    ["candidate-a", "candidate-b"],
  );
  assert.equal(summary.staleVersionCandidates.length, 0);
  assert.equal(summary.currentVersionCandidates[0]?.matchAssessment?.score, 95);
});

test("批量重新评估保留历史快照并追加版本化评估", async () => {
  const jobProfile = {
    ...createConfirmedJobProfile(),
    currentVersionId: "job-1-v2",
  };
  const searchRuns = new InMemorySearchRunRepository();
  const aiAssessmentAudit = new InMemoryAIAssessmentAuditSink();
  const candidateAssessments = new InMemoryCandidateAssessmentRepository();
  const initialRun = completeSearchRun(
    applySoftAssessments(
      applyHardFilter(
        deduplicateWithinSearchRun(
          acquireCandidateResults(
            startSearchRun(createSearchRun(jobProfile, "reassess-run-1", { targetResultCount: undefined, ownerId: undefined })),
            jobProfile,
            createCandidateDrafts().slice(0, 2),
          ),
        ),
        jobProfile,
      ),
      new Map([
        ["reassess-run-1-candidate-1", createMatchAssessment({ score: 40, jobProfileVersionId: "job-1-v1" })],
        ["reassess-run-1-candidate-2", createMatchAssessment({ score: 41, jobProfileVersionId: "job-1-v1" })],
      ]),
    ),
  );
  await searchRuns.save(initialRun);

  const result = await reassessJobProfileCandidates(jobProfile, {
    searchRuns,
    aiAssessment: new MockAIAssessment(),
    aiAssessmentAudit,
    auditIdGenerator: () => "reassess-audit-1",
    candidateAssessments,
  });

  const savedRun = await searchRuns.findById("reassess-run-1");
  const audits = await aiAssessmentAudit.findBySearchRunId("reassess-run-1");

  assert.equal(result.reassessedCount, 2);
  assert.equal(savedRun?.candidates.every((candidate) => candidate.matchAssessment?.jobProfileVersionId === "job-1-v1"), true);
  const latest = await candidateAssessments.findLatestByJobProfileVersion(jobProfile.id, "job-1-v2");
  assert.equal(latest.length, 2);
  assert.equal(latest.every((record) => record.assessment.jobProfileVersionId === "job-1-v2"), true);
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.status, "success");
});
