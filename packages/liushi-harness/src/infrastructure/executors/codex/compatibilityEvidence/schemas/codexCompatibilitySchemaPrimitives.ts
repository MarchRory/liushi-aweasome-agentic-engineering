import { z } from "zod";

import { ResultStatus, parseContentDigest, type ContentDigest } from "#common/index.js";

/** Codex 兼容性来源中的内容摘要。 */
export const codexContentDigestSchema = z.string().transform((value, context): ContentDigest => {
  const parsed = parseContentDigest(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

/** 不允许首尾空白或 NUL 的来源文本。 */
export const codexNonBlankStringSchema = z
  .string()
  .min(1)
  .max(16_384)
  .refine((value) => value === value.trim() && !value.includes("\0"));

/** 允许格式化换行但拒绝空白内容和 NUL 的来源正文。 */
export const codexSourceTextSchema = z
  .string()
  .min(1)
  .max(16_384)
  .refine((value) => value.trim().length > 0 && !value.includes("\0"));

/** 可以进入公开 Artifact 的安全标识。 */
export const codexSafeIdentifierSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9._+:@/-]+$/u);

/** 只接受 Capability Probe 能够产生的完整 Codex 版本值。 */
export const codexVersionSchema = z
  .string()
  .max(160)
  .regex(/^\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9_.-]+)?$/u);

/** 带时区且可审计的 ISO 时间。 */
export const codexObservedAtSchema = z.string().datetime({ offset: true });

/** Git 提交对象的十六进制标识。 */
export const codexGitRevisionSchema = z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u);

/** 非负整数来源指标。 */
export const codexNonNegativeIntegerSchema = z.number().int().nonnegative();
