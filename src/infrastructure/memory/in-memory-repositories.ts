import type {
  AIAssessmentAuditRepository,
  AIAssessmentAuditSink,
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
  SearchRefinementSuggestionRepository,
} from "../../application/ports.js";
import type { SearchRefinementSuggestion } from "../../domain/search-refinement-contract.js";
import type {
  AIAssessmentAuditRecord,
  HardConditionDimension,
  HardConditionOption,
  JobProfile,
  JobProfileVersion,
  SearchRun,
  User,
  PluginCandidateBatch,
  CandidateAssessmentRecord,
} from "../../domain/types.js";
import type { ClarificationInterviewSession } from "../../domain/clarification-interview.js";

export class InMemorySearchRefinementSuggestionRepository implements SearchRefinementSuggestionRepository {
  private readonly records = new Map<string, SearchRefinementSuggestion>();

  async save(suggestion: SearchRefinementSuggestion): Promise<SearchRefinementSuggestion> {
    this.records.set(suggestion.id, structuredClone(suggestion));
    return structuredClone(suggestion);
  }

  async findBySearchRunId(searchRunId: string): Promise<SearchRefinementSuggestion[]> {
    return [...this.records.values()]
      .filter((suggestion) => suggestion.searchRunId === searchRunId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((suggestion) => structuredClone(suggestion));
  }

  async findByJobProfileId(jobProfileId: string): Promise<SearchRefinementSuggestion[]> {
    return [...this.records.values()]
      .filter((suggestion) => suggestion.jobProfileId === jobProfileId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((suggestion) => structuredClone(suggestion));
  }
}

export class InMemoryClarificationInterviewSessionRepository implements ClarificationInterviewSessionRepository {
  private readonly records = new Map<string, ClarificationInterviewSession>();

  async save(session: ClarificationInterviewSession): Promise<ClarificationInterviewSession> {
    this.records.set(session.id, structuredClone(session));
    return structuredClone(session);
  }

  async findById(id: string): Promise<ClarificationInterviewSession | undefined> {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async findByJobProfileId(jobProfileId: string): Promise<ClarificationInterviewSession[]> {
    return [...this.records.values()]
      .filter((session) => session.jobProfileId === jobProfileId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((session) => structuredClone(session));
  }
}

export class InMemoryPluginCandidateBatchRepository implements PluginCandidateBatchRepository {
  private readonly records = new Map<string, PluginCandidateBatch>();

  async claim(batch: PluginCandidateBatch): Promise<PluginBatchClaim> {
    const key = `${batch.searchRunId}:${batch.batchId}`;
    const existing = this.records.get(key);
    if (!existing) {
      this.records.set(key, structuredClone(batch));
      return "claimed";
    }
    if (existing.requestDigest !== batch.requestDigest) return "conflict";
    if (existing.status === "completed" || existing.status === "processing") return "duplicate";
    this.records.set(key, structuredClone(batch));
    return "retry";
  }

  async complete(searchRunId: string, batchId: string): Promise<void> {
    this.update(searchRunId, batchId, "completed");
  }

  async fail(searchRunId: string, batchId: string, reason: string): Promise<void> {
    this.update(searchRunId, batchId, "failed", reason);
  }

  private update(searchRunId: string, batchId: string, status: PluginCandidateBatch["status"], failureReason?: string): void {
    const key = `${searchRunId}:${batchId}`;
    const record = this.records.get(key);
    if (record) this.records.set(key, { ...record, status, failureReason });
  }
}

export class InMemoryReassessmentLockRepository implements ReassessmentLockRepository {
  private readonly running = new Set<string>();
  async tryAcquire(jobProfileId: string, versionId: string): Promise<boolean> {
    const key = `${jobProfileId}:${versionId}`;
    if (this.running.has(key)) return false;
    this.running.add(key); return true;
  }
  async release(jobProfileId: string, versionId: string): Promise<void> { this.running.delete(`${jobProfileId}:${versionId}`); }
}

export class InMemoryCandidateAssessmentRepository implements CandidateAssessmentRepository {
  private readonly records: CandidateAssessmentRecord[] = [];
  async append(record: CandidateAssessmentRecord): Promise<void> { this.records.push(structuredClone(record)); }
  async findLatestByJobProfileVersion(jobProfileId: string, jobProfileVersionId: string): Promise<CandidateAssessmentRecord[]> {
    const latest = new Map<string, CandidateAssessmentRecord>();
    for (const record of this.records) {
      if (record.jobProfileId === jobProfileId && record.jobProfileVersionId === jobProfileVersionId) {
        const current = latest.get(record.candidateFingerprint);
        if (!current || current.createdAt < record.createdAt) latest.set(record.candidateFingerprint, record);
      }
    }
    return [...latest.values()].map((record) => structuredClone(record));
  }
}

export class InMemoryUserRepository implements UserRepository {
  private readonly records = new Map<string, User>();

  constructor(users: User[]) {
    for (const user of users) {
      this.records.set(user.id, structuredClone(user));
    }
  }

  async save(user: User): Promise<User> {
    this.records.set(user.id, structuredClone(user));
    return structuredClone(user);
  }

  async findById(id: string): Promise<User | undefined> {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const normalizedEmail = email.trim().toLowerCase();
    const record = [...this.records.values()].find((user) => user.email === normalizedEmail);
    return record ? structuredClone(record) : undefined;
  }
}

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

export class InMemoryJobProfileVersionRepository implements JobProfileVersionRepository {
  private readonly records = new Map<string, JobProfileVersion>();

  async save(version: JobProfileVersion): Promise<JobProfileVersion> {
    this.records.set(version.id, structuredClone(version));
    return structuredClone(version);
  }

  async findById(id: string): Promise<JobProfileVersion | undefined> {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async findByJobProfileId(jobProfileId: string): Promise<JobProfileVersion[]> {
    return [...this.records.values()]
      .filter((record) => record.jobProfileId === jobProfileId)
      .sort((left, right) => left.version - right.version)
      .map((record) => structuredClone(record));
  }

  async findLatestConfirmedByJobProfileId(jobProfileId: string): Promise<JobProfileVersion | undefined> {
    const versions = [...this.records.values()]
      .filter((record) => record.jobProfileId === jobProfileId && record.status === "Confirmed")
      .sort((left, right) => right.version - left.version);

    return versions[0] ? structuredClone(versions[0]) : undefined;
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

  async findByJobProfileId(jobProfileId: string): Promise<SearchRun[]> {
    return [...this.records.values()]
      .filter((record) => record.jobProfileId === jobProfileId)
      .sort((left, right) => left.updatedAt.getTime() - right.updatedAt.getTime())
      .map((record) => structuredClone(record));
  }

  findHistoryById(id: string): SearchRun[] {
    return (this.history.get(id) ?? []).map((record) => structuredClone(record));
  }
}

export class InMemoryHardConditionConfigRepository implements HardConditionConfigRepository {
  private readonly dimensions: HardConditionDimension[] = createDefaultHardConditionDimensions();
  private readonly options: HardConditionOption[] = createDefaultHardConditionOptions();

  async findDimensions(): Promise<HardConditionDimension[]> {
    return this.dimensions.map((dimension) => structuredClone(dimension));
  }

  async findOptionsByDimensionKey(dimensionKey: string): Promise<HardConditionOption[]> {
    return this.options
      .filter((option) => option.dimensionKey === dimensionKey)
      .map((option) => structuredClone(option));
  }

  async findAll(): Promise<Array<HardConditionDimension & { options: HardConditionOption[] }>> {
    return Promise.all(
      this.dimensions.map(async (dimension) => ({
        ...structuredClone(dimension),
        options: await this.findOptionsByDimensionKey(dimension.key),
      })),
    );
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

function createDefaultHardConditionDimensions(): HardConditionDimension[] {
  const now = new Date("2026-06-06T00:00:00.000Z");
  return [
    {
      id: "hard-dimension-keyword",
      key: "keyword",
      label: "全文关键词",
      valueType: "text",
      supportedMatchModes: ["exact", "normalizedContains"],
      allowMultiple: true,
      createdAt: now,
    },
    {
      id: "hard-dimension-city",
      key: "city",
      label: "城市",
      valueType: "option",
      supportedMatchModes: ["optionAny"],
      allowMultiple: true,
      createdAt: now,
    },
    {
      id: "hard-dimension-industry",
      key: "industry",
      label: "行业",
      valueType: "option",
      supportedMatchModes: ["optionAny"],
      allowMultiple: true,
      createdAt: now,
    },
    {
      id: "hard-dimension-education",
      key: "education",
      label: "学历",
      valueType: "option",
      supportedMatchModes: ["rankAtLeast"],
      allowMultiple: false,
      createdAt: now,
    },
    {
      id: "hard-dimension-years",
      key: "yearsOfExperience",
      label: "最低工作年限",
      valueType: "number",
      supportedMatchModes: ["min"],
      allowMultiple: false,
      createdAt: now,
    },
  ];
}

function createDefaultHardConditionOptions(): HardConditionOption[] {
  const now = new Date("2026-06-06T00:00:00.000Z");
  return [
    {
      id: "hard-option-education-college",
      dimensionKey: "education",
      value: "大专",
      label: "大专",
      aliases: ["专科"],
      rank: 1,
      createdAt: now,
    },
    {
      id: "hard-option-education-bachelor",
      dimensionKey: "education",
      value: "本科",
      label: "本科",
      aliases: ["学士"],
      rank: 2,
      createdAt: now,
    },
    {
      id: "hard-option-education-master",
      dimensionKey: "education",
      value: "硕士",
      label: "硕士",
      aliases: ["研究生"],
      rank: 3,
      createdAt: now,
    },
    {
      id: "hard-option-education-doctor",
      dimensionKey: "education",
      value: "博士",
      label: "博士",
      aliases: ["博士研究生"],
      rank: 4,
      createdAt: now,
    },
  ];
}
