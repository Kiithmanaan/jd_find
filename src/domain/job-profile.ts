import { DomainError } from "./errors.js";
import type { JobProfile } from "./types.js";

export function confirmJobProfile(jobProfile: JobProfile): JobProfile {
  if (jobProfile.status === "Archived") {
    throw new DomainError("Archived job profiles cannot be confirmed.");
  }

  if (jobProfile.searchCondition.keywords.length === 0) {
    throw new DomainError("Search condition keywords must be confirmed before search.");
  }

  if (jobProfile.hardRequirements.length === 0) {
    throw new DomainError("At least one hard requirement must be confirmed before search.");
  }

  if (jobProfile.softRequirements.length === 0) {
    throw new DomainError("At least one soft requirement must be confirmed before search.");
  }

  return {
    ...jobProfile,
    status: "Confirmed",
    confirmedAt: new Date(),
  };
}

export function assertJobProfileConfirmed(jobProfile: JobProfile): void {
  if (jobProfile.status !== "Confirmed") {
    throw new DomainError("Job profile must be confirmed before starting a search run.");
  }
}
