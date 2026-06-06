import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const stringList = z.array(nonEmptyString);
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
]);

const searchConditionSchema = z.object({
  keywords: stringList.min(1),
  cities: stringList,
  industries: stringList,
  educationLevels: stringList,
  minYearsOfExperience: z.number().int().min(0).optional(),
});

const hardRequirementSchema = z.object({
  key: nonEmptyString,
  label: nonEmptyString,
  weight: z.number().min(0),
  predicate: hardRequirementPredicateSchema,
});

const softRequirementSchema = z.object({
  key: nonEmptyString,
  label: nonEmptyString,
  weight: z.number().min(0),
  description: nonEmptyString,
});

const jobProfileSchema = z.object({
  id: nonEmptyString,
  title: nonEmptyString,
  jdText: nonEmptyString,
  status: z.enum(["Draft", "Suggested", "Confirmed", "Archived"]),
  currentVersionId: nonEmptyString.optional(),
  searchCondition: searchConditionSchema,
  hardRequirements: z.array(hardRequirementSchema).min(1),
  softRequirements: z.array(softRequirementSchema).min(1),
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

const mockOneTimeSearchRequestSchema = z.object({
  jobProfile: jobProfileSchema,
  sourceType: z.literal("mock").optional(),
  candidates: z.array(candidateDraftSchema),
  riskSignal: riskSignalSchema.optional(),
});

const csvOneTimeSearchRequestSchema = z.object({
  jobProfile: jobProfileSchema,
  sourceType: z.literal("csv"),
  csvFilePath: nonEmptyString,
});

export const oneTimeSearchRequestSchema = z.discriminatedUnion("sourceType", [
  mockOneTimeSearchRequestSchema.extend({
    sourceType: z.literal("mock"),
  }),
  csvOneTimeSearchRequestSchema,
]).or(mockOneTimeSearchRequestSchema);

export type OneTimeSearchRequestBody = z.infer<typeof oneTimeSearchRequestSchema>;

export function formatZodError(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
