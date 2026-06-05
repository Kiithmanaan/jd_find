import type {
  AIAssessmentAuditRepository,
  AIAssessmentAuditSink,
  JobProfileRepository,
  SearchRunRepository,
} from "../../application/ports.js";
import type { AIAssessmentAuditRecord, JobProfile, SearchRun } from "../../domain/types.js";

export class InMemoryJobProfileRepository implements JobProfileRepository {
  private readonly records = new Map<string, JobProfile>();

  async save(jobProfile: JobProfile): Promise<JobProfile> {
    this.records.set(jobProfile.id, structuredClone(jobProfile));
    return structuredClone(jobProfile);
  }

  async findById(id: string): Promise<JobProfile | undefined> {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }
}

export class InMemorySearchRunRepository implements SearchRunRepository {
  private readonly records = new Map<string, SearchRun>();
  private readonly history = new Map<string, SearchRun[]>();

  async save(searchRun: SearchRun): Promise<SearchRun> {
    const snapshot = structuredClone(searchRun);
    this.records.set(searchRun.id, snapshot);

    const existingHistory = this.history.get(searchRun.id) ?? [];
    this.history.set(searchRun.id, [...existingHistory, snapshot]);

    return structuredClone(snapshot);
  }

  async findById(id: string): Promise<SearchRun | undefined> {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }

  findHistoryById(id: string): SearchRun[] {
    return (this.history.get(id) ?? []).map((record) => structuredClone(record));
  }
}

export class InMemoryAIAssessmentAuditSink implements AIAssessmentAuditSink, AIAssessmentAuditRepository {
  private readonly records: AIAssessmentAuditRecord[] = [];

  async record(record: AIAssessmentAuditRecord): Promise<void> {
    this.records.push(structuredClone(record));
  }

  async findAll(): Promise<AIAssessmentAuditRecord[]> {
    return this.records.map((record) => structuredClone(record));
  }

  async findBySearchRunId(searchRunId: string): Promise<AIAssessmentAuditRecord[]> {
    const records = await this.findAll();
    return records.filter((record) => record.searchRunId === searchRunId);
  }
}
