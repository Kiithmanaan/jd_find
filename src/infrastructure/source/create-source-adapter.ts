import type { OneTimeSearchJob, SourceAdapter } from "../../application/ports.js";
import { CsvSourceAdapter } from "../csv/csv-source-adapter.js";
import { MockSourceAdapter } from "../mock/mock-source-adapter.js";

export function createSourceAdapter(job: OneTimeSearchJob): SourceAdapter {
  switch (job.source.type) {
    case "mock": return new MockSourceAdapter({ candidates: job.source.candidates, riskSignal: job.source.riskSignal });
    case "csv": return new CsvSourceAdapter({ filePath: job.source.csvFilePath });
    case "plugin": throw new Error("Plugin search runs are processed through ingestion APIs.");
  }
}
