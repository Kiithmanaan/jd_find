import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const stringList = z.array(nonEmptyString);
const targetResultCountSchema = z.number().int().min(10).max(500).default(200);
const optionalDate = z
  .union([z.string().datetime(), z.date()])
  .optional()
  .transform((value) => {
    if (!value) {
      return undefined;
    }

    return value instanceof Date ? value : new Date(value);
  });

const hardRequirementPredicateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("minYearsOfExperience"),
    value: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("educationIn"),
    values: stringList.min(1),
  }),
  z.object({
    type: z.literal("keywordAny"),
    values: stringList.min(1),
  }),
  z.object({
    type: z.literal("industryIn"),
    values: stringList.min(1),
  }),
  z.object({
    type: z.literal("hardConditionRuleSet"),
    eliminationRules: z.array(
      z.object({
        id: nonEmptyString,
        label: nonEmptyString,
        mode: z.enum(["AND", "OR"]),
        conditions: z.array(
          z.object({
            field: z.enum(["keyword", "city", "industry", "education", "yearsOfExperience"]),
            operator: z.enum(["normalizedContainsAny", "optionAny", "rankAtLeast", "min"]),
            values: stringList,
            numericValue: z.number().min(0).optional(),
            aliases: stringList,
            rank: z.number().int().min(1).optional(),
          }),
        ).min(1),
      }),
    ),
    passRules: z.array(
      z.object({
        id: nonEmptyString,
        label: nonEmptyString,
        mode: z.enum(["AND", "OR"]),
        conditions: z.array(
          z.object({
            field: z.enum(["keyword", "city", "industry", "education", "yearsOfExperience"]),
            operator: z.enum(["normalizedContainsAny", "optionAny", "rankAtLeast", "min"]),
            values: stringList,
            numericValue: z.number().min(0).optional(),
            aliases: stringList,
            rank: z.number().int().min(1).optional(),
          }),
        ).min(1),
      }),
    ).min(1),
  }),
]);

export const searchConditionSchema = z.object({
  keywords: stringList.min(1),
  cities: stringList,
  industries: stringList,
  educationLevels: stringList,
  minYearsOfExperience: z.number().int().min(0).optional(),
});

export const hardRequirementSchema = z.object({
  key: nonEmptyString,
  label: nonEmptyString,
  weight: z.number().min(0),
  predicate: hardRequirementPredicateSchema,
});

export const softRequirementSchema = z.object({
  key: nonEmptyString,
  label: nonEmptyString,
  weight: z.number().min(0),
  description: nonEmptyString,
  verificationHint: nonEmptyString.optional(),
});

export const jobProfileSchema = z.object({
  id: nonEmptyString,
  createdByUserId: nonEmptyString.optional(),
  title: nonEmptyString,
  jdText: nonEmptyString,
  status: z.enum(["Draft", "Suggested", "Confirmed", "Archived"]),
  currentVersionId: nonEmptyString.optional(),
  searchCondition: searchConditionSchema,
  hardRequirements: z.array(hardRequirementSchema).min(1),
  softRequirements: z.array(softRequirementSchema).min(1),
  negativeSignals: stringList.default([]),
  confirmedAt: optionalDate,
});

const candidateResumeSchema = z.object({
  name: nonEmptyString,
  title: nonEmptyString,
  city: nonEmptyString,
  educationLevel: nonEmptyString,
  yearsOfExperience: z.number().int().min(0),
  industries: stringList,
  keywords: stringList,
  summary: nonEmptyString,
});

const sourceLeadSchema = z.object({
  platform: nonEmptyString,
  url: z.string().url().optional(),
  searchContext: nonEmptyString,
  fallbackClues: stringList,
  expired: z.boolean().optional(),
});

const candidateDraftSchema = z.object({
  fingerprint: nonEmptyString,
  resume: candidateResumeSchema,
  intent: nonEmptyString,
  activityLevel: nonEmptyString,
  sourceLead: sourceLeadSchema,
});

const riskSignalSchema = z.object({
  type: z.enum(["captcha", "accessLimited", "sourceUnavailable", "sourceLeadUnstable"]),
  reason: nonEmptyString,
});

export const loginRequestSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

const mockOneTimeSearchRequestSchema = z.object({
  jobProfile: jobProfileSchema,
  sourceType: z.literal("mock").optional(),
  targetResultCount: targetResultCountSchema,
  candidates: z.array(candidateDraftSchema),
  riskSignal: riskSignalSchema.optional(),
});

const csvOneTimeSearchRequestSchema = z.object({
  jobProfile: jobProfileSchema,
  sourceType: z.literal("csv"),
  targetResultCount: targetResultCountSchema,
  csvFilePath: nonEmptyString,
});

const pluginOneTimeSearchRequestSchema = z.object({
  jobProfile: jobProfileSchema,
  sourceType: z.literal("plugin"),
  targetResultCount: targetResultCountSchema,
});

export const oneTimeSearchRequestSchema = z.discriminatedUnion("sourceType", [
  mockOneTimeSearchRequestSchema.extend({
    sourceType: z.literal("mock"),
  }),
  csvOneTimeSearchRequestSchema,
  pluginOneTimeSearchRequestSchema,
]).or(mockOneTimeSearchRequestSchema);

export type OneTimeSearchRequestBody = z.infer<typeof oneTimeSearchRequestSchema>;

export const pluginCandidateSubmissionSchema = z.object({
  batchId: nonEmptyString,
  sourcePlatform: nonEmptyString.optional(),
  candidates: z.array(candidateDraftSchema).min(1),
});

// §4b 原始载荷提交：服务端不校验 json 结构（校验结构等于把字段名再次写死进契约）。
// payloads 数量与请求体大小的上限在路由层处理为 PayloadTooLarge，不在此 schema 里 cap。
const rawPayloadSchema = z.object({
  url: nonEmptyString.optional(),
  matched: z.enum(["exact", "heuristic"]).optional(),
  capturedAt: z.string().datetime().optional(),
  json: z.unknown(),
});

export const pluginRawCandidateSubmissionSchema = z.object({
  batchId: nonEmptyString,
  sourcePlatform: nonEmptyString,
  captureVersion: nonEmptyString.optional(),
  payloads: z.array(rawPayloadSchema).min(1),
});

export const resumeAttachmentUploadSchema = z.object({
  filename: nonEmptyString,
  contentType: z.enum([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  contentBase64: nonEmptyString,
});

export const interviewAnswerRequestSchema = z.object({
  answer: nonEmptyString,
});

export const jobProfileVersionDraftRequestSchema = z.object({
  title: nonEmptyString,
  jdText: nonEmptyString,
  searchCondition: searchConditionSchema,
  hardRequirements: z.array(hardRequirementSchema).min(1),
  softRequirements: z.array(softRequirementSchema).min(1),
  negativeSignals: stringList.default([]),
});

export function formatZodError(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
