import type { Prisma } from "@prisma/client";
import type {
  CandidateResult,
  JobProfile,
  JobProfileVersion,
  SearchEvent,
  SearchRun,
} from "../../domain/types.js";

export type JobProfilePersistenceRecord = {
  id: string;
  title: string;
  jdText: string;
  status: JobProfile["status"];
  currentVersionId: string | null;
  searchCondition: Prisma.JsonValue;
  hardRequirements: Prisma.JsonValue;
  softRequirements: Prisma.JsonValue;
  confirmedAt: Date | null;
};

export type JobProfileVersionPersistenceRecord = {
  id: string;
  jobProfileId: string;
  version: number;
  title: string;
  jdText: string;
  searchCondition: Prisma.JsonValue;
  hardRequirements: Prisma.JsonValue;
  softRequirements: Prisma.JsonValue;
  status: JobProfileVersion["status"];
  createdAt: Date;
  confirmedAt: Date | null;
};

export type SearchRunPersistenceRecord = {
  id: string;
  jobProfileId: string;
  jobProfileVersionId: string;
  status: SearchRun["status"];
  targetResultCount: number;
  interruptedReason: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  candidates: CandidateResultPersistenceRecord[];
  events: SearchEventPersistenceRecord[];
};

export type CandidateResultPersistenceRecord = {
  id: string;
  fingerprint: string;
  jobProfileId: string;
  searchRunId: string;
  status: CandidateResult["status"];
  resume: Prisma.JsonValue;
  intent: string;
  activityLevel: string;
  sourceLead: Prisma.JsonValue;
  hardRejectReasons: Prisma.JsonValue;
  matchAssessment: Prisma.JsonValue | null;
};

export type SearchEventPersistenceRecord = {
  type: SearchEvent["type"];
  sequence: number;
  occurredAt: Date;
  reason: string | null;
  metadata: Prisma.JsonValue | null;
};

export function toJobProfileCreateInput(jobProfile: JobProfile): Prisma.JobProfileRecordCreateInput {
  return {
    id: jobProfile.id,
    title: jobProfile.title,
    jdText: jobProfile.jdText,
    status: jobProfile.status,
    currentVersionId: jobProfile.currentVersionId ?? null,
    searchCondition: toJsonInput(jobProfile.searchCondition),
    hardRequirements: toJsonInput(jobProfile.hardRequirements),
    softRequirements: toJsonInput(jobProfile.softRequirements),
    confirmedAt: jobProfile.confirmedAt ?? null,
  };
}

export function toJobProfileUpdateInput(jobProfile: JobProfile): Prisma.JobProfileRecordUpdateInput {
  return {
    title: jobProfile.title,
    jdText: jobProfile.jdText,
    status: jobProfile.status,
    currentVersionId: jobProfile.currentVersionId ?? null,
    searchCondition: toJsonInput(jobProfile.searchCondition),
    hardRequirements: toJsonInput(jobProfile.hardRequirements),
    softRequirements: toJsonInput(jobProfile.softRequirements),
    confirmedAt: jobProfile.confirmedAt ?? null,
  };
}

export function toJobProfileDomain(record: JobProfilePersistenceRecord): JobProfile {
  return {
    id: record.id,
    title: record.title,
    jdText: record.jdText,
    status: record.status,
    currentVersionId: record.currentVersionId ?? undefined,
    searchCondition: record.searchCondition as unknown as JobProfile["searchCondition"],
    hardRequirements: record.hardRequirements as unknown as JobProfile["hardRequirements"],
    softRequirements: record.softRequirements as unknown as JobProfile["softRequirements"],
    confirmedAt: record.confirmedAt ?? undefined,
  };
}

export function toJobProfileVersionCreateInput(
  version: JobProfileVersion,
): Prisma.JobProfileVersionRecordCreateInput {
  return {
    id: version.id,
    jobProfile: {
      connect: {
        id: version.jobProfileId,
      },
    },
    version: version.version,
    title: version.title,
    jdText: version.jdText,
    searchCondition: toJsonInput(version.searchCondition),
    hardRequirements: toJsonInput(version.hardRequirements),
    softRequirements: toJsonInput(version.softRequirements),
    status: version.status,
    createdAt: version.createdAt,
    confirmedAt: version.confirmedAt ?? null,
  };
}

export function toJobProfileVersionUpdateInput(
  version: JobProfileVersion,
): Prisma.JobProfileVersionRecordUpdateInput {
  return {
    version: version.version,
    title: version.title,
    jdText: version.jdText,
    searchCondition: toJsonInput(version.searchCondition),
    hardRequirements: toJsonInput(version.hardRequirements),
    softRequirements: toJsonInput(version.softRequirements),
    status: version.status,
    createdAt: version.createdAt,
    confirmedAt: version.confirmedAt ?? null,
  };
}

export function toJobProfileVersionDomain(record: JobProfileVersionPersistenceRecord): JobProfileVersion {
  return {
    id: record.id,
    jobProfileId: record.jobProfileId,
    version: record.version,
    title: record.title,
    jdText: record.jdText,
    searchCondition: record.searchCondition as unknown as JobProfileVersion["searchCondition"],
    hardRequirements: record.hardRequirements as unknown as JobProfileVersion["hardRequirements"],
    softRequirements: record.softRequirements as unknown as JobProfileVersion["softRequirements"],
    status: record.status,
    createdAt: record.createdAt,
    confirmedAt: record.confirmedAt ?? undefined,
  };
}

export function toSearchRunDomain(record: SearchRunPersistenceRecord): SearchRun {
  return {
    id: record.id,
    jobProfileId: record.jobProfileId,
    jobProfileVersionId: record.jobProfileVersionId,
    status: record.status,
    targetResultCount: record.targetResultCount,
    interruptedReason: record.interruptedReason ?? undefined,
    failureReason: record.failureReason ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    candidates: record.candidates.map(toCandidateResultDomain),
    events: record.events
      .sort((left, right) => left.sequence - right.sequence)
      .map(toSearchEventDomain),
  };
}

export function toSearchRunCreateInput(searchRun: SearchRun): Prisma.SearchRunRecordCreateInput {
  return {
    id: searchRun.id,
    jobProfile: {
      connect: {
        id: searchRun.jobProfileId,
      },
    },
    jobProfileVersion: {
      connect: {
        id: searchRun.jobProfileVersionId,
      },
    },
    status: searchRun.status,
    targetResultCount: searchRun.targetResultCount,
    interruptedReason: searchRun.interruptedReason ?? null,
    failureReason: searchRun.failureReason ?? null,
    createdAt: searchRun.createdAt,
    updatedAt: searchRun.updatedAt,
    candidates: {
      create: searchRun.candidates.map(toCandidateResultCreateWithoutSearchRunInput),
    },
    events: {
      create: searchRun.events.map(toSearchEventCreateWithoutSearchRunInput),
    },
  };
}

export function toSearchRunUpdateInput(searchRun: SearchRun): Prisma.SearchRunRecordUpdateInput {
  return {
    status: searchRun.status,
    jobProfileVersion: {
      connect: {
        id: searchRun.jobProfileVersionId,
      },
    },
    targetResultCount: searchRun.targetResultCount,
    interruptedReason: searchRun.interruptedReason ?? null,
    failureReason: searchRun.failureReason ?? null,
    createdAt: searchRun.createdAt,
    updatedAt: searchRun.updatedAt,
    candidates: {
      deleteMany: {},
      create: searchRun.candidates.map(toCandidateResultCreateWithoutSearchRunInput),
    },
    events: {
      deleteMany: {},
      create: searchRun.events.map(toSearchEventCreateWithoutSearchRunInput),
    },
  };
}

function toCandidateResultDomain(record: CandidateResultPersistenceRecord): CandidateResult {
  return {
    id: record.id,
    fingerprint: record.fingerprint,
    jobProfileId: record.jobProfileId,
    searchRunId: record.searchRunId,
    status: record.status,
    resume: record.resume as unknown as CandidateResult["resume"],
    intent: record.intent,
    activityLevel: record.activityLevel,
    sourceLead: record.sourceLead as unknown as CandidateResult["sourceLead"],
    hardRejectReasons: record.hardRejectReasons as unknown as string[],
    matchAssessment:
      (record.matchAssessment as unknown as CandidateResult["matchAssessment"] | null) ?? undefined,
  };
}

function toCandidateResultCreateWithoutSearchRunInput(
  candidate: CandidateResult,
): Prisma.CandidateResultRecordCreateWithoutSearchRunInput {
  return {
    id: candidate.id,
    fingerprint: candidate.fingerprint,
    jobProfileId: candidate.jobProfileId,
    status: candidate.status,
    resume: toJsonInput(candidate.resume),
    intent: candidate.intent,
    activityLevel: candidate.activityLevel,
    sourceLead: toJsonInput(candidate.sourceLead),
    hardRejectReasons: toJsonInput(candidate.hardRejectReasons),
    matchAssessment: candidate.matchAssessment ? toJsonInput(candidate.matchAssessment) : undefined,
  };
}

function toSearchEventDomain(record: SearchEventPersistenceRecord): SearchEvent {
  return {
    type: record.type,
    occurredAt: record.occurredAt,
    reason: record.reason ?? undefined,
    metadata: (record.metadata as unknown as SearchEvent["metadata"] | null) ?? undefined,
  };
}

function toSearchEventCreateWithoutSearchRunInput(
  event: SearchEvent,
  index: number,
): Prisma.SearchEventRecordCreateWithoutSearchRunInput {
  return {
    type: event.type,
    sequence: index + 1,
    occurredAt: event.occurredAt,
    reason: event.reason ?? null,
    metadata: event.metadata ? toJsonInput(event.metadata) : undefined,
  };
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
