import { ResultStatus } from "../../../src/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../../src/infrastructure/index.js";

const digest = new Rfc8785Sha256DigestAdapter();

/** 使用生产实现计算 E2E 输入所需的 RFC 8785 SHA-256 摘要。 */
export function digestCloseoutCliValue(value: unknown): string {
  const result = digest.calculate(value);
  if (result.status !== ResultStatus.Success) throw result.error;
  return result.value;
}
