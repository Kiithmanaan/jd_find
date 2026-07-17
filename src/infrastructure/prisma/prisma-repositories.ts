import { Prisma, PrismaClient } from "@prisma/client";
import type {
  HardConditionConfigRepository,
  JobProfileRepository,
  JobProfileVersionRepository,
  SearchRunRepository,
  UserRepository,
  PluginCandidateBatchRepository,
  PluginBatchClaim,
  CandidateAssessmentRepository,
  ReassessmentLockRepository,
  ClarificationInterviewSessionRepository,
} from "../../application/ports.js";
import type { ClarificationInterviewSession } from "../../domain/clarification-interview.js";
import type {
  HardConditionDimension,
  HardConditionOption,
  JobProfile,
  JobProfileVersion,
  SearchRun,
  User,
  PluginCandidateBatch,
  CandidateAssessmentRecord,
} from "../../domain/types.js";
import {
  toUserCreateInput,
  toUserDomain,
  toUserUpdateInput,
  toJobProfileCreateInput,
  toJobProfileDomain,
  toJobProfileUpdateInput,
  toJobProfileVersionCreateInput,
  toJobProfileVersionDomain,
  toJobProfileVersionUpdateInput,
  toSearchRunCreateInput,
  toSearchRunDomain,
  toSearchRunUpdateInput,
  toClarificationInterviewSessionCreateInput,
  toClarificationInterviewSessionDomain,
  toClarificationInterviewSessionUpdateInput,
  type UserPersistenceRecord,
  type JobProfilePersistenceRecord,
  type JobProfileVersionPersistenceRecord,
  type SearchRunPersistenceRecord,
  type ClarificationInterviewSessionPersistenceRecord,
} from "./prisma-mappers.js";

export type PrismaLikeClient = Pick<
  PrismaClient,
  "userRecord" | "jobProfileRecord" | "jobProfileVersionRecord" | "searchRunRecord" | "hardConditionDimensionRecord" | "hardConditionOptionRecord" | "pluginCandidateBatchRecord" | "candidateAssessmentRecord" | "reassessmentLockRecord" | "clarificationInterviewSessionRecord"
>;

export class PrismaClarificationInterviewSessionRepository implements ClarificationInterviewSessionRepository {
  constructor(private readonly prisma: PrismaLikeClient) {}

  async save(session: ClarificationInterviewSession): Promise<ClarificationInterviewSession> {
    const record = await this.prisma.clarificationInterviewSessionRecord.upsert({
      where: { id: session.id },
      create: toClarificationInterviewSessionCreateInput(session),
      update: toClarificationInterviewSessionUpdateInput(session),
    });

    return toClarificationInterviewSessionDomain(record as ClarificationInterviewSessionPersistenceRecord);
  }

  async findById(id: string): Promise<ClarificationInterviewSession | undefined> {
    const record = await this.prisma.clarificationInterviewSessionRecord.findUnique({ where: { id } });
    return record
      ? toClarificationInterviewSessionDomain(record as ClarificationInterviewSessionPersistenceRecord)
      : undefined;
  }

  async findByJobProfileId(jobProfileId: string): Promise<ClarificationInterviewSession[]> {
    const records = await this.prisma.clarificationInterviewSessionRecord.findMany({
      where: { jobProfileId },
      orderBy: { createdAt: "desc" },
    });
    return records.map((record) =>
      toClarificationInterviewSessionDomain(record as ClarificationInterviewSessionPersistenceRecord),
    );
  }
}

export class PrismaReassessmentLockRepository implements ReassessmentLockRepository {
  constructor(private readonly prisma: PrismaLikeClient) {}
  async tryAcquire(jobProfileId: string, jobProfileVersionId: string): Promise<boolean> {
    try {
      await this.prisma.reassessmentLockRecord.create({ data: { jobProfileId, jobProfileVersionId, running: true } });
      return true;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const claimed = await this.prisma.reassessmentLockRecord.updateMany({
        where: { jobProfileId, jobProfileVersionId, running: false }, data: { running: true },
      });
      return claimed.count === 1;
    }
  }
  async release(jobProfileId: string, jobProfileVersionId: string): Promise<void> {
    await this.prisma.reassessmentLockRecord.update({ where: { jobProfileId_jobProfileVersionId: { jobProfileId, jobProfileVersionId } }, data: { running: false } });
  }
}

export class PrismaPluginCandidateBatchRepository implements PluginCandidateBatchRepository {
  constructor(private readonly prisma: PrismaLikeClient) {}

  async claim(batch: PluginCandidateBatch): Promise<PluginBatchClaim> {
    const existing = await this.prisma.pluginCandidateBatchRecord.findUnique({
      where: { searchRunId_batchId: { searchRunId: batch.searchRunId, batchId: batch.batchId } },
    });
    if (existing) {
      if (existing.requestDigest !== batch.requestDigest) return "conflict";
      if (existing.status !== "failed") return "duplicate";
      await this.prisma.pluginCandidateBatchRecord.update({
        where: { id: existing.id }, data: { status: "processing", failureReason: null },
      });
      return "retry";
    }
    try {
      await this.prisma.pluginCandidateBatchRecord.create({ data: batch });
      return "claimed";
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const raced = await this.prisma.pluginCandidateBatchRecord.findUnique({
        where: { searchRunId_batchId: { searchRunId: batch.searchRunId, batchId: batch.batchId } },
      });
      if (!raced) throw new Error("Plugin candidate batch claim failed.");
      return raced.requestDigest === batch.requestDigest ? "duplicate" : "conflict";
    }
  }
  async complete(searchRunId: string, batchId: string): Promise<void> {
    await this.prisma.pluginCandidateBatchRecord.update({ where: { searchRunId_batchId: { searchRunId, batchId } }, data: { status: "completed", failureReason: null } });
  }
  async fail(searchRunId: string, batchId: string, reason: string): Promise<void> {
    await this.prisma.pluginCandidateBatchRecord.update({ where: { searchRunId_batchId: { searchRunId, batchId } }, data: { status: "failed", failureReason: reason } });
  }
}

export class PrismaCandidateAssessmentRepository implements CandidateAssessmentRepository {
  constructor(private readonly prisma: PrismaLikeClient) {}
  async append(record: CandidateAssessmentRecord): Promise<void> {
    await this.prisma.candidateAssessmentRecord.create({ data: { ...record, assessment: record.assessment as object } });
  }
  async findLatestByJobProfileVersion(jobProfileId: string, jobProfileVersionId: string): Promise<CandidateAssessmentRecord[]> {
    const records = await this.prisma.candidateAssessmentRecord.findMany({
      where: { jobProfileId, jobProfileVersionId }, orderBy: { createdAt: "desc" },
    });
    const latest = new Map<string, CandidateAssessmentRecord>();
    for (const record of records) {
      if (!latest.has(record.candidateFingerprint)) latest.set(record.candidateFingerprint, { ...record, auditId: record.auditId ?? undefined, assessmentType: record.assessmentType as CandidateAssessmentRecord["assessmentType"], assessment: record.assessment as unknown as CandidateAssessmentRecord["assessment"] });
    }
    return [...latest.values()];
  }
}

const searchRunInclude = {
  candidates: true,
  events: true,
} as const;

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaLikeClient) {}

  async save(user: User): Promise<User> {
    const record = await this.prisma.userRecord.upsert({
      where: { id: user.id },
      create: toUserCreateInput(user),
      update: toUserUpdateInput(user),
    });

    return toUserDomain(record as UserPersistenceRecord);
  }

  async findById(id: string): Promise<User | undefined> {
    const record = await this.prisma.userRecord.findUnique({
      where: { id },
    });

    return record ? toUserDomain(record as UserPersistenceRecord) : undefined;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const record = await this.prisma.userRecord.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    return record ? toUserDomain(record as UserPersistenceRecord) : undefined;
  }
}

export class PrismaJobProfileRepository implements JobProfileRepository {
  constructor(private readonly prisma: PrismaLikeClient) {}

  async save(jobProfile: JobProfile): Promise<JobProfile> {
    const record = await this.prisma.jobProfileRecord.upsert({
      where: { id: jobProfile.id },
      create: toJobProfileCreateInput(jobProfile),
      update: toJobProfileUpdateInput(jobProfile),
    });

    return toJobProfileDomain(record as JobProfilePersistenceRecord);
  }

  async findById(id: string): Promise<JobProfile | undefined> {
    const record = await this.prisma.jobProfileRecord.findUnique({
      where: { id },
    });

    return record ? toJobProfileDomain(record as JobProfilePersistenceRecord) : undefined;
  }
}

export class PrismaJobProfileVersionRepository implements JobProfileVersionRepository {
  constructor(private readonly prisma: PrismaLikeClient) {}

  async save(version: JobProfileVersion): Promise<JobProfileVersion> {
    const record = await this.prisma.jobProfileVersionRecord.upsert({
      where: { id: version.id },
      create: toJobProfileVersionCreateInput(version),
      update: toJobProfileVersionUpdateInput(version),
    });

    return toJobProfileVersionDomain(record as JobProfileVersionPersistenceRecord);
  }

  async findById(id: string): Promise<JobProfileVersion | undefined> {
    const record = await this.prisma.jobProfileVersionRecord.findUnique({
      where: { id },
    });

    return record ? toJobProfileVersionDomain(record as JobProfileVersionPersistenceRecord) : undefined;
  }

  async findByJobProfileId(jobProfileId: string): Promise<JobProfileVersion[]> {
    const records = await this.prisma.jobProfileVersionRecord.findMany({
      where: { jobProfileId },
      orderBy: { version: "asc" },
    });

    return records.map((record) => toJobProfileVersionDomain(record as JobProfileVersionPersistenceRecord));
  }

  async findLatestConfirmedByJobProfileId(jobProfileId: string): Promise<JobProfileVersion | undefined> {
    const record = await this.prisma.jobProfileVersionRecord.findFirst({
      where: {
        jobProfileId,
        status: "Confirmed",
      },
      orderBy: {
        version: "desc",
      },
    });

    return record ? toJobProfileVersionDomain(record as JobProfileVersionPersistenceRecord) : undefined;
  }
}

export class PrismaSearchRunRepository implements SearchRunRepository {
  constructor(private readonly prisma: PrismaLikeClient) {}

  async save(searchRun: SearchRun): Promise<SearchRun> {
    const record = await this.prisma.searchRunRecord.upsert({
      where: { id: searchRun.id },
      create: toSearchRunCreateInput(searchRun),
      update: toSearchRunUpdateInput(searchRun),
      include: searchRunInclude,
    });

    return toSearchRunDomain(record as unknown as SearchRunPersistenceRecord);
  }

  async findById(id: string): Promise<SearchRun | undefined> {
    const record = await this.prisma.searchRunRecord.findUnique({
      where: { id },
      include: searchRunInclude,
    });

    return record ? toSearchRunDomain(record as unknown as SearchRunPersistenceRecord) : undefined;
  }

  async findByJobProfileId(jobProfileId: string): Promise<SearchRun[]> {
    const records = await this.prisma.searchRunRecord.findMany({
      where: { jobProfileId },
      include: searchRunInclude,
      orderBy: { updatedAt: "asc" },
    });

    return records.map((record) => toSearchRunDomain(record as unknown as SearchRunPersistenceRecord));
  }
}

export class PrismaHardConditionConfigRepository implements HardConditionConfigRepository {
  constructor(private readonly prisma: PrismaLikeClient) {}

  async findDimensions(): Promise<HardConditionDimension[]> {
    const records = await this.prisma.hardConditionDimensionRecord.findMany({
      orderBy: { key: "asc" },
    });

    return records.map((record) => ({
      id: record.id,
      key: record.key,
      label: record.label,
      valueType: record.valueType as HardConditionDimension["valueType"],
      supportedMatchModes: record.supportedMatchModes as unknown as HardConditionDimension["supportedMatchModes"],
      allowMultiple: record.allowMultiple,
      createdAt: record.createdAt,
    }));
  }

  async findOptionsByDimensionKey(dimensionKey: string): Promise<HardConditionOption[]> {
    const records = await this.prisma.hardConditionOptionRecord.findMany({
      where: { dimensionKey },
      orderBy: { value: "asc" },
    });

    return records.map((record) => ({
      id: record.id,
      dimensionKey: record.dimensionKey,
      value: record.value,
      label: record.label,
      aliases: record.aliases as unknown as string[],
      rank: record.rank ?? undefined,
      createdAt: record.createdAt,
    }));
  }

  async findAll(): Promise<Array<HardConditionDimension & { options: HardConditionOption[] }>> {
    const dimensions = await this.findDimensions();

    return Promise.all(
      dimensions.map(async (dimension) => ({
        ...dimension,
        options: await this.findOptionsByDimensionKey(dimension.key),
      })),
    );
  }
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}
