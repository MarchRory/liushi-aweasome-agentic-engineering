import { z } from "zod";

import { failure, success, type HarnessError, type Result } from "#common/index.js";

import { MAX_RULE_LIST_ITEMS } from "../constants/index.js";
import type { RuleResolutionContext, RuleResolutionTarget } from "../contracts/index.js";
import { RuleFileKind, RuleOperation } from "../enums/index.js";
import {
  repositoryRuleContextRefSchema,
  workspaceRuleContextRefSchema,
} from "./ruleContext.schema.js";
import {
  repositoryIdSchema,
  ruleRegistryIdSchema,
  ruleRelativePathSchema,
  taskIdSchema,
} from "./ruleSchemaPrimitives.js";
import { createRuleSchemaError } from "./ruleSchemaError.js";

const ruleResolutionTargetSchema = z
  .object({
    targetId: ruleRegistryIdSchema,
    repositoryId: repositoryIdSchema,
    relativePath: ruleRelativePathSchema,
    language: ruleRegistryIdSchema,
    fileKind: z.enum(RuleFileKind),
    operation: z.enum(RuleOperation),
  })
  .strict()
  .transform((input): RuleResolutionTarget => ({
    targetId: input.targetId,
    repositoryId: input.repositoryId,
    relativePath: input.relativePath,
    language: input.language,
    fileKind: input.fileKind,
    operation: input.operation,
  }));

const registryIdArraySchema = z
  .array(ruleRegistryIdSchema)
  .max(MAX_RULE_LIST_ITEMS)
  .refine((values) => new Set(values).size === values.length, "Registry IDs must be unique.");

const rawRuleResolutionContextSchema = z
  .object({
    taskId: taskIdSchema,
    workspaceRef: workspaceRuleContextRefSchema,
    repositoryRefs: z.array(repositoryRuleContextRefSchema).max(MAX_RULE_LIST_ITEMS),
    targets: z.array(ruleResolutionTargetSchema).min(1).max(MAX_RULE_LIST_ITEMS),
    availableValidatorIds: registryIdArraySchema,
    availableCapabilityIds: registryIdArraySchema,
  })
  .strict()
  .superRefine((input, context) => {
    const repositoryIds = input.repositoryRefs.map((entry) => entry.repositoryId);
    if (new Set(repositoryIds).size !== repositoryIds.length) {
      context.addIssue({
        code: "custom",
        message: "Repository context entries must be unique.",
        path: ["repositoryRefs"],
      });
    }
    const targetIds = input.targets.map((target) => target.targetId);
    if (new Set(targetIds).size !== targetIds.length) {
      context.addIssue({
        code: "custom",
        message: "Resolution target IDs must be unique.",
        path: ["targets"],
      });
    }
    const knownRepositories = new Set(repositoryIds);
    input.targets.forEach((target, index) => {
      if (!knownRepositories.has(target.repositoryId)) {
        context.addIssue({
          code: "custom",
          message: `Target references unknown repository ${target.repositoryId}.`,
          path: ["targets", index, "repositoryId"],
        });
      }
    });
  });

/** Rule Resolution Context 的严格 Schema。 */
export const ruleResolutionContextSchema = rawRuleResolutionContextSchema.transform(
  (input): RuleResolutionContext => ({
    taskId: input.taskId,
    workspaceRef: input.workspaceRef,
    repositoryRefs: input.repositoryRefs,
    targets: input.targets,
    availableValidatorIds: input.availableValidatorIds,
    availableCapabilityIds: input.availableCapabilityIds,
  }),
);

/** 校验未知输入并返回 Rule Resolution Context。 */
export function parseRuleResolutionContext(
  input: unknown,
): Result<RuleResolutionContext, HarnessError> {
  const parsed = ruleResolutionContextSchema.safeParse(input);
  return parsed.success
    ? success(parsed.data)
    : failure(createRuleSchemaError(parsed.error, "Rule resolution context schema is invalid."));
}
