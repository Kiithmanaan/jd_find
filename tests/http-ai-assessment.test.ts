import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../src/domain/errors.js";
import { parseHttpAIAssessmentResponse, HttpAIAssessment } from "../src/infrastructure/http/http-ai-assessment.js";
import {
  acquireCandidateResults,
  applyHardFilter,
  createSearchRun,
  deduplicateWithinSearchRun,
  startSearchRun,
} from "../src/domain/search-run.js";
import { createCandidateDrafts, createConfirmedJobProfile } from "./fixtures.js";

test("parseHttpAIAssessmentResponse maps assessments array", () => {
  const parsed = parseHttpAIAssessmentResponse({
    assessments: [
      {
        candidateId: "candidate-1",
        score: 88,
        fitPoints: ["匹配岗位画像"],
        riskPoints: ["需要人工确认"],
      },
    ],
  });

  assert.equal(parsed.get("candidate-1")?.score, 88);
});

test("parseHttpAIAssessmentResponse rejects invalid response shape", () => {
  assert.throws(() => parseHttpAIAssessmentResponse({}), DomainError);
  assert.throws(
    () =>
      parseHttpAIAssessmentResponse({
        assessments: [{ candidateId: "candidate-1", score: "88", fitPoints: [], riskPoints: [] }],
      }),
    DomainError,
  );
});

test("HttpAIAssessment posts job profile and candidates to endpoint", async () => {
  let requestBody: unknown;
  let authorization: string | undefined;
  const fetchFn = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    authorization = init?.headers
      ? (init.headers as Record<string, string>).authorization
      : undefined;
    requestBody = JSON.parse(String(init?.body));

    return new Response(
      JSON.stringify({
        assessments: [
          {
            candidateId: "http-run-candidate-1",
            score: 86,
            fitPoints: ["具备客户理解能力"],
            riskPoints: ["需要人工确认意向"],
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const jobProfile = createConfirmedJobProfile();
  let searchRun = startSearchRun(createSearchRun(jobProfile, "http-run"));
  searchRun = acquireCandidateResults(searchRun, jobProfile, createCandidateDrafts().slice(0, 1));
  searchRun = deduplicateWithinSearchRun(searchRun);
  searchRun = applyHardFilter(searchRun, jobProfile);
  const hardPassedCandidates = searchRun.candidates.filter(
    (candidate) => candidate.status === "HardPassed",
  );

  const adapter = new HttpAIAssessment({
    endpoint: "https://ai.example.test/assess",
    apiKey: "test-key",
    providerName: "test-http",
    modelName: "test-model",
    fetchFn: fetchFn as typeof fetch,
  });
  const assessments = await adapter.assessCandidates(jobProfile, hardPassedCandidates);

  assert.equal(adapter.providerName, "test-http");
  assert.equal(adapter.modelName, "test-model");
  assert.equal(authorization, "Bearer test-key");
  assert.equal((requestBody as { jobProfile: { id: string } }).jobProfile.id, "job-1");
  assert.equal((requestBody as { candidates: unknown[] }).candidates.length, 1);
  assert.equal(assessments.get("http-run-candidate-1")?.score, 86);
});

test("HttpAIAssessment turns non-2xx responses into DomainError", async () => {
  const adapter = new HttpAIAssessment({
    endpoint: "https://ai.example.test/assess",
    fetchFn: (async () => new Response("failed", { status: 500 })) as typeof fetch,
  });
  await assert.rejects(
    () => adapter.assessCandidates(createConfirmedJobProfile(), createHardPassedCandidates()),
    DomainError,
  );
});

function createHardPassedCandidates() {
  const jobProfile = createConfirmedJobProfile();
  let searchRun = startSearchRun(createSearchRun(jobProfile, "http-error-run"));
  searchRun = acquireCandidateResults(searchRun, jobProfile, createCandidateDrafts().slice(0, 1));
  searchRun = deduplicateWithinSearchRun(searchRun);
  searchRun = applyHardFilter(searchRun, jobProfile);
  return searchRun.candidates.filter((candidate) => candidate.status === "HardPassed");
}
