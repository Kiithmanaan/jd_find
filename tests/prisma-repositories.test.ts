import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaLikeClient } from "../src/infrastructure/prisma/prisma-repositories.js";
import {
  PrismaJobProfileRepository,
  PrismaSearchRunRepository,
} from "../src/infrastructure/prisma/prisma-repositories.js";
import {
  acquireCandidateResults,
  createSearchRun,
  startSearchRun,
} from "../src/domain/search-run.js";
import { createCandidateDrafts, createConfirmedJobProfile } from "./fixtures.js";

test("PrismaJobProfileRepository 使用 upsert 保存并还原领域对象", async () => {
  const jobProfile = createConfirmedJobProfile();
  let capturedArgs: unknown;
  const prisma = {
    jobProfileRecord: {
      upsert: async (args: unknown) => {
        capturedArgs = args;
        return {
          id: jobProfile.id,
          title: jobProfile.title,
          jdText: jobProfile.jdText,
          status: jobProfile.status,
          currentVersionId: jobProfile.currentVersionId ?? null,
          searchCondition: jobProfile.searchCondition,
          hardRequirements: jobProfile.hardRequirements,
          softRequirements: jobProfile.softRequirements,
          confirmedAt: jobProfile.confirmedAt ?? null,
        };
      },
      findUnique: async () => null,
    },
    searchRunRecord: {
      upsert: async () => null,
      findUnique: async () => null,
    },
  } as unknown as PrismaLikeClient;

  const repository = new PrismaJobProfileRepository(prisma);
  const saved = await repository.save(jobProfile);

  assert.equal(saved.id, "job-1");
  assert.equal((capturedArgs as { where: { id: string } }).where.id, "job-1");
});

test("PrismaSearchRunRepository 使用 upsert 保存 SearchRun 聚合", async () => {
  const jobProfile = createConfirmedJobProfile();
  let searchRun = createSearchRun(jobProfile, "prisma-run-1", {
    targetResultCount: undefined,
    ownerId: undefined,
  });
  searchRun = startSearchRun(searchRun);
  searchRun = acquireCandidateResults(searchRun, jobProfile, createCandidateDrafts().slice(0, 1));

  let capturedArgs: unknown;
  const prisma = {
    jobProfileRecord: {
      upsert: async () => null,
      findUnique: async () => null,
    },
    jobProfileVersionRecord: {
      upsert: async () => null,
      findUnique: async () => null,
      findFirst: async () => null,
    },
    hardConditionDimensionRecord: {
      findMany: async () => [],
    },
    hardConditionOptionRecord: {
      findMany: async () => [],
    },
    searchRunRecord: {
      upsert: async (args: unknown) => {
        capturedArgs = args;
        return {
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
          events: searchRun.events.map((event) => ({
            type: event.type,
            sequence: searchRun.events.indexOf(event) + 1,
            occurredAt: event.occurredAt,
            reason: event.reason ?? null,
            metadata: event.metadata ?? null,
          })),
        };
      },
      findUnique: async () => null,
    },
  } as unknown as PrismaLikeClient;

  const repository = new PrismaSearchRunRepository(prisma);
  const saved = await repository.save(searchRun);

  assert.equal(saved.id, "prisma-run-1");
  assert.equal(saved.candidates.length, 1);
  assert.equal((capturedArgs as { include: { candidates: boolean; events: boolean } }).include.candidates, true);
});
