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
