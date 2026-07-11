import { z } from "zod";

import { ResultStatus, parseContentDigest, type ContentDigest } from "#common/index.js";
import { parseTaskId, type TaskId } from "#domain/task/index.js";
import {
  parseRepositoryId,
  parseWorkspaceId,
  type RepositoryId,
  type WorkspaceId,
} from "#domain/workspace/index.js";

import {
  MAX_RULE_ID_LENGTH,
  MAX_RULE_LOCATOR_LENGTH,
  MAX_RULE_REVISION_LENGTH,
  MAX_RULE_TEXT_LENGTH,
  RULE_REGISTRY_ID_PATTERN,
  RULE_VERSION_PATTERN,
} from "../constants/index.js";
import { normalizeRulePathGlob, normalizeRuleRelativePath } from "../path/index.js";

/** 创建禁止首尾空白的 Rule 文本 Schema。 */
export function createRuleTextSchema(maxLength = MAX_RULE_TEXT_LENGTH): z.ZodString {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value === value.trim());
}

/** Rule 开放 Registry ID 的严格 Schema。 */
export const ruleRegistryIdSchema = z
  .string()
  .min(1)
  .max(MAX_RULE_ID_LENGTH)
  .regex(RULE_REGISTRY_ID_PATTERN);

/** Rule 三段式 SemVer 的严格 Schema。 */
export const ruleVersionSchema = z.string().regex(RULE_VERSION_PATTERN);

/** Context Revision 的严格非空 Schema。 */
export const ruleRevisionSchema = createRuleTextSchema(MAX_RULE_REVISION_LENGTH);

/** Rule Source Locator 的严格非空 Schema。 */
export const ruleLocatorSchema = createRuleTextSchema(MAX_RULE_LOCATOR_LENGTH);

/** 通用 Content Digest 的严格 Schema。 */
export const contentDigestSchema = z.string().transform((value, context): ContentDigest => {
  const parsed = parseContentDigest(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

/** Workspace ID 的严格 Schema。 */
export const workspaceIdSchema = z.string().transform((value, context): WorkspaceId => {
  const parsed = parseWorkspaceId(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

/** Repository ID 的严格 Schema。 */
export const repositoryIdSchema = z.string().transform((value, context): RepositoryId => {
  const parsed = parseRepositoryId(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

/** Task ID 的严格 Schema。 */
export const taskIdSchema = z.string().transform((value, context): TaskId => {
  const parsed = parseTaskId(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

/** Repository 相对路径的规范化 Schema。 */
export const ruleRelativePathSchema = createNormalizedPathSchema(normalizeRuleRelativePath);

/** Repository 相对 Glob 的规范化 Schema。 */
export const rulePathGlobSchema = createNormalizedPathSchema(normalizeRulePathGlob);

function createNormalizedPathSchema(
  normalize: (value: string) => ReturnType<typeof normalizeRuleRelativePath>,
): z.ZodPipe<z.ZodString, z.ZodTransform<string, string>> {
  return z
    .string()
    .max(MAX_RULE_LOCATOR_LENGTH)
    .transform((value, context): string => {
      const normalized = normalize(value);
      if (normalized.status === ResultStatus.Failure) {
        context.addIssue({ code: "custom", message: normalized.error.message });
        return z.NEVER;
      }
      return normalized.value;
    });
}
