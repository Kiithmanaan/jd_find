import { PrismaClient } from "@prisma/client";
import type {
  HardConditionConfigRepository,
  JobProfileRepository,
  JobProfileVersionRepository,
  SearchRunRepository,
  UserRepository,
} from "../../application/ports.js";
import type {
  HardConditionDimension,
  HardConditionOption,
  JobProfile,
  JobProfileVersion,
  SearchRun,
  User,
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
  type UserPersistenceRecord,
  type JobProfilePersistenceRecord,
  type JobProfileVersionPersistenceRecord,
  type SearchRunPersistenceRecord,
} from "./prisma-mappers.js";

export type PrismaLikeClient = Pick<
  PrismaClient,
  "userRecord" | "jobProfileRecord" | "jobProfileVersionRecord" | "searchRunRecord" | "hardConditionDimensionRecord" | "hardConditionOptionRecord"
>;

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
