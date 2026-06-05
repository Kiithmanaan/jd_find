import type { CandidateResult, HardRequirement, HardRequirementPredicate } from "./types.js";

export interface HardFilterResult {
  passed: boolean;
  reasons: string[];
}

export function evaluateHardRequirements(
  candidate: CandidateResult,
  requirements: HardRequirement[],
): HardFilterResult {
  const reasons = requirements
    .filter((requirement) => !matchesPredicate(candidate, requirement.predicate))
    .map((requirement) => `未满足硬性条件：${requirement.label}`);

  return {
    passed: reasons.length === 0,
    reasons,
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
  }
}
