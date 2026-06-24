import assert from "node:assert/strict";
import test from "node:test";
import { PrismaAIAssessmentAuditSink } from "../src/infrastructure/prisma/prisma-ai-assessment-audit-sink.js";
import type { PrismaAIAssessmentAuditClient } from "../src/infrastructure/prisma/prisma-ai-assessment-audit-sink.js";
import { createMatchAssessment } from "./fixtures.js";

test("PrismaAIAssessmentAuditSink writes audit snapshots", async () => {
  let capturedArgs: unknown;
  const sink = new PrismaAIAssessmentAuditSink({
    aIAssessmentAuditRecord: {
      create: async (args: unknown) => {
        capturedArgs = args;
      },
      findMany: async () => [],
    },
  } as unknown as PrismaAIAssessmentAuditClient);

  await sink.record({
    id: "audit-1",
    searchRunId: "run-1",
    jobProfileId: "job-1",
    agentType: "match-assessment",
    provider: "mock",
    model: "mock-ai-assessment-v1",
    promptVersion: "match-assessment-v1",
    agentVersion: "jd-match-assessment-v1",
    graphVersion: "match-assessment-graph-v1",
    prompt: "prompt body",
    candidateIds: ["candidate-1"],
    inputSnapshot: {
      jobProfile: {
        id: "job-1",
        title: "岗位",
        searchCondition: {
          keywords: ["解决方案"],
          cities: [],
          industries: [],
          educationLevels: [],
        },
        hardRequirements: [],
        softRequirements: [],
      },
      candidates: [],
    },
    outputSnapshot: [],
    durationMs: 12,
    status: "success",
    createdAt: new Date("2026-06-04T00:00:00.000Z"),
  });

  const data = (capturedArgs as {
    data: { id: string; provider: string; graphVersion: string; candidateIds: unknown; prompt: string; durationMs: number };
  }).data;
  assert.equal(data.id, "audit-1");
  assert.equal(data.provider, "mock");
  assert.equal(data.graphVersion, "match-assessment-graph-v1");
  assert.equal(data.prompt, "prompt body");
  assert.equal(data.durationMs, 12);
  assert.deepEqual(data.candidateIds, ["candidate-1"]);
});

test("PrismaAIAssessmentAuditSink reads audit snapshots by SearchRun", async () => {
  const sink = new PrismaAIAssessmentAuditSink({
    aIAssessmentAuditRecord: {
      create: async () => undefined,
      findMany: async (args: unknown) => {
        assert.deepEqual(args, {
          where: { searchRunId: "run-1" },
          orderBy: { createdAt: "asc" },
        });

        return [
          {
            id: "audit-1",
            searchRunId: "run-1",
            jobProfileId: "job-1",
            jobProfileVersionId: "job-1-v1",
            agentType: "match-assessment",
            provider: "mock",
            model: "mock-ai-assessment-v1",
            promptVersion: "match-assessment-v1",
            agentVersion: "jd-match-assessment-v1",
            graphVersion: "match-assessment-graph-v1",
            prompt: "prompt body",
            candidateIds: ["candidate-1"],
            inputSnapshot: {
              jobProfile: {
                id: "job-1",
                title: "岗位",
                searchCondition: {
                  keywords: ["解决方案"],
                  cities: [],
                  industries: [],
                  educationLevels: [],
                },
                hardRequirements: [],
                softRequirements: [],
              },
              candidates: [],
            },
            outputSnapshot: [
              {
                candidateId: "candidate-1",
                assessment: {
                  ...createMatchAssessment({ score: 80 }),
                  assessedAt: "2026-06-04T00:00:00.000Z",
                },
              },
            ],
            durationMs: 25,
            status: "failure",
            errorType: "DomainError",
            errorMessage: "AI failed",
            createdAt: new Date("2026-06-04T00:00:00.000Z"),
          },
        ];
      },
    },
  } as unknown as PrismaAIAssessmentAuditClient);

  const [record] = await sink.findBySearchRunId("run-1");

  assert.equal(record?.id, "audit-1");
  assert.equal(record?.prompt, "prompt body");
  assert.equal(record?.durationMs, 25);
  assert.equal(record?.graphVersion, "match-assessment-graph-v1");
  assert.equal(record?.status, "failure");
  assert.equal(record?.errorType, "DomainError");
  assert.equal(record?.outputSnapshot[0]?.assessment.assessedAt instanceof Date, true);
});
