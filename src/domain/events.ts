import type { SearchEvent, SearchEventType } from "./types.js";

export function createSearchEvent(
  type: SearchEventType,
  reason?: string,
  metadata?: Record<string, unknown>,
): SearchEvent {
  return {
    type,
    reason,
    metadata,
    occurredAt: new Date(),
  };
}
