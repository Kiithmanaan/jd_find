import type { SourceAdapter } from "../../application/ports.js";
import { normalizeSourceAcquisitionResult, type SourceAcquisitionResult } from "../../domain/source-adapter-contract.js";
import type { CandidateDraft, JobProfile, RiskSignal, SearchRun } from "../../domain/types.js";

export interface MockSourceAdapterOptions {
  candidates: CandidateDraft[];
  riskSignal?: RiskSignal;
}

export class MockSourceAdapter implements SourceAdapter {
  constructor(private readonly options: MockSourceAdapterOptions) {}

  async acquireCandidates(
    _jobProfile: JobProfile,
    _searchRun: SearchRun,
  ): Promise<SourceAcquisitionResult> {
    return normalizeSourceAcquisitionResult({
      candidates: this.options.candidates,
      riskSignal: this.options.riskSignal,
    });
  }
}
