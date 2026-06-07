import type {
  CandidateResult,
  HardConditionRule,
  HardConditionRuleCondition,
  HardRequirement,
  HardRequirementPredicate,
} from "./types.js";

export interface HardFilterResult {
  passed: boolean;
  reasons: string[];
}

export function evaluateHardRequirements(
  candidate: CandidateResult,
  requirements: HardRequirement[],
): HardFilterResult {
  const configuredRuleSets = requirements.filter(
    (requirement) => requirement.predicate.type === "hardConditionRuleSet",
  );
  if (configuredRuleSets.length > 0) {
    return evaluateConfiguredHardRequirements(candidate, configuredRuleSets);
  }

  const reasons = requirements
    .filter((requirement) => !matchesPredicate(candidate, requirement.predicate))
    .map((requirement) => `未满足硬性条件：${requirement.label}`);

  return {
    passed: reasons.length === 0,
    reasons,
  };
}

function evaluateConfiguredHardRequirements(
  candidate: CandidateResult,
  requirements: HardRequirement[],
): HardFilterResult {
  for (const requirement of requirements) {
    if (requirement.predicate.type !== "hardConditionRuleSet") {
      continue;
    }

    const eliminationRule = requirement.predicate.eliminationRules.find((rule) => matchesRule(candidate, rule));
    if (eliminationRule) {
      return {
        passed: false,
        reasons: [`命中淘汰规则：${eliminationRule.label}`],
      };
    }

    const passRule = requirement.predicate.passRules.find((rule) => matchesRule(candidate, rule));
    if (passRule) {
      return {
        passed: true,
        reasons: [],
      };
    }
  }

  return {
    passed: false,
    reasons: ["未命中合格规则"],
  };
}

function matchesPredicate(candidate: CandidateResult, predicate: HardRequirementPredicate): boolean {
  switch (predicate.type) {
    case "minYearsOfExperience":
      return candidate.resume.yearsOfExperience >= predicate.value;
    case "educationIn":
      return predicate.values.includes(candidate.resume.educationLevel);
    case "keywordAny":
      return predicate.values.some((keyword) => candidate.resume.keywords.includes(keyword));
    case "industryIn":
      return predicate.values.some((industry) => candidate.resume.industries.includes(industry));
    case "hardConditionRuleSet":
      return evaluateConfiguredHardRequirements(candidate, [
        {
          key: "configured",
          label: "配置硬筛",
          weight: 0,
          predicate,
        },
      ]).passed;
  }
}

function matchesRule(candidate: CandidateResult, rule: HardConditionRule): boolean {
  const results = rule.conditions.map((condition) => matchesCondition(candidate, condition));
  return rule.mode === "AND" ? results.every(Boolean) : results.some(Boolean);
}

function matchesCondition(candidate: CandidateResult, condition: HardConditionRuleCondition): boolean {
  switch (condition.field) {
    case "keyword":
      return condition.values.some((value) =>
        normalizedIncludes(candidate.resume.summary, value) ||
        candidate.resume.keywords.some((keyword) => normalizedEqualsOrIncludes(keyword, value)),
      );
    case "city":
      return matchesOptionValue(candidate.resume.city, condition);
    case "industry":
      return candidate.resume.industries.some((industry) => matchesOptionValue(industry, condition));
    case "education":
      return matchesEducationRank(candidate.resume.educationLevel, condition);
    case "yearsOfExperience":
      return typeof condition.numericValue === "number" && candidate.resume.yearsOfExperience >= condition.numericValue;
  }
}

function matchesOptionValue(actual: string, condition: HardConditionRuleCondition): boolean {
  return [...condition.values, ...condition.aliases].some((value) => normalizeText(actual) === normalizeText(value));
}

function matchesEducationRank(actual: string, condition: HardConditionRuleCondition): boolean {
  const actualRank = inferEducationRank(actual);
  if (!condition.rank || !actualRank) {
    return matchesOptionValue(actual, condition);
  }

  return actualRank >= condition.rank;
}

function inferEducationRank(value: string): number | undefined {
  const normalized = normalizeText(value);
  if (["博士", "博士研究生"].some((item) => normalizeText(item) === normalized)) {
    return 4;
  }
  if (["硕士", "研究生"].some((item) => normalizeText(item) === normalized)) {
    return 3;
  }
  if (["本科", "学士"].some((item) => normalizeText(item) === normalized)) {
    return 2;
  }
  if (["大专", "专科"].some((item) => normalizeText(item) === normalized)) {
    return 1;
  }

  return undefined;
}

function normalizedEqualsOrIncludes(actual: string, expected: string): boolean {
  return normalizeText(actual).includes(normalizeText(expected));
}

function normalizedIncludes(actual: string, expected: string): boolean {
  return normalizeText(actual).includes(normalizeText(expected));
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}
