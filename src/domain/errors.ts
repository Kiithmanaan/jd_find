export function formatFailureReason(error: unknown): string {
  if (error instanceof Error) {
    return error.name + ": " + error.message;
  }
  return "UnknownError: Search run failed.";
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class BatchConflictError extends DomainError {
  constructor() {
    super("The batchId was already used with different candidate content.");
    this.name = "BatchConflictError";
  }
}

export class ReassessmentInProgressError extends DomainError {
  constructor() { super("A reassessment is already running for this job profile version."); this.name = "ReassessmentInProgressError"; }
}

export class RefinementInProgressError extends DomainError {
  constructor() { super("A search refinement analysis is already running for this search run."); this.name = "RefinementInProgressError"; }
}
