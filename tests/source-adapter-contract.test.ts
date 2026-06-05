import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../src/domain/errors.js";
import { normalizeSourceAcquisitionResult } from "../src/domain/source-adapter-contract.js";
import { MockSourceAdapter } from "../src/infrastructure/mock/mock-source-adapter.js";
import { createCandidateDrafts, createConfirmedJobProfile } from "./fixtures.js";
import { createSearchRun, startSearchRun } from "../src/domain/search-run.js";

test("来源协议在风控信号存在时清空候选人，保证风控优先", () => {
  const result = normalizeSourceAcquisitionResult({
    candidates: createCandidateDrafts(),
    riskSignal: {
      type: "captcha",
      reason: " 出现验证码 ",
    },
  });

  assert.equal(result.candidates.length, 0);
  assert.equal(result.riskSignal?.type, "captcha");
});

test("来源协议允许无直接 URL 但具备辅助找回线索的 SourceLead", () => {
  const [candidate] = createCandidateDrafts();
  const result = normalizeSourceAcquisitionResult({
    candidates: [
      {
        ...candidate!,
        sourceLead: {
          ...candidate!.sourceLead,
          url: undefined,
          fallbackClues: [" 候选人A ", " 企业服务 "],
        },
      },
    ],
  });

  assert.equal(result.candidates[0]?.sourceLead.url, undefined);
  assert.deepEqual(result.candidates[0]?.sourceLead.fallbackClues, ["候选人A", "企业服务"]);
});

test("来源协议拒绝既无 URL 又无辅助找回线索的 SourceLead", () => {
  const [candidate] = createCandidateDrafts();

  assert.throws(
    () =>
      normalizeSourceAcquisitionResult({
        candidates: [
          {
            ...candidate!,
            sourceLead: {
              ...candidate!.sourceLead,
              url: undefined,
              fallbackClues: [" "],
            },
          },
        ],
      }),
    DomainError,
  );
});

test("MockSourceAdapter 通过来源协议规范化候选人草稿", async () => {
  const [candidate] = createCandidateDrafts();
  const adapter = new MockSourceAdapter({
    candidates: [
      {
        ...candidate!,
        fingerprint: " candidate-a ",
        intent: " 高 ",
        activityLevel: " 低 ",
        sourceLead: {
          ...candidate!.sourceLead,
          searchContext: " 关键词：解决方案 ",
          fallbackClues: [" 上海 ", ""],
        },
      },
    ],
  });
  const jobProfile = createConfirmedJobProfile();
  const searchRun = startSearchRun(createSearchRun(jobProfile, "source-contract-run"));

  const result = await adapter.acquireCandidates(jobProfile, searchRun);

  assert.equal(result.candidates[0]?.fingerprint, "candidate-a");
  assert.equal(result.candidates[0]?.intent, "高");
  assert.equal(result.candidates[0]?.sourceLead.searchContext, "关键词：解决方案");
  assert.deepEqual(result.candidates[0]?.sourceLead.fallbackClues, ["上海"]);
});
