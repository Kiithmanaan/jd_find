import { expireSourceLink, verifySourceLink } from "../domain/original-source-link.js";
import type { SearchRunRepository } from "./ports.js";

export async function updateCandidateSourceLink(
  searchRuns: SearchRunRepository,
  searchRunId: string,
  candidateId: string,
  action: "verify" | "expire",
) {
  const searchRun = await searchRuns.findById(searchRunId);
  if (!searchRun) return undefined;
  const candidate = searchRun.candidates.find((item) => item.id === candidateId);
  if (!candidate) return undefined;
  const sourceLead = action === "verify" ? verifySourceLink(candidate.sourceLead) : expireSourceLink(candidate.sourceLead);
  const now = new Date();
  return searchRuns.save({
    ...searchRun,
    candidates: searchRun.candidates.map((item) => item.id === candidateId ? { ...item, sourceLead } : item),
    events: action === "expire" ? [...searchRun.events, { type: "SourceLeadExpired", occurredAt: now, metadata: { candidateId } }] : searchRun.events,
    updatedAt: now,
  });
}
