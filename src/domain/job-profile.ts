import { DomainError } from "./errors.js";
import type { JobProfile, JobProfileVersion } from "./types.js";

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
    currentVersionId: jobProfile.currentVersionId ?? createDefaultJobProfileVersionId(jobProfile.id),
    confirmedAt: new Date(),
  };
}

export function assertJobProfileConfirmed(jobProfile: JobProfile): void {
  if (jobProfile.status !== "Confirmed") {
    throw new DomainError("Job profile must be confirmed before starting a search run.");
  }
}


export function normalizeConfirmedJobProfileVersion(jobProfile: JobProfile): JobProfile {
  if (jobProfile.status !== "Confirmed" || jobProfile.currentVersionId) {
    return jobProfile;
  }
  return {
    ...jobProfile,
    currentVersionId: createDefaultJobProfileVersionId(jobProfile.id),
  };
}
export function createDefaultJobProfileVersionId(jobProfileId: string): string {
  return `${jobProfileId}-v1`;
}

export function createConfirmedJobProfileVersion(jobProfile: JobProfile): JobProfileVersion {
  assertJobProfileConfirmed(jobProfile);

  return {
    id: jobProfile.currentVersionId ?? createDefaultJobProfileVersionId(jobProfile.id),
    jobProfileId: jobProfile.id,
    version: 1,
    title: jobProfile.title,
    jdText: jobProfile.jdText,
    searchCondition: jobProfile.searchCondition,
    hardRequirements: jobProfile.hardRequirements,
    softRequirements: jobProfile.softRequirements,
    negativeSignals: jobProfile.negativeSignals,
    status: "Confirmed",
    createdAt: jobProfile.confirmedAt ?? new Date(),
    confirmedAt: jobProfile.confirmedAt ?? new Date(),
  };
}

export function createDraftJobProfileVersion(
  jobProfile: JobProfile,
  id: string,
  version: number,
): JobProfileVersion {
  if (version < 1) {
    throw new DomainError("Job profile version number must be positive.");
  }

  return {
    id,
    jobProfileId: jobProfile.id,
    version,
    title: jobProfile.title,
    jdText: jobProfile.jdText,
    searchCondition: jobProfile.searchCondition,
    hardRequirements: jobProfile.hardRequirements,
    softRequirements: jobProfile.softRequirements,
    negativeSignals: jobProfile.negativeSignals,
    status: "Draft",
    createdAt: new Date(),
  };
}

export function confirmJobProfileVersion(
  jobProfile: JobProfile,
  version: JobProfileVersion,
): { jobProfile: JobProfile; version: JobProfileVersion } {
  if (version.jobProfileId !== jobProfile.id) {
    throw new DomainError("Job profile version does not belong to the job profile.");
  }

  const confirmedAt = new Date();
  return {
    jobProfile: {
      ...jobProfile,
      title: version.title,
      jdText: version.jdText,
      status: "Confirmed",
      currentVersionId: version.id,
      searchCondition: version.searchCondition,
      hardRequirements: version.hardRequirements,
      softRequirements: version.softRequirements,
      negativeSignals: version.negativeSignals,
      confirmedAt,
    },
    version: {
      ...version,
      status: "Confirmed",
      confirmedAt,
    },
  };
}
