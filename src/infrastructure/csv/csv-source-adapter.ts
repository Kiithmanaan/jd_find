import { readFile } from "node:fs/promises";
import type { SourceAdapter } from "../../application/ports.js";
import { DomainError } from "../../domain/errors.js";
import { normalizeSourceAcquisitionResult, type SourceAcquisitionResult } from "../../domain/source-adapter-contract.js";
import type { CandidateDraft, JobProfile, SearchRun } from "../../domain/types.js";

const REQUIRED_HEADERS = [
  "fingerprint",
  "name",
  "title",
  "city",
  "educationLevel",
  "yearsOfExperience",
  "industries",
  "keywords",
  "summary",
  "intent",
  "activityLevel",
  "platform",
  "sourceUrl",
  "searchContext",
  "fallbackClues",
] as const;

export interface CsvSourceAdapterOptions {
  filePath: string;
  delimiter?: ",";
}

export class CsvSourceAdapter implements SourceAdapter {
  constructor(private readonly options: CsvSourceAdapterOptions) {}

  async acquireCandidates(_jobProfile: JobProfile, _searchRun: SearchRun): Promise<SourceAcquisitionResult> {
    const csv = await readFile(this.options.filePath, "utf8");

    return normalizeSourceAcquisitionResult({
      candidates: parseCandidateDraftCsv(csv),
    });
  }
}

export function parseCandidateDraftCsv(csv: string): CandidateDraft[] {
  const rows = parseCsvRows(csv);

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0]!.map((header) => header.trim());
  assertRequiredHeaders(headers);

  return rows.slice(1).filter(hasAnyValue).map((row, index) => {
    const record = toRecord(headers, row);
    return toCandidateDraft(record, index + 2);
  });
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]!;
    const nextChar = csv[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      currentCell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (inQuotes) {
    throw new DomainError("CSV contains an unclosed quoted field.");
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function assertRequiredHeaders(headers: string[]): void {
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));

  if (missingHeaders.length > 0) {
    throw new DomainError(`CSV is missing required headers: ${missingHeaders.join(", ")}`);
  }
}

function hasAnyValue(row: string[]): boolean {
  return row.some((cell) => cell.trim().length > 0);
}

function toRecord(headers: string[], row: string[]): Record<string, string> {
  return Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? ""]));
}

function toCandidateDraft(record: Record<string, string>, rowNumber: number): CandidateDraft {
  const yearsOfExperience = Number(record.yearsOfExperience);

  if (!Number.isInteger(yearsOfExperience) || yearsOfExperience < 0) {
    throw new DomainError(`CSV row ${rowNumber} has invalid yearsOfExperience.`);
  }

  return {
    fingerprint: required(record.fingerprint, rowNumber, "fingerprint"),
    resume: {
      name: required(record.name, rowNumber, "name"),
      title: required(record.title, rowNumber, "title"),
      city: required(record.city, rowNumber, "city"),
      educationLevel: required(record.educationLevel, rowNumber, "educationLevel"),
      yearsOfExperience,
      industries: splitList(record.industries),
      keywords: splitList(record.keywords),
      summary: required(record.summary, rowNumber, "summary"),
    },
    intent: required(record.intent, rowNumber, "intent"),
    activityLevel: required(record.activityLevel, rowNumber, "activityLevel"),
    sourceLead: {
      platform: required(record.platform, rowNumber, "platform"),
      url: record.sourceUrl || undefined,
      searchContext: required(record.searchContext, rowNumber, "searchContext"),
      fallbackClues: splitList(record.fallbackClues),
    },
  };
}

function required(value: string, rowNumber: number, field: string): string {
  if (!value.trim()) {
    throw new DomainError(`CSV row ${rowNumber} is missing ${field}.`);
  }

  return value;
}

function splitList(value: string): string[] {
  return value.split(";").map((item) => item.trim()).filter(Boolean);
}
