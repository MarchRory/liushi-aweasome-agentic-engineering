import { z } from "zod";

import {
  EVIDENCE_CONTENT_DIGEST_PATTERN,
  MAX_CLAIM_STATEMENT_LENGTH,
  MAX_EVIDENCE_ID_LENGTH,
  MAX_EVIDENCE_LOCATOR_LENGTH,
  MAX_EVIDENCE_REVISION_LENGTH,
  MAX_EVIDENCE_TITLE_LENGTH,
} from "./evidenceConstants.js";
import { ClaimClassification, EvidenceKind } from "./evidenceEnums.js";

const nonBlank = (maxLength: number): z.ZodString =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value === value.trim());

/** EvidenceRef 的严格 zod schema。 */
export const evidenceRefSchema = z
  .object({
    evidenceId: nonBlank(MAX_EVIDENCE_ID_LENGTH),
    kind: z.enum(EvidenceKind),
    source: nonBlank(MAX_EVIDENCE_TITLE_LENGTH),
    title: nonBlank(MAX_EVIDENCE_TITLE_LENGTH),
    locator: nonBlank(MAX_EVIDENCE_LOCATOR_LENGTH).optional(),
    revision: nonBlank(MAX_EVIDENCE_REVISION_LENGTH).optional(),
    observedAt: z.string().datetime().optional(),
    contentDigest: z.string().regex(EVIDENCE_CONTENT_DIGEST_PATTERN).optional(),
  })
  .strict();

/** Claim 的严格 zod schema，包含 fact 必须引用 Evidence 的不变量。 */
export const claimSchema = z
  .object({
    claimId: nonBlank(MAX_EVIDENCE_ID_LENGTH),
    statement: nonBlank(MAX_CLAIM_STATEMENT_LENGTH),
    classification: z.enum(ClaimClassification),
    evidenceIds: z.array(nonBlank(MAX_EVIDENCE_ID_LENGTH)),
  })
  .strict()
  .refine(
    (claim) => claim.classification !== ClaimClassification.Fact || claim.evidenceIds.length > 0,
    {
      message: "Fact claim must include at least one evidenceId.",
      path: ["evidenceIds"],
    },
  );
