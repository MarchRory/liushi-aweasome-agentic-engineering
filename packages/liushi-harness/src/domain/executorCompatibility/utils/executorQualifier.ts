import type { ExecutorCapabilityQualifier } from "../contracts/index.js";
import { normalizeQualifiers } from "../digest/index.js";

/** 判断证据限定符是否覆盖 Requirement 的全部限定符。 */
export function includesQualifiers(
  evidence: readonly ExecutorCapabilityQualifier[],
  required: readonly ExecutorCapabilityQualifier[],
): boolean {
  const available = new Set(evidence.map((item) => `${item.kind}:${item.value}`));
  return required.every((item) => available.has(`${item.kind}:${item.value}`));
}

/** 判断限定符集合是否包含重复身份。 */
export function hasDuplicateQualifiers(
  qualifiers: readonly ExecutorCapabilityQualifier[],
): boolean {
  const identities = normalizeQualifiers(qualifiers).map((item) => `${item.kind}:${item.value}`);
  return new Set(identities).size !== identities.length;
}
