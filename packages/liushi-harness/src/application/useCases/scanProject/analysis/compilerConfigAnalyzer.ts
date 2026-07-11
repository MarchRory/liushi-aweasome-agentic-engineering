import { z } from "zod";

import { failure, success, type Result } from "#common/index.js";
import type { ProjectCompilerConfigFact } from "#domain/projectDiscovery/index.js";

const compilerOptionsSchema = z
  .object({
    strict: z.boolean().optional(),
    forceConsistentCasingInFileNames: z.boolean().optional(),
    noUncheckedIndexedAccess: z.boolean().optional(),
    exactOptionalPropertyTypes: z.boolean().optional(),
    paths: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const compilerConfigSchema = z
  .object({
    extends: z.string().min(1).optional(),
    compilerOptions: compilerOptionsSchema.optional(),
  })
  .passthrough();

/** 从已解析 JSONC Value 提取 TypeScript/JavaScript Compiler 显式事实。 */
export function analyzeCompilerConfig(
  value: unknown,
  configPath: string,
): Result<ProjectCompilerConfigFact, string> {
  const parsed = compilerConfigSchema.safeParse(value);
  if (!parsed.success) {
    return failure("Compiler config fields do not match the supported schema.");
  }
  const options = parsed.data.compilerOptions;
  return success({
    configPath,
    ...(options?.strict === undefined ? {} : { strict: options.strict }),
    ...(options?.forceConsistentCasingInFileNames === undefined
      ? {}
      : { forceConsistentCasingInFileNames: options.forceConsistentCasingInFileNames }),
    ...(options?.noUncheckedIndexedAccess === undefined
      ? {}
      : { noUncheckedIndexedAccess: options.noUncheckedIndexedAccess }),
    ...(options?.exactOptionalPropertyTypes === undefined
      ? {}
      : { exactOptionalPropertyTypes: options.exactOptionalPropertyTypes }),
    pathAliasKeys: Object.keys(options?.paths ?? {}).sort(compare),
    ...(parsed.data.extends === undefined ? {} : { extendsRef: parsed.data.extends }),
  });
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
