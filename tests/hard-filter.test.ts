import assert from "node:assert/strict";
import test from "node:test";
import { evaluateHardRequirements } from "../src/domain/hard-filter.js";
import type { HardRequirement } from "../src/domain/types.js";
import { createCandidateDrafts, createConfirmedJobProfile } from "./fixtures.js";

test("配置驱动硬筛先执行淘汰规则，再执行合格规则", () => {
  const jobProfile = createConfirmedJobProfile();
  const candidate = {
    id: "candidate-1",
    fingerprint: "candidate-1",
    jobProfileId: jobProfile.id,
    searchRunId: "run-1",
    status: "Deduplicated" as const,
    resume: createCandidateDrafts()[0]!.resume,
    intent: "高",
    activityLevel: "高",
    sourceLead: createCandidateDrafts()[0]!.sourceLead,
    hardRejectReasons: [],
  };
  const result = evaluateHardRequirements(candidate, [createConfiguredHardRequirement()]);

  assert.equal(result.passed, true);
  assert.deepEqual(result.reasons, []);

  const eliminated = evaluateHardRequirements(
    {
      ...candidate,
      resume: {
        ...candidate.resume,
        city: "杭州",
      },
    },
    [createConfiguredHardRequirement()],
  );

  assert.equal(eliminated.passed, false);
  assert.deepEqual(eliminated.reasons, ["命中淘汰规则：城市不匹配"]);
});

function createConfiguredHardRequirement(): HardRequirement {
  return {
    key: "configured-hard-filter",
    label: "配置硬筛",
    weight: 100,
    predicate: {
      type: "hardConditionRuleSet",
      eliminationRules: [
        {
          id: "eliminate-city",
          label: "城市不匹配",
          mode: "AND",
          conditions: [
            {
              field: "city",
              operator: "optionAny",
              values: ["杭州"],
              aliases: [],
            },
          ],
        },
      ],
      passRules: [
        {
          id: "pass-main",
          label: "上海企业服务本科5年",
          mode: "AND",
          conditions: [
            {
              field: "keyword",
              operator: "normalizedContainsAny",
              values: ["复杂项目推动"],
              aliases: [],
            },
            {
              field: "city",
              operator: "optionAny",
              values: ["上海"],
              aliases: ["上海市"],
            },
            {
              field: "industry",
              operator: "optionAny",
              values: ["企业服务"],
              aliases: ["ToB"],
            },
            {
              field: "education",
              operator: "rankAtLeast",
              values: ["本科"],
              aliases: ["学士"],
              rank: 2,
            },
            {
              field: "yearsOfExperience",
              operator: "min",
              values: [],
              aliases: [],
              numericValue: 5,
            },
          ],
        },
      ],
    },
  };
}
