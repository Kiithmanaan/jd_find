import type { PrismaClient } from "@prisma/client";
import type { AIAssessmentAuditRepository, AIAssessmentAuditSink } from "../../application/ports.js";
import type { AIAssessmentAuditRecord, MatchAssessment } from "../../domain/types.js";

export type PrismaAIAssessmentAuditClient = Pick<PrismaClient, "aIAssessmentAuditRecord">;

export class PrismaAIAssessmentAuditSink implements AIAssessmentAuditSink, AIAssessmentAuditRepository {
  constructor(private readonly prisma: PrismaAIAssessmentAuditClient) {}

  async record(record: AIAssessmentAuditRecord): Promise<void> {
    await this.prisma.aIAssessmentAuditRecord.create({
      data: {
        id: record.id,
        searchRunId: record.searchRunId,
        jobProfileId: record.jobProfileId,
        jobProfileVersionId: record.jobProfileVersionId ?? null,
        agentType: record.agentType,
        provider: record.provider,
        model: record.model,
        promptVersion: record.promptVersion,
        agentVersion: record.agentVersion,
        graphVersion: record.graphVersion ?? null,
        prompt: record.prompt,
        candidateIds: toJson(record.candidateIds),
        inputSnapshot: toJson(record.inputSnapshot),
        outputSnapshot: toJson(record.outputSnapshot),
        durationMs: record.durationMs,
        status: record.status,
        errorType: record.errorType ?? null,
        errorMessage: record.errorMessage ?? null,
        createdAt: record.createdAt,
      },
    });
  }

  async findBySearchRunId(searchRunId: string): Promise<AIAssessmentAuditRecord[]> {
    const records = await this.prisma.aIAssessmentAuditRecord.findMany({
      where: { searchRunId },
      orderBy: { createdAt: "asc" },
    });

    return records.map((record) => ({
      id: record.id,
      searchRunId: record.searchRunId,
      jobProfileId: record.jobProfileId,
      jobProfileVersionId: record.jobProfileVersionId ?? undefined,
      agentType: record.agentType as AIAssessmentAuditRecord["agentType"],
      provider: record.provider,
      model: record.model,
      promptVersion: record.promptVersion,
      agentVersion: record.agentVersion,
      graphVersion: record.graphVersion ?? undefined,
      prompt: record.prompt,
      candidateIds: record.candidateIds as unknown as string[],
      inputSnapshot: reviveInputSnapshot(record.inputSnapshot),
      outputSnapshot: reviveOutputSnapshot(record.outputSnapshot),
      durationMs: record.durationMs,
      status: record.status as AIAssessmentAuditRecord["status"],
      errorType: record.errorType ?? undefined,
      errorMessage: record.errorMessage ?? undefined,
      createdAt: record.createdAt,
    }));
  }
}

function toJson(value: unknown): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

function reviveInputSnapshot(value: unknown): AIAssessmentAuditRecord["inputSnapshot"] {
  return value as AIAssessmentAuditRecord["inputSnapshot"];
}

function reviveOutputSnapshot(value: unknown): AIAssessmentAuditRecord["outputSnapshot"] {
  return (value as Array<{ candidateId: string; assessment: MatchAssessment }>).map((item) => ({
    candidateId: item.candidateId,
    assessment: {
      ...item.assessment,
      assessedAt: new Date(item.assessment.assessedAt),
    },
  }));
}
