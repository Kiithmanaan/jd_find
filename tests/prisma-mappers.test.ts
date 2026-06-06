import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import {
  toJobProfileCreateInput,
  toJobProfileDomain,
  toSearchRunCreateInput,
  toSearchRunDomain,
  type JobProfilePersistenceRecord,
  type SearchRunPersistenceRecord,
} from "../src/infrastructure/prisma/prisma-mappers.js";
import {
  acquireCandidateResults,
  applyHardFilter,
  applySoftAssessments,
  completeSearchRun,
  createSearchRun,
  deduplicateWithinSearchRun,
  startSearchRun,
} from "../src/domain/search-run.js";
import { createCandidateDrafts, createConfirmedJobProfile } from "./fixtures.js";

test("JobProfile mapper 保留画像条件和确认状态", () => {
  const jobProfile = createConfirmedJobProfile();
  const input = toJobProfileCreateInput(jobProfile);

  assert.equal(input.id, "job-1");
  assert.equal(input.status, "Confirmed");
  assert.deepEqual(input.searchCondition, jobProfile.searchCondition);

  const domain = toJobProfileDomain({
    ...input,
    currentVersionId: jobProfile.currentVersionId ?? null,
    confirmedAt: jobProfile.confirmedAt!,
  } as JobProfilePersistenceRecord);

  assert.deepEqual(domain.searchCondition, jobProfile.searchCondition);
  assert.equal(domain.status, "Confirmed");
});

test("SearchRun mapper 保留候选人、SourceLead、匹配评估和事件顺序", () => {
  const jobProfile = createConfirmedJobProfile();
  let searchRun = createSearchRun(jobProfile, "mapper-run-1");
  searchRun = startSearchRun(searchRun);
  searchRun = acquireCandidateResults(searchRun, jobProfile, createCandidateDrafts().slice(0, 1));
  searchRun = deduplicateWithinSearchRun(searchRun);
  searchRun = applyHardFilter(searchRun, jobProfile);
  searchRun = applySoftAssessments(
    searchRun,
    new Map([
      [
        searchRun.candidates[0]!.id,
        {
          score: 91,
          fitPoints: ["具备复杂项目推动相关经历"],
          riskPoints: ["需要人工确认求职意向"],
          assessedAt: new Date("2026-06-04T00:00:00.000Z"),
        },
      ],
    ]),
  );
  searchRun = completeSearchRun(searchRun);

  const input = toSearchRunCreateInput(searchRun);
  assert.equal(input.id, "mapper-run-1");
  assert.equal(input.status, "Completed");
  const candidateCreates = input.candidates?.create as Prisma.CandidateResultRecordCreateWithoutSearchRunInput[];
  const eventCreates = input.events?.create as Prisma.SearchEventRecordCreateWithoutSearchRunInput[];
  assert.equal(candidateCreates.length, 1);
  assert.equal(eventCreates.length, 6);

  const record = {
    id: searchRun.id,
    jobProfileId: searchRun.jobProfileId,
    jobProfileVersionId: searchRun.jobProfileVersionId,
    status: searchRun.status,
    targetResultCount: searchRun.targetResultCount,
    interruptedReason: null,
    failureReason: null,
    createdAt: searchRun.createdAt,
    updatedAt: searchRun.updatedAt,
    candidates: searchRun.candidates.map((candidate) => ({
      id: candidate.id,
      fingerprint: candidate.fingerprint,
      jobProfileId: candidate.jobProfileId,
      searchRunId: candidate.searchRunId,
      status: candidate.status,
      resume: candidate.resume,
      intent: candidate.intent,
      activityLevel: candidate.activityLevel,
      sourceLead: candidate.sourceLead,
      hardRejectReasons: candidate.hardRejectReasons,
      matchAssessment: candidate.matchAssessment ?? null,
    })),
    events: [...searchRun.events]
      .reverse()
      .map((event) => ({
        type: event.type,
        sequence: searchRun.events.indexOf(event) + 1,
        occurredAt: event.occurredAt,
        reason: event.reason ?? null,
        metadata: event.metadata ?? null,
      })),
  } as unknown as SearchRunPersistenceRecord;

  const domain = toSearchRunDomain(record);

  assert.equal(domain.status, "Completed");
  assert.equal(domain.candidates[0]?.sourceLead.platform, "MockPlatform");
  assert.equal(domain.candidates[0]?.matchAssessment?.score, 91);
  assert.deepEqual(
    domain.events.map((event) => event.type),
    [
      "SearchStarted",
      "CandidateResultsAcquired",
      "CandidateResultsDeduplicated",
      "HardFilterCompleted",
      "SoftMatchAssessed",
      "SearchCompleted",
    ],
  );
});
