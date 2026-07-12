import { z } from "zod";

import { ResultStatus, parseContentDigest, type ContentDigest } from "#common/index.js";
import {
  parseRepositoryId,
  parseWorkspaceId,
  type RepositoryId,
  type WorkspaceId,
} from "#domain/workspace/index.js";

/** 不施加容量预算的非空文本 Schema。 */
export const discoveryTextSchema = z
  .string()
  .min(1)
  .refine((value) => value === value.trim(), "Text must not contain surrounding whitespace.");

/** 文件与目录计数使用的非负整数 Schema。 */
export const discoveryCountSchema = z.number().int().nonnegative();

/** Project Discovery 报告中的 Content Digest Schema。 */
export const discoveryContentDigestSchema = z
  .string()
  .transform((value, context): ContentDigest => {
    const parsed = parseContentDigest(value);
    if (parsed.status === ResultStatus.Failure) {
      context.addIssue({ code: "custom", message: parsed.error.message });
      return z.NEVER;
    }
    return parsed.value;
  });

/** Project Discovery 报告中的 Workspace ID Schema。 */
export const discoveryWorkspaceIdSchema = z.string().transform((value, context): WorkspaceId => {
  const parsed = parseWorkspaceId(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

/** Project Discovery 报告中的 Repository ID Schema。 */
export const discoveryRepositoryIdSchema = z.string().transform((value, context): RepositoryId => {
  const parsed = parseRepositoryId(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

/** 判断字符串集合在忽略大小写后是否仍然唯一。 */
export function hasUniqueDiscoveryValues(values: readonly string[]): boolean {
  return new Set(values.map((value) => value.toLowerCase())).size === values.length;
}

/** 判断复合业务身份在忽略大小写后是否唯一。 */
export function hasUniqueDiscoveryIdentities(values: readonly string[]): boolean {
  return hasUniqueDiscoveryValues(values);
}
