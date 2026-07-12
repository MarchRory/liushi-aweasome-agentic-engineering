import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import {
  parseArtifactDigest,
  parseArtifactId,
  ArtifactType,
  type ArtifactDigest,
  type ArtifactId,
} from "#domain/artifact/index.js";

import type { ContextManifest, EffectiveRevisionSet, InputBindingSet } from "../contracts/index.js";
import { ContextSource, TrustChannel } from "../enums/index.js";

const nonBlank = z
  .string()
  .min(1)
  .refine((value) => value === value.trim());

const artifactIdSchema = z.string().transform((value, context): ArtifactId => {
  const parsed = parseArtifactId(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

const artifactDigestSchema = z.string().transform((value, context): ArtifactDigest => {
  const parsed = parseArtifactDigest(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

const contentDigestSchema = z.string().transform((value, context): ContentDigest => {
  const parsed = parseContentDigest(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

const effectiveRevisionSchema = z
  .object({
    artifactId: artifactIdSchema,
    artifactType: z.enum(ArtifactType),
    revision: z.number().int().positive(),
    digest: artifactDigestSchema,
  })
  .strict();

const inputBindingSchema = z
  .object({
    inputKey: nonBlank,
    artifactId: artifactIdSchema,
    artifactType: z.enum(ArtifactType),
    revision: z.number().int().positive(),
    digest: artifactDigestSchema,
  })
  .strict();

const contextManifestEntrySchema = z
  .object({
    source: z.enum(ContextSource),
    locator: nonBlank,
    revision: nonBlank,
    digest: contentDigestSchema,
    scope: nonBlank,
    trustLevel: z.enum(TrustChannel),
    selectionReason: nonBlank,
    truncationReason: nonBlank.optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    if (
      [
        ContextSource.Repository,
        ContextSource.Wiki,
        ContextSource.Ticket,
        ContextSource.ToolOutput,
      ].includes(entry.source) &&
      entry.trustLevel !== TrustChannel.ExternalUntrusted
    ) {
      context.addIssue({
        code: "custom",
        message: "External context sources must use the untrusted channel.",
        path: ["trustLevel"],
      });
    }
  });

/** 解析并校验当前有效 Revision 集合。 */
export function parseEffectiveRevisionSet(
  input: unknown,
): Result<EffectiveRevisionSet, HarnessError> {
  const parsed = z
    .object({ revisions: z.array(effectiveRevisionSchema) })
    .strict()
    .superRefine((value, context) =>
      addDuplicateIssue(
        value.revisions.map((item) => item.artifactId),
        context,
        "revisions",
      ),
    )
    .safeParse(input);

  return parsed.success
    ? success(parsed.data as EffectiveRevisionSet)
    : failure(createWorkflowValidationError(parsed.error, "Effective revision set is invalid."));
}

/** 解析并校验输入绑定集合。 */
export function parseInputBindingSet(input: unknown): Result<InputBindingSet, HarnessError> {
  const parsed = z
    .object({ bindings: z.array(inputBindingSchema) })
    .strict()
    .superRefine((value, context) =>
      addDuplicateIssue(
        value.bindings.map((item) => item.inputKey),
        context,
        "bindings",
      ),
    )
    .safeParse(input);

  return parsed.success
    ? success(parsed.data as InputBindingSet)
    : failure(createWorkflowValidationError(parsed.error, "Input binding set is invalid."));
}

/** 解析并校验可重建 Context 的来源清单。 */
export function parseContextManifest(input: unknown): Result<ContextManifest, HarnessError> {
  const parsed = z
    .object({ sources: z.array(contextManifestEntrySchema) })
    .strict()
    .safeParse(input);

  return parsed.success
    ? success(parsed.data as ContextManifest)
    : failure(createWorkflowValidationError(parsed.error, "Context manifest is invalid."));
}

/** 机械比较 InputBinding 与当前 EffectiveRevision，不推断业务影响。 */
export function validateInputBindingsAgainstEffectiveRevisions(
  bindings: InputBindingSet,
  effectiveRevisions: EffectiveRevisionSet,
): Result<void, HarnessError> {
  const currentByArtifactId = new Map(
    effectiveRevisions.revisions.map((revision) => [revision.artifactId, revision]),
  );

  for (const binding of bindings.bindings) {
    const current = currentByArtifactId.get(binding.artifactId);
    if (
      current === undefined ||
      current.artifactType !== binding.artifactType ||
      current.revision !== binding.revision ||
      current.digest !== binding.digest
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Input binding does not match the current effective revision.",
          {
            inputKey: binding.inputKey,
            artifactId: binding.artifactId,
            expectedRevision: current === undefined ? "missing" : String(current.revision),
            actualRevision: String(binding.revision),
          },
        ),
      );
    }
  }

  return success(undefined);
}

function addDuplicateIssue(
  identities: readonly string[],
  context: z.RefinementCtx,
  path: string,
): void {
  if (new Set(identities).size !== identities.length) {
    context.addIssue({ code: "custom", message: "Values must be unique.", path: [path] });
  }
}

function createWorkflowValidationError(error: z.ZodError, message: string): HarnessError {
  const issue = error.issues[0];
  return new HarnessError(
    HarnessErrorCode.InvalidInput,
    message,
    {
      path: issue?.path.join(".") ?? "unknown",
      issue: issue?.message ?? "unknown",
    },
    error,
  );
}
