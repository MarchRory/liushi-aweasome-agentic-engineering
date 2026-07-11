import { z } from "zod";

import { ResultStatus, parseContentDigest, type ContentDigest } from "#common/index.js";
import { RepositoryRole } from "#domain/projectDiscovery/index.js";
import { parseRepositoryId } from "#domain/workspace/index.js";

import { MAX_ARTIFACT_LIST_ITEMS, MAX_ARTIFACT_TEXT_LENGTH } from "../constants/index.js";
import type {
  ProjectProfileConfirmedRole,
  ProjectProfileProposalPayload,
} from "../contracts/index.js";
import { nonBlank } from "./schemaPrimitives.js";

const projectProfileConfirmedRoles = [
  RepositoryRole.Application,
  RepositoryRole.SharedInfrastructure,
  RepositoryRole.Library,
  RepositoryRole.Contract,
  RepositoryRole.Documentation,
] as const satisfies readonly ProjectProfileConfirmedRole[];

const contentDigestSchema = z
  .string()
  .refine((value) => parseContentDigest(value).status === ResultStatus.Success)
  .transform((value) => value as ContentDigest);

const repositoryIdSchema = z.string().transform((value, context) => {
  const parsed = parseRepositoryId(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

const stableIdArraySchema = z
  .array(nonBlank(MAX_ARTIFACT_TEXT_LENGTH))
  .max(MAX_ARTIFACT_LIST_ITEMS)
  .superRefine((items, context) => {
    assertStrictlyIncreasing(items, context, "IDs must be unique and sorted.");
  });

const repositorySelectionSchema = z
  .object({
    repositoryId: repositoryIdSchema,
    repositoryRevision: nonBlank(MAX_ARTIFACT_TEXT_LENGTH),
    profileCandidateDigest: contentDigestSchema,
    confirmedRole: z.enum(projectProfileConfirmedRoles),
    acceptedRuleIds: stableIdArraySchema,
    rejectedRuleIds: stableIdArraySchema,
    acceptedMechanismCandidateIds: stableIdArraySchema,
    rejectedMechanismCandidateIds: stableIdArraySchema,
  })
  .strict()
  .superRefine((selection, context) => {
    assertDisjoint(
      selection.acceptedRuleIds,
      selection.rejectedRuleIds,
      context,
      ["acceptedRuleIds"],
      "Accepted and rejected Rule IDs must not overlap.",
    );
    assertDisjoint(
      selection.acceptedMechanismCandidateIds,
      selection.rejectedMechanismCandidateIds,
      context,
      ["acceptedMechanismCandidateIds"],
      "Accepted and rejected mechanism candidate IDs must not overlap.",
    );
  });

export const projectProfileProposalPayloadSchema = z
  .object({
    discoveryReportDigest: contentDigestSchema,
    workspaceGraphRevision: nonBlank(MAX_ARTIFACT_TEXT_LENGTH),
    repositorySelections: z
      .array(repositorySelectionSchema)
      .max(MAX_ARTIFACT_LIST_ITEMS)
      .superRefine((selections, context) => {
        assertStrictlyIncreasing(
          selections.map((selection) => selection.repositoryId),
          context,
          "Repository selections must be unique and sorted by repositoryId.",
        );
      }),
  })
  .strict();

/** 灏?Project Profile Proposal Payload Schema 杈撳嚭鏄犲皠涓洪鍩熷绾︺€?*/
export function mapProjectProfileProposalPayload(
  payload: z.infer<typeof projectProfileProposalPayloadSchema>,
): ProjectProfileProposalPayload {
  return {
    discoveryReportDigest: payload.discoveryReportDigest,
    workspaceGraphRevision: payload.workspaceGraphRevision,
    repositorySelections: payload.repositorySelections.map((selection) => ({
      repositoryId: selection.repositoryId,
      repositoryRevision: selection.repositoryRevision,
      profileCandidateDigest: selection.profileCandidateDigest,
      confirmedRole: selection.confirmedRole,
      acceptedRuleIds: selection.acceptedRuleIds,
      rejectedRuleIds: selection.rejectedRuleIds,
      acceptedMechanismCandidateIds: selection.acceptedMechanismCandidateIds,
      rejectedMechanismCandidateIds: selection.rejectedMechanismCandidateIds,
    })),
  };
}

function assertStrictlyIncreasing(
  items: readonly string[],
  context: z.RefinementCtx,
  message: string,
): void {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (previous !== undefined && current !== undefined && previous >= current) {
      context.addIssue({ code: "custom", message, path: [index] });
      return;
    }
  }
}

function assertDisjoint(
  accepted: readonly string[],
  rejected: readonly string[],
  context: z.RefinementCtx,
  path: [string],
  message: string,
): void {
  const rejectedIds = new Set(rejected);
  if (accepted.some((id) => rejectedIds.has(id))) {
    context.addIssue({ code: "custom", message, path });
  }
}
