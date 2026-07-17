import assert from "node:assert/strict";
import test from "node:test";
import {
  MATCH_ASSESSMENT_AGENT_VERSION,
  MATCH_ASSESSMENT_PROMPT_VERSION,
  createMatchAssessmentPrompt,
} from "../src/domain/ai-assessment-contract.js";
import {
  confirmJobProfileVersion,
  createConfirmedJobProfileVersion,
  createDraftJobProfileVersion,
} from "../src/domain/job-profile.js";
import { MockAIAssessment } from "../src/infrastructure/mock/mock-ai-assessment.js";
import { LangGraphOpenAIAssessment } from "../src/infrastructure/langgraph/langgraph-openai-ai-assessment.js";
import { toJobProfileCreateInput, toJobProfileDomain, type JobProfilePersistenceRecord } from "../src/infrastructure/prisma/prisma-mappers.js";
import type { CandidateResult, JobProfile } from "../src/domain/types.js";
import { createConfirmedJobProfile } from "./fixtures.js";

function createProfileWithSignals(): JobProfile {
  return {
    ...createConfirmedJobProfile(),
    currentVersionId: "job-1-v1",
    negativeSignals: ["频繁跳槽", "经历断档"],
  };
}

function createCandidate(id: string, summary: string): CandidateResult {
  return {
    id,
    fingerprint: id,
    jobProfileId: "job-1",
    searchRunId: "run-signals",
    status: "HardPassed",
    resume: {
      name: "候选人",
      title: "解决方案顾问",
      city: "上海",
      educationLevel: "本科",
      yearsOfExperience: 8,
      industries: ["企业服务"],
      keywords: ["解决方案"],
      summary,
    },
    intent: "高",
    activityLevel: "高",
    sourceLead: {
      platform: "MockPlatform",
      url: "https://example.test/candidate",
      searchContext: "关键词：解决方案",
      fallbackClues: ["解决方案顾问"],
    },
    hardRejectReasons: [],
  };
}

test("匹配评估契约版本升级为 v2 且 prompt 注入排除信号", () => {
  assert.equal(MATCH_ASSESSMENT_PROMPT_VERSION, "match-assessment-v2");
  assert.equal(MATCH_ASSESSMENT_AGENT_VERSION, "jd-match-assessment-v2");

  const prompt = createMatchAssessmentPrompt(createProfileWithSignals(), ["candidate-1"]);
  const parsed = JSON.parse(prompt) as { jobProfile: { negativeSignals: string[] } };
  assert.deepEqual(parsed.jobProfile.negativeSignals, ["频繁跳槽", "经历断档"]);
});

test("画像版本三个拷贝函数都保留排除信号", () => {
  const jobProfile = createProfileWithSignals();

  const confirmedVersion = createConfirmedJobProfileVersion(jobProfile);
  assert.deepEqual(confirmedVersion.negativeSignals, ["频繁跳槽", "经历断档"]);

  const draftVersion = createDraftJobProfileVersion(jobProfile, "job-1-v2", 2);
  assert.deepEqual(draftVersion.negativeSignals, ["频繁跳槽", "经历断档"]);

  const changedDraft = { ...draftVersion, negativeSignals: ["方向漂移"] };
  const confirmed = confirmJobProfileVersion(jobProfile, changedDraft);
  assert.deepEqual(confirmed.jobProfile.negativeSignals, ["方向漂移"]);
  assert.deepEqual(confirmed.version.negativeSignals, ["方向漂移"]);
});

test("Mock 评估命中排除信号时追加风险点并降档", async () => {
  const jobProfile = createProfileWithSignals();
  const hitCandidate = createCandidate(
    "candidate-hit",
    "负责复杂项目推动，具备客户理解能力，但简历显示频繁跳槽。",
  );
  const cleanCandidate = createCandidate(
    "candidate-clean",
    "负责复杂项目推动，具备客户理解能力。",
  );

  const assessments = await new MockAIAssessment().assessCandidates(jobProfile, [
    hitCandidate,
    cleanCandidate,
  ]);

  const hit = assessments.get("candidate-hit");
  const clean = assessments.get("candidate-clean");

  assert.equal(clean?.recommendation, "推荐");
  assert.equal(clean?.score, 90);
  assert.equal(hit?.recommendation, "待定");
  assert.equal(hit?.score, 75);
  assert.equal(hit?.riskPoints.includes("命中排除信号：频繁跳槽"), true);
});

test("Mock 评估命中多条排除信号时风险点不超过 3 条", async () => {
  const jobProfile: JobProfile = {
    ...createProfileWithSignals(),
    negativeSignals: ["频繁跳槽", "经历断档", "方向漂移", "薪资倒挂"],
  };
  const candidate = createCandidate(
    "candidate-many-hits",
    "频繁跳槽，经历断档，方向漂移，薪资倒挂。",
  );

  const assessments = await new MockAIAssessment().assessCandidates(jobProfile, [candidate]);
  const assessment = assessments.get("candidate-many-hits");

  assert.equal(assessment?.riskPoints.length, 3);
  assert.equal(
    assessment?.riskPoints.every((point) => point.startsWith("命中排除信号：")),
    true,
  );
});

test("LangGraph 评估 prompt 注入排除信号与对照指令", async () => {
  const jobProfile = createProfileWithSignals();
  const candidate = createCandidate("candidate-langgraph", "负责复杂项目推动。");
  let capturedPrompt = "";

  const adapter = new LangGraphOpenAIAssessment({
    apiKey: "test-key",
    modelName: "test-model",
    temperature: 0,
    maxRetries: 0,
    timeoutMs: 1_000,
    structuredModel: {
      invoke: async (input: string) => {
        capturedPrompt = input;
        return {
          assessments: [
            {
              candidateId: "candidate-langgraph",
              score: 80,
              recommendation: "待定",
              recommendationReason: "命中排除信号需人工复核。",
              matchedPoints: ["具备复杂项目推动相关经历"],
              unmatchedPoints: [],
              riskPoints: ["命中排除信号：频繁跳槽"],
              trace: "根据候选人摘要和岗位画像评估。",
            },
          ],
        };
      },
    },
  });

  await adapter.assessCandidates(jobProfile, [candidate]);

  const parsed = JSON.parse(capturedPrompt) as {
    instruction: string;
    jobProfile: { negativeSignals: string[] };
  };
  assert.deepEqual(parsed.jobProfile.negativeSignals, ["频繁跳槽", "经历断档"]);
  assert.match(parsed.instruction, /排除信号/);
  assert.match(parsed.instruction, /verificationHint/);
});

test("JobProfile mapper 往返保留排除信号且历史空值回退为空数组", () => {
  const jobProfile = createProfileWithSignals();
  const input = toJobProfileCreateInput(jobProfile);
  assert.deepEqual(input.negativeSignals, ["频繁跳槽", "经历断档"]);

  const domain = toJobProfileDomain({
    ...input,
    currentVersionId: jobProfile.currentVersionId ?? null,
    confirmedAt: jobProfile.confirmedAt!,
  } as JobProfilePersistenceRecord);
  assert.deepEqual(domain.negativeSignals, ["频繁跳槽", "经历断档"]);

  const legacyDomain = toJobProfileDomain({
    ...input,
    negativeSignals: null,
    currentVersionId: null,
    confirmedAt: null,
  } as unknown as JobProfilePersistenceRecord);
  assert.deepEqual(legacyDomain.negativeSignals, []);
});
