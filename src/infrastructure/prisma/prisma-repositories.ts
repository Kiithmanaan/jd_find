import { PrismaClient } from "@prisma/client";
import type { JobProfileRepository, SearchRunRepository } from "../../application/ports.js";
import type { JobProfile, SearchRun } from "../../domain/types.js";
import {
  toJobProfileCreateInput,
  toJobProfileDomain,
  toJobProfileUpdateInput,
  toSearchRunCreateInput,
  toSearchRunDomain,
  toSearchRunUpdateInput,
  type JobProfilePersistenceRecord,
  type SearchRunPersistenceRecord,
} from "./prisma-mappers.js";

export type PrismaLikeClient = Pick<PrismaClient, "jobProfileRecord" | "searchRunRecord">;

const searchRunInclude = {
  candidates: true,
  events: true,
} as const;

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
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}
